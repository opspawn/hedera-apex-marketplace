/**
 * Sprint 25 tests — Chat UI polish and demo recording features.
 *
 * Tests the chat suggestions, markdown rendering, skills tool,
 * and the /demo/record scripted demo route.
 */

import { ChatAgent, ChatAgentConfig, AgentChatResponse } from '../../src/chat/agent-chat';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';

// Mock RegistryBroker
const mockBroker = {
  register: jest.fn(),
  searchAgents: jest.fn(),
  vectorSearch: jest.fn(),
  verifyRegistration: jest.fn(),
  getStatus: jest.fn(),
  buildProfile: jest.fn(),
  getBrokerUrl: jest.fn().mockReturnValue('https://hol.org/registry/api/v1'),
  authenticate: jest.fn(),
  getAgentProfile: jest.fn(),
  getSkills: jest.fn(),
  registerSkill: jest.fn(),
  createSession: jest.fn(),
  sendRelayMessage: jest.fn(),
  getRelaySession: jest.fn(),
  getRelayHistory: jest.fn(),
  getActiveRelaySessions: jest.fn().mockReturnValue([]),
} as unknown as RegistryBroker;

// Mock ConnectionHandler
const mockConnectionHandler = {
  getPendingRequests: jest.fn().mockReturnValue([]),
  getActiveConnections: jest.fn().mockReturnValue([]),
  getAllConnections: jest.fn().mockReturnValue([]),
  acceptConnection: jest.fn(),
  sendMessage: jest.fn(),
  readConnectionMessages: jest.fn(),
  closeConnection: jest.fn(),
  getHandlerStatus: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: jest.fn(),
  pollInboundTopic: jest.fn(),
  getConnection: jest.fn(),
} as unknown as ConnectionHandler;

describe('Sprint 25: Chat UI Polish', () => {
  let agent: ChatAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new ChatAgent({
      registryBroker: mockBroker,
      connectionHandler: mockConnectionHandler,
    });
  });

  describe('Skills suggestion flow', () => {
    it('should detect skills listing intent', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({
        agents: [
          { display_name: 'TestAgent', capabilities: ['TEXT_GENERATION', 'CODE_GENERATION'], tags: ['nlp'] },
          { display_name: 'Agent2', capabilities: ['IMAGE_GENERATION'], tags: ['vision'] },
        ],
        total: 2,
      });

      const result = await agent.processMessage('Show available agent skills', 'test-session');
      expect(result.response).toContain('skills');
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions[0].tool).toBe('list_skills');
    });

    it('should list unique skills from all agents', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({
        agents: [
          { display_name: 'A', capabilities: ['TEXT_GENERATION'], tags: ['code'] },
          { display_name: 'B', capabilities: ['TEXT_GENERATION', 'CODE_GENERATION'], tags: ['analysis'] },
        ],
        total: 2,
      });

      const result = await agent.processMessage('List available skills', 'test-skills');
      expect(result.actions[0].result.success).toBe(true);
      expect(result.actions[0].result.data).toBeDefined();
    });

    it('should handle empty marketplace for skills listing', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({ agents: [], total: 0 });

      const result = await agent.processMessage('Show available skills', 'empty-skills');
      expect(result.response).toContain('No skills');
    });
  });

  describe('Chat suggestion cards', () => {
    it('should support Register suggestion', async () => {
      (mockBroker.register as jest.Mock).mockResolvedValue({
        success: true, uaid: 'test-uaid', agentId: 'agent-123',
      });

      const result = await agent.processMessage('Register me as a data analyst agent', 'reg-session');
      expect(result.actions[0].tool).toBe('register_agent');
    });

    it('should support Discover suggestion', async () => {
      (mockBroker.vectorSearch as jest.Mock).mockResolvedValue({
        results: [{ display_name: 'FinBot', bio: 'Financial analyzer', score: 0.95 }],
        total: 1,
      });

      const result = await agent.processMessage('Find agents that can analyze financial data', 'disc-session');
      expect(result.actions[0].tool).toBe('vector_search');
    });

    it('should support Connect suggestion', async () => {
      const result = await agent.processMessage('Connect to 0.0.12345', 'conn-session');
      expect(result.actions[0].tool).toBe('initiate_connection');
      expect(result.actions[0].args.targetAccount).toBe('0.0.12345');
    });
  });

  describe('Available tools include list_skills', () => {
    it('should include list_skills in available tools', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toContain('list_skills');
    });

    it('should have all expected tools', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toContain('register_agent');
      expect(tools).toContain('find_registrations');
      expect(tools).toContain('vector_search');
      expect(tools).toContain('initiate_connection');
      expect(tools).toContain('send_message');
      expect(tools).toContain('check_messages');
      expect(tools).toContain('list_skills');
    });
  });

  describe('Session management', () => {
    it('should preserve session history', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({ agents: [], total: 0 });

      await agent.processMessage('Show skills', 'history-test');
      await agent.processMessage('List agents', 'history-test');

      const history = agent.getHistory('history-test');
      expect(history.length).toBe(4); // 2 user + 2 agent messages
    });

    it('should isolate sessions', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({ agents: [], total: 0 });

      await agent.processMessage('Hello', 'session-a');
      await agent.processMessage('Hi', 'session-b');

      expect(agent.getHistory('session-a').length).toBe(2);
      expect(agent.getHistory('session-b').length).toBe(2);
    });
  });
});
