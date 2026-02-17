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

export interface InboundLogEntry {
  type: 'connection_request' | 'message' | 'connection_close' | 'unknown';
  from: string;
  content: string;
  timestamp: string;
  sequence_number: number;
  auto_accepted?: boolean;
  nl_response?: string;
}

export interface ConnectionHandlerConfig {
  inboundTopicId: string;
  outboundTopicId: string;
  accountId: string;
  pollIntervalMs?: number;
  autoAccept?: boolean;
}

export class ConnectionHandler {
  private config: ConnectionHandlerConfig;
  private hcs10: HCS10Client;
  private connections: Map<string, ActiveConnection> = new Map();
  private pendingRequests: Map<string, ConnectionRequest> = new Map();
  private messageLog: ConnectionMessage[] = [];
  private inboundLog: InboundLogEntry[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processedSequences: Set<number> = new Set();
  private connectionCounter = 0;
  private autoAccept: boolean;

  constructor(config: ConnectionHandlerConfig, hcs10: HCS10Client) {
    this.config = config;
    this.hcs10 = hcs10;
    this.autoAccept = config.autoAccept !== false; // Default: auto-accept ON
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
   * With autoAccept enabled, connections are automatically accepted and
   * a natural language greeting is sent on the new connection.
   */
  async pollInboundTopic(): Promise<ConnectionRequest[]> {
    const messages = await this.hcs10.readMessages(this.config.inboundTopicId, 25);
    const newRequests: ConnectionRequest[] = [];

    for (const msg of messages) {
      // Skip already-processed messages
      if (this.processedSequences.has(msg.sequenceNumber)) continue;
      this.processedSequences.add(msg.sequenceNumber);

      const content = msg.content;

      // Log all inbound messages for demo/audit purposes
      if (content.p === 'hcs-10') {
        const logEntry: InboundLogEntry = {
          type: (content.op === 'connection_request' ? 'connection_request'
            : content.op === 'message' ? 'message'
            : content.op === 'connection_close' ? 'connection_close'
            : 'unknown') as InboundLogEntry['type'],
          from: (content.account_id as string) || (content.from as string) || 'unknown',
          content: (content.m as string) || (content.content as string) || JSON.stringify(content),
          timestamp: msg.timestamp,
          sequence_number: msg.sequenceNumber,
        };

        if (content.op === 'connection_request') {
          const request: ConnectionRequest = {
            id: `conn-req-${msg.sequenceNumber}`,
            from_account: content.account_id as string || 'unknown',
            from_inbound_topic: content.inbound_topic as string || '',
            message: content.m as string || undefined,
            timestamp: msg.timestamp,
            sequence_number: msg.sequenceNumber,
          };

          if (this.autoAccept) {
            // Auto-accept the connection
            this.pendingRequests.set(request.id, request);
            try {
              const conn = await this.acceptConnection(request.id);
              logEntry.auto_accepted = true;

              // Send natural language greeting on the new connection
              const greeting = this.generateNLGreeting(request);
              await this.sendMessage(conn.id, greeting);
              logEntry.nl_response = greeting;
            } catch {
              // Still add to pending if auto-accept fails
              this.pendingRequests.set(request.id, request);
              logEntry.auto_accepted = false;
            }
          } else {
            this.pendingRequests.set(request.id, request);
          }

          newRequests.push(request);
        } else if (content.op === 'message') {
          // Handle inbound messages on existing connections — respond with NL
          const inboundContent = (content.content as string) || (content.m as string) || '';
          if (inboundContent) {
            const nlResponse = this.generateNLResponse(inboundContent);
            logEntry.nl_response = nlResponse;
            // Find matching connection and respond
            for (const conn of this.connections.values()) {
              if (conn.status === 'active' && conn.remote_account === ((content.from as string) || '')) {
                try {
                  await this.sendMessage(conn.id, nlResponse);
                } catch { /* best effort */ }
                break;
              }
            }
          }
        }

        this.inboundLog.push(logEntry);
        // Keep log bounded
        if (this.inboundLog.length > 200) {
          this.inboundLog = this.inboundLog.slice(-100);
        }
      }
    }

    return newRequests;
  }

  /**
   * Generate a natural language greeting for a new connection.
   */
  private generateNLGreeting(request: ConnectionRequest): string {
    const who = request.from_account !== 'unknown' ? ` from ${request.from_account}` : '';
    const msg = request.message ? ` You said: "${request.message}".` : '';
    return `Hello${who}! Welcome to the Hedera Agent Marketplace. I'm ready to help you discover agents, register new ones, or delegate tasks.${msg} What would you like to do?`;
  }

  /**
   * Generate a natural language response to an inbound message.
   */
  private generateNLResponse(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return 'Hello! I\'m the Hedera Agent Marketplace. I can help you find agents, register new ones, check trust scores, or delegate tasks. What would you like to do?';
    }
    if (lower.includes('search') || lower.includes('find') || lower.includes('discover')) {
      return 'I can search the marketplace for agents. Try asking: "Find agents with security skills" or use the /api/marketplace/discover endpoint directly.';
    }
    if (lower.includes('register') || lower.includes('sign up') || lower.includes('join')) {
      return 'To register a new agent, provide a name, description, skills, and endpoint. Use POST /api/marketplace/register or send me the details in natural language.';
    }
    if (lower.includes('trust') || lower.includes('score') || lower.includes('reputation')) {
      return 'I track trust scores based on agent age, connections, completed tasks, and privacy compliance. Use GET /api/agents/:id/trust to check a specific agent.';
    }
    if (lower.includes('hire') || lower.includes('task') || lower.includes('delegate')) {
      return 'To hire an agent, specify the agent_id and skill_id. Use POST /api/marketplace/hire or the A2A protocol at /api/a2a/tasks.';
    }
    if (lower.includes('help') || lower.includes('what can you do')) {
      return 'I\'m the Hedera Agent Marketplace. I support: agent registration, discovery, hiring, trust scoring, HCS-10 connections, A2A protocol, and MCP tools. Ask me anything!';
    }
    return `Thank you for your message. I'm the Hedera Agent Marketplace — I can help with agent discovery, registration, hiring, and trust evaluation. Available protocols: HCS-10, A2A, MCP. How can I assist you?`;
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
    auto_accept: boolean;
    inbound_log_size: number;
  } {
    return {
      running: this.running,
      inbound_topic: this.config.inboundTopicId,
      active_connections: this.getActiveConnections().length,
      pending_requests: this.pendingRequests.size,
      total_messages: this.messageLog.length,
      auto_accept: this.autoAccept,
      inbound_log_size: this.inboundLog.length,
    };
  }

  /**
   * Get the recent inbound log entries for dashboard display.
   */
  getRecentInboundLog(limit: number = 50): InboundLogEntry[] {
    return this.inboundLog.slice(-limit);
  }

  /**
   * Check if auto-accept is enabled.
   */
  isAutoAcceptEnabled(): boolean {
    return this.autoAccept;
  }

  /**
   * Enable or disable auto-accept.
   */
  setAutoAccept(enabled: boolean): void {
    this.autoAccept = enabled;
  }
}
