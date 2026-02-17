/**
 * Tests for Registry Broker Chat Relay — session management and message relay.
 *
 * Sprint 20: Chat relay integration for agent-to-agent communication
 * via the HOL Registry Broker infrastructure.
 */

import { RegistryBroker, ChatRelaySession, ChatRelayMessage } from '../../src/hol/registry-broker';

// Create a broker instance with test config (will use local fallbacks since no real broker)
function createTestBroker(): RegistryBroker {
  return new RegistryBroker({
    accountId: '0.0.7854018',
    privateKey: 'test-key',
    network: 'testnet',
    brokerBaseUrl: 'https://test-broker.example.com',
  });
}

describe('RegistryBroker Chat Relay', () => {
  let broker: RegistryBroker;

  beforeEach(() => {
    broker = createTestBroker();
  });

  // ----- Session creation -----

  describe('createSession', () => {
    test('should create a session with valid agentId', async () => {
      const session = await broker.createSession('agent-001');
      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.agentId).toBe('agent-001');
      expect(session.status).toBe('active');
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeDefined();
      expect(session.lastMessageAt).toBeDefined();
    });

    test('should create unique session IDs', async () => {
      const s1 = await broker.createSession('agent-001');
      const s2 = await broker.createSession('agent-002');
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });

    test('should create multiple sessions for same agent', async () => {
      const s1 = await broker.createSession('agent-001');
      const s2 = await broker.createSession('agent-001');
      expect(s1.sessionId).not.toBe(s2.sessionId);
      expect(s1.agentId).toBe(s2.agentId);
    });

    test('session should have relay- prefix', async () => {
      const session = await broker.createSession('agent-003');
      expect(session.sessionId).toMatch(/^relay-/);
    });

    test('session should start with zero messages', async () => {
      const session = await broker.createSession('agent-004');
      expect(session.messageCount).toBe(0);
    });
  });

  // ----- Send relay message -----

  describe('sendRelayMessage', () => {
    test('should send a message and get response', async () => {
      const session = await broker.createSession('agent-001');
      const response = await broker.sendRelayMessage(session.sessionId, 'Hello agent');
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message.role).toBe('user');
      expect(response.message.content).toBe('Hello agent');
      expect(response.message.sessionId).toBe(session.sessionId);
    });

    test('should include agent response', async () => {
      const session = await broker.createSession('agent-001');
      const response = await broker.sendRelayMessage(session.sessionId, 'Hello');
      expect(response.agentResponse).toBeDefined();
      expect(response.agentResponse!.role).toBe('agent');
      expect(response.agentResponse!.content).toContain('agent-001');
    });

    test('should increment message count', async () => {
      const session = await broker.createSession('agent-001');
      await broker.sendRelayMessage(session.sessionId, 'Message 1');
      const updated = broker.getRelaySession(session.sessionId);
      expect(updated!.messageCount).toBe(2); // user + agent
    });

    test('should update lastMessageAt', async () => {
      const session = await broker.createSession('agent-001');
      const before = session.lastMessageAt;
      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 5));
      await broker.sendRelayMessage(session.sessionId, 'Hello');
      const updated = broker.getRelaySession(session.sessionId);
      expect(new Date(updated!.lastMessageAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    test('should throw for non-existent session', async () => {
      await expect(broker.sendRelayMessage('fake-session', 'hello')).rejects.toThrow('not found');
    });

    test('should throw for closed session', async () => {
      const session = await broker.createSession('agent-001');
      broker.closeRelaySession(session.sessionId);
      await expect(broker.sendRelayMessage(session.sessionId, 'hello')).rejects.toThrow('closed');
    });

    test('should accumulate messages in history', async () => {
      const session = await broker.createSession('agent-001');
      await broker.sendRelayMessage(session.sessionId, 'Msg 1');
      await broker.sendRelayMessage(session.sessionId, 'Msg 2');
      const history = broker.getRelayHistory(session.sessionId);
      expect(history).toHaveLength(4); // 2 user + 2 agent
    });

    test('message IDs should be unique', async () => {
      const session = await broker.createSession('agent-001');
      const r1 = await broker.sendRelayMessage(session.sessionId, 'A');
      const r2 = await broker.sendRelayMessage(session.sessionId, 'B');
      expect(r1.message.id).not.toBe(r2.message.id);
    });
  });

  // ----- Get relay history -----

  describe('getRelayHistory', () => {
    test('should return empty array for new session', async () => {
      const session = await broker.createSession('agent-001');
      const history = broker.getRelayHistory(session.sessionId);
      expect(history).toEqual([]);
    });

    test('should return messages after sending', async () => {
      const session = await broker.createSession('agent-001');
      await broker.sendRelayMessage(session.sessionId, 'Test message');
      const history = broker.getRelayHistory(session.sessionId);
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Test message');
      expect(history[1].role).toBe('agent');
    });

    test('should return empty array for unknown session', () => {
      const history = broker.getRelayHistory('nonexistent');
      expect(history).toEqual([]);
    });

    test('should preserve message order', async () => {
      const session = await broker.createSession('agent-001');
      await broker.sendRelayMessage(session.sessionId, 'First');
      await broker.sendRelayMessage(session.sessionId, 'Second');
      const history = broker.getRelayHistory(session.sessionId);
      expect(history[0].content).toBe('First');
      expect(history[2].content).toBe('Second');
    });
  });

  // ----- Get relay session -----

  describe('getRelaySession', () => {
    test('should return session by ID', async () => {
      const session = await broker.createSession('agent-001');
      const found = broker.getRelaySession(session.sessionId);
      expect(found).toBeDefined();
      expect(found!.agentId).toBe('agent-001');
    });

    test('should return undefined for unknown session', () => {
      const found = broker.getRelaySession('nonexistent');
      expect(found).toBeUndefined();
    });

    test('should reflect status changes', async () => {
      const session = await broker.createSession('agent-001');
      expect(broker.getRelaySession(session.sessionId)!.status).toBe('active');
      broker.closeRelaySession(session.sessionId);
      expect(broker.getRelaySession(session.sessionId)!.status).toBe('closed');
    });
  });

  // ----- Get active relay sessions -----

  describe('getActiveRelaySessions', () => {
    test('should return empty array initially', () => {
      const sessions = broker.getActiveRelaySessions();
      expect(sessions).toEqual([]);
    });

    test('should return active sessions', async () => {
      await broker.createSession('agent-001');
      await broker.createSession('agent-002');
      const sessions = broker.getActiveRelaySessions();
      expect(sessions).toHaveLength(2);
    });

    test('should exclude closed sessions', async () => {
      const s1 = await broker.createSession('agent-001');
      await broker.createSession('agent-002');
      broker.closeRelaySession(s1.sessionId);
      const sessions = broker.getActiveRelaySessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].agentId).toBe('agent-002');
    });
  });

  // ----- Close relay session -----

  describe('closeRelaySession', () => {
    test('should close an active session', async () => {
      const session = await broker.createSession('agent-001');
      broker.closeRelaySession(session.sessionId);
      const found = broker.getRelaySession(session.sessionId);
      expect(found!.status).toBe('closed');
    });

    test('should be a no-op for unknown session', () => {
      // Should not throw
      broker.closeRelaySession('nonexistent');
    });

    test('should prevent further messages', async () => {
      const session = await broker.createSession('agent-001');
      broker.closeRelaySession(session.sessionId);
      await expect(broker.sendRelayMessage(session.sessionId, 'test')).rejects.toThrow();
    });
  });
});
