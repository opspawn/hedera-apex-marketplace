/**
 * Sprint 48 — Registry Broker Registration Tests
 *
 * Tests for:
 * 1. HederaConnect agent registration via HOLRegistryClient
 * 2. Registration verification (search for agent)
 * 3. Chat relay round-trip (session create, message, end)
 * 4. Agent discoverability in search
 * 5. Idempotent registration (check-before-register)
 */

import {
  HOLRegistryClient,
  HOLApiError,
  HOLRegistrationPayload,
  HOLSearchResult,
  HOLAgent,
  HOLChatSession,
  HOLChatResponse,
} from '../../src/hol/hol-registry-client';
import { RegistryBroker, RegistryBrokerConfig } from '../../src/hol/registry-broker';
import { HOLAutoRegister } from '../../src/hol/hol-auto-register';
import { RegisteredAgent } from '../../src/types';

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

// ── Mock standards-sdk ─────────────────────────────────────────────────

jest.mock('@hashgraphonline/standards-sdk', () => ({
  RegistryBrokerClient: jest.fn().mockImplementation(() => ({
    authenticateWithLedgerCredentials: jest.fn().mockResolvedValue(undefined),
    registerAgent: jest.fn().mockResolvedValue({
      uaid: 'hederaconnect-uaid-001',
      agentId: 'hederaconnect-agent-001',
    }),
    search: jest.fn().mockResolvedValue({
      agents: [{
        uaid: 'hederaconnect-uaid-001',
        display_name: 'HederaConnect',
        bio: 'AI Agent Marketplace',
        tags: ['marketplace', 'discovery'],
        capabilities: ['marketplace', 'discovery', 'chat'],
      }],
      total: 1,
    }),
    getAgent: jest.fn().mockResolvedValue({
      uaid: 'hederaconnect-uaid-001',
      display_name: 'HederaConnect',
      bio: 'AI Agent Marketplace',
    }),
    createChatSession: jest.fn().mockResolvedValue({
      sessionId: 'session-hc-001',
    }),
    sendChatMessage: jest.fn().mockResolvedValue({
      response: 'Hello! I am HederaConnect. How can I help you?',
    }),
  })),
}));

// ── Test config ────────────────────────────────────────────────────────

const TEST_CONFIG: RegistryBrokerConfig = {
  accountId: '0.0.7854018',
  privateKey: 'test-private-key-mock',
  network: 'testnet',
  brokerBaseUrl: 'https://hol.org/registry/api/v1',
  agentEndpoint: 'https://hedera.opspawn.com/api/agent',
};

const HEDERACONNECT_PAYLOAD: HOLRegistrationPayload = {
  name: 'HederaConnect',
  description: 'AI Agent Marketplace with multi-protocol discovery, trust analytics, and privacy-preserving agent interaction',
  capabilities: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy'],
  protocols: ['hcs-10', 'a2a'],
  endpoints: {
    a2a: 'https://hedera.opspawn.com/api/agents/marketplace',
    chat: 'https://hedera.opspawn.com/api/chat',
    hire: 'https://hedera.opspawn.com/api/marketplace/hire',
  },
  profile: {
    type: 'ai_agent',
    version: '1.0',
    display_name: 'HederaConnect',
    bio: 'AI Agent Marketplace with multi-protocol discovery, trust analytics, and privacy-preserving agent interaction',
    aiAgent: {
      type: 'autonomous',
      model: 'claude-opus-4-6',
      capabilities: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy'],
      creator: 'OpSpawn',
    },
    properties: {
      tags: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy', 'hedera', 'hcs-10'],
    },
    socials: [
      { platform: 'twitter', handle: '@opspawn' },
      { platform: 'github', handle: 'opspawn' },
    ],
  },
  communicationProtocol: 'hcs-10',
  registry: 'hashgraph-online',
  metadata: {
    provider: 'opspawn',
    version: '0.43.0',
    standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
  },
};

// ── 1. Registration via HOLRegistryClient ──────────────────────────────

describe('Sprint 48: HederaConnect Registration', () => {
  describe('HOLRegistryClient.register — HederaConnect', () => {
    let client: HOLRegistryClient;

    beforeEach(() => {
      client = new HOLRegistryClient({ apiKey: 'test-key' });
    });

    it('should register HederaConnect with correct payload', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        uaid: 'hederaconnect-uaid-001',
        agentId: 'hederaconnect-agent-001',
        status: 'registered',
      }));

      const result = await client.register(HEDERACONNECT_PAYLOAD);
      expect(result.success).toBe(true);
      expect(result.uaid).toBe('hederaconnect-uaid-001');
      expect(result.agentId).toBe('hederaconnect-agent-001');

      // Verify POST body
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/register');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.name).toBe('HederaConnect');
      expect(body.capabilities).toContain('marketplace');
      expect(body.capabilities).toContain('discovery');
      expect(body.capabilities).toContain('chat');
      expect(body.capabilities).toContain('trust-analytics');
      expect(body.capabilities).toContain('privacy');
      expect(body.communicationProtocol).toBe('hcs-10');
    });

    it('should include all required profile fields', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, uaid: 'uaid-x' }));

      await client.register(HEDERACONNECT_PAYLOAD);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.profile.type).toBe('ai_agent');
      expect(body.profile.display_name).toBe('HederaConnect');
      expect(body.profile.bio).toContain('multi-protocol discovery');
      expect(body.profile.aiAgent.model).toBe('claude-opus-4-6');
      expect(body.profile.aiAgent.creator).toBe('OpSpawn');
      expect(body.profile.socials).toHaveLength(2);
    });

    it('should include endpoints for A2A, chat, and hire', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.register(HEDERACONNECT_PAYLOAD);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.endpoints.a2a).toContain('/api/agents/marketplace');
      expect(body.endpoints.chat).toContain('/api/chat');
      expect(body.endpoints.hire).toContain('/api/marketplace/hire');
    });

    it('should handle registration failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(
        { error: 'insufficient_credits', message: 'Not enough credits' },
        402,
        'Payment Required',
      ));

      const result = await client.register(HEDERACONNECT_PAYLOAD);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('AbortError: signal timed out'));

      const result = await client.register(HEDERACONNECT_PAYLOAD);
      expect(result.success).toBe(false);
      expect(result.error).toContain('AbortError');
    });

    it('should include x-api-key header when auth is needed', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.register(HEDERACONNECT_PAYLOAD);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('test-key');
    });
  });

  // ── 2. Registration Verification ───────────────────────────────────────

  describe('Registration Verification — Search for HederaConnect', () => {
    let client: HOLRegistryClient;

    beforeEach(() => {
      client = new HOLRegistryClient();
    });

    it('should find HederaConnect in search results', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
          description: 'AI Agent Marketplace',
          capabilities: ['marketplace', 'discovery', 'chat'],
          protocols: ['hcs-10', 'a2a'],
          communicationSupported: true,
        }],
        total: 1,
        page: 1,
        limit: 10,
        hasMore: false,
      }));

      const result = await client.search({ q: 'HederaConnect' });
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('HederaConnect');
      expect(result.agents[0].uaid).toBe('hederaconnect-uaid-001');
    });

    it('should verify agent has correct capabilities', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
          capabilities: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy'],
        }],
        total: 1,
      }));

      const result = await client.search({ q: 'HederaConnect' });
      const agent = result.agents[0];
      expect(agent.capabilities).toContain('marketplace');
      expect(agent.capabilities).toContain('discovery');
      expect(agent.capabilities).toContain('chat');
      expect(agent.capabilities).toContain('trust-analytics');
      expect(agent.capabilities).toContain('privacy');
    });

    it('should resolve agent by UAID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'hc-1',
        uaid: 'hederaconnect-uaid-001',
        name: 'HederaConnect',
        registry: 'hashgraph-online',
        description: 'AI Agent Marketplace',
      }));

      const agent = await client.resolve('hederaconnect-uaid-001');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('HederaConnect');
      expect(agent!.uaid).toBe('hederaconnect-uaid-001');
    });

    it('should return null for non-existent UAID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      });

      const agent = await client.resolve('nonexistent-uaid');
      expect(agent).toBeNull();
    });

    it('should get full agent profile by UAID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'hc-1',
        uaid: 'hederaconnect-uaid-001',
        name: 'HederaConnect',
        registry: 'hashgraph-online',
        description: 'AI Agent Marketplace with multi-protocol discovery',
        capabilities: ['marketplace', 'discovery', 'chat'],
        protocols: ['hcs-10', 'a2a'],
        profile: {
          type: 'ai_agent',
          version: '1.0',
          display_name: 'HederaConnect',
          bio: 'AI Agent Marketplace',
          aiAgent: {
            type: 'autonomous',
            model: 'claude-opus-4-6',
            capabilities: ['marketplace', 'discovery', 'chat'],
          },
        },
      }));

      const agent = await client.getAgent('hederaconnect-uaid-001');
      expect(agent.name).toBe('HederaConnect');
      expect(agent.profile?.aiAgent?.model).toBe('claude-opus-4-6');
      expect(agent.protocols).toContain('hcs-10');
    });

    it('should find HederaConnect when filtering by protocol', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
          protocols: ['hcs-10', 'a2a'],
        }],
        total: 1,
      }));

      const result = await client.search({ protocol: 'hcs-10', q: 'HederaConnect' });
      expect(result.agents).toHaveLength(1);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('protocol=hcs-10');
    });
  });

  // ── 3. Chat Relay Round-Trip ───────────────────────────────────────────

  describe('Chat Relay Round-Trip', () => {
    let client: HOLRegistryClient;

    beforeEach(() => {
      client = new HOLRegistryClient({ apiKey: 'test-key' });
    });

    it('should create a chat session with HederaConnect', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sessionId: 'session-hc-001',
        agentUaid: 'hederaconnect-uaid-001',
        status: 'active',
        createdAt: '2026-02-18T12:00:00Z',
      }));

      const session = await client.createChatSession('hederaconnect-uaid-001');
      expect(session.sessionId).toBe('session-hc-001');
      expect(session.agentUaid).toBe('hederaconnect-uaid-001');
      expect(session.status).toBe('active');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/chat/session');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.uaid).toBe('hederaconnect-uaid-001');
    });

    it('should send a message and receive a response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        response: {
          id: 'msg-agent-001',
          content: 'Hello! I am HederaConnect. I can help you discover, evaluate, and interact with AI agents on Hedera.',
          role: 'agent',
          timestamp: '2026-02-18T12:00:01Z',
        },
      }));

      const result = await client.sendChatMessage('session-hc-001', 'Hello, what can you do?');
      expect(result.message.role).toBe('user');
      expect(result.message.content).toBe('Hello, what can you do?');
      expect(result.agentResponse).toBeDefined();
      expect(result.agentResponse!.content).toContain('HederaConnect');
    });

    it('should handle message with no agent response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        message: { id: 'msg-user-001', content: 'Hello', role: 'user' },
      }));

      const result = await client.sendChatMessage('session-hc-001', 'Hello');
      expect(result.message).toBeDefined();
      expect(result.agentResponse).toBeUndefined();
    });

    it('should end a chat session', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.endChatSession('session-hc-001');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/chat/session/session-hc-001');
      expect(opts.method).toBe('DELETE');
    });

    it('should handle insufficient credits (402) for chat', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        text: () => Promise.resolve('{"error":"insufficient_credits"}'),
      });

      await expect(client.createChatSession('hederaconnect-uaid-001'))
        .rejects.toThrow(HOLApiError);
    });

    it('should get chat session metadata', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sessionId: 'session-hc-001',
        agentUaid: 'hederaconnect-uaid-001',
        status: 'active',
        createdAt: '2026-02-18T12:00:00Z',
        lastMessageAt: '2026-02-18T12:00:05Z',
        messageCount: 4,
      }));

      const meta = await client.getSessionMeta('session-hc-001');
      expect(meta.sessionId).toBe('session-hc-001');
      expect(meta.agentUaid).toBe('hederaconnect-uaid-001');
      expect(meta.status).toBe('active');
      expect(meta.messageCount).toBe(4);
    });

    it('should get chat history', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sessionId: 'session-hc-001',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2026-02-18T12:00:00Z' },
          { id: 'msg-2', role: 'agent', content: 'Hi! I am HederaConnect.', timestamp: '2026-02-18T12:00:01Z' },
        ],
      }));

      const history = await client.getChatHistory('session-hc-001');
      expect(history.sessionId).toBe('session-hc-001');
      expect(history.messages).toHaveLength(2);
      expect(history.messages[0].role).toBe('user');
      expect(history.messages[1].role).toBe('agent');
      expect(history.messages[1].content).toContain('HederaConnect');
    });

    it('should complete full chat relay round-trip', async () => {
      // 1. Create session
      mockFetch.mockResolvedValueOnce(mockResponse({
        sessionId: 'session-hc-round-trip',
        agentUaid: 'hederaconnect-uaid-001',
        status: 'active',
        createdAt: new Date().toISOString(),
      }));

      const session = await client.createChatSession('hederaconnect-uaid-001');
      expect(session.sessionId).toBe('session-hc-round-trip');

      // 2. Send message and get response
      mockFetch.mockResolvedValueOnce(mockResponse({
        response: {
          id: 'msg-agent-rt',
          content: 'I can help you discover agents. Try asking "Find agents that can analyze data".',
          role: 'agent',
          timestamp: new Date().toISOString(),
        },
      }));

      const chatResponse = await client.sendChatMessage(
        session.sessionId,
        'What capabilities do you have?',
      );
      expect(chatResponse.agentResponse).toBeDefined();
      expect(chatResponse.agentResponse!.content).toContain('discover agents');

      // 3. End session
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      await client.endChatSession(session.sessionId);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ── 4. RegistryBroker — HederaConnect Profile ──────────────────────────

  describe('RegistryBroker — HederaConnect Profile', () => {
    let broker: RegistryBroker;

    beforeEach(() => {
      broker = new RegistryBroker(TEST_CONFIG);
    });

    it('should build profile with HederaConnect name', () => {
      const profile = broker.buildProfile();
      expect(profile.display_name).toBe('HederaConnect');
      expect(profile.alias).toBe('hedera-connect');
    });

    it('should include correct description', () => {
      const profile = broker.buildProfile();
      expect(profile.bio).toContain('multi-protocol discovery');
      expect(profile.bio).toContain('trust analytics');
      expect(profile.bio).toContain('privacy-preserving');
    });

    it('should include required capabilities', () => {
      const profile = broker.buildProfile();
      expect(profile.capabilities).toContain('marketplace');
      expect(profile.capabilities).toContain('discovery');
      expect(profile.capabilities).toContain('chat');
      expect(profile.capabilities).toContain('trust-analytics');
      expect(profile.capabilities).toContain('privacy');
    });

    it('should include correct tags', () => {
      const profile = broker.buildProfile();
      expect(profile.tags).toContain('marketplace');
      expect(profile.tags).toContain('discovery');
      expect(profile.tags).toContain('chat');
      expect(profile.tags).toContain('trust-analytics');
      expect(profile.tags).toContain('privacy');
      expect(profile.tags).toContain('hedera');
      expect(profile.tags).toContain('hcs-10');
    });

    it('should include OpSpawn socials', () => {
      const profile = broker.buildProfile();
      expect(profile.socials).toEqual(
        expect.arrayContaining([
          { platform: 'twitter', handle: '@opspawn' },
          { platform: 'github', handle: 'opspawn' },
        ]),
      );
    });

    it('should register with HederaConnect profile via SDK', async () => {
      const result = await broker.register();
      expect(result.success).toBe(true);
      expect(result.uaid).toBe('hederaconnect-uaid-001');
      expect(result.agentId).toBe('hederaconnect-agent-001');
    });

    it('should verify HederaConnect is searchable', async () => {
      const verified = await broker.verifyRegistration();
      expect(verified).toBe(true);
    });

    it('should search for HederaConnect agents', async () => {
      const result = await broker.searchAgents({ q: 'HederaConnect' });
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].display_name).toBe('HederaConnect');
    });

    it('should get HederaConnect agent profile', async () => {
      const profile = await broker.getAgentProfile('hederaconnect-uaid-001');
      expect(profile).not.toBeNull();
      expect(profile!.display_name).toBe('HederaConnect');
    });

    it('should create chat relay session via RegistryBroker', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      expect(session.sessionId).toBe('session-hc-001');
      expect(session.agentId).toBe('hederaconnect-agent-001');
      expect(session.status).toBe('active');
    });

    it('should send relay message and get response', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      const response = await broker.sendRelayMessage(session.sessionId, 'Test message');

      expect(response.message.role).toBe('user');
      expect(response.message.content).toBe('Test message');
      expect(response.agentResponse).toBeDefined();
      expect(response.agentResponse!.content).toContain('HederaConnect');
    });

    it('should track message count in relay session', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      expect(session.messageCount).toBe(0);

      await broker.sendRelayMessage(session.sessionId, 'First message');
      const updated = broker.getRelaySession(session.sessionId);
      expect(updated!.messageCount).toBe(2); // user + agent response
    });

    it('should close relay session', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      broker.closeRelaySession(session.sessionId);

      const closed = broker.getRelaySession(session.sessionId);
      expect(closed!.status).toBe('closed');
    });

    it('should reject messages to closed session', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      broker.closeRelaySession(session.sessionId);

      await expect(broker.sendRelayMessage(session.sessionId, 'Should fail'))
        .rejects.toThrow(/closed/);
    });

    it('should get relay history', async () => {
      const session = await broker.createSession('hederaconnect-agent-001');
      await broker.sendRelayMessage(session.sessionId, 'Hello HederaConnect');

      const history = broker.getRelayHistory(session.sessionId);
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello HederaConnect');
      expect(history[1].role).toBe('agent');
    });
  });

  // ── 5. Idempotent Registration ─────────────────────────────────────────

  describe('Idempotent Registration — HOLAutoRegister', () => {
    function createMockClient(overrides?: Record<string, unknown>): HOLRegistryClient {
      return {
        search: jest.fn().mockResolvedValue({
          agents: [],
          total: 0,
          page: 1,
          limit: 10,
          hasMore: false,
        }),
        register: jest.fn().mockResolvedValue({
          success: true,
          uaid: 'auto-hc-uaid-001',
          agentId: 'auto-hc-agent-001',
        }),
        getStats: jest.fn().mockResolvedValue({ totalAgents: 93000 }),
        getRegistries: jest.fn().mockResolvedValue([]),
        getProtocols: jest.fn().mockResolvedValue([]),
        resolve: jest.fn().mockResolvedValue(null),
        getSkills: jest.fn().mockResolvedValue([]),
        getRegistrationQuote: jest.fn().mockResolvedValue({ credits: 0 }),
        createChatSession: jest.fn().mockResolvedValue({ sessionId: 's1' }),
        sendChatMessage: jest.fn().mockResolvedValue({ message: { id: 'm1' } }),
        getAgent: jest.fn().mockResolvedValue({ id: 'a1' }),
        getChatHistory: jest.fn().mockResolvedValue({ messages: [] }),
        getSessionMeta: jest.fn().mockResolvedValue({ sessionId: 's1' }),
        endChatSession: jest.fn().mockResolvedValue(undefined),
        getRegistrationStatus: jest.fn().mockResolvedValue({ status: 'registered' }),
        getBalance: jest.fn().mockResolvedValue({ balance: 100 }),
        vectorSearch: jest.fn().mockResolvedValue({ agents: [] }),
        getAgentFeedback: jest.fn().mockResolvedValue({ feedback: [] }),
        findSimilar: jest.fn().mockResolvedValue([]),
        clearCache: jest.fn(),
        getCacheSize: jest.fn().mockReturnValue(0),
        parseAgent: jest.fn(),
        getBaseUrl: jest.fn().mockReturnValue('https://hol.org/registry/api/v1'),
        ...overrides,
      } as unknown as HOLRegistryClient;
    }

    function createTestAgent(overrides?: Partial<RegisteredAgent>): RegisteredAgent {
      return {
        name: 'HederaConnect',
        description: 'AI Agent Marketplace with multi-protocol discovery',
        agent_id: 'hederaconnect-001',
        endpoint: 'https://hedera.opspawn.com/api/agent',
        protocols: ['hcs-10', 'a2a'],
        skills: [{
          id: 'skill-marketplace',
          name: 'marketplace',
          description: 'Agent discovery and marketplace',
          category: 'discovery',
          tags: ['marketplace'],
          input_schema: {},
          output_schema: {},
          pricing: { amount: 0, token: 'HBAR', unit: 'per_call' },
        }],
        payment_address: '0.0.7854018',
        inbound_topic: '0.0.7854276',
        outbound_topic: '0.0.7854275',
        profile_topic: '0.0.7854282',
        reputation_score: 85,
        trust_score: 75,
        trust_level: 'verified',
        status: 'online',
        registered_at: new Date().toISOString(),
        hedera_verified: true,
        hedera_transactions: [],
        ...overrides,
      };
    }

    it('should skip registration if agent already exists', async () => {
      const mockClient = createMockClient({
        search: jest.fn().mockResolvedValue({
          agents: [{
            id: 'existing-hc',
            uaid: 'existing-hc-uaid',
            name: 'HederaConnect',
            registry: 'hashgraph-online',
          }],
          total: 1,
          page: 1,
          limit: 5,
          hasMore: false,
        }),
      });

      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();
      const result = await autoRegister.autoRegisterAll([agent]);

      expect(result.skipped).toBe(1);
      expect(result.registered).toBe(0);
      expect((mockClient.register as jest.Mock)).not.toHaveBeenCalled();
    });

    it('should register if agent does not exist', async () => {
      const mockClient = createMockClient();
      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();

      const result = await autoRegister.autoRegisterAll([agent]);
      expect(result.registered).toBe(1);
      expect(result.skipped).toBe(0);
      expect((mockClient.register as jest.Mock)).toHaveBeenCalled();
    });

    it('should build correct payload for HederaConnect', () => {
      const mockClient = createMockClient();
      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();
      const payload = autoRegister.buildPayload(agent);

      expect(payload.name).toBe('HederaConnect');
      expect(payload.description).toContain('multi-protocol discovery');
      expect(payload.protocols).toContain('hcs-10');
      expect(payload.communicationProtocol).toBe('hcs-10');
      expect(payload.endpoints?.a2a).toContain('hedera.opspawn.com');
    });

    it('should handle registration failure and record error', async () => {
      const mockClient = createMockClient({
        register: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();
      const result = await autoRegister.autoRegisterAll([agent]);

      expect(result.failed).toBe(1);
      expect(result.records[0].status).toBe('failed');
      expect(result.records[0].error).toContain('Network error');
    });

    it('should track all registration records', async () => {
      const mockClient = createMockClient();
      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();

      await autoRegister.autoRegisterAll([agent]);
      const records = autoRegister.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].name).toBe('HederaConnect');
    });

    it('should provide summary with correct counts', async () => {
      const mockClient = createMockClient();
      const autoRegister = new HOLAutoRegister(mockClient, 'https://hedera.opspawn.com');
      const agent = createTestAgent();

      await autoRegister.autoRegisterAll([agent]);
      const summary = autoRegister.getSummary();
      expect(summary.total).toBe(1);
      expect(summary.registered).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(0);
    });
  });

  // ── 6. Registration Status Check ───────────────────────────────────────

  describe('Registration Status Check', () => {
    let client: HOLRegistryClient;

    beforeEach(() => {
      client = new HOLRegistryClient();
    });

    it('should check registration status by UAID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        uaid: 'hederaconnect-uaid-001',
        status: 'registered',
        registeredAt: '2026-02-18T12:00:00Z',
        registry: 'hashgraph-online',
      }));

      const status = await client.getRegistrationStatus('hederaconnect-uaid-001');
      expect(status.uaid).toBe('hederaconnect-uaid-001');
      expect(status.status).toBe('registered');
      expect(status.registry).toBe('hashgraph-online');
    });

    it('should get registration quote before registering', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        credits: 10,
        currency: 'HBAR',
        estimatedProcessingTime: '5s',
      }));

      const quote = await client.getRegistrationQuote(HEDERACONNECT_PAYLOAD);
      expect(quote.credits).toBe(10);
      expect(quote.currency).toBe('HBAR');
    });
  });

  // ── 7. Agent Discoverability ───────────────────────────────────────────

  describe('Agent Discoverability in Search', () => {
    let client: HOLRegistryClient;

    beforeEach(() => {
      client = new HOLRegistryClient();
    });

    it('should find HederaConnect by name search', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
        }],
        total: 1,
      }));

      const result = await client.search({ q: 'HederaConnect' });
      expect(result.total).toBeGreaterThan(0);
      expect(result.agents[0].name).toBe('HederaConnect');
    });

    it('should find HederaConnect by capability search', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
          capabilities: ['marketplace', 'discovery', 'chat'],
        }],
        total: 1,
      }));

      const result = await client.search({ q: 'marketplace discovery' });
      expect(result.agents[0].capabilities).toContain('marketplace');
    });

    it('should find HederaConnect via vector search', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
        }],
        total: 1,
        query: 'agent marketplace with trust analytics',
      }));

      const result = await client.vectorSearch('agent marketplace with trust analytics');
      expect(result.agents[0].name).toBe('HederaConnect');
    });

    it('should find similar agents to HederaConnect', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [
          { id: 'sim-1', uaid: 'uaid-sim-1', name: 'AgentHub', registry: 'agent-hub' },
          { id: 'sim-2', uaid: 'uaid-sim-2', name: 'AIBroker', registry: 'ai-broker' },
        ],
      }));

      const similar = await client.findSimilar('hederaconnect-uaid-001');
      expect(similar).toHaveLength(2);
    });

    it('should return trust score for HederaConnect', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        agents: [{
          id: 'hc-1',
          uaid: 'hederaconnect-uaid-001',
          name: 'HederaConnect',
          registry: 'hashgraph-online',
          trustScore: 85,
          trustScores: { reliability: 90, responsiveness: 80 },
        }],
        total: 1,
      }));

      const result = await client.search({ q: 'HederaConnect', minTrust: 50 });
      expect(result.agents[0].trustScore).toBe(85);
    });
  });
});
