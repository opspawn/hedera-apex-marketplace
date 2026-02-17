/**
 * Tests for ChatAgent — chat relay tool integration.
 *
 * Sprint 20: Tests for create_chat_session, relay_message, get_relay_history tools.
 */

import { ChatAgent } from '../../src/chat/agent-chat';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';
import { AgentFeedbackManager } from '../../src/hol/agent-feedback';

// Mock RegistryBroker with relay methods
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
  getRelayHistory: jest.fn(),
  getRelaySession: jest.fn(),
  getActiveRelaySessions: jest.fn().mockReturnValue([]),
  closeRelaySession: jest.fn(),
} as unknown as RegistryBroker;

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

describe('ChatAgent Chat Relay Tools', () => {
  let agent: ChatAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([]);
    agent = new ChatAgent({
      registryBroker: mockBroker,
      connectionHandler: mockConnectionHandler,
    });
  });

  // ----- Tool listing -----

  describe('getAvailableTools', () => {
    test('should include 11 tools (8 original + 3 relay)', () => {
      const tools = agent.getAvailableTools();
      expect(tools).toHaveLength(11);
    });

    test('should include create_chat_session tool', () => {
      expect(agent.getAvailableTools()).toContain('create_chat_session');
    });

    test('should include relay_message tool', () => {
      expect(agent.getAvailableTools()).toContain('relay_message');
    });

    test('should include get_relay_history tool', () => {
      expect(agent.getAvailableTools()).toContain('get_relay_history');
    });
  });

  // ----- Intent detection: create_chat_session -----

  describe('create_chat_session intent', () => {
    beforeEach(() => {
      (mockBroker.createSession as jest.Mock).mockResolvedValue({
        sessionId: 'relay-test-1',
        agentId: 'agent-001',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
      });
    });

    test('should detect "Chat with agent 0.0.12345"', async () => {
      const res = await agent.processMessage('Chat with agent 0.0.12345', 'relay-s1');
      expect(res.actions).toHaveLength(1);
      expect(res.actions[0].tool).toBe('create_chat_session');
      expect(res.response).toContain('Chat session created');
    });

    test('should detect "Start a conversation with the analyst"', async () => {
      const res = await agent.processMessage('Start a conversation with the analyst', 'relay-s2');
      expect(res.actions[0].tool).toBe('create_chat_session');
    });

    test('should detect "Talk to agent-001"', async () => {
      const res = await agent.processMessage('Talk to agent-001', 'relay-s3');
      expect(res.actions[0].tool).toBe('create_chat_session');
    });

    test('should detect "Open a session with the bot"', async () => {
      const res = await agent.processMessage('Open a session with the bot', 'relay-s4');
      expect(res.actions[0].tool).toBe('create_chat_session');
    });

    test('should detect "Converse with agent-002"', async () => {
      const res = await agent.processMessage('Converse with agent-002', 'relay-s5');
      expect(res.actions[0].tool).toBe('create_chat_session');
    });

    test('should return error when no agentId specified', async () => {
      const res = await agent.processMessage('Start a chat with', 'relay-s6');
      expect(res.actions[0].tool).toBe('create_chat_session');
      expect(res.actions[0].result.success).toBe(false);
      expect(res.response).toContain('specify an agent ID');
    });

    test('should include session ID in response', async () => {
      const res = await agent.processMessage('Chat with agent-001', 'relay-s7');
      expect(res.response).toContain('relay-test-1');
    });

    test('should handle broker error gracefully', async () => {
      (mockBroker.createSession as jest.Mock).mockRejectedValue(new Error('Broker unavailable'));
      const res = await agent.processMessage('Chat with agent-001', 'relay-s8');
      expect(res.response).toContain('error');
    });
  });

  // ----- Intent detection: relay_message -----

  describe('relay_message intent', () => {
    test('should detect "Relay message: hello agent"', async () => {
      const res = await agent.processMessage('Relay message: hello agent', 'relay-m1');
      expect(res.actions[0].tool).toBe('relay_message');
    });

    test('should detect "Forward message to the agent"', async () => {
      const res = await agent.processMessage('Forward message to the agent', 'relay-m2');
      expect(res.actions[0].tool).toBe('relay_message');
    });

    test('should detect "In the chat session say hi"', async () => {
      const res = await agent.processMessage('In the chat session say hi', 'relay-m3');
      expect(res.actions[0].tool).toBe('relay_message');
    });

    test('should fail with no active sessions', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Relay message: hello', 'relay-m4');
      expect(res.response).toContain('No active chat relay sessions');
    });

    test('should relay to most recent session', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([
        { sessionId: 'relay-1', agentId: 'agent-001', status: 'active', messageCount: 0, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
        { sessionId: 'relay-2', agentId: 'agent-002', status: 'active', messageCount: 0, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
      ]);
      (mockBroker.sendRelayMessage as jest.Mock).mockResolvedValue({
        message: { id: 'm1', sessionId: 'relay-2', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
        agentResponse: { id: 'm2', sessionId: 'relay-2', role: 'agent', content: 'Hi there!', timestamp: new Date().toISOString() },
      });
      const res = await agent.processMessage('Relay message: hello', 'relay-m5');
      expect(res.actions[0].result.success).toBe(true);
      expect(res.response).toContain('agent-002');
    });

    test('should include agent response in message', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([
        { sessionId: 'relay-1', agentId: 'agent-001', status: 'active', messageCount: 0, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
      ]);
      (mockBroker.sendRelayMessage as jest.Mock).mockResolvedValue({
        message: { id: 'm1', sessionId: 'relay-1', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
        agentResponse: { id: 'm2', sessionId: 'relay-1', role: 'agent', content: 'I can help!', timestamp: new Date().toISOString() },
      });
      const res = await agent.processMessage('Relay message: hello', 'relay-m6');
      expect(res.response).toContain('I can help!');
    });
  });

  // ----- Intent detection: get_relay_history -----

  describe('get_relay_history intent', () => {
    test('should detect "Show chat relay history"', async () => {
      const res = await agent.processMessage('Show chat relay history', 'relay-h1');
      expect(res.actions[0].tool).toBe('get_relay_history');
    });

    test('should detect "Chat history"', async () => {
      const res = await agent.processMessage('Show me the chat history', 'relay-h2');
      expect(res.actions[0].tool).toBe('get_relay_history');
    });

    test('should detect "Relay transcript"', async () => {
      const res = await agent.processMessage('Show the relay transcript', 'relay-h3');
      expect(res.actions[0].tool).toBe('get_relay_history');
    });

    test('should detect "Session history"', async () => {
      const res = await agent.processMessage('Get the session history', 'relay-h4');
      expect(res.actions[0].tool).toBe('get_relay_history');
    });

    test('should return no sessions message when empty', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Show relay history', 'relay-h5');
      expect(res.response).toContain('No active chat relay sessions');
    });

    test('should return history for active session', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([
        { sessionId: 'relay-1', agentId: 'agent-001', status: 'active', messageCount: 2, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
      ]);
      (mockBroker.getRelayHistory as jest.Mock).mockReturnValue([
        { id: 'm1', sessionId: 'relay-1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: 'm2', sessionId: 'relay-1', role: 'agent', content: 'Hi!', timestamp: new Date().toISOString() },
      ]);
      const res = await agent.processMessage('Show relay history', 'relay-h6');
      expect(res.response).toContain('2 messages');
      expect(res.response).toContain('Hello');
    });

    test('should handle empty history for active session', async () => {
      (mockBroker.getActiveRelaySessions as jest.Mock).mockReturnValue([
        { sessionId: 'relay-1', agentId: 'agent-001', status: 'active', messageCount: 0, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
      ]);
      (mockBroker.getRelayHistory as jest.Mock).mockReturnValue([]);
      const res = await agent.processMessage('Show relay history', 'relay-h7');
      expect(res.response).toContain('no messages');
    });
  });

  // ----- Help response -----

  describe('help response includes relay tools', () => {
    test('should mention Chat Relay in help', async () => {
      const res = await agent.processMessage('help me', 'relay-help1');
      expect(res.response).toContain('Chat Relay');
    });

    test('should mention relay examples in help', async () => {
      const res = await agent.processMessage('what can you do', 'relay-help2');
      expect(res.response).toContain('Chat with agent');
    });
  });
});
