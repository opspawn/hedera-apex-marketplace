/**
 * Integration tests for the HOL module exports.
 */

import { RegistryBroker, ConnectionHandler } from '../../src/hol';
import { HCS10Client } from '../../src/hcs/hcs10-client';

describe('HOL module exports', () => {
  it('should export RegistryBroker', () => {
    expect(RegistryBroker).toBeDefined();
    const broker = new RegistryBroker({
      accountId: '0.0.test',
      privateKey: 'key',
      network: 'testnet',
    });
    expect(broker).toBeInstanceOf(RegistryBroker);
  });

  it('should export ConnectionHandler', () => {
    expect(ConnectionHandler).toBeDefined();
    const mockHcs10 = {
      readMessages: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn(),
      createTopic: jest.fn(),
      getConfig: jest.fn().mockReturnValue({}),
    } as unknown as HCS10Client;

    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.123',
      outboundTopicId: '0.0.456',
      accountId: '0.0.789',
    }, mockHcs10);
    expect(handler).toBeInstanceOf(ConnectionHandler);
  });
});
