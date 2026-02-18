/**
 * Tests for HOL Registry Client — Direct REST API integration.
 *
 * All network calls are mocked via global.fetch.
 * Sprint 37: 100+ tests for $8K HOL bounty.
 */

import {
  HOLRegistryClient,
  HOLApiError,
  HOLSearchParams,
  HOLAgent,
  HOLSearchResult,
  HOLStats,
  HOLRegistry,
  HOLProtocol,
  HOLRegistrationPayload,
  HOLRegistrationResult,
  HOLChatSession,
  HOLChatResponse,
  HOLSkill,
} from '../../src/hol/hol-registry-client';

// ── Mock fetch ─────────────────────────────────────────────────────────

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function mockResponse(data: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Constructor ─────────────────────────────────────────────────────────

describe('HOLRegistryClient constructor', () => {
  it('should use default base URL', () => {
    const client = new HOLRegistryClient();
    expect(client.getBaseUrl()).toBe('https://hol.org/registry/api/v1');
  });

  it('should accept custom base URL', () => {
    const client = new HOLRegistryClient({ baseUrl: 'https://custom.example.com/api' });
    expect(client.getBaseUrl()).toBe('https://custom.example.com/api');
  });

  it('should strip trailing slash from base URL', () => {
    const client = new HOLRegistryClient({ baseUrl: 'https://example.com/api/' });
    expect(client.getBaseUrl()).toBe('https://example.com/api');
  });

  it('should accept API key', () => {
    const client = new HOLRegistryClient({ apiKey: 'test-key' });
    expect(client.getBaseUrl()).toBe('https://hol.org/registry/api/v1');
  });

  it('should accept custom timeout', () => {
    const client = new HOLRegistryClient({ timeout: 30000 });
    expect(client).toBeInstanceOf(HOLRegistryClient);
  });
});

// ── Search ─────────────────────────────────────────────────────────────

describe('HOLRegistryClient.search', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should search agents with text query', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [
        { id: 'a1', uaid: 'uaid-1', name: 'TestAgent', registry: 'hcs-10', trustScore: 85 },
      ],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    }));

    const result = await client.search({ q: 'test' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('TestAgent');
    expect(result.agents[0].trustScore).toBe(85);
    expect(result.total).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/search?q=test'),
      expect.any(Object),
    );
  });

  it('should pass minTrust parameter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ q: 'agent', minTrust: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('minTrust=50'),
      expect.any(Object),
    );
  });

  it('should pass limit and page parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ limit: 10, page: 2 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.any(Object),
    );
  });

  it('should pass protocol filter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ protocol: 'hcs-10' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('protocol=hcs-10'),
      expect.any(Object),
    );
  });

  it('should pass registry filter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ registry: 'agentverse' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('registry=agentverse'),
      expect.any(Object),
    );
  });

  it('should handle empty results', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    const result = await client.search({ q: 'nonexistent' });
    expect(result.agents).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should handle results array format', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      results: [{ id: 'r1', uaid: 'u1', name: 'ResultAgent', registry: 'test' }],
      total: 1,
    }));
    const result = await client.search({ q: 'result' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('ResultAgent');
  });

  it('should parse agent fields correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [{
        id: 'a1',
        uaid: 'uaid-1',
        originalId: 'orig-1',
        registry: 'hcs-10',
        name: 'FullAgent',
        description: 'A full test agent',
        capabilities: ['search', 'chat'],
        protocols: ['hcs-10', 'a2a'],
        communicationSupported: true,
        routingSupported: false,
        endpoints: { a2a: 'https://agent.com/a2a' },
        profile: { type: 'ai_agent', display_name: 'Full Agent' },
        trustScore: 92,
        trustScores: { availability: { uptime: 99 } },
        metadata: { adapter: 'hcs-10' },
      }],
      total: 1,
    }));

    const result = await client.search({ q: 'full' });
    const agent = result.agents[0];
    expect(agent.id).toBe('a1');
    expect(agent.uaid).toBe('uaid-1');
    expect(agent.originalId).toBe('orig-1');
    expect(agent.registry).toBe('hcs-10');
    expect(agent.capabilities).toEqual(['search', 'chat']);
    expect(agent.protocols).toEqual(['hcs-10', 'a2a']);
    expect(agent.communicationSupported).toBe(true);
    expect(agent.routingSupported).toBe(false);
    expect(agent.endpoints).toEqual({ a2a: 'https://agent.com/a2a' });
    expect(agent.trustScore).toBe(92);
  });

  it('should handle display_name fallback', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [{ id: 'a1', uaid: 'u1', display_name: 'Display Name', registry: 'test' }],
      total: 1,
    }));
    const result = await client.search({ q: 'display' });
    expect(result.agents[0].name).toBe('Display Name');
  });

  it('should use cache for repeated searches', async () => {
    const freshClient = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [{ id: 'a1', uaid: 'u1', name: 'Cached', registry: 'test' }], total: 1 }));

    const result1 = await freshClient.search({ q: 'cache-test' });
    const result2 = await freshClient.search({ q: 'cache-test' });

    expect(result1.agents[0].name).toBe('Cached');
    expect(result2.agents[0].name).toBe('Cached');
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch call
  });

  it('should throw HOLApiError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
    });

    await expect(client.search({ q: 'error' })).rejects.toThrow(HOLApiError);
  });

  it('should handle multiple agents in results', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`, uaid: `u${i}`, name: `Agent ${i}`, registry: 'test', trustScore: i * 5,
      })),
      total: 100,
      hasMore: true,
    }));

    const result = await client.search({ q: 'all', limit: 20 });
    expect(result.agents).toHaveLength(20);
    expect(result.total).toBe(100);
    expect(result.hasMore).toBe(true);
  });
});

// ── Stats ──────────────────────────────────────────────────────────────

describe('HOLRegistryClient.getStats', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should return platform statistics', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      totalAgents: 93310,
      totalRegistries: 15,
      totalProtocols: 8,
      registries: [{ name: 'agentverse', count: 37900 }],
      protocols: [{ name: 'hcs-10', count: 12000 }],
      lastUpdated: '2026-02-17T00:00:00Z',
    }));

    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(93310);
    expect(stats.totalRegistries).toBe(15);
    expect(stats.totalProtocols).toBe(8);
    expect(stats.registries).toHaveLength(1);
    expect(stats.protocols).toHaveLength(1);
  });

  it('should handle alternate field names (total_agents)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      total_agents: 50000,
      total_registries: 10,
      total_protocols: 5,
    }));

    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(50000);
    expect(stats.totalRegistries).toBe(10);
  });

  it('should default to zero for missing fields', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const stats = await client.getStats();
    expect(stats.totalAgents).toBe(0);
    expect(stats.totalRegistries).toBe(0);
    expect(stats.totalProtocols).toBe(0);
    expect(stats.registries).toEqual([]);
    expect(stats.protocols).toEqual([]);
  });

  it('should use cache for repeated stats calls', async () => {
    const freshClient = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ totalAgents: 93000, totalRegistries: 15, totalProtocols: 8 }));
    await freshClient.getStats();
    await freshClient.getStats();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── Registries ─────────────────────────────────────────────────────────

describe('HOLRegistryClient.getRegistries', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should return list of registries', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      registries: [
        { name: 'agentverse', agentCount: 37900 },
        { name: 'pulsemcp', agentCount: 16100 },
      ],
    }));

    const registries = await client.getRegistries();
    expect(registries).toHaveLength(2);
    expect(registries[0].name).toBe('agentverse');
    expect(registries[0].agentCount).toBe(37900);
  });

  it('should handle array response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([
      { name: 'reg1', count: 100 },
    ]));

    const registries = await client.getRegistries();
    expect(registries).toHaveLength(1);
    expect(registries[0].agentCount).toBe(100);
  });

  it('should handle empty registries', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ registries: [] }));
    const registries = await client.getRegistries();
    expect(registries).toHaveLength(0);
  });
});

// ── Protocols ──────────────────────────────────────────────────────────

describe('HOLRegistryClient.getProtocols', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should return list of protocols', async () => {
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
  });

  it('should handle array response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([
      { name: 'xmtp', count: 3000 },
    ]));

    const protocols = await client.getProtocols();
    expect(protocols).toHaveLength(1);
    expect(protocols[0].agentCount).toBe(3000);
  });
});

// ── Resolve ────────────────────────────────────────────────────────────

describe('HOLRegistryClient.resolve', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should resolve agent by UAID', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      id: 'a1',
      uaid: 'uaid-123',
      name: 'ResolvedAgent',
      registry: 'hcs-10',
      trustScore: 88,
      description: 'A resolved agent',
    }));

    const agent = await client.resolve('uaid-123');
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('ResolvedAgent');
    expect(agent!.uaid).toBe('uaid-123');
    expect(agent!.trustScore).toBe(88);
  });

  it('should return null for 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Not found'),
    });

    const agent = await client.resolve('nonexistent');
    expect(agent).toBeNull();
  });

  it('should throw on other HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Error'),
    });

    await expect(client.resolve('error-uaid')).rejects.toThrow(HOLApiError);
  });

  it('should encode UAID in URL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 'a1', uaid: 'special/uaid', name: 'Agent', registry: 'test' }));
    await client.resolve('special/uaid');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resolve/special%2Fuaid'),
      expect.any(Object),
    );
  });

  it('should use cache for repeated resolves', async () => {
    const freshClient = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 'a1', uaid: 'cached-uaid', name: 'Cached', registry: 'test' }));
    await freshClient.resolve('cached-uaid');
    await freshClient.resolve('cached-uaid');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── Find Similar ───────────────────────────────────────────────────────

describe('HOLRegistryClient.findSimilar', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should find similar agents', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      agents: [
        { id: 's1', uaid: 'sim-1', name: 'Similar1', registry: 'test' },
        { id: 's2', uaid: 'sim-2', name: 'Similar2', registry: 'test' },
      ],
    }));

    const agents = await client.findSimilar('uaid-123');
    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Similar1');
  });

  it('should pass limit parameter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [] }));
    await client.findSimilar('uaid-123', 3);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('?limit=3'),
      expect.any(Object),
    );
  });

  it('should handle results array format', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      results: [{ id: 'r1', uaid: 'r-1', name: 'Result', registry: 'test' }],
    }));
    const agents = await client.findSimilar('uaid-456');
    expect(agents).toHaveLength(1);
  });

  it('should handle direct array response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([
      { id: 'd1', uaid: 'd-1', name: 'Direct', registry: 'test' },
    ]));
    const agents = await client.findSimilar('uaid-789');
    expect(agents).toHaveLength(1);
  });
});

// ── Skills ─────────────────────────────────────────────────────────────

describe('HOLRegistryClient.getSkills', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should return skills list', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      skills: [
        { id: 'sk1', name: 'text-summarization', description: 'Summarize text', category: 'nlp' },
        { id: 'sk2', name: 'code-review', description: 'Review code', category: 'dev' },
      ],
    }));

    const skills = await client.getSkills();
    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('text-summarization');
    expect(skills[0].category).toBe('nlp');
  });

  it('should pass limit and name parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ skills: [] }));
    await client.getSkills({ limit: 5, name: 'translation' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=5'),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('name=translation'),
      expect.any(Object),
    );
  });

  it('should handle empty skills', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ skills: [] }));
    const skills = await client.getSkills();
    expect(skills).toHaveLength(0);
  });

  it('should handle array response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([
      { id: 'sk1', name: 'skill1', description: 'desc' },
    ]));
    const skills = await client.getSkills();
    expect(skills).toHaveLength(1);
  });

  it('should handle results format', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      results: [{ topic_id: 'topic-1', name: 'skill2', description: 'desc2' }],
    }));
    const skills = await client.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('topic-1');
  });
});

// ── Register ───────────────────────────────────────────────────────────

describe('HOLRegistryClient.register', () => {
  it('should register an agent successfully', async () => {
    const client = new HOLRegistryClient({ apiKey: 'test-key' });
    mockFetch.mockResolvedValueOnce(mockResponse({
      uaid: 'new-uaid-123',
      agentId: 'new-agent-456',
      status: 'registered',
    }));

    const payload: HOLRegistrationPayload = {
      name: 'TestAgent',
      description: 'A test agent',
      capabilities: ['search'],
      protocols: ['hcs-10'],
    };

    const result = await client.register(payload);
    expect(result.success).toBe(true);
    expect(result.uaid).toBe('new-uaid-123');
    expect(result.agentId).toBe('new-agent-456');
  });

  it('should include API key in auth header', async () => {
    const client = new HOLRegistryClient({ apiKey: 'my-api-key' });
    mockFetch.mockResolvedValueOnce(mockResponse({ uaid: 'u1' }));

    await client.register({ name: 'Test', description: 'desc' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/register'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'my-api-key' }),
      }),
    );
  });

  it('should handle registration failure gracefully', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await client.register({ name: 'Fail', description: 'fail' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('should handle HTTP error during registration', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      text: () => Promise.resolve('Insufficient credits'),
    });

    const result = await client.register({ name: 'NoPay', description: 'no pay' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('402');
  });
});

// ── Registration Quote ─────────────────────────────────────────────────

describe('HOLRegistryClient.getRegistrationQuote', () => {
  let client: HOLRegistryClient;
  beforeEach(() => { client = new HOLRegistryClient(); });

  it('should return registration cost quote', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      credits: 100,
      currency: 'HBAR',
      estimatedProcessingTime: '30s',
    }));

    const quote = await client.getRegistrationQuote({ name: 'Test', description: 'desc' });
    expect(quote.credits).toBe(100);
    expect(quote.currency).toBe('HBAR');
    expect(quote.estimatedProcessingTime).toBe('30s');
  });

  it('should handle alternate field names', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ cost: 50 }));
    const quote = await client.getRegistrationQuote({ name: 'Test', description: 'desc' });
    expect(quote.credits).toBe(50);
  });

  it('should default currency to HBAR', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const quote = await client.getRegistrationQuote({ name: 'Test', description: 'desc' });
    expect(quote.currency).toBe('HBAR');
  });
});

// ── Chat ───────────────────────────────────────────────────────────────

describe('HOLRegistryClient.createChatSession', () => {
  const client = new HOLRegistryClient({ apiKey: 'test' });

  it('should create a chat session', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      sessionId: 'session-123',
      createdAt: '2026-02-17T00:00:00Z',
    }));

    const session = await client.createChatSession('uaid-target');
    expect(session.sessionId).toBe('session-123');
    expect(session.agentUaid).toBe('uaid-target');
    expect(session.status).toBe('active');
  });

  it('should handle missing sessionId with fallback', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 'alt-session' }));
    const session = await client.createChatSession('uaid-2');
    expect(session.sessionId).toBe('alt-session');
  });

  it('should generate fallback sessionId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const session = await client.createChatSession('uaid-3');
    expect(session.sessionId).toContain('session-');
  });
});

describe('HOLRegistryClient.sendChatMessage', () => {
  const client = new HOLRegistryClient({ apiKey: 'test' });

  it('should send a message and get response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      response: {
        id: 'resp-1',
        content: 'Hello! I can help.',
        timestamp: '2026-02-17T00:00:00Z',
      },
    }));

    const result = await client.sendChatMessage('session-1', 'Hello');
    expect(result.message.role).toBe('user');
    expect(result.message.content).toBe('Hello');
    expect(result.agentResponse).toBeDefined();
    expect(result.agentResponse!.content).toBe('Hello! I can help.');
    expect(result.agentResponse!.role).toBe('agent');
  });

  it('should handle string response format', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      response: 'Simple text response',
    }));

    const result = await client.sendChatMessage('session-2', 'Hi');
    expect(result.agentResponse).toBeDefined();
    expect(result.agentResponse!.content).toBe('Simple text response');
  });

  it('should handle no response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const result = await client.sendChatMessage('session-3', 'Test');
    expect(result.message.content).toBe('Test');
    expect(result.agentResponse).toBeUndefined();
  });
});

// ── Cache ──────────────────────────────────────────────────────────────

describe('HOLRegistryClient cache', () => {
  it('should clear cache', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValue(mockResponse({ agents: [], total: 0 }));

    await client.search({ q: 'test' });
    expect(client.getCacheSize()).toBeGreaterThan(0);

    client.clearCache();
    expect(client.getCacheSize()).toBe(0);
  });

  it('should report cache size', async () => {
    const client = new HOLRegistryClient();
    expect(client.getCacheSize()).toBe(0);

    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ q: 'a' });
    expect(client.getCacheSize()).toBe(1);

    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0 }));
    await client.search({ q: 'b' });
    expect(client.getCacheSize()).toBe(2);
  });

  it('should not cache across different queries', async () => {
    const client = new HOLRegistryClient();
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [{ id: 'a1', name: 'First', uaid: 'u1', registry: 'test' }], total: 1 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ agents: [{ id: 'a2', name: 'Second', uaid: 'u2', registry: 'test' }], total: 1 }));

    const r1 = await client.search({ q: 'first' });
    const r2 = await client.search({ q: 'second' });

    expect(r1.agents[0].name).toBe('First');
    expect(r2.agents[0].name).toBe('Second');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ── HOLApiError ────────────────────────────────────────────────────────

describe('HOLApiError', () => {
  it('should contain status code', () => {
    const err = new HOLApiError('Test error', 404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.responseBody).toBe('Not found');
    expect(err.message).toBe('Test error');
    expect(err.name).toBe('HOLApiError');
  });

  it('should be an instance of Error', () => {
    const err = new HOLApiError('Test', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HOLApiError);
  });
});

// ── parseAgent ─────────────────────────────────────────────────────────

describe('HOLRegistryClient.parseAgent', () => {
  const client = new HOLRegistryClient();

  it('should parse minimal agent data', () => {
    const agent = client.parseAgent({ name: 'MinimalAgent' });
    expect(agent.name).toBe('MinimalAgent');
    expect(agent.id).toBe('');
    expect(agent.registry).toBe('');
  });

  it('should use display_name as fallback for name', () => {
    const agent = client.parseAgent({ display_name: 'DisplayName' });
    expect(agent.name).toBe('DisplayName');
  });

  it('should default to Unknown for missing name', () => {
    const agent = client.parseAgent({});
    expect(agent.name).toBe('Unknown');
  });

  it('should use bio as fallback for description', () => {
    const agent = client.parseAgent({ bio: 'Agent bio text' });
    expect(agent.description).toBe('Agent bio text');
  });
});
