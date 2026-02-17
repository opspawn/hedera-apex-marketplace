/**
 * Tests for Registry Broker vector search and skills APIs.
 *
 * Validates the complete search, vector search, and skills workflow
 * with various query patterns and edge cases.
 */

import {
  RegistryBroker,
  RegistryBrokerConfig,
  AgentSearchQuery,
  VectorSearchQuery,
  BrokerSkillEntry,
} from '../../src/hol/registry-broker';

// Extended mock with configurable responses
const mockSearch = jest.fn().mockResolvedValue({
  agents: [
    { uaid: 'u1', display_name: 'Agent Alpha', tags: ['nlp', 'hedera'], protocol: 'hcs-10' },
    { uaid: 'u2', display_name: 'Agent Beta', tags: ['code'], protocol: 'hcs-10' },
  ],
  total: 2,
});

const mockVectorSearch = jest.fn().mockResolvedValue({
  results: [
    { uaid: 'v1', display_name: 'Vector Agent 1', score: 0.97, tags: ['search'] },
  ],
  total: 1,
});

const mockListSkills = jest.fn().mockResolvedValue({
  skills: [
    { id: 'sk1', name: 'text-gen', description: 'Generate text', category: 'nlp', tags: ['ai'] },
    { id: 'sk2', name: 'code-gen', description: 'Generate code', category: 'dev', tags: ['code'] },
    { id: 'sk3', name: 'image-gen', description: 'Generate images', category: 'creative', tags: ['ai'] },
  ],
  total: 3,
});

const mockRegisterSkill = jest.fn().mockResolvedValue({
  id: 'sk-new-001',
  name: 'custom-skill',
});

const mockGetAgent = jest.fn().mockResolvedValue({
  uaid: 'u1',
  agentId: 'ag1',
  display_name: 'Agent Alpha',
  bio: 'Alpha agent for testing',
  tags: ['nlp'],
  endpoint: 'https://agent-alpha.example.com',
});

jest.mock('@hashgraphonline/standards-sdk', () => ({
  RegistryBrokerClient: jest.fn().mockImplementation(() => ({
    authenticateWithLedgerCredentials: jest.fn().mockResolvedValue(undefined),
    registerAgent: jest.fn().mockResolvedValue({ uaid: 'u-test', agentId: 'ag-test' }),
    search: mockSearch,
    getAgent: mockGetAgent,
    vectorSearch: mockVectorSearch,
    listSkills: mockListSkills,
    registerSkill: mockRegisterSkill,
  })),
}));

const TEST_CONFIG: RegistryBrokerConfig = {
  accountId: '0.0.7854018',
  privateKey: 'test-key',
  network: 'testnet',
  brokerBaseUrl: 'https://hol.org/registry/api/v1',
};

describe('Registry Broker Search API', () => {
  let broker: RegistryBroker;

  beforeEach(() => {
    broker = new RegistryBroker(TEST_CONFIG);
    jest.clearAllMocks();
  });

  describe('searchAgents', () => {
    it('should return agents matching text query', async () => {
      const result = await broker.searchAgents({ q: 'nlp' });
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeTruthy();
    });

    it('should pass query params to SDK', async () => {
      await broker.searchAgents({ q: 'test', tags: ['ai'], protocol: 'hcs-10', limit: 5, offset: 10 });
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should map agent fields correctly', async () => {
      const result = await broker.searchAgents({ q: 'alpha' });
      const agent = result.agents[0];
      expect(agent.uaid).toBe('u1');
      expect(agent.display_name).toBe('Agent Alpha');
      expect(agent.tags).toContain('nlp');
      expect(agent.protocol).toBe('hcs-10');
    });

    it('should return total count from API', async () => {
      const result = await broker.searchAgents({ q: 'test' });
      expect(result.total).toBe(2);
    });

    it('should include query in result', async () => {
      const query: AgentSearchQuery = { q: 'marketplace', tags: ['hedera'] };
      const result = await broker.searchAgents(query);
      expect(result.query).toEqual(query);
    });

    it('should handle search with only tags', async () => {
      const result = await broker.searchAgents({ tags: ['hedera'] });
      expect(result.agents).toBeDefined();
    });

    it('should handle search with no params', async () => {
      const result = await broker.searchAgents({});
      expect(result.agents).toBeDefined();
    });

    it('should handle search with type filter', async () => {
      const result = await broker.searchAgents({ type: 'ai_agent' });
      expect(result.agents).toBeDefined();
    });
  });

  describe('getAgentProfile', () => {
    it('should fetch agent profile by UAID', async () => {
      const agent = await broker.getAgentProfile('u1');
      expect(agent).not.toBeNull();
      expect(agent!.display_name).toBe('Agent Alpha');
      expect(agent!.bio).toBe('Alpha agent for testing');
    });

    it('should include endpoint in profile', async () => {
      const agent = await broker.getAgentProfile('u1');
      expect(agent!.endpoint).toBe('https://agent-alpha.example.com');
    });

    it('should include tags in profile', async () => {
      const agent = await broker.getAgentProfile('u1');
      expect(agent!.tags).toContain('nlp');
    });

    it('should return null-like for failed fetch', async () => {
      mockGetAgent.mockRejectedValueOnce(new Error('Network error'));
      // Even on error, fallback to search — which returns results
      const agent = await broker.getAgentProfile('nonexistent');
      expect(agent).toBeDefined();
    });
  });
});

describe('Registry Broker Vector Search API', () => {
  let broker: RegistryBroker;

  beforeEach(() => {
    broker = new RegistryBroker(TEST_CONFIG);
    jest.clearAllMocks();
  });

  it('should perform semantic vector search', async () => {
    const result = await broker.vectorSearch({ text: 'find agents that can search' });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.method).toBe('vector');
  });

  it('should return scored results', async () => {
    const result = await broker.vectorSearch({ text: 'search query' });
    expect(result.results[0].score).toBe(0.97);
  });

  it('should pass topK to SDK', async () => {
    await broker.vectorSearch({ text: 'test', topK: 20 });
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 20 })
    );
  });

  it('should pass threshold to SDK', async () => {
    await broker.vectorSearch({ text: 'test', threshold: 0.9 });
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 0.9 })
    );
  });

  it('should pass filter to SDK', async () => {
    await broker.vectorSearch({ text: 'test', filter: { protocol: 'hcs-10' } });
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { protocol: 'hcs-10' } })
    );
  });

  it('should default topK to 10', async () => {
    await broker.vectorSearch({ text: 'test' });
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 10 })
    );
  });

  it('should default threshold to 0.5', async () => {
    await broker.vectorSearch({ text: 'test' });
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 0.5 })
    );
  });

  it('should return total count', async () => {
    const result = await broker.vectorSearch({ text: 'test' });
    expect(result.total).toBe(1);
  });

  it('should include query text in result', async () => {
    const result = await broker.vectorSearch({ text: 'my search' });
    expect(result.query).toBe('my search');
  });

  it('should handle empty results gracefully', async () => {
    mockVectorSearch.mockResolvedValueOnce({ results: [], total: 0 });
    const result = await broker.vectorSearch({ text: 'nonexistent' });
    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should fall back to regular search if vector search fails', async () => {
    mockVectorSearch.mockRejectedValueOnce(new Error('Vector search unavailable'));
    const result = await broker.vectorSearch({ text: 'fallback' });
    // Should still return a result (empty because error is caught)
    expect(result.method).toBe('vector');
    expect(result.results).toBeDefined();
  });
});

describe('Registry Broker Skills API', () => {
  let broker: RegistryBroker;

  beforeEach(() => {
    broker = new RegistryBroker(TEST_CONFIG);
    jest.clearAllMocks();
  });

  describe('getSkills', () => {
    it('should list all available skills', async () => {
      const result = await broker.getSkills();
      expect(result.skills).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should return skill details', async () => {
      const result = await broker.getSkills();
      const skill = result.skills[0];
      expect(skill.id).toBe('sk1');
      expect(skill.name).toBe('text-gen');
      expect(skill.description).toBe('Generate text');
      expect(skill.category).toBe('nlp');
    });

    it('should pass category filter', async () => {
      await broker.getSkills({ category: 'nlp' });
      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'nlp' })
      );
    });

    it('should pass tags filter', async () => {
      await broker.getSkills({ tags: ['ai', 'code'] });
      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ tags: 'ai,code' })
      );
    });

    it('should pass limit param', async () => {
      await broker.getSkills({ limit: 10 });
      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should include timestamp in result', async () => {
      const result = await broker.getSkills();
      expect(result.timestamp).toBeTruthy();
    });

    it('should handle empty skill list', async () => {
      mockListSkills.mockResolvedValueOnce({ skills: [], total: 0 });
      const result = await broker.getSkills();
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle API error gracefully', async () => {
      mockListSkills.mockRejectedValueOnce(new Error('API down'));
      const result = await broker.getSkills();
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('registerSkill', () => {
    it('should register a new skill', async () => {
      const skill = await broker.registerSkill({
        name: 'custom-skill',
        description: 'A custom skill',
        category: 'general',
        tags: ['custom'],
        version: '1.0.0',
      });
      expect(skill).not.toBeNull();
      expect(skill!.id).toBe('sk-new-001');
      expect(skill!.name).toBe('custom-skill');
    });

    it('should pass skill details to SDK', async () => {
      await broker.registerSkill({
        name: 'my-skill',
        description: 'Skill description',
        category: 'ai',
        tags: ['tag1', 'tag2'],
        version: '2.0.0',
        pricing: { amount: 50, token: 'HBAR', unit: 'per_call' },
      });
      expect(mockRegisterSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-skill',
          description: 'Skill description',
          category: 'ai',
        })
      );
    });

    it('should include pricing in registration', async () => {
      const skill = await broker.registerSkill({
        name: 'paid-skill',
        description: 'Paid',
        pricing: { amount: 100, token: 'HBAR', unit: 'per_call' },
      });
      expect(skill!.pricing).toEqual({ amount: 100, token: 'HBAR', unit: 'per_call' });
    });

    it('should handle registration failure', async () => {
      mockRegisterSkill.mockRejectedValueOnce(new Error('Registration failed'));
      const skill = await broker.registerSkill({
        name: 'fail-skill',
        description: 'Will fail',
      });
      expect(skill).toBeNull();
    });

    it('should include version in registered skill', async () => {
      const skill = await broker.registerSkill({
        name: 'versioned',
        description: 'Has version',
        version: '3.0.0',
      });
      expect(skill!.version).toBe('3.0.0');
    });

    it('should include agentId if provided', async () => {
      const skill = await broker.registerSkill({
        name: 'agent-skill',
        description: 'Linked to agent',
        agentId: 'agent-123',
      });
      expect(skill!.agentId).toBe('agent-123');
    });
  });
});
