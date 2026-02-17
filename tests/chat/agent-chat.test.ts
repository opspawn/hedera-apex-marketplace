/**
 * Tests for ChatAgent — natural language tool-calling agent.
 *
 * All broker/connection operations are mocked.
 */

import { ChatAgent, ChatAgentConfig, AgentChatResponse } from '../../src/chat/agent-chat';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';
import { AgentFeedbackManager } from '../../src/hol/agent-feedback';

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

// Mock FeedbackManager
const mockFeedback = {
  getAgentFeedback: jest.fn(),
  submitFeedback: jest.fn(),
} as unknown as AgentFeedbackManager;

describe('ChatAgent', () => {
  let agent: ChatAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new ChatAgent({
      registryBroker: mockBroker,
      connectionHandler: mockConnectionHandler,
      feedbackManager: mockFeedback,
    });
  });

  // ----- Tool listing -----

  describe('getAvailableTools', () => {
    test('should return all tools', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toHaveLength(12);
      expect(tools).toContain('register_agent');
      expect(tools).toContain('find_registrations');
      expect(tools).toContain('vector_search');
      expect(tools).toContain('get_agent_details');
      expect(tools).toContain('initiate_connection');
      expect(tools).toContain('send_message');
      expect(tools).toContain('check_messages');
      expect(tools).toContain('get_feedback');
    });
  });

  // ----- Session management -----

  describe('session management', () => {
    test('should create a session on first message', async () => {
      (mockBroker.register as jest.Mock).mockResolvedValue({ success: true, uaid: 'u1', agentId: 'a1' });
      const res = await agent.processMessage('Register me as an agent', 'sess-1');
      expect(res.sessionId).toBe('sess-1');
    });

    test('should maintain history across messages', async () => {
      (mockBroker.register as jest.Mock).mockResolvedValue({ success: true, uaid: 'u1', agentId: 'a1' });
      await agent.processMessage('Register me as an agent', 'sess-2');
      const history = agent.getHistory('sess-2');
      expect(history).toHaveLength(2); // user + agent
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('agent');
    });

    test('should return empty history for unknown session', () => {
      const history = agent.getHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  // ----- Intent detection: register -----

  describe('register_agent intent', () => {
    beforeEach(() => {
      (mockBroker.register as jest.Mock).mockResolvedValue({
        success: true,
        uaid: 'uaid-test-123',
        agentId: 'agent-test-456',
      });
    });

    test('should detect "Register me as a data analyst agent"', async () => {
      const res = await agent.processMessage('Register me as a data analyst agent', 's1');
      expect(res.actions).toHaveLength(1);
      expect(res.actions[0].tool).toBe('register_agent');
      expect(res.response).toContain('Successfully registered');
      expect(res.response).toContain('uaid-test-123');
    });

    test('should detect "Sign up as an agent"', async () => {
      const res = await agent.processMessage('Sign up as an agent', 's2');
      expect(res.actions[0].tool).toBe('register_agent');
    });

    test('should detect "Create my agent profile"', async () => {
      const res = await agent.processMessage('Create my agent profile', 's3');
      expect(res.actions[0].tool).toBe('register_agent');
    });

    test('should handle registration failure', async () => {
      (mockBroker.register as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Network error',
      });
      const res = await agent.processMessage('Register me as an agent', 's4');
      expect(res.actions[0].result.success).toBe(false);
      expect(res.response).toContain('Registration failed');
    });
  });

  // ----- Intent detection: find_registrations -----

  describe('find_registrations intent', () => {
    test('should detect "List all agents"', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({
        agents: [{ display_name: 'Agent 1', bio: 'Does stuff' }],
        total: 1,
      });
      const res = await agent.processMessage('List all agents', 's5');
      expect(res.actions[0].tool).toBe('find_registrations');
      expect(res.response).toContain('Found 1 agent');
    });

    test('should detect "Search for code agents"', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({ agents: [], total: 0 });
      const res = await agent.processMessage('Search for code agents', 's6');
      expect(res.actions[0].tool).toBe('find_registrations');
    });

    test('should handle no results', async () => {
      (mockBroker.searchAgents as jest.Mock).mockResolvedValue({ agents: [], total: 0 });
      const res = await agent.processMessage('Browse agents', 's7');
      expect(res.response).toContain('No agents found');
    });
  });

  // ----- Intent detection: vector_search -----

  describe('vector_search intent', () => {
    test('should detect "Find me an agent that can analyze financial data"', async () => {
      (mockBroker.vectorSearch as jest.Mock).mockResolvedValue({
        results: [{ display_name: 'FinBot', score: 0.92, tags: ['finance'] }],
        total: 1,
      });
      const res = await agent.processMessage('Find me an agent that can analyze financial data', 's8');
      expect(res.actions[0].tool).toBe('vector_search');
      expect(res.response).toContain('semantic search');
    });

    test('should detect "Which agent can summarize documents"', async () => {
      (mockBroker.vectorSearch as jest.Mock).mockResolvedValue({ results: [], total: 0 });
      const res = await agent.processMessage('Which agent can summarize documents', 's9');
      expect(res.actions[0].tool).toBe('vector_search');
    });

    test('should handle no vector results', async () => {
      (mockBroker.vectorSearch as jest.Mock).mockResolvedValue({ results: [], total: 0 });
      const res = await agent.processMessage('Find an agent that can fly', 's10');
      expect(res.response).toContain('No agents found');
    });
  });

  // ----- Intent detection: get_agent_details -----

  describe('get_agent_details intent', () => {
    test('should detect "Details for agent 0.0.12345"', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue({
        display_name: 'TestBot',
        bio: 'A test agent',
        tags: ['testing'],
        capabilities: ['TEXT_GENERATION'],
      });
      const res = await agent.processMessage('Details for agent 0.0.12345', 's-det1');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('TestBot');
      expect(res.response).toContain('A test agent');
    });

    test('should detect "Info about agent sentinel-ai"', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue({
        display_name: 'SentinelAI',
        bio: 'Security agent',
        tags: ['security'],
      });
      const res = await agent.processMessage('Info about agent sentinel-ai', 's-det2');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('SentinelAI');
    });

    test('should detect "Who is agent 0.0.99999"', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue({
        display_name: 'DataBot',
        bio: 'Data processor',
      });
      const res = await agent.processMessage('Who is agent 0.0.99999', 's-det3');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('DataBot');
    });

    test('should handle agent not found', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue(null);
      const res = await agent.processMessage('Details for agent unknown-id', 's-det4');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('No agent found');
    });

    test('should detect "Describe agent finbot-001"', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue({
        display_name: 'FinBot',
        bio: 'Financial analyst',
      });
      const res = await agent.processMessage('Describe agent finbot-001', 's-det5');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('FinBot');
    });

    test('should show capabilities and tags when available', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockResolvedValue({
        display_name: 'MultiBot',
        bio: 'Multi-purpose agent',
        tags: ['ai', 'ml', 'nlp'],
        capabilities: ['TEXT_GENERATION', 'CODE_GENERATION'],
        protocol: 'HCS-10',
      });
      const res = await agent.processMessage('Details for agent multi-bot', 's-det6');
      expect(res.actions[0].tool).toBe('get_agent_details');
      expect(res.response).toContain('ai, ml, nlp');
      expect(res.response).toContain('TEXT_GENERATION');
      expect(res.response).toContain('HCS-10');
    });

    test('should handle broker error gracefully', async () => {
      (mockBroker.getAgentProfile as jest.Mock).mockRejectedValue(new Error('Broker timeout'));
      const res = await agent.processMessage('Details for agent 0.0.55555', 's-det7');
      expect(res.response).toContain('error');
      expect(res.response).toContain('Broker timeout');
    });
  });

  // ----- Intent detection: initiate_connection -----

  describe('initiate_connection intent', () => {
    test('should detect "Connect to 0.0.12345"', async () => {
      const res = await agent.processMessage('Connect to 0.0.12345', 's11');
      expect(res.actions[0].tool).toBe('initiate_connection');
      expect(res.actions[0].args.targetAccount).toBe('0.0.12345');
    });

    test('should accept pending connection request', async () => {
      (mockConnectionHandler.getPendingRequests as jest.Mock).mockReturnValue([
        { id: 'req-1', from_account: '0.0.99999', from_inbound_topic: '0.0.55555', timestamp: new Date().toISOString(), sequence_number: 1 },
      ]);
      (mockConnectionHandler.acceptConnection as jest.Mock).mockResolvedValue({
        id: 'conn-1',
        remote_account: '0.0.99999',
        connection_topic: '0.0.66666',
        status: 'active',
      });
      const res = await agent.processMessage('Connect to 0.0.99999', 's12');
      expect(res.actions[0].tool).toBe('initiate_connection');
      expect(res.response).toContain('Connection established');
    });

    test('should inform when no pending request', async () => {
      const res = await agent.processMessage('Connect to 0.0.11111', 's13');
      expect(res.response).toContain('No pending connection request');
    });

    test('should require target account', async () => {
      // "Initiate connection" without specifying target
      const res = await agent.processMessage('Initiate connection with', 's14');
      expect(res.actions[0].tool).toBe('initiate_connection');
    });
  });

  // ----- Intent detection: send_message -----

  describe('send_message intent', () => {
    test('should detect "Send a message to the analyst"', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Send a message to the analyst: review this dataset', 's15');
      expect(res.actions[0].tool).toBe('send_message');
    });

    test('should send on active connection', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([
        { id: 'conn-1', remote_account: '0.0.99999', connection_topic: '0.0.66666', status: 'active' },
      ]);
      (mockConnectionHandler.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg-1', connection_id: 'conn-1', from: '0.0.7854018', content: 'hello', timestamp: new Date().toISOString(),
      });
      const res = await agent.processMessage('Tell the agent: hello', 's16');
      expect(res.actions[0].result.success).toBe(true);
      expect(res.response).toContain('Message sent');
    });

    test('should fail without active connections', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Ask the agent to review data', 's17');
      expect(res.response).toContain('No active connections');
    });
  });

  // ----- Intent detection: check_messages -----

  describe('check_messages intent', () => {
    test('should detect "Check my messages"', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Check my messages', 's18');
      expect(res.actions[0].tool).toBe('check_messages');
    });

    test('should return messages from active connections', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([
        { id: 'conn-1', remote_account: '0.0.99999', connection_topic: '0.0.66666', status: 'active' },
      ]);
      (mockConnectionHandler.readConnectionMessages as jest.Mock).mockResolvedValue([
        { id: 'msg-1', connection_id: 'conn-1', from: '0.0.99999', content: 'hi there', timestamp: new Date().toISOString() },
      ]);
      const res = await agent.processMessage('Any new messages?', 's19');
      expect(res.actions[0].tool).toBe('check_messages');
      expect(res.response).toContain('Found 1 message');
    });

    test('should handle no messages', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([
        { id: 'conn-1', remote_account: '0.0.99999', connection_topic: '0.0.66666', status: 'active' },
      ]);
      (mockConnectionHandler.readConnectionMessages as jest.Mock).mockResolvedValue([]);
      const res = await agent.processMessage('Read my inbox', 's20');
      expect(res.response).toContain('No new messages');
    });
  });

  // ----- Intent detection: get_feedback -----

  describe('get_feedback intent', () => {
    test('should detect "Show feedback for agent-001"', async () => {
      (mockFeedback.getAgentFeedback as jest.Mock).mockResolvedValue({
        totalFeedback: 3,
        averageRating: 4.5,
      });
      const res = await agent.processMessage('Show feedback for agent-001', 's21');
      expect(res.actions[0].tool).toBe('get_feedback');
      expect(res.response).toContain('3 feedback entries');
      expect(res.response).toContain('4.5');
    });

    test('should handle no feedback', async () => {
      (mockFeedback.getAgentFeedback as jest.Mock).mockResolvedValue({
        totalFeedback: 0,
        averageRating: 0,
      });
      const res = await agent.processMessage('Rating for agent-002', 's22');
      expect(res.response).toContain('No feedback found');
    });

    test('should require agent ID', async () => {
      const res = await agent.processMessage('Show me the feedback', 's23');
      expect(res.actions[0].tool).toBe('get_feedback');
      expect(res.response).toContain('specify an agent ID');
    });
  });

  // ----- Help / fallback -----

  describe('help fallback', () => {
    test('should return help for unrecognized input', async () => {
      const res = await agent.processMessage('What is the meaning of life?', 's24');
      expect(res.actions).toHaveLength(0);
      expect(res.response).toContain('Agent Registration');
      expect(res.response).toContain('Agent Discovery');
      expect(res.response).toContain('Connections');
    });

    test('should return help for empty-ish input', async () => {
      const res = await agent.processMessage('hello', 's25');
      expect(res.actions).toHaveLength(0);
      expect(res.response).toContain('help you with');
    });
  });

  // ----- Error handling -----

  describe('error handling', () => {
    test('should handle broker errors gracefully', async () => {
      (mockBroker.register as jest.Mock).mockRejectedValue(new Error('Network down'));
      const res = await agent.processMessage('Register me as an agent', 's26');
      expect(res.response).toContain('error');
      expect(res.response).toContain('Network down');
    });

    test('should handle connection handler errors gracefully', async () => {
      (mockConnectionHandler.getActiveConnections as jest.Mock).mockReturnValue([
        { id: 'conn-1', remote_account: '0.0.99999', connection_topic: '0.0.66666', status: 'active' },
      ]);
      (mockConnectionHandler.sendMessage as jest.Mock).mockRejectedValue(new Error('Topic not found'));
      const res = await agent.processMessage('Tell the agent: hello', 's27');
      expect(res.response).toContain('error');
    });
  });

  // ----- Without feedback manager -----

  describe('without feedback manager', () => {
    test('should return error when feedback manager not configured', async () => {
      const agentNoFeedback = new ChatAgent({
        registryBroker: mockBroker,
        connectionHandler: mockConnectionHandler,
      });
      const res = await agentNoFeedback.processMessage('Show feedback for agent-001', 's28');
      expect(res.response).toContain('not configured');
    });
  });

  // ----- Tool call history -----

  describe('tool call recording', () => {
    test('should record tool calls in message history', async () => {
      (mockBroker.register as jest.Mock).mockResolvedValue({ success: true, uaid: 'u1', agentId: 'a1' });
      await agent.processMessage('Register me as an agent', 's29');
      const history = agent.getHistory('s29');
      const agentMsg = history[1];
      expect(agentMsg.toolCalls).toBeDefined();
      expect(agentMsg.toolCalls).toHaveLength(1);
      expect(agentMsg.toolCalls![0].name).toBe('register_agent');
    });

    test('should not include tool calls for help response', async () => {
      await agent.processMessage('hello world', 's30');
      const history = agent.getHistory('s30');
      const agentMsg = history[1];
      expect(agentMsg.toolCalls).toBeUndefined();
    });
  });
});
