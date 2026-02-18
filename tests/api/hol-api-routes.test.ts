/**
 * Tests for HOL API routes (/api/hol/*) — Sprint 37.
 *
 * Tests HOL route handler logic without HTTP transport.
 * Uses HOLRegistryClient and HOLAutoRegister directly.
 */

import { HOLRegistryClient, HOLApiError } from '../../src/hol/hol-registry-client';
import { HOLAutoRegister } from '../../src/hol/hol-auto-register';
import { RegisteredAgent } from '../../src/types';

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

beforeEach(() => {
  mockFetch.mockReset();
});

function createTestAgent(overrides?: Partial<RegisteredAgent>): RegisteredAgent {
  return {
    name: 'TestAgent',
    description: 'A test agent',
    agent_id: 'agent-1',
    endpoint: 'https://test.com/a2a',
    protocols: ['hcs-10'],
    payment_address: '0.0.1234',
    skills: [],
    inbound_topic: '0.0.100',
    outbound_topic: '0.0.101',
    profile_topic: '0.0.102',
    reputation_score: 80,
    status: 'online',
    registered_at: '2026-02-17T00:00:00Z',
    hedera_verified: true,
    hedera_transactions: [],
    ...overrides,
  };
}

// ── Search Route Logic ────────────────────────────────────────────────

describe('/api/hol/search logic', () => {
  it('should search with query parameter', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [{ id: 'a1', uaid: 'u1', name: 'Found', registry: 'test', trustScore: 75 }],
      total: 1,
    }));

    const result = await client.search({ q: 'marketplace', limit: 20 });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('Found');
  });

  it('should search with protocol filter', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));

    const result = await client.search({ q: 'agent', protocol: 'hcs-10', minTrust: 50 });
    expect(result.agents).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('protocol=hcs-10'),
      expect.any(Object),
    );
  });

  it('should handle search failure with HOLApiError', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 502, statusText: 'Bad Gateway',
      text: () => Promise.resolve('Upstream error'),
    });

    await expect(client.search({ q: 'fail' })).rejects.toThrow(HOLApiError);
  });
});

// ── Stats Route Logic ─────────────────────────────────────────────────

describe('/api/hol/stats logic', () => {
  it('should return platform stats', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      totalAgents: 93310,
      totalRegistries: 15,
      totalProtocols: 8,
      registries: [{ name: 'agentverse', count: 37900 }],
      protocols: [{ name: 'hcs-10', count: 12000 }],
    }));

    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(93310);
    expect(stats.totalRegistries).toBe(15);
    expect(stats.registries).toHaveLength(1);
  });
});

// ── Registries Route Logic ────────────────────────────────────────────

describe('/api/hol/registries logic', () => {
  it('should list registries', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      registries: [
        { name: 'agentverse', agentCount: 37900, description: 'Fetch.ai agents' },
        { name: 'pulsemcp', agentCount: 16100 },
      ],
    }));

    const registries = await client.getRegistries();
    expect(registries).toHaveLength(2);
    expect(registries[0].name).toBe('agentverse');
    expect(registries[0].description).toBe('Fetch.ai agents');
  });
});

// ── Protocols Route Logic ─────────────────────────────────────────────

describe('/api/hol/protocols logic', () => {
  it('should list protocols', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      protocols: [
        { name: 'hcs-10', agentCount: 12000 },
        { name: 'a2a', agentCount: 8000 },
        { name: 'mcp', agentCount: 5000 },
      ],
    }));

    const protocols = await client.getProtocols();
    expect(protocols).toHaveLength(3);
    expect(protocols[0].name).toBe('hcs-10');
    expect(protocols[0].agentCount).toBe(12000);
  });
});

// ── Resolve Route Logic ───────────────────────────────────────────────

describe('/api/hol/agent/:uaid logic', () => {
  it('should resolve agent by UAID', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      id: 'a1', uaid: 'target-uaid', name: 'TargetAgent', registry: 'hcs-10',
      description: 'An agent', trustScore: 90,
    }));

    const agent = await client.resolve('target-uaid');
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('TargetAgent');
    expect(agent!.trustScore).toBe(90);
  });

  it('should return null for 404', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 404, statusText: 'Not Found',
      text: () => Promise.resolve('Not found'),
    });

    const agent = await client.resolve('nonexistent');
    expect(agent).toBeNull();
  });
});

// ── Similar Agents Route Logic ────────────────────────────────────────

describe('/api/hol/agent/:uaid/similar logic', () => {
  it('should find similar agents', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [
        { id: 's1', uaid: 'sim-1', name: 'Similar1', registry: 'test', trustScore: 80 },
        { id: 's2', uaid: 'sim-2', name: 'Similar2', registry: 'test', trustScore: 70 },
      ],
    }));

    const agents = await client.findSimilar('uaid-123', 5);
    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Similar1');
  });
});

// ── Skills Route Logic ────────────────────────────────────────────────

describe('/api/hol/skills logic', () => {
  it('should list skills', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      skills: [
        { id: 'sk1', name: 'translation', description: 'Translate text', category: 'nlp' },
        { id: 'sk2', name: 'code-review', description: 'Review code', category: 'dev' },
      ],
    }));

    const skills = await client.getSkills({ limit: 10 });
    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('translation');
  });
});

// ── Register Route Logic ──────────────────────────────────────────────

describe('/api/hol/register logic', () => {
  it('should register agent with payload', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test-key' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      uaid: 'new-uaid',
      agentId: 'new-agent',
      status: 'registered',
    }));

    const result = await client.register({
      name: 'NewAgent',
      description: 'A new agent registration',
      capabilities: ['search', 'chat'],
      protocols: ['hcs-10'],
    });
    expect(result.success).toBe(true);
    expect(result.uaid).toBe('new-uaid');
  });

  it('should handle registration with full profile', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test-key' });
    mockFetch.mockResolvedValueOnce(mockResponse({ uaid: 'full-uaid' }));

    const result = await client.register({
      name: 'FullAgent',
      description: 'Full registration',
      capabilities: ['discovery', 'hiring'],
      protocols: ['hcs-10', 'a2a'],
      endpoints: { a2a: 'https://agent.com/a2a', chat: 'https://agent.com/chat' },
      profile: {
        type: 'ai_agent',
        version: '1.0',
        display_name: 'Full Agent',
        bio: 'Full description',
        aiAgent: { type: 'autonomous', model: 'claude-opus-4-6', capabilities: ['search'] },
      },
      communicationProtocol: 'hcs-10',
      metadata: { version: '0.37.0' },
    });
    expect(result.success).toBe(true);
  });
});

// ── Quote Route Logic ─────────────────────────────────────────────────

describe('/api/hol/register/quote logic', () => {
  it('should get registration quote', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({
      credits: 100,
      currency: 'HBAR',
      estimatedProcessingTime: '30s',
    }));

    const quote = await client.getRegistrationQuote({
      name: 'QuoteAgent',
      description: 'Testing quote',
    });
    expect(quote.credits).toBe(100);
    expect(quote.currency).toBe('HBAR');
  });
});

// ── Auto-Register All Route Logic ─────────────────────────────────────

describe('/api/hol/register/all logic', () => {
  it('should auto-register all agents', async () => {
    // Mock search to return no existing agents
    mockFetch.mockResolvedValue(mockResponse({ agents: [], total: 0 }));
    // Then mock register calls
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }))
      .mockResolvedValueOnce(mockResponse({ uaid: 'u1', status: 'registered' }))
      .mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }))
      .mockResolvedValueOnce(mockResponse({ uaid: 'u2', status: 'registered' }));

    const client = new HOLRegistryClient();
    const autoReg = new HOLAutoRegister(client);

    const agents = [
      createTestAgent({ agent_id: 'a1', name: 'Agent1' }),
      createTestAgent({ agent_id: 'a2', name: 'Agent2' }),
    ];

    const result = await autoReg.autoRegisterAll(agents);
    expect(result.registered).toBeGreaterThanOrEqual(0);
    expect(result.records).toHaveLength(2);
    expect(result.timestamp).toBeDefined();
  });
});

// ── Register Status Route Logic ───────────────────────────────────────

describe('/api/hol/register/status logic', () => {
  it('should return empty status initially', () => {
    const client = new HOLRegistryClient();
    const autoReg = new HOLAutoRegister(client);

    const summary = autoReg.getSummary();
    expect(summary.total).toBe(0);
    expect(summary.registered).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it('should return records after registration', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ uaid: 'new-u' }));

    const autoReg = new HOLAutoRegister(client);
    await autoReg.registerAgent(createTestAgent());

    const records = autoReg.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('registered');
  });
});

// ── Chat Route Logic ──────────────────────────────────────────────────

describe('/api/hol/chat logic', () => {
  it('should create a chat session', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      sessionId: 'chat-sess-1',
      createdAt: '2026-02-17T00:00:00Z',
    }));

    const session = await client.createChatSession('target-uaid');
    expect(session.sessionId).toBe('chat-sess-1');
    expect(session.agentUaid).toBe('target-uaid');
    expect(session.status).toBe('active');
  });

  it('should send a chat message', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      response: { id: 'r1', content: 'I can help with that.', timestamp: '2026-02-17T00:00:00Z' },
    }));

    const result = await client.sendChatMessage('chat-sess-1', 'Help me find an agent');
    expect(result.message.role).toBe('user');
    expect(result.message.content).toBe('Help me find an agent');
    expect(result.agentResponse).toBeDefined();
    expect(result.agentResponse!.content).toBe('I can help with that.');
  });
});
