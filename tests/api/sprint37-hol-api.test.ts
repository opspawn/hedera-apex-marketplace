/**
 * Sprint 37: HOL API Route Logic Tests
 *
 * Tests all /api/hol/* endpoint logic by testing the underlying
 * HOLRegistryClient and HOLAutoRegister directly (same pattern as
 * existing hol-api-routes.test.ts).
 *
 * Covers: search, stats, registries, protocols, resolve, similar,
 * skills, register, quote, auto-register, chat.
 */

import { HOLRegistryClient, HOLApiError } from '../../src/hol/hol-registry-client';
import { HOLAutoRegister } from '../../src/hol/hol-auto-register';
import { RegisteredAgent } from '../../src/types';
import { DEMO_AGENTS } from '../../src/seed/demo-agents';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function createTestAgent(overrides?: Partial<RegisteredAgent>): RegisteredAgent {
  return {
    name: 'TestAgent',
    description: 'A test agent',
    agent_id: `agent-${Math.random().toString(36).slice(2)}`,
    endpoint: 'https://test.com/a2a',
    protocols: ['hcs-10'],
    payment_address: '0.0.1234',
    skills: [{ id: 'sk1', name: 'Skill', description: 'desc', category: 'test', tags: ['t'], input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
    inbound_topic: '0.0.100',
    outbound_topic: '0.0.101',
    profile_topic: '0.0.102',
    reputation_score: 80,
    status: 'online',
    registered_at: '2026-02-18T00:00:00Z',
    hedera_verified: true,
    hedera_transactions: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/search — Proxy search with caching
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/search', () => {
  it('should proxy search with q + minTrust + limit + page', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [{ id: 'a1', uaid: 'u1', name: 'Marketplace', registry: 'hcs-10', trustScore: 90 }],
      total: 1, page: 1, limit: 10, hasMore: false,
    }));

    const result = await client.search({ q: 'marketplace', minTrust: 50, limit: 10, page: 1 });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].trustScore).toBe(90);
    expect(result.total).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=marketplace'),
      expect.any(Object),
    );
  });

  it('should proxy search with protocol filter', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ protocol: 'a2a' });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('protocol=a2a'), expect.any(Object));
  });

  it('should proxy search with registry filter', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ registry: 'moltbook' });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('registry=moltbook'), expect.any(Object));
  });

  it('should cache identical search queries', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [{ id: 'c', uaid: 'c', name: 'Cached', registry: 'test' }], total: 1 }));
    await client.search({ q: 'cache-api' });
    await client.search({ q: 'cache-api' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return 502-equivalent on server error', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', text: () => Promise.resolve('err') });
    await expect(client.search({ q: 'error' })).rejects.toThrow(HOLApiError);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/stats — Platform statistics
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/stats', () => {
  it('should return platform stats with 93K+ agents', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      totalAgents: 93310, totalRegistries: 15, totalProtocols: 8,
      registries: [{ name: 'agentverse', count: 37900 }, { name: 'pulsemcp', count: 16100 }],
      protocols: [{ name: 'hcs-10', count: 12000 }],
      lastUpdated: '2026-02-18T00:00:00Z',
    }));
    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(93310);
    expect(stats.totalRegistries).toBe(15);
    expect(stats.registries).toHaveLength(2);
  });

  it('should handle missing stat fields', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(0);
    expect(stats.registries).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/registries — List all registries
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/registries', () => {
  it('should return 15 registries', async () => {
    const client = new HOLRegistryClient();
    const registriesData = Array.from({ length: 15 }, (_, i) => ({
      name: `registry-${i}`, agentCount: 1000 + i * 500,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse({ registries: registriesData }));
    const registries = await client.getRegistries();
    expect(registries).toHaveLength(15);
    expect(registries[0].name).toBe('registry-0');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/protocols — List all protocols
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/protocols', () => {
  it('should return multiple protocols', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      protocols: [
        { name: 'hcs-10', agentCount: 12000 },
        { name: 'a2a', agentCount: 8000 },
        { name: 'mcp', agentCount: 5000 },
        { name: 'xmtp', agentCount: 3000 },
      ],
    }));
    const protocols = await client.getProtocols();
    expect(protocols).toHaveLength(4);
    expect(protocols.find(p => p.name === 'hcs-10')?.agentCount).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/agent/:uaid — Resolve agent
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/agent/:uaid', () => {
  it('should resolve agent with full profile', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      id: 'agent-1', uaid: 'uaid-resolve', name: 'FullAgent', registry: 'hcs-10',
      description: 'Full agent description',
      trustScore: 92,
      capabilities: ['search', 'chat'],
      protocols: ['hcs-10', 'a2a'],
      endpoints: { a2a: 'https://agent.com/a2a' },
      profile: { type: 'ai_agent', display_name: 'Full Agent' },
    }));
    const agent = await client.resolve('uaid-resolve');
    expect(agent).not.toBeNull();
    expect(agent!.trustScore).toBe(92);
    expect(agent!.capabilities).toContain('search');
    expect(agent!.endpoints?.a2a).toBe('https://agent.com/a2a');
  });

  it('should return null for 404', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found', text: () => Promise.resolve('') });
    const agent = await client.resolve('nonexistent');
    expect(agent).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/agent/:uaid/similar — Find similar agents
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/agent/:uaid/similar', () => {
  it('should find similar agents with limit', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [
        { id: 's1', uaid: 'sim-1', name: 'Similar1', registry: 'test', trustScore: 85 },
        { id: 's2', uaid: 'sim-2', name: 'Similar2', registry: 'test', trustScore: 78 },
      ],
    }));
    const agents = await client.findSimilar('uaid-origin', 5);
    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Similar1');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('?limit=5'), expect.any(Object));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/skills — Browse skills
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/skills', () => {
  it('should list skills with limit and name filter', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      skills: [
        { id: 'sk1', name: 'translation', description: 'Translate text', category: 'nlp', tags: ['translate'] },
        { id: 'sk2', name: 'summarization', description: 'Summarize docs', category: 'nlp' },
      ],
    }));
    const skills = await client.getSkills({ limit: 10, name: 'trans' });
    expect(skills).toHaveLength(2);
    expect(skills[0].category).toBe('nlp');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/register — Register agent
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/register', () => {
  it('should register agent with full profile', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test-key' });
    mockFetch.mockResolvedValueOnce(mockResponse({ uaid: 'new-uaid', agentId: 'new-id', status: 'registered' }));
    const result = await client.register({
      name: 'HireWire Marketplace',
      description: 'Decentralized agent marketplace',
      capabilities: ['discovery', 'hiring'],
      protocols: ['hcs-10', 'a2a'],
    });
    expect(result.success).toBe(true);
    expect(result.uaid).toBe('new-uaid');
  });

  it('should handle 402 Payment Required', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402, statusText: 'Payment Required', text: () => Promise.resolve('') });
    const result = await client.register({ name: 'NoPay', description: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('402');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/register/quote — Registration quote
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/register/quote', () => {
  it('should return price quote in HBAR', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ credits: 100, currency: 'HBAR', estimatedProcessingTime: '30s' }));
    const quote = await client.getRegistrationQuote({ name: 'QuoteAgent', description: 'test' });
    expect(quote.credits).toBe(100);
    expect(quote.currency).toBe('HBAR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/register/all — Auto-register all agents
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/register/all', () => {
  it('should auto-register all 24 demo agents', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    const autoRegister = new HOLAutoRegister(client, 'https://hedera.opspawn.com');

    const agents = DEMO_AGENTS.map((da, i) => createTestAgent({
      agent_id: `agent-${i}`,
      name: da.name,
      description: da.description,
      skills: da.skills,
      protocols: da.protocols,
    }));

    // All agents not found in search
    for (let i = 0; i < agents.length; i++) {
      mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    }
    // All registrations succeed
    for (let i = 0; i < agents.length; i++) {
      mockFetch.mockResolvedValueOnce(mockResponse({ uaid: `uaid-${i}`, success: true }));
    }

    const result = await autoRegister.autoRegisterAll(agents);
    expect(result.registered).toBe(24);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.records).toHaveLength(24);
  });

  it('should report registration status after auto-register', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    const autoRegister = new HOLAutoRegister(client);

    // Register one agent
    const agents = [createTestAgent({ agent_id: 'status-1', name: 'StatusAgent' })];
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ uaid: 'uaid-status', success: true }));
    await autoRegister.autoRegisterAll(agents);

    const summary = autoRegister.getSummary();
    expect(summary.total).toBe(1);
    expect(summary.registered).toBe(1);

    const records = autoRegister.getRecords();
    expect(records[0].name).toBe('StatusAgent');
    expect(records[0].holUaid).toBe('uaid-status');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /api/hol/chat — Create session + send message
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: /api/hol/chat', () => {
  it('should create chat session with agent', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    mockFetch.mockResolvedValueOnce(mockResponse({ sessionId: 'sess-api', createdAt: '2026-02-18T00:00:00Z' }));
    const session = await client.createChatSession('uaid-chat-target');
    expect(session.sessionId).toBe('sess-api');
    expect(session.agentUaid).toBe('uaid-chat-target');
    expect(session.status).toBe('active');
  });

  it('should send message and receive response', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      response: { content: 'Found 3 matching agents for you.', timestamp: '2026-02-18T00:00:01Z' },
    }));
    const resp = await client.sendChatMessage('sess-api', 'Find agents for NLP tasks');
    expect(resp.message.content).toBe('Find agents for NLP tasks');
    expect(resp.message.role).toBe('user');
    expect(resp.agentResponse?.content).toBe('Found 3 matching agents for you.');
    expect(resp.agentResponse?.role).toBe('agent');
  });

  it('should handle chat timeout gracefully', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test', timeout: 1 });
    mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));
    await expect(client.createChatSession('slow-agent')).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Cross-Cutting: Full HOL → API Flow
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint 37 API: Full HOL Integration Flow', () => {
  it('should support complete discover → chat → register flow', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });

    // Step 1: Search for agents
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [{ id: 'a1', uaid: 'target-uaid', name: 'LinguaFlow', registry: 'hcs-10', trustScore: 87 }],
      total: 1,
    }));
    const search = await client.search({ q: 'translation', minTrust: 50 });
    expect(search.agents).toHaveLength(1);

    // Step 2: Resolve the agent
    mockFetch.mockResolvedValueOnce(mockResponse({
      id: 'a1', uaid: 'target-uaid', name: 'LinguaFlow', registry: 'hcs-10',
      trustScore: 87, capabilities: ['translation'],
      endpoints: { a2a: 'https://linguaflow.opspawn.com/a2a' },
    }));
    const agent = await client.resolve('target-uaid');
    expect(agent?.capabilities).toContain('translation');

    // Step 3: Create chat session
    mockFetch.mockResolvedValueOnce(mockResponse({ sessionId: 'flow-session', createdAt: '2026-02-18T00:00:00Z' }));
    const session = await client.createChatSession('target-uaid');
    expect(session.sessionId).toBe('flow-session');

    // Step 4: Send message
    mockFetch.mockResolvedValueOnce(mockResponse({
      response: { content: 'Hello! I can translate 40+ languages.', timestamp: '2026-02-18T00:00:01Z' },
    }));
    const chat = await client.sendChatMessage(session.sessionId, 'Can you translate English to French?');
    expect(chat.agentResponse?.content).toContain('translate');
  });

  it('should support stats → registries → protocols flow', async () => {
    const client = new HOLRegistryClient();

    // Stats
    mockFetch.mockResolvedValueOnce(mockResponse({ totalAgents: 93310, totalRegistries: 15, totalProtocols: 8 }));
    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(93310);

    // Registries
    mockFetch.mockResolvedValueOnce(mockResponse({ registries: [{ name: 'agentverse', agentCount: 37900 }] }));
    const registries = await client.getRegistries();
    expect(registries.length).toBeGreaterThan(0);

    // Protocols
    mockFetch.mockResolvedValueOnce(mockResponse({ protocols: [{ name: 'hcs-10', agentCount: 12000 }] }));
    const protocols = await client.getProtocols();
    expect(protocols.length).toBeGreaterThan(0);
  });
});
