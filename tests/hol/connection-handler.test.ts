/**
 * Tests for HCS-10 Connection Handler.
 *
 * Uses a mock HCS10Client to simulate topic operations.
 */

import { ConnectionHandler, ConnectionHandlerConfig, ActiveConnection, ConnectionRequest } from '../../src/hol/connection-handler';
import { HCS10Client } from '../../src/hcs/hcs10-client';

// Mock HCS10Client
function createMockHCS10(): jest.Mocked<HCS10Client> {
  return {
    readMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({ sequenceNumber: 1, timestamp: new Date().toISOString() }),
    createTopic: jest.fn().mockResolvedValue('0.0.99999'),
    registerAgent: jest.fn(),
    getConfig: jest.fn().mockReturnValue({
      accountId: '0.0.7854018',
      privateKey: 'mock-key',
      network: 'testnet',
      registryTopicId: '0.0.7311321',
    }),
    setTestnetIntegration: jest.fn(),
    hasTestnetIntegration: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<HCS10Client>;
}

const TEST_CONFIG: ConnectionHandlerConfig = {
  inboundTopicId: '0.0.7854276',
  outboundTopicId: '0.0.7854275',
  accountId: '0.0.7854018',
  pollIntervalMs: 60000, // Long interval to prevent auto-polling in tests
  autoAccept: false, // Disable auto-accept for unit tests that manage accept manually
};

describe('ConnectionHandler', () => {
  let handler: ConnectionHandler;
  let mockHcs10: jest.Mocked<HCS10Client>;

  beforeEach(() => {
    mockHcs10 = createMockHCS10();
    handler = new ConnectionHandler(TEST_CONFIG, mockHcs10);
  });

  afterEach(() => {
    handler.stop();
  });

  describe('lifecycle', () => {
    it('should start and stop cleanly', () => {
      expect(handler.isRunning()).toBe(false);
      handler.start();
      expect(handler.isRunning()).toBe(true);
      handler.stop();
      expect(handler.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      handler.start();
      handler.start(); // second call should be no-op
      expect(handler.isRunning()).toBe(true);
    });

    it('should handle stop when not running', () => {
      handler.stop(); // should not throw
      expect(handler.isRunning()).toBe(false);
    });
  });

  describe('getHandlerStatus', () => {
    it('should return initial status', () => {
      const status = handler.getHandlerStatus();
      expect(status.running).toBe(false);
      expect(status.inbound_topic).toBe('0.0.7854276');
      expect(status.active_connections).toBe(0);
      expect(status.pending_requests).toBe(0);
      expect(status.total_messages).toBe(0);
    });

    it('should reflect running state', () => {
      handler.start();
      const status = handler.getHandlerStatus();
      expect(status.running).toBe(true);
    });
  });

  describe('pollInboundTopic', () => {
    it('should return empty when no messages', async () => {
      const requests = await handler.pollInboundTopic();
      expect(requests).toEqual([]);
      expect(mockHcs10.readMessages).toHaveBeenCalledWith('0.0.7854276', 25);
    });

    it('should detect connection_request messages', async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: {
            p: 'hcs-10',
            op: 'connection_request',
            account_id: '0.0.12345',
            inbound_topic: '0.0.12346',
            m: 'Hello, connect please',
          },
          sequenceNumber: 1,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);

      const requests = await handler.pollInboundTopic();
      expect(requests).toHaveLength(1);
      expect(requests[0].from_account).toBe('0.0.12345');
      expect(requests[0].message).toBe('Hello, connect please');
    });

    it('should not process the same message twice', async () => {
      const msg = {
        content: {
          p: 'hcs-10',
          op: 'connection_request',
          account_id: '0.0.12345',
          inbound_topic: '0.0.12346',
        },
        sequenceNumber: 5,
        timestamp: '2026-02-12T12:00:00Z',
      };

      mockHcs10.readMessages.mockResolvedValue([msg]);

      const first = await handler.pollInboundTopic();
      expect(first).toHaveLength(1);

      const second = await handler.pollInboundTopic();
      expect(second).toHaveLength(0); // already processed
    });

    it('should ignore non-connection messages', async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'register', account_id: '0.0.999' },
          sequenceNumber: 1,
          timestamp: '2026-02-12T12:00:00Z',
        },
        {
          content: { type: 'random', data: 'something' },
          sequenceNumber: 2,
          timestamp: '2026-02-12T12:00:01Z',
        },
      ]);

      const requests = await handler.pollInboundTopic();
      expect(requests).toHaveLength(0);
    });

    it('should add requests to pending list', async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.111' },
          sequenceNumber: 10,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);

      await handler.pollInboundTopic();
      const pending = handler.getPendingRequests();
      expect(pending).toHaveLength(1);
      expect(pending[0].from_account).toBe('0.0.111');
    });
  });

  describe('acceptConnection', () => {
    it('should accept a pending request and create connection topics', async () => {
      // First, create a pending request
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.55555' },
          sequenceNumber: 42,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);
      await handler.pollInboundTopic();

      const pending = handler.getPendingRequests();
      expect(pending).toHaveLength(1);

      // Accept it
      const connection = await handler.acceptConnection(pending[0].id);
      expect(connection.remote_account).toBe('0.0.55555');
      expect(connection.connection_topic).toBe('0.0.99999');
      expect(connection.status).toBe('active');
      expect(connection.messages_exchanged).toBe(0);

      // Verify topic was created
      expect(mockHcs10.createTopic).toHaveBeenCalled();

      // Verify connection_created message was sent
      expect(mockHcs10.sendMessage).toHaveBeenCalledWith(
        '0.0.7854275',
        expect.objectContaining({
          p: 'hcs-10',
          op: 'connection_created',
          account_id: '0.0.7854018',
          connected_account_id: '0.0.55555',
        })
      );

      // Pending should be cleared
      expect(handler.getPendingRequests()).toHaveLength(0);
    });

    it('should throw for unknown request ID', async () => {
      await expect(handler.acceptConnection('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('sendMessage', () => {
    let connectionId: string;

    beforeEach(async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.77777' },
          sequenceNumber: 100,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);
      await handler.pollInboundTopic();
      const pending = handler.getPendingRequests();
      const conn = await handler.acceptConnection(pending[0].id);
      connectionId = conn.id;
    });

    it('should send a message on an active connection', async () => {
      const msg = await handler.sendMessage(connectionId, 'Hello from marketplace!');
      expect(msg.content).toBe('Hello from marketplace!');
      expect(msg.from).toBe('0.0.7854018');
      expect(msg.connection_id).toBe(connectionId);
    });

    it('should increment message count', async () => {
      await handler.sendMessage(connectionId, 'msg1');
      await handler.sendMessage(connectionId, 'msg2');
      const conn = handler.getConnection(connectionId);
      expect(conn?.messages_exchanged).toBe(2);
    });

    it('should throw for unknown connection', async () => {
      await expect(handler.sendMessage('bogus', 'hi')).rejects.toThrow('not found');
    });

    it('should throw for closed connection', async () => {
      await handler.closeConnection(connectionId);
      await expect(handler.sendMessage(connectionId, 'hi')).rejects.toThrow('closed');
    });
  });

  describe('readConnectionMessages', () => {
    it('should read messages from connection topic', async () => {
      // Setup connection
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.88888' },
          sequenceNumber: 200,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);
      await handler.pollInboundTopic();
      const conn = await handler.acceptConnection(handler.getPendingRequests()[0].id);

      // Mock reading from connection topic
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { from: '0.0.88888', content: 'Hello back!' },
          sequenceNumber: 1,
          timestamp: '2026-02-12T12:01:00Z',
        },
      ]);

      const messages = await handler.readConnectionMessages(conn.id, 10);
      expect(messages).toHaveLength(1);
      expect(messages[0].from).toBe('0.0.88888');
      expect(messages[0].content).toBe('Hello back!');
    });

    it('should throw for unknown connection', async () => {
      await expect(handler.readConnectionMessages('bogus')).rejects.toThrow('not found');
    });
  });

  describe('closeConnection', () => {
    it('should close an active connection', async () => {
      // Setup
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.44444' },
          sequenceNumber: 300,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);
      await handler.pollInboundTopic();
      const conn = await handler.acceptConnection(handler.getPendingRequests()[0].id);

      await handler.closeConnection(conn.id);

      const closed = handler.getConnection(conn.id);
      expect(closed?.status).toBe('closed');
    });

    it('should send connection_close message', async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        {
          content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.33333' },
          sequenceNumber: 400,
          timestamp: '2026-02-12T12:00:00Z',
        },
      ]);
      await handler.pollInboundTopic();
      const conn = await handler.acceptConnection(handler.getPendingRequests()[0].id);

      await handler.closeConnection(conn.id);

      expect(mockHcs10.sendMessage).toHaveBeenCalledWith(
        '0.0.99999',
        expect.objectContaining({ p: 'hcs-10', op: 'connection_close' })
      );
    });

    it('should throw for unknown connection', async () => {
      await expect(handler.closeConnection('nope')).rejects.toThrow('not found');
    });
  });

  describe('getActiveConnections', () => {
    it('should return only active connections', async () => {
      // Create two connections
      mockHcs10.readMessages.mockResolvedValueOnce([
        { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.1001' }, sequenceNumber: 500, timestamp: '2026-02-12T12:00:00Z' },
        { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.1002' }, sequenceNumber: 501, timestamp: '2026-02-12T12:00:01Z' },
      ]);
      await handler.pollInboundTopic();
      const pending = handler.getPendingRequests();

      const conn1 = await handler.acceptConnection(pending[0].id);
      const conn2 = await handler.acceptConnection(pending[1].id);

      expect(handler.getActiveConnections()).toHaveLength(2);

      // Close one
      await handler.closeConnection(conn1.id);
      expect(handler.getActiveConnections()).toHaveLength(1);
      expect(handler.getActiveConnections()[0].id).toBe(conn2.id);
    });
  });

  describe('getAllConnections', () => {
    it('should return active and closed connections', async () => {
      mockHcs10.readMessages.mockResolvedValueOnce([
        { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.2001' }, sequenceNumber: 600, timestamp: '2026-02-12T12:00:00Z' },
      ]);
      await handler.pollInboundTopic();
      const conn = await handler.acceptConnection(handler.getPendingRequests()[0].id);
      await handler.closeConnection(conn.id);

      const all = handler.getAllConnections();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe('closed');
    });
  });
});

describe('ConnectionHandler edge cases', () => {
  let handler: ConnectionHandler;
  let mockHcs10: jest.Mocked<HCS10Client>;

  beforeEach(() => {
    mockHcs10 = createMockHCS10();
    handler = new ConnectionHandler(TEST_CONFIG, mockHcs10);
  });

  afterEach(() => {
    handler.stop();
  });

  it('should handle empty content fields in connection request', async () => {
    mockHcs10.readMessages.mockResolvedValueOnce([
      {
        content: { p: 'hcs-10', op: 'connection_request' }, // no account_id
        sequenceNumber: 700,
        timestamp: '2026-02-12T12:00:00Z',
      },
    ]);

    const requests = await handler.pollInboundTopic();
    expect(requests).toHaveLength(1);
    expect(requests[0].from_account).toBe('unknown');
  });

  it('should handle readMessages failure gracefully during poll', async () => {
    mockHcs10.readMessages.mockRejectedValueOnce(new Error('Network error'));

    // pollInboundTopic should throw, but when called from interval it's caught
    await expect(handler.pollInboundTopic()).rejects.toThrow('Network error');
  });

  it('should handle multiple connection requests in one poll', async () => {
    mockHcs10.readMessages.mockResolvedValueOnce([
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.A' }, sequenceNumber: 1, timestamp: '2026-02-12T12:00:00Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.B' }, sequenceNumber: 2, timestamp: '2026-02-12T12:00:01Z' },
      { content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.C' }, sequenceNumber: 3, timestamp: '2026-02-12T12:00:02Z' },
    ]);

    const requests = await handler.pollInboundTopic();
    expect(requests).toHaveLength(3);
    expect(handler.getPendingRequests()).toHaveLength(3);
  });
});
