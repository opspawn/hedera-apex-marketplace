import { HederaTestnetClient } from '../../src/hedera/client';

describe('HederaTestnetClient', () => {
  describe('constructor', () => {
    it('should default to mock mode when no credentials provided', () => {
      const client = new HederaTestnetClient();
      expect(client.isMockMode()).toBe(true);
    });

    it('should be in mock mode with empty account ID', () => {
      const client = new HederaTestnetClient({ accountId: '', privateKey: 'test-key' });
      expect(client.isMockMode()).toBe(true);
    });

    it('should be in mock mode with empty private key', () => {
      const client = new HederaTestnetClient({ accountId: '0.0.12345', privateKey: '' });
      expect(client.isMockMode()).toBe(true);
    });

    it('should fall back to mock when SDK init fails with bad credentials', () => {
      // Use a clearly invalid key that will cause SDK to throw
      const client = new HederaTestnetClient({
        accountId: '0.0.12345',
        privateKey: 'not-a-valid-key',
        network: 'testnet',
      });
      // Falls back to mock mode when SDK fails to initialize
      expect(client.isMockMode()).toBe(true);
    });

    it('should accept explicit network setting', () => {
      const client = new HederaTestnetClient({ network: 'mainnet' });
      const status = client.getStatus();
      expect(status.network).toBe('mainnet');
    });
  });

  describe('getStatus', () => {
    it('should return mock status when in mock mode', () => {
      const client = new HederaTestnetClient();
      const status = client.getStatus();
      expect(status.mode).toBe('mock');
      expect(status.connected).toBe(false);
      expect(status.network).toBe('testnet');
      expect(status.mirrorNode).toBe('testnet.mirrornode.hedera.com');
    });

    it('should return mainnet mirror node for mainnet', () => {
      const client = new HederaTestnetClient({ network: 'mainnet' });
      const status = client.getStatus();
      expect(status.mirrorNode).toBe('mainnet-public.mirrornode.hedera.com');
    });

    it('should return mock-account when no account configured', () => {
      const client = new HederaTestnetClient();
      const status = client.getStatus();
      expect(status.accountId).toBe('mock-account');
    });

    it('should return configured account ID when provided', () => {
      const client = new HederaTestnetClient({ accountId: '0.0.99999' });
      const status = client.getStatus();
      expect(status.accountId).toBe('0.0.99999');
    });
  });

  describe('createTopic (mock mode)', () => {
    it('should return a mock topic ID', async () => {
      const client = new HederaTestnetClient();
      const result = await client.createTopic('test-memo');
      expect(result.topicId).toMatch(/^0\.0\.\d+$/);
      expect(result.memo).toBe('test-memo');
      expect(result.createdAt).toBeDefined();
    });

    it('should generate unique topic IDs', async () => {
      const client = new HederaTestnetClient();
      const t1 = await client.createTopic('topic-1');
      const t2 = await client.createTopic('topic-2');
      expect(t1.topicId).not.toBe(t2.topicId);
    });
  });

  describe('submitMessage (mock mode)', () => {
    it('should return mock message result with string message', async () => {
      const client = new HederaTestnetClient();
      const result = await client.submitMessage('0.0.12345', 'hello world');
      expect(result.topicId).toBe('0.0.12345');
      expect(result.sequenceNumber).toBe(1);
      expect(result.timestamp).toBeDefined();
    });

    it('should return mock message result with object message', async () => {
      const client = new HederaTestnetClient();
      const result = await client.submitMessage('0.0.12345', { type: 'test', data: 'hello' });
      expect(result.topicId).toBe('0.0.12345');
      expect(result.sequenceNumber).toBe(1);
    });

    it('should increment sequence numbers per topic', async () => {
      const client = new HederaTestnetClient();
      const r1 = await client.submitMessage('0.0.111', 'msg1');
      const r2 = await client.submitMessage('0.0.111', 'msg2');
      const r3 = await client.submitMessage('0.0.222', 'msg3');
      expect(r1.sequenceNumber).toBe(1);
      expect(r2.sequenceNumber).toBe(2);
      expect(r3.sequenceNumber).toBe(1); // Different topic starts at 1
    });
  });

  describe('getTopicMessages (mock mode)', () => {
    it('should return empty array in mock mode', async () => {
      const client = new HederaTestnetClient();
      const messages = await client.getTopicMessages('0.0.12345');
      expect(messages).toEqual([]);
    });
  });

  describe('getAccountBalance (mock mode)', () => {
    it('should return mock balance', async () => {
      const client = new HederaTestnetClient();
      const balance = await client.getAccountBalance();
      expect(balance.hbar).toBe(10000);
      expect(balance.tokens).toEqual({});
    });
  });

  describe('close', () => {
    it('should close without error in mock mode', async () => {
      const client = new HederaTestnetClient();
      await expect(client.close()).resolves.not.toThrow();
    });
  });
});
