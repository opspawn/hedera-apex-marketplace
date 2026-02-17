/**
 * Tests for Agent Connection Flow API endpoints.
 *
 * Sprint 20: Tests for /api/agents/:id/connect, /api/agents/:id/disconnect,
 * /api/connections, and chat relay routes.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

// Lightweight request helper
async function request(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Agent Connection Flow API', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // ----- GET /api/connections -----

  describe('GET /api/connections', () => {
    test('should return empty connections list', async () => {
      const res = await request(app, 'GET', '/api/connections');
      expect(res.status).toBe(200);
      expect(res.body.connections).toBeDefined();
      expect(res.body.active).toBe(0);
      expect(res.body.pending).toBe(0);
    });

    test('should return connection counts', async () => {
      const res = await request(app, 'GET', '/api/connections');
      expect(res.body).toHaveProperty('active');
      expect(res.body).toHaveProperty('closed');
      expect(res.body).toHaveProperty('pending');
      expect(res.body).toHaveProperty('total_messages');
    });

    test('should include pending_requests array', async () => {
      const res = await request(app, 'GET', '/api/connections');
      expect(res.body.pending_requests).toBeDefined();
      expect(Array.isArray(res.body.pending_requests)).toBe(true);
    });

    test('should include running status', async () => {
      const res = await request(app, 'GET', '/api/connections');
      expect(typeof res.body.running).toBe('boolean');
    });
  });

  // ----- POST /api/agents/:id/connect -----

  describe('POST /api/agents/:id/connect', () => {
    test('should return 404 for non-existent agent', async () => {
      const res = await request(app, 'POST', '/api/agents/nonexistent/connect');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    test('should return 202 when no pending request from target', async () => {
      // First register an agent
      await request(app, 'POST', '/api/agents/register', {
        name: 'Test Agent',
        description: 'A test',
        skills: [{ id: 's1', name: 'Skill', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
        endpoint: 'https://test.example.com',
        protocols: ['hcs-10'],
        payment_address: '0.0.999',
      });
      // Try to connect
      const agents = await request(app, 'GET', '/api/agents');
      const agentId = agents.body.agents[0].agent_id;
      const res = await request(app, 'POST', `/api/agents/${agentId}/connect`);
      expect(res.status).toBe(202);
      expect(res.body.connected).toBe(false);
      expect(res.body.message).toContain('queued');
    });

    test('should return agent info in connection response', async () => {
      await request(app, 'POST', '/api/agents/register', {
        name: 'Connect Agent',
        description: 'Connection test',
        skills: [{ id: 's1', name: 'Skill', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
        endpoint: 'https://test.example.com',
        protocols: ['hcs-10'],
        payment_address: '0.0.888',
      });
      const agents = await request(app, 'GET', '/api/agents');
      const agentId = agents.body.agents[0].agent_id;
      const res = await request(app, 'POST', `/api/agents/${agentId}/connect`);
      expect(res.body.agent).toBeDefined();
      expect(res.body.agent.name).toBe('Connect Agent');
    });

    test('should include instructions in 202 response', async () => {
      await request(app, 'POST', '/api/agents/register', {
        name: 'Instruction Agent',
        description: 'Test',
        skills: [{ id: 's1', name: 'Skill', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
        endpoint: 'https://test.example.com',
        protocols: ['hcs-10'],
        payment_address: '0.0.777',
      });
      const agents = await request(app, 'GET', '/api/agents');
      const agentId = agents.body.agents[0].agent_id;
      const res = await request(app, 'POST', `/api/agents/${agentId}/connect`);
      expect(res.body.instructions).toBeDefined();
      expect(res.body.instructions).toContain('HCS-10');
    });
  });

  // ----- POST /api/agents/:id/disconnect -----

  describe('POST /api/agents/:id/disconnect', () => {
    test('should return 404 when no connection exists', async () => {
      const res = await request(app, 'POST', '/api/agents/0.0.99999/disconnect');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
      expect(res.body.message).toContain('No active connection');
    });
  });

  // ----- Chat Relay Routes -----

  describe('POST /api/chat/relay/session', () => {
    test('should create a relay session', async () => {
      const res = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.agentId).toBe('agent-001');
      expect(res.body.status).toBe('active');
    });

    test('should require agentId', async () => {
      const res = await request(app, 'POST', '/api/chat/relay/session', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    test('should return messageCount of 0 for new session', async () => {
      const res = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-002' });
      expect(res.body.messageCount).toBe(0);
    });
  });

  describe('POST /api/chat/relay/:sessionId/message', () => {
    test('should send a relay message', async () => {
      const sessionRes = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      const sessionId = sessionRes.body.sessionId;
      const res = await request(app, 'POST', `/api/chat/relay/${sessionId}/message`, { content: 'Hello agent' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.content).toBe('Hello agent');
    });

    test('should require content', async () => {
      const sessionRes = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      const sessionId = sessionRes.body.sessionId;
      const res = await request(app, 'POST', `/api/chat/relay/${sessionId}/message`, {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    test('should return 404 for unknown session', async () => {
      const res = await request(app, 'POST', '/api/chat/relay/fake-session/message', { content: 'hello' });
      expect(res.status).toBe(404);
    });

    test('should include agent response', async () => {
      const sessionRes = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-003' });
      const sessionId = sessionRes.body.sessionId;
      const res = await request(app, 'POST', `/api/chat/relay/${sessionId}/message`, { content: 'Test' });
      expect(res.body.agentResponse).toBeDefined();
      expect(res.body.agentResponse.role).toBe('agent');
    });
  });

  describe('GET /api/chat/relay/:sessionId/history', () => {
    test('should return session history', async () => {
      const sessionRes = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      const sessionId = sessionRes.body.sessionId;
      // Send a message first
      await request(app, 'POST', `/api/chat/relay/${sessionId}/message`, { content: 'Hi' });
      const res = await request(app, 'GET', `/api/chat/relay/${sessionId}/history`);
      expect(res.status).toBe(200);
      expect(res.body.session).toBeDefined();
      expect(res.body.messages).toBeDefined();
      expect(res.body.messages.length).toBeGreaterThan(0);
    });

    test('should return 404 for unknown session', async () => {
      const res = await request(app, 'GET', '/api/chat/relay/fake-session/history');
      expect(res.status).toBe(404);
    });

    test('should return empty messages for new session', async () => {
      const sessionRes = await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      const sessionId = sessionRes.body.sessionId;
      const res = await request(app, 'GET', `/api/chat/relay/${sessionId}/history`);
      expect(res.body.messages).toEqual([]);
    });
  });

  describe('GET /api/chat/relay/sessions', () => {
    test('should return empty sessions initially', async () => {
      const res = await request(app, 'GET', '/api/chat/relay/sessions');
      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });

    test('should return created sessions', async () => {
      await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-001' });
      await request(app, 'POST', '/api/chat/relay/session', { agentId: 'agent-002' });
      const res = await request(app, 'GET', '/api/chat/relay/sessions');
      expect(res.body.sessions).toHaveLength(2);
    });
  });

  // ----- Version/Health check updated -----

  describe('version update', () => {
    test('should report version 0.20.0', async () => {
      const res = await request(app, 'GET', '/api/health');
      expect(res.body.version).toBe('0.28.0');
    });

    test('should report updated test count', async () => {
      const res = await request(app, 'GET', '/api/health');
      expect(res.body.test_count).toBeGreaterThanOrEqual(1400);
    });
  });

  // ----- Agent card updated -----

  describe('agent card update', () => {
    test('should include chat-relay capability', async () => {
      const res = await request(app, 'GET', '/.well-known/agent-card.json');
      expect(res.body.capabilities).toContain('chat-relay');
    });

    test('should include agent-connections capability', async () => {
      const res = await request(app, 'GET', '/.well-known/agent-card.json');
      expect(res.body.capabilities).toContain('agent-connections');
    });
  });
});
