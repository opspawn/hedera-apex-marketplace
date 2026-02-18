import { TestnetIntegration } from '../../src/hedera/testnet-integration';

// Get the mocked @hashgraph/sdk so we can temporarily override behaviour
const mockSdk = jest.requireMock('@hashgraph/sdk');

describe('TestnetIntegration', () => {
  describe('constructor', () => {
    it('should initialize in mock mode without credentials', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      expect(integration.isLive()).toBe(false);
    });

    it('should fall back to mock with invalid credentials', () => {
      // Make all PrivateKey parse methods throw to simulate invalid key
      const origECDSA = mockSdk.PrivateKey.fromStringECDSA;
      const origED25519 = mockSdk.PrivateKey.fromStringED25519;
      const origFromString = mockSdk.PrivateKey.fromString;
      mockSdk.PrivateKey.fromStringECDSA = jest.fn(() => { throw new Error('bad key'); });
      mockSdk.PrivateKey.fromStringED25519 = jest.fn(() => { throw new Error('bad key'); });
      mockSdk.PrivateKey.fromString = jest.fn(() => { throw new Error('bad key'); });

      const integration = new TestnetIntegration({
        accountId: '0.0.12345',
        privateKey: 'invalid-key',
        network: 'testnet',
      });
      // Falls back to mock because SDK init fails
      expect(integration.isLive()).toBe(false);

      // Restore original mock behaviour
      mockSdk.PrivateKey.fromStringECDSA = origECDSA;
      mockSdk.PrivateKey.fromStringED25519 = origED25519;
      mockSdk.PrivateKey.fromString = origFromString;
    });

    it('should accept testnet network', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const status = integration.getStatus();
      expect(status.network).toBe('testnet');
    });

    it('should accept mainnet network', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'mainnet',
      });
      const status = integration.getStatus();
      expect(status.network).toBe('mainnet');
    });
  });

  describe('getStatus', () => {
    it('should return complete status object', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const status = integration.getStatus();
      expect(status.mode).toBe('mock');
      expect(status.network).toBe('testnet');
      expect(status.topicsCreated).toBe(0);
      expect(status.messagesSubmitted).toBe(0);
      expect(status.connected).toBe(false);
    });

    it('should track topics created count', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await integration.createTopic('test-topic');
      expect(integration.getStatus().topicsCreated).toBe(1);
    });

    it('should track messages submitted count', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await integration.submitMessage('0.0.123', 'hello');
      expect(integration.getStatus().messagesSubmitted).toBe(1);
    });
  });

  describe('createTopic', () => {
    it('should create a topic with a memo', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const topic = await integration.createTopic('my-test-topic');
      expect(topic.topicId).toMatch(/^0\.0\.\d+$/);
      expect(topic.memo).toBe('my-test-topic');
      expect(topic.createdAt).toBeDefined();
      expect(topic.onChain).toBe(false); // mock mode
    });

    it('should generate unique topic IDs', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const t1 = await integration.createTopic('topic-1');
      const t2 = await integration.createTopic('topic-2');
      expect(t1.topicId).not.toBe(t2.topicId);
    });

    it('should record topics in session', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await integration.createTopic('topic-a');
      await integration.createTopic('topic-b');
      const topics = integration.getTopics();
      expect(topics.length).toBe(2);
      expect(topics[0].memo).toBe('topic-a');
      expect(topics[1].memo).toBe('topic-b');
    });
  });

  describe('submitMessage', () => {
    it('should submit a string message', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const result = await integration.submitMessage('0.0.123', 'hello world');
      expect(result.topicId).toBe('0.0.123');
      expect(result.sequenceNumber).toBe(1);
      expect(result.timestamp).toBeDefined();
      expect(result.content).toBe('hello world');
      expect(result.onChain).toBe(false);
    });

    it('should submit an object message', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const result = await integration.submitMessage('0.0.123', { type: 'test', data: 42 });
      expect(result.content).toBe(JSON.stringify({ type: 'test', data: 42 }));
    });

    it('should record messages in session', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await integration.submitMessage('0.0.111', 'msg-1');
      await integration.submitMessage('0.0.222', 'msg-2');
      const messages = integration.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('msg-1');
      expect(messages[1].content).toBe('msg-2');
    });

    it('should increment sequence numbers per topic', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const r1 = await integration.submitMessage('0.0.111', 'a');
      const r2 = await integration.submitMessage('0.0.111', 'b');
      expect(r1.sequenceNumber).toBe(1);
      expect(r2.sequenceNumber).toBe(2);
    });
  });

  describe('readMessages', () => {
    it('should return empty array in mock mode', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const msgs = await integration.readMessages('0.0.123');
      expect(msgs).toEqual([]);
    });
  });

  describe('getAccountBalance', () => {
    it('should return mock balance', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const balance = await integration.getAccountBalance();
      expect(balance.hbar).toBe(10000);
      expect(balance.tokens).toEqual({});
    });
  });

  describe('getSessionSummary', () => {
    it('should return empty summary initially', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const summary = integration.getSessionSummary();
      expect(summary.mode).toBe('mock');
      expect(summary.topicsCreated).toBe(0);
      expect(summary.messagesSubmitted).toBe(0);
      expect(summary.onChainTopics).toBe(0);
      expect(summary.onChainMessages).toBe(0);
      expect(summary.topics).toEqual([]);
      expect(summary.messages).toEqual([]);
    });

    it('should reflect session activity', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await integration.createTopic('t1');
      await integration.createTopic('t2');
      await integration.submitMessage('0.0.1', 'msg');
      const summary = integration.getSessionSummary();
      expect(summary.topicsCreated).toBe(2);
      expect(summary.messagesSubmitted).toBe(1);
      expect(summary.onChainTopics).toBe(0); // mock mode
      expect(summary.onChainMessages).toBe(0); // mock mode
    });
  });

  describe('getClient', () => {
    it('should return the underlying HederaTestnetClient', () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      const client = integration.getClient();
      expect(client).toBeDefined();
      expect(client.isMockMode()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close without error', async () => {
      const integration = new TestnetIntegration({
        accountId: '',
        privateKey: '',
        network: 'testnet',
      });
      await expect(integration.close()).resolves.not.toThrow();
    });
  });
});
