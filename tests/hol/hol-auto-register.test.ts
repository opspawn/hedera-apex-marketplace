/**
 * Tests for HOL Auto-Registration — registers marketplace agents in HOL.
 *
 * Sprint 37: Auto-registration for $8K HOL bounty.
 */

import { HOLAutoRegister, HOLRegistrationRecord, AutoRegistrationResult } from '../../src/hol/hol-auto-register';
import { HOLRegistryClient, HOLSearchResult, HOLRegistrationResult } from '../../src/hol/hol-registry-client';
import { RegisteredAgent } from '../../src/types';

// ── Mock HOL Client ────────────────────────────────────────────────────

function createMockClient(overrides?: Partial<HOLRegistryClient>): HOLRegistryClient {
  return {
    search: jest.fn().mockResolvedValue({ agents: [], total: 0, page: 1, limit: 20, hasMore: false }),
    register: jest.fn().mockResolvedValue({ success: true, uaid: 'auto-uaid-1', agentId: 'auto-agent-1' }),
    getStats: jest.fn().mockResolvedValue({ totalAgents: 93000, totalRegistries: 15, totalProtocols: 8, registries: [], protocols: [], lastUpdated: '' }),
    resolve: jest.fn().mockResolvedValue(null),
    getBaseUrl: jest.fn().mockReturnValue('https://hol.org/registry/api/v1'),
    ...overrides,
  } as unknown as HOLRegistryClient;
}

function createTestAgent(overrides?: Partial<RegisteredAgent>): RegisteredAgent {
  return {
    name: 'TestAgent',
    description: 'A test agent for testing',
    agent_id: 'agent-test-1',
    endpoint: 'https://test.example.com/a2a',
    protocols: ['hcs-10', 'a2a'],
    payment_address: '0.0.1234',
    skills: [
      {
        id: 'skill-1',
        name: 'Test Skill',
        description: 'A test skill',
        category: 'testing',
        tags: ['test'],
        input_schema: {},
        output_schema: {},
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      },
    ],
    inbound_topic: '0.0.100',
    outbound_topic: '0.0.101',
    profile_topic: '0.0.102',
    reputation_score: 85,
    trust_score: 75,
    trust_level: 'trusted',
    status: 'online',
    registered_at: '2026-02-17T00:00:00Z',
    hedera_verified: true,
    hedera_transactions: [],
    ...overrides,
  };
}

// ── Constructor ─────────────────────────────────────────────────────────

describe('HOLAutoRegister constructor', () => {
  it('should create with client', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    expect(reg).toBeInstanceOf(HOLAutoRegister);
  });

  it('should accept custom staging URL', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client, 'https://custom.staging.com');
    expect(reg).toBeInstanceOf(HOLAutoRegister);
  });
});

// ── buildPayload ────────────────────────────────────────────────────────

describe('HOLAutoRegister.buildPayload', () => {
  it('should build registration payload from agent', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client, 'https://staging.test.com');
    const agent = createTestAgent();

    const payload = reg.buildPayload(agent);

    expect(payload.name).toBe('TestAgent');
    expect(payload.description).toBe('A test agent for testing');
    expect(payload.capabilities).toEqual(['Test Skill']);
    expect(payload.protocols).toEqual(['hcs-10', 'a2a']);
    expect(payload.endpoints).toBeDefined();
    expect(payload.endpoints!.a2a).toContain('staging.test.com');
    expect(payload.endpoints!.chat).toContain('staging.test.com');
    expect(payload.communicationProtocol).toBe('hcs-10');
    expect(payload.registry).toBe('hashgraph-online');
  });

  it('should include agent profile with standards', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const payload = reg.buildPayload(agent);

    expect(payload.profile).toBeDefined();
    expect(payload.profile!.type).toBe('ai_agent');
    expect(payload.profile!.display_name).toBe('TestAgent');
    expect(payload.profile!.aiAgent).toBeDefined();
    expect(payload.profile!.aiAgent!.creator).toBe('OpSpawn');
  });

  it('should include metadata with marketplace agent ID', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent({ agent_id: 'my-agent-id' });

    const payload = reg.buildPayload(agent);

    expect(payload.metadata).toBeDefined();
    expect(payload.metadata!.marketplace_agent_id).toBe('my-agent-id');
    expect(payload.metadata!.inbound_topic).toBe('0.0.100');
  });

  it('should handle agent with no skills', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent({ skills: [] });

    const payload = reg.buildPayload(agent);
    expect(payload.capabilities).toEqual([]);
  });

  it('should extract unique categories', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent({
      skills: [
        { id: 's1', name: 'Skill A', category: 'nlp', tags: [], input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } },
        { id: 's2', name: 'Skill B', category: 'nlp', tags: [], input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } },
        { id: 's3', name: 'Skill C', category: 'blockchain', tags: [], input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } },
      ],
    });

    const payload = reg.buildPayload(agent);
    expect(payload.capabilities).toEqual(['Skill A', 'Skill B', 'Skill C']);
  });
});

// ── checkRegistered ─────────────────────────────────────────────────────

describe('HOLAutoRegister.checkRegistered', () => {
  it('should check if agents are registered', async () => {
    const client = createMockClient({
      search: jest.fn().mockResolvedValue({
        agents: [{ id: 'a1', uaid: 'u1', name: 'TestAgent', registry: 'hcs-10' }],
        total: 1, page: 1, limit: 5, hasMore: false,
      }),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const results = await reg.checkRegistered([agent]);
    expect(results.get('agent-test-1')).toBeDefined();
    expect(results.get('agent-test-1')!.name).toBe('TestAgent');
  });

  it('should return null for unregistered agents', async () => {
    const client = createMockClient({
      search: jest.fn().mockResolvedValue({ agents: [], total: 0, page: 1, limit: 5, hasMore: false }),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const results = await reg.checkRegistered([agent]);
    expect(results.get('agent-test-1')).toBeNull();
  });

  it('should handle search errors gracefully', async () => {
    const client = createMockClient({
      search: jest.fn().mockRejectedValue(new Error('Network error')),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const results = await reg.checkRegistered([agent]);
    expect(results.get('agent-test-1')).toBeNull();
  });

  it('should check multiple agents', async () => {
    let callCount = 0;
    const client = createMockClient({
      search: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { agents: [{ id: 'a1', uaid: 'u1', name: 'Agent1', registry: 'test' }], total: 1 };
        return { agents: [], total: 0 };
      }),
    });
    const reg = new HOLAutoRegister(client);

    const results = await reg.checkRegistered([
      createTestAgent({ agent_id: 'a1', name: 'Agent1' }),
      createTestAgent({ agent_id: 'a2', name: 'Agent2' }),
    ]);

    expect(results.size).toBe(2);
  });
});

// ── registerAgent ───────────────────────────────────────────────────────

describe('HOLAutoRegister.registerAgent', () => {
  it('should register a single agent', async () => {
    const client = createMockClient({
      register: jest.fn().mockResolvedValue({ success: true, uaid: 'new-uaid', agentId: 'new-agent' }),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const record = await reg.registerAgent(agent);
    expect(record.status).toBe('registered');
    expect(record.holUaid).toBe('new-uaid');
    expect(record.agentId).toBe('agent-test-1');
  });

  it('should handle registration failure', async () => {
    const client = createMockClient({
      register: jest.fn().mockResolvedValue({ success: false, error: 'Insufficient credits' }),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const record = await reg.registerAgent(agent);
    expect(record.status).toBe('failed');
    expect(record.error).toBe('Insufficient credits');
  });

  it('should handle registration exception', async () => {
    const client = createMockClient({
      register: jest.fn().mockRejectedValue(new Error('Network failure')),
    });
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    const record = await reg.registerAgent(agent);
    expect(record.status).toBe('failed');
    expect(record.error).toContain('Network failure');
  });

  it('should store record for later retrieval', async () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    const agent = createTestAgent();

    await reg.registerAgent(agent);
    const record = reg.getRecord('agent-test-1');
    expect(record).toBeDefined();
    expect(record!.name).toBe('TestAgent');
  });
});

// ── autoRegisterAll ─────────────────────────────────────────────────────

describe('HOLAutoRegister.autoRegisterAll', () => {
  it('should auto-register all agents', async () => {
    const client = createMockClient({
      search: jest.fn().mockResolvedValue({ agents: [], total: 0 }),
      register: jest.fn().mockResolvedValue({ success: true, uaid: 'new-uaid' }),
    });
    const reg = new HOLAutoRegister(client);

    const result = await reg.autoRegisterAll([
      createTestAgent({ agent_id: 'a1', name: 'Agent1' }),
      createTestAgent({ agent_id: 'a2', name: 'Agent2' }),
    ]);

    expect(result.registered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.records).toHaveLength(2);
  });

  it('should skip already registered agents', async () => {
    const client = createMockClient({
      search: jest.fn().mockResolvedValue({
        agents: [{ id: 'a1', uaid: 'existing-uaid', name: 'Agent1', registry: 'test' }],
        total: 1,
      }),
    });
    const reg = new HOLAutoRegister(client);

    const result = await reg.autoRegisterAll([
      createTestAgent({ agent_id: 'a1', name: 'Agent1' }),
    ]);

    expect(result.registered).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.records[0].status).toBe('skipped');
    expect(result.records[0].holUaid).toBe('existing-uaid');
  });

  it('should handle mixed results (registered + skipped + failed)', async () => {
    let searchCount = 0;
    let registerCount = 0;
    const client = createMockClient({
      search: jest.fn().mockImplementation(async () => {
        searchCount++;
        if (searchCount === 2) return { agents: [{ id: 'a2', uaid: 'existing', name: 'Agent2', registry: 'test' }], total: 1 };
        return { agents: [], total: 0 };
      }),
      register: jest.fn().mockImplementation(async () => {
        registerCount++;
        if (registerCount === 2) return { success: false, error: 'Failed' };
        return { success: true, uaid: 'new-uaid-' + registerCount };
      }),
    });
    const reg = new HOLAutoRegister(client);

    const result = await reg.autoRegisterAll([
      createTestAgent({ agent_id: 'a1', name: 'Agent1' }),
      createTestAgent({ agent_id: 'a2', name: 'Agent2' }),
      createTestAgent({ agent_id: 'a3', name: 'Agent3' }),
    ]);

    expect(result.registered).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.records).toHaveLength(3);
  });

  it('should handle empty agent list', async () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);

    const result = await reg.autoRegisterAll([]);
    expect(result.registered).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it('should set timestamp', async () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);

    const result = await reg.autoRegisterAll([]);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });
});

// ── getRecords / getSummary ─────────────────────────────────────────────

describe('HOLAutoRegister records and summary', () => {
  it('should return empty records initially', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    expect(reg.getRecords()).toHaveLength(0);
  });

  it('should return records after registration', async () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);

    await reg.registerAgent(createTestAgent());
    expect(reg.getRecords()).toHaveLength(1);
  });

  it('should get record by agent ID', async () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);

    await reg.registerAgent(createTestAgent({ agent_id: 'specific-id' }));
    const record = reg.getRecord('specific-id');
    expect(record).toBeDefined();
    expect(record!.agentId).toBe('specific-id');
  });

  it('should return undefined for unknown agent', () => {
    const client = createMockClient();
    const reg = new HOLAutoRegister(client);
    expect(reg.getRecord('nonexistent')).toBeUndefined();
  });

  it('should return correct summary', async () => {
    const client = createMockClient({
      search: jest.fn().mockResolvedValue({ agents: [], total: 0 }),
      register: jest.fn()
        .mockResolvedValueOnce({ success: true, uaid: 'u1' })
        .mockResolvedValueOnce({ success: false, error: 'fail' }),
    });
    const reg = new HOLAutoRegister(client);

    await reg.autoRegisterAll([
      createTestAgent({ agent_id: 'a1' }),
      createTestAgent({ agent_id: 'a2' }),
    ]);

    const summary = reg.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.registered).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(0);
  });
});
