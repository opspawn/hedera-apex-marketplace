/**
 * Unit tests for the HOL-related API endpoint handlers.
 *
 * Tests the route handler logic without HTTP transport.
 */

import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler, ConnectionHandlerConfig } from '../../src/hol/connection-handler';
import { HCS10Client } from '../../src/hcs/hcs10-client';

jest.mock('@hashgraphonline/standards-sdk', () => ({
  RegistryBrokerClient: jest.fn().mockImplementation(() => ({
    authenticateWithLedgerCredentials: jest.fn().mockResolvedValue(undefined),
    registerAgent: jest.fn().mockResolvedValue({ uaid: 'test-uaid', agentId: 'test-agent' }),
    search: jest.fn().mockResolvedValue({ agents: [] }),
  })),
}));

describe('Registry Broker endpoint logic', () => {
  const config = {
    accountId: '0.0.test',
    privateKey: 'mock-key',
    network: 'testnet' as const,
  };

  it('should register and return result with uaid', async () => {
    const broker = new RegistryBroker(config);
    const result = await broker.register();
    expect(result.success).toBe(true);
    expect(result.uaid).toBe('test-uaid');
  });

  it('should return status with registered flag', async () => {
    const broker = new RegistryBroker(config);
    expect(broker.getStatus().registered).toBe(false);
    await broker.register();
    expect(broker.getStatus().registered).toBe(true);
  });

  it('should verify registration via search', async () => {
    const broker = new RegistryBroker(config);
    // Mock returns empty results by default
    const verified = await broker.verifyRegistration();
    expect(typeof verified).toBe('boolean');
  });
});

describe('Connection handler endpoint logic', () => {
  function createMockHcs10() {
    return {
      readMessages: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ sequenceNumber: 1, timestamp: new Date().toISOString() }),
      createTopic: jest.fn().mockResolvedValue('0.0.99999'),
      getConfig: jest.fn().mockReturnValue({}),
    } as unknown as HCS10Client;
  }

  it('should list empty connections initially', () => {
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.123',
      outboundTopicId: '0.0.456',
      accountId: '0.0.789',
    }, createMockHcs10());

    expect(handler.getActiveConnections()).toEqual([]);
    expect(handler.getAllConnections()).toEqual([]);
    expect(handler.getPendingRequests()).toEqual([]);
  });

  it('should list pending requests after polling', async () => {
    const mock = createMockHcs10();
    mock.readMessages = jest.fn().mockResolvedValue([
      {
        content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.111' },
        sequenceNumber: 1,
        timestamp: '2026-02-12T12:00:00Z',
      },
    ]);

    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.123',
      outboundTopicId: '0.0.456',
      accountId: '0.0.789',
      autoAccept: false,
    }, mock);

    await handler.pollInboundTopic();
    expect(handler.getPendingRequests()).toHaveLength(1);
  });

  it('should track connection after accepting', async () => {
    const mock = createMockHcs10();
    mock.readMessages = jest.fn().mockResolvedValue([
      {
        content: { p: 'hcs-10', op: 'connection_request', account_id: '0.0.222' },
        sequenceNumber: 5,
        timestamp: '2026-02-12T12:00:00Z',
      },
    ]);

    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.123',
      outboundTopicId: '0.0.456',
      accountId: '0.0.789',
      autoAccept: false,
    }, mock);

    await handler.pollInboundTopic();
    const pending = handler.getPendingRequests();
    const conn = await handler.acceptConnection(pending[0].id);
    expect(conn.status).toBe('active');
    expect(handler.getActiveConnections()).toHaveLength(1);
  });
});
