/**
 * Sprint 32: Chat UX Enhancement Tests
 *
 * Tests for:
 * - Suggested prompts matching HOL bounty requirements
 * - Agent card display in chat responses
 * - Trust score queries via chat
 * - Response quality for natural language queries
 */

import { ChatAgent } from '../../src/chat/agent-chat';
import { RegistryBroker, BrokerAgentEntry } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';
import { AgentFeedbackManager } from '../../src/hol/agent-feedback';

const createMockBroker = () => ({
  register: jest.fn().mockResolvedValue({ success: true, uaid: 'u1', agentId: 'a1' }),
  searchAgents: jest.fn().mockResolvedValue({
    agents: [
      { display_name: 'SentinelAI', bio: 'Smart contract audits', tags: ['security', 'audit'], capabilities: ['CODE_GENERATION'], trust_score: 92, trust_level: 'elite', reputation_score: 92 },
      { display_name: 'DataWeaver', bio: 'ETL pipelines', tags: ['data', 'etl'], capabilities: ['TEXT_GENERATION'], trust_score: 78, trust_level: 'verified', reputation_score: 78 },
      { display_name: 'LinguaFlow', bio: 'Translation AI', tags: ['nlp', 'translation'], capabilities: ['TEXT_GENERATION'], trust_score: 87, trust_level: 'elite', reputation_score: 87 },
    ],
    total: 3,
  }),
  vectorSearch: jest.fn().mockResolvedValue({
    results: [
      { display_name: 'DataWeaver', score: 0.95, bio: 'ETL pipelines', tags: ['data'], trust_score: 78 },
    ],
    total: 1,
  }),
  getAgentProfile: jest.fn().mockResolvedValue({
    display_name: 'SentinelAI',
    bio: 'Smart contract auditing agent',
    tags: ['security', 'audit'],
    capabilities: ['CODE_GENERATION'],
    protocol: 'hcs-10',
  }),
  createSession: jest.fn().mockResolvedValue({ sessionId: 's1', agentId: 'a1' }),
  sendRelayMessage: jest.fn().mockResolvedValue({ agentResponse: { content: 'Response here' } }),
  getActiveRelaySessions: jest.fn().mockReturnValue([]),
  getRelayHistory: jest.fn().mockReturnValue([]),
  getBrokerUrl: jest.fn().mockReturnValue('https://hol.org/registry/api/v1'),
  authenticate: jest.fn(),
  getStatus: jest.fn(),
  buildProfile: jest.fn(),
  verifyRegistration: jest.fn(),
  getSkills: jest.fn(),
  registerSkill: jest.fn(),
} as unknown as RegistryBroker);

const createMockConnectionHandler = () => ({
  getPendingRequests: jest.fn().mockReturnValue([]),
  getActiveConnections: jest.fn().mockReturnValue([]),
  getAllConnections: jest.fn().mockReturnValue([]),
  acceptConnection: jest.fn(),
  sendMessage: jest.fn(),
  readConnectionMessages: jest.fn().mockResolvedValue([]),
  closeConnection: jest.fn(),
  getHandlerStatus: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: jest.fn(),
  pollInboundTopic: jest.fn(),
  getConnection: jest.fn(),
} as unknown as ConnectionHandler);

const createMockFeedback = () => ({
  getAgentFeedback: jest.fn().mockResolvedValue({ totalFeedback: 3, averageRating: 4.2 }),
  submitFeedback: jest.fn(),
} as unknown as AgentFeedbackManager);

describe('Sprint 32: Chat UX Enhancement', () => {
  let agent: ChatAgent;
  let mockBroker: ReturnType<typeof createMockBroker>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBroker = createMockBroker();
    agent = new ChatAgent({
      registryBroker: mockBroker,
      connectionHandler: createMockConnectionHandler(),
      feedbackManager: createMockFeedback(),
    });
  });

  // ===== Suggested Prompts (HOL bounty requirement) =====

  describe('HOL bounty suggested prompts', () => {
    test('should respond to "Find me an AI agent for data analysis"', async () => {
      const res = await agent.processMessage('Find me an AI agent for data analysis', 's-p1');
      expect(res.actions.length).toBeGreaterThanOrEqual(1);
      expect(['vector_search', 'find_registrations']).toContain(res.actions[0].tool);
    });

    test('should respond to "Register a new agent"', async () => {
      const res = await agent.processMessage('Register a new agent', 's-p2');
      expect(res.actions[0].tool).toBe('register_agent');
    });

    test('should respond to "Show trust scores"', async () => {
      const res = await agent.processMessage('Show trust scores for available agents', 's-p3');
      expect(res.actions[0].tool).toBe('get_trust_scores');
    });

    test('should respond to "Search for code review agents"', async () => {
      const res = await agent.processMessage('Search for code review agents', 's-p4');
      expect(res.actions.length).toBeGreaterThanOrEqual(1);
    });

    test('should respond to "Show available agent skills"', async () => {
      const res = await agent.processMessage('Show available agent skills', 's-p5');
      expect(res.actions[0].tool).toBe('list_skills');
    });

    test('should respond to "Connect to agent 0.0.12345"', async () => {
      const res = await agent.processMessage('Connect to agent 0.0.12345', 's-p6');
      expect(res.actions[0].tool).toBe('initiate_connection');
    });
  });

  // ===== Trust Score Tool =====

  describe('trust score tool', () => {
    test('should return trust scores for all agents', async () => {
      const res = await agent.processMessage('Show trust scores', 's-t1');
      expect(res.actions[0].tool).toBe('get_trust_scores');
      expect(res.response).toContain('Trust');
      expect(res.response).toContain('SentinelAI');
    });

    test('should include trust level labels in response', async () => {
      const res = await agent.processMessage('Show trust scores for agents', 's-t2');
      expect(res.response).toContain('elite');
    });

    test('should include trust level legend', async () => {
      const res = await agent.processMessage('Show trust scores', 's-t3');
      expect(res.response).toContain('new');
      expect(res.response).toContain('basic');
      expect(res.response).toContain('trusted');
      expect(res.response).toContain('verified');
      expect(res.response).toContain('elite');
    });

    test('should handle empty marketplace for trust scores', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValueOnce({ agents: [], total: 0 });
      const res = await agent.processMessage('Show trust scores', 's-t4');
      expect(res.response).toContain('No agents found');
    });

    test('should be listed in available tools', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toContain('get_trust_scores');
    });

    test('should have 14 tools total', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toHaveLength(14);
    });
  });

  // ===== Agent Card Display in Chat =====

  describe('agent card data in responses', () => {
    test('search results should include agent display data', async () => {
      const res = await agent.processMessage('List all agents', 's-c1');
      const action = res.actions[0];
      expect(action.result.data).toBeDefined();
      const data = action.result.data as { agents: BrokerAgentEntry[] };
      expect(data.agents).toBeDefined();
      expect(data.agents.length).toBeGreaterThanOrEqual(1);
      expect(data.agents[0].display_name).toBeDefined();
    });

    test('vector search results should include score', async () => {
      const res = await agent.processMessage('Find agents that can process data', 's-c2');
      const action = res.actions[0];
      expect(action.result.data).toBeDefined();
      const data = action.result.data as { results: BrokerAgentEntry[] };
      expect(data.results).toBeDefined();
      expect(data.results[0].score).toBeDefined();
    });

    test('agent details should include full profile', async () => {
      const res = await agent.processMessage('Details for agent sentinel-ai', 's-c3');
      const action = res.actions[0];
      expect(action.result.data).toBeDefined();
      const profile = action.result.data as { display_name: string };
      expect(profile.display_name).toBe('SentinelAI');
    });

    test('trust score results should include agent data', async () => {
      const res = await agent.processMessage('Show trust scores', 's-c4');
      const action = res.actions[0];
      expect(action.result.data).toBeDefined();
      const data = action.result.data as { agents: BrokerAgentEntry[] };
      expect(data.agents).toBeDefined();
    });
  });

  // ===== Response Quality =====

  describe('response quality', () => {
    test('should give natural language responses for registration', async () => {
      const res = await agent.processMessage('Register me as a data analyst', 's-q1');
      expect(res.response.length).toBeGreaterThan(20);
      expect(res.response).toContain('registered');
    });

    test('should give formatted agent lists for search', async () => {
      const res = await agent.processMessage('List all agents', 's-q2');
      expect(res.response).toContain('Found');
      expect(res.response).toContain('agent');
    });

    test('should provide helpful error messages', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValueOnce({ agents: [], total: 0 });
      const res = await agent.processMessage('Browse agents', 's-q3');
      expect(res.response).toContain('No agents found');
      expect(res.response).toContain('Try');
    });

    test('should provide comprehensive help', async () => {
      const res = await agent.processMessage('What can you help me with?', 's-q4');
      expect(res.response).toContain('Agent Registration');
      expect(res.response).toContain('Agent Discovery');
      expect(res.response).toContain('Connections');
      expect(res.response).toContain('Chat Relay');
      expect(res.response).toContain('Trust Scores');
    });
  });
});
