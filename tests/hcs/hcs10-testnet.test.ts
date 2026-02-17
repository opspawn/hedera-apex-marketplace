import { HCS10Client } from '../../src/hcs/hcs10-client';
import { TestnetIntegration } from '../../src/hedera/testnet-integration';

describe('HCS10Client with TestnetIntegration', () => {
  const config = {
    accountId: '0.0.test',
    privateKey: 'test-key',
    network: 'testnet' as const,
    registryTopicId: '0.0.registry',
  };

  const testnetConfig = {
    accountId: '',
    privateKey: '',
    network: 'testnet' as const,
  };

  describe('testnet integration setup', () => {
    it('should start without testnet integration', () => {
      const client = new HCS10Client(config);
      expect(client.hasTestnetIntegration()).toBe(false);
    });

    it('should accept testnet integration in constructor', () => {
      const testnet = new TestnetIntegration(testnetConfig);
      const client = new HCS10Client(config, testnet);
      expect(client.hasTestnetIntegration()).toBe(true);
    });

    it('should accept testnet integration via setter', () => {
      const client = new HCS10Client(config);
      expect(client.hasTestnetIntegration()).toBe(false);
      const testnet = new TestnetIntegration(testnetConfig);
      client.setTestnetIntegration(testnet);
      expect(client.hasTestnetIntegration()).toBe(true);
    });
  });

  describe('registerAgent with testnet', () => {
    it('should create real topics when testnet is attached', async () => {
      const testnet = new TestnetIntegration(testnetConfig);
      const client = new HCS10Client(config, testnet);

      const agent = await client.registerAgent({
        name: 'TestAgent',
        description: 'A test agent',
        endpoint: 'https://test.com',
        protocols: ['hcs-10'],
        payment_address: '0.0.99999',
        skills: [{
          id: 'test-skill',
          name: 'Test Skill',
          description: 'A test skill',
          category: 'test',
          tags: ['test'],
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
        }],
      });

      expect(agent.agent_id).toMatch(/^0\.0\./);
      expect(agent.name).toBe('TestAgent');
      // Topics should be real (not the registry fallback)
      expect(agent.inbound_topic).toMatch(/^0\.0\.\d+$/);
      expect(agent.outbound_topic).toMatch(/^0\.0\.\d+$/);
      expect(agent.profile_topic).toMatch(/^0\.0\.\d+$/);

      // Testnet should have recorded 3 topics + 1 registration message
      const summary = testnet.getSessionSummary();
      expect(summary.topicsCreated).toBe(3);
      expect(summary.messagesSubmitted).toBe(1);
    });

    it('should use registry topic as fallback without testnet', async () => {
      const client = new HCS10Client(config);

      const agent = await client.registerAgent({
        name: 'FallbackAgent',
        description: 'A fallback agent',
        endpoint: 'https://test.com',
        protocols: ['hcs-10'],
        payment_address: '0.0.99999',
        skills: [{
          id: 'test',
          name: 'Test',
          description: 'Test',
          input_schema: {},
          output_schema: {},
          pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
        }],
      });

      // Without testnet, topics should fall back to registry topic
      expect(agent.inbound_topic).toBe('0.0.registry');
      expect(agent.outbound_topic).toBe('0.0.registry');
      expect(agent.profile_topic).toBe('0.0.registry');
    });
  });

  describe('sendMessage with testnet', () => {
    it('should submit message via testnet integration', async () => {
      const testnet = new TestnetIntegration(testnetConfig);
      const client = new HCS10Client(config, testnet);

      const result = await client.sendMessage('0.0.123', { type: 'test', data: 'hello' });
      expect(result.sequenceNumber).toBe(1);
      expect(result.timestamp).toBeDefined();

      // Testnet should have recorded the message
      expect(testnet.getMessages().length).toBe(1);
    });

    it('should return mock result without testnet', async () => {
      const client = new HCS10Client(config);
      const result = await client.sendMessage('0.0.123', { type: 'test' });
      expect(result.sequenceNumber).toBe(1);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createTopic with testnet', () => {
    it('should create topic via testnet integration', async () => {
      const testnet = new TestnetIntegration(testnetConfig);
      const client = new HCS10Client(config, testnet);

      const topicId = await client.createTopic('test-memo');
      expect(topicId).toMatch(/^0\.0\.\d+$/);

      // Testnet should have recorded the topic
      expect(testnet.getTopics().length).toBe(1);
      expect(testnet.getTopics()[0].memo).toBe('test-memo');
    });

    it('should return mock topic without testnet', async () => {
      const client = new HCS10Client(config);
      const topicId = await client.createTopic('test-memo');
      expect(topicId).toMatch(/^0\.0\.\d+$/);
    });
  });

  describe('readMessages with testnet', () => {
    it('should return empty array via testnet (mock)', async () => {
      const testnet = new TestnetIntegration(testnetConfig);
      const client = new HCS10Client(config, testnet);

      const messages = await client.readMessages('0.0.123');
      expect(messages).toEqual([]);
    });

    it('should return empty array without testnet', async () => {
      const client = new HCS10Client(config);
      const messages = await client.readMessages('0.0.123');
      expect(messages).toEqual([]);
    });
  });
});
