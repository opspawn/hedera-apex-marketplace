/**
 * HCS-10 Connection Handler
 *
 * Monitors the agent's inbound topic for connection_request messages
 * and handles the full HCS-10 connection lifecycle:
 *
 * 1. Listen for connection_request on inbound topic
 * 2. Accept: create shared connection topics
 * 3. Respond with connection_created message
 * 4. Exchange messages on connection topics
 *
 * This makes the agent "reachable" — not just registered.
 */

import { HCS10Client } from '../hcs/hcs10-client';

export interface ConnectionRequest {
  id: string;
  from_account: string;
  from_inbound_topic: string;
  message?: string;
  timestamp: string;
  sequence_number: number;
}

export interface ActiveConnection {
  id: string;
  remote_account: string;
  connection_topic: string;
  status: 'active' | 'closed';
  created_at: string;
  last_message_at: string;
  messages_exchanged: number;
}

export interface ConnectionMessage {
  id: string;
  connection_id: string;
  from: string;
  content: string;
  timestamp: string;
  sequence_number?: number;
}

export interface ConnectionHandlerConfig {
  inboundTopicId: string;
  outboundTopicId: string;
  accountId: string;
  pollIntervalMs?: number;
}

export class ConnectionHandler {
  private config: ConnectionHandlerConfig;
  private hcs10: HCS10Client;
  private connections: Map<string, ActiveConnection> = new Map();
  private pendingRequests: Map<string, ConnectionRequest> = new Map();
  private messageLog: ConnectionMessage[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processedSequences: Set<number> = new Set();
  private connectionCounter = 0;

  constructor(config: ConnectionHandlerConfig, hcs10: HCS10Client) {
    this.config = config;
    this.hcs10 = hcs10;
  }

  /**
   * Start listening for inbound connection requests.
   * Polls the inbound topic at the configured interval.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const interval = this.config.pollIntervalMs || 10000;
    this.pollTimer = setInterval(() => {
      this.pollInboundTopic().catch(() => {});
    }, interval);

    // Initial poll
    this.pollInboundTopic().catch(() => {});
  }

  /**
   * Stop listening for connection requests.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Check if the handler is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Poll the inbound topic for new connection requests.
   */
  async pollInboundTopic(): Promise<ConnectionRequest[]> {
    const messages = await this.hcs10.readMessages(this.config.inboundTopicId, 25);
    const newRequests: ConnectionRequest[] = [];

    for (const msg of messages) {
      // Skip already-processed messages
      if (this.processedSequences.has(msg.sequenceNumber)) continue;
      this.processedSequences.add(msg.sequenceNumber);

      const content = msg.content;
      if (content.p === 'hcs-10' && content.op === 'connection_request') {
        const request: ConnectionRequest = {
          id: `conn-req-${msg.sequenceNumber}`,
          from_account: content.account_id as string || 'unknown',
          from_inbound_topic: content.inbound_topic as string || '',
          message: content.m as string || undefined,
          timestamp: msg.timestamp,
          sequence_number: msg.sequenceNumber,
        };
        this.pendingRequests.set(request.id, request);
        newRequests.push(request);
      }
    }

    return newRequests;
  }

  /**
   * Accept a connection request and create shared connection topics.
   */
  async acceptConnection(requestId: string): Promise<ActiveConnection> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Connection request ${requestId} not found`);
    }

    // Create shared connection topic
    const connectionTopicId = await this.hcs10.createTopic(
      `hcs10:connection:${this.config.accountId}:${request.from_account}`
    );

    // Send connection_created response to our outbound topic
    await this.hcs10.sendMessage(this.config.outboundTopicId, {
      p: 'hcs-10',
      op: 'connection_created',
      account_id: this.config.accountId,
      connected_account_id: request.from_account,
      connection_topic_id: connectionTopicId,
      m: 'Connection accepted',
      timestamp: new Date().toISOString(),
    });

    const connection: ActiveConnection = {
      id: `conn-${Date.now()}-${++this.connectionCounter}`,
      remote_account: request.from_account,
      connection_topic: connectionTopicId,
      status: 'active',
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      messages_exchanged: 0,
    };

    this.connections.set(connection.id, connection);
    this.pendingRequests.delete(requestId);

    return connection;
  }

  /**
   * Send a message on an active connection.
   */
  async sendMessage(connectionId: string, content: string): Promise<ConnectionMessage> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }
    if (connection.status !== 'active') {
      throw new Error(`Connection ${connectionId} is ${connection.status}`);
    }

    const result = await this.hcs10.sendMessage(connection.connection_topic, {
      p: 'hcs-10',
      op: 'message',
      from: this.config.accountId,
      content,
      timestamp: new Date().toISOString(),
    });

    const message: ConnectionMessage = {
      id: `msg-${Date.now()}`,
      connection_id: connectionId,
      from: this.config.accountId,
      content,
      timestamp: new Date().toISOString(),
      sequence_number: result.sequenceNumber,
    };

    this.messageLog.push(message);
    connection.messages_exchanged++;
    connection.last_message_at = message.timestamp;

    return message;
  }

  /**
   * Read messages from a connection topic.
   */
  async readConnectionMessages(connectionId: string, limit: number = 10): Promise<ConnectionMessage[]> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const messages = await this.hcs10.readMessages(connection.connection_topic, limit);
    return messages.map(msg => ({
      id: `msg-${msg.sequenceNumber}`,
      connection_id: connectionId,
      from: (msg.content.from as string) || 'unknown',
      content: (msg.content.content as string) || JSON.stringify(msg.content),
      timestamp: msg.timestamp,
      sequence_number: msg.sequenceNumber,
    }));
  }

  /**
   * Close an active connection.
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Send close message
    await this.hcs10.sendMessage(connection.connection_topic, {
      p: 'hcs-10',
      op: 'connection_close',
      from: this.config.accountId,
      timestamp: new Date().toISOString(),
    });

    connection.status = 'closed';
  }

  /**
   * Get all active connections.
   */
  getActiveConnections(): ActiveConnection[] {
    return Array.from(this.connections.values()).filter(c => c.status === 'active');
  }

  /**
   * Get all connections (active and closed).
   */
  getAllConnections(): ActiveConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get pending connection requests.
   */
  getPendingRequests(): ConnectionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get connection by ID.
   */
  getConnection(connectionId: string): ActiveConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get handler status summary.
   */
  getHandlerStatus(): {
    running: boolean;
    inbound_topic: string;
    active_connections: number;
    pending_requests: number;
    total_messages: number;
  } {
    return {
      running: this.running,
      inbound_topic: this.config.inboundTopicId,
      active_connections: this.getActiveConnections().length,
      pending_requests: this.pendingRequests.size,
      total_messages: this.messageLog.length,
    };
  }
}
