/**
 * End-to-end lifecycle tests for HCS-10 connections.
 *
 * Tests the full flow: poll → accept → message → close.
 */

import { ConnectionHandler } from '../../src/hol/connection-handler';
import { HCS10Client } from '../../src/hcs/hcs10-client';

function createMockHCS10() {
  return {
    readMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({ sequenceNumber: 1, timestamp: new Date().toISOString() }),
    createTopic: jest.fn().mockResolvedValue('0.0.shared-topic'),
    registerAgent: jest.fn(),
    getConfig: jest.fn().mockReturnValue({
      accountId: '0.0.7854018',
      privateKey: 'mock',
      network: 'testnet',
      registryTopicId: '0.0.7311321',
    }),
    setTestnetIntegration: jest.fn(),
    hasTestnetIntegration: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<HCS10Client>;
}

describe('Connection Lifecycle', () => {
  let handler: ConnectionHandler;
  let mockHcs10: jest.Mocked<HCS10Client>;

  beforeEach(() => {
    mockHcs10 = createMockHCS10();
    handler = new ConnectionHandler({
      inboundTopicId: '0.0.7854276',
      outboundTopicId: '0.0.7854275',
      accountId: '0.0.7854018',
      pollIntervalMs: 60000,
    }, mockHcs10);
  });

  afterEach(() => {
    handler.stop();
  });

  it('should complete full connection lifecycle', async () => {
    // Step 1: Receive connection request
    mockHcs10.readMessages.mockResolvedValueOnce([
      {
        content: {
          p: 'hcs-10',
          op: 'connection_request',
          account_id: '0.0.remote-agent',
          inbound_topic: '0.0.remote-inbound',
          m: 'Want to connect for task delegation',
        },
        sequenceNumber: 1,
        timestamp: '2026-02-12T14:00:00Z',
      },
    ]);

    const requests = await handler.pollInboundTopic();
    expect(requests).toHaveLength(1);
    expect(handler.getPendingRequests()).toHaveLength(1);

    // Step 2: Accept connection
    const connection = await handler.acceptConnection(requests[0].id);
    expect(connection.status).toBe('active');
    expect(connection.remote_account).toBe('0.0.remote-agent');
    expect(connection.connection_topic).toBe('0.0.shared-topic');
    expect(handler.getPendingRequests()).toHaveLength(0);
    expect(handler.getActiveConnections()).toHaveLength(1);

    // Step 3: Exchange messages
    const msg1 = await handler.sendMessage(connection.id, 'Task: analyze security report');
    expect(msg1.content).toBe('Task: analyze security report');
    expect(msg1.from).toBe('0.0.7854018');

    const msg2 = await handler.sendMessage(connection.id, 'Please respond with findings');
    expect(msg2.content).toBe('Please respond with findings');

    // Verify message count
    const updatedConn = handler.getConnection(connection.id);
    expect(updatedConn?.messages_exchanged).toBe(2);

    // Step 4: Read response from remote agent
    mockHcs10.readMessages.mockResolvedValueOnce([
      {
        content: { from: '0.0.remote-agent', content: 'Analysis complete. No threats found.' },
        sequenceNumber: 3,
        timestamp: '2026-02-12T14:05:00Z',
      },
    ]);
    const responses = await handler.readConnectionMessages(connection.id, 10);
    expect(responses).toHaveLength(1);
    expect(responses[0].content).toBe('Analysis complete. No threats found.');

    // Step 5: Close connection
    await handler.closeConnection(connection.id);
    expect(handler.getActiveConnections()).toHaveLength(0);
    expect(handler.getAllConnections()).toHaveLength(1);
    expect(handler.getAllConnections()[0].status).toBe('closed');

    // Step 6: Verify status
    const status = handler.getHandlerStatus();
    expect(status.active_connections).toBe(0);
    expect(status.pending_requests).toBe(0);
    expect(status.total_messages).toBe(2);
  });

  it('should handle multiple concurrent connections', async () => {
    // Receive 3 connection requests
    mockHcs10.readMessages.mockResolvedValueOnce([
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.agent-a' }, sequenceNumber: 10, timestamp: '2026-02-12T14:00:00Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.agent-b' }, sequenceNumber: 11, timestamp: '2026-02-12T14:00:01Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.agent-c' }, sequenceNumber: 12, timestamp: '2026-02-12T14:00:02Z' },
    ]);

    await handler.pollInboundTopic();
    const pending = handler.getPendingRequests();
    expect(pending).toHaveLength(3);

    // Accept all three
    const connA = await handler.acceptConnection(pending[0].id);
    const connB = await handler.acceptConnection(pending[1].id);
    const connC = await handler.acceptConnection(pending[2].id);

    expect(handler.getActiveConnections()).toHaveLength(3);

    // Send message on each
    await handler.sendMessage(connA.id, 'Task for A');
    await handler.sendMessage(connB.id, 'Task for B');
    await handler.sendMessage(connC.id, 'Task for C');

    // Close one
    await handler.closeConnection(connB.id);
    expect(handler.getActiveConnections()).toHaveLength(2);
    expect(handler.getAllConnections()).toHaveLength(3);
  });

  it('should reject messages on closed connections', async () => {
    mockHcs10.readMessages.mockResolvedValueOnce([
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.temp' }, sequenceNumber: 20, timestamp: '2026-02-12T14:00:00Z' },
    ]);

    await handler.pollInboundTopic();
    const conn = await handler.acceptConnection(handler.getPendingRequests()[0].id);
    await handler.closeConnection(conn.id);

    await expect(handler.sendMessage(conn.id, 'This should fail')).rejects.toThrow('closed');
  });
});

describe('Connection polling behavior', () => {
  it('should handle mixed message types on inbound topic', async () => {
    const mockHcs10 = createMockHCS10();
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.123',
      outboundTopicId: '0.0.456',
      accountId: '0.0.789',
    }, mockHcs10);

    mockHcs10.readMessages.mockResolvedValueOnce([
      { content: { p: 'hcs-10', op: 'register' }, sequenceNumber: 1, timestamp: '2026-02-12T14:00:00Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.real' }, sequenceNumber: 2, timestamp: '2026-02-12T14:00:01Z' },
      { content: { type: 'random-noise' }, sequenceNumber: 3, timestamp: '2026-02-12T14:00:02Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.also-real' }, sequenceNumber: 4, timestamp: '2026-02-12T14:00:03Z' },
    ]);

    const requests = await handler.pollInboundTopic();
    expect(requests).toHaveLength(2);
    expect(requests[0].from_account).toBe('0.0.real');
    expect(requests[1].from_account).toBe('0.0.also-real');
  });
});
