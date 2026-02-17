import { HCS10Client } from '../../src/hcs/hcs10-client';

describe('HCS10Client', () => {
  let client: HCS10Client;

  beforeEach(() => {
    client = new HCS10Client({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
      registryTopicId: '0.0.7311321',
    });
  });

  test('should initialize with config', () => {
    const config = client.getConfig();
    expect(config.accountId).toBe('0.0.7854018');
    expect(config.network).toBe('testnet');
    expect(config.registryTopicId).toBe('0.0.7311321');
  });

  test('should register an agent and return RegisteredAgent', async () => {
    const result = await client.registerAgent({
      name: 'Test Agent',
      description: 'A test agent',
      skills: [{
        id: 'test-skill',
        name: 'Test Skill',
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' },
      }],
      endpoint: 'https://test.example.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.1234567',
    });

    expect(result.agent_id).toBeDefined();
    expect(result.name).toBe('Test Agent');
    expect(result.status).toBe('online');
    expect(result.reputation_score).toBe(0);
    expect(result.registered_at).toBeDefined();
  });

  test('should send a message and return sequence info', async () => {
    const result = await client.sendMessage('0.0.7854276', { type: 'test' });
    expect(result.sequenceNumber).toBe(1);
    expect(result.timestamp).toBeDefined();
  });

  test('should read messages from a topic', async () => {
    const messages = await client.readMessages('0.0.7854276');
    expect(Array.isArray(messages)).toBe(true);
  });

  test('should create a topic and return topic ID', async () => {
    const topicId = await client.createTopic('test-topic');
    expect(topicId).toMatch(/^0\.0\.\d+$/);
  });
});
