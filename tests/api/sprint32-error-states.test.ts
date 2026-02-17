/**
 * Sprint 32: Error States & Edge Cases Tests
 *
 * Tests for:
 * - Friendly empty states (no agents, no chat history)
 * - Loading skeletons
 * - Error boundaries with retry
 * - Edge cases in API endpoints
 */

import express from 'express';
import http from 'http';
import { createChatRouter } from '../../src/chat/chat-server';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';

function request(server: http.Server, method: string, path: string, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = null; }
        resolve({ status: res.statusCode ?? 0, body: parsed, text: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Sprint 32: Error States & Edge Cases', () => {
  let app: express.Application;
  let server: http.Server;

  beforeAll((done) => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    app = express();
    app.use(express.json());
    app.use(createChatRouter());
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  // ===== Chat API Error Handling =====

  describe('chat API error handling', () => {
    test('should reject empty message', async () => {
      const res = await request(server, 'POST', '/api/chat/message', { message: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    test('should reject null message', async () => {
      const res = await request(server, 'POST', '/api/chat/message', { message: null });
      expect(res.status).toBe(400);
    });

    test('should reject whitespace-only message', async () => {
      const res = await request(server, 'POST', '/api/chat/message', { message: '   ' });
      expect(res.status).toBe(400);
    });

    test('should reject message exceeding 10000 chars', async () => {
      const longMsg = 'a'.repeat(10001);
      const res = await request(server, 'POST', '/api/chat/message', { message: longMsg });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('too long');
    });

    test('should handle missing session for history', async () => {
      const res = await request(server, 'GET', '/api/chat/history/nonexistent-session-12345');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    test('should gracefully handle no API key for message endpoint', async () => {
      const res = await request(server, 'POST', '/api/chat/message', { message: 'Hello' });
      // Should return 200 with a helpful message about missing API key
      expect(res.status).toBe(200);
      expect(res.body.agentMessage.content).toContain('API key not configured');
    });
  });

  // ===== Chat Agent Endpoint Errors =====

  describe('chat agent endpoint errors', () => {
    test('should reject empty message on agent endpoint', async () => {
      const res = await request(server, 'POST', '/api/chat/agent', { message: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Message is required');
    });

    test('should reject missing message on agent endpoint', async () => {
      const res = await request(server, 'POST', '/api/chat/agent', {});
      expect(res.status).toBe(400);
    });

    test('should handle agent not configured', async () => {
      // Without chatAgentConfig, agent endpoint returns 503
      const res = await request(server, 'POST', '/api/chat/agent', { message: 'Hello' });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });
  });

  // ===== Chat Status Endpoint =====

  describe('chat status', () => {
    test('should return status without API key', async () => {
      const res = await request(server, 'GET', '/api/chat/status');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });

    test('should include chatAgentReady field', async () => {
      const res = await request(server, 'GET', '/api/chat/status');
      expect(res.body).toHaveProperty('chatAgentReady');
    });

    test('should include hederaConfigured field', async () => {
      const res = await request(server, 'GET', '/api/chat/status');
      expect(res.body).toHaveProperty('hederaConfigured');
    });
  });

  // ===== Chat UI =====

  describe('chat UI', () => {
    test('should serve chat page', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Hedera Agent Chat');
    });

    test('should include suggested prompts in HTML', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('Find me an AI agent for data analysis');
      expect(res.text).toContain('Register a new agent');
      expect(res.text).toContain('Show trust scores');
    });

    test('should include agent card CSS styles', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('chat-agent-card');
      expect(res.text).toContain('chat-agent-card-name');
      expect(res.text).toContain('chat-agent-card-score');
    });

    test('should include empty state CSS', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('chat-empty');
    });

    test('should include typing indicator', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('typing-indicator');
      expect(res.text).toContain('typing-dots');
    });

    test('should include error badge styling', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('error-badge');
    });

    test('should include tool call display', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.text).toContain('tool-call');
      expect(res.text).toContain('tool-call-header');
    });
  });

  // ===== Session Management =====

  describe('session management', () => {
    test('should create unique sessions', async () => {
      const res1 = await request(server, 'POST', '/api/chat/session');
      const res2 = await request(server, 'POST', '/api/chat/session');
      expect(res1.body.sessionId).not.toBe(res2.body.sessionId);
    });

    test('should retrieve history for valid session', async () => {
      const createRes = await request(server, 'POST', '/api/chat/session');
      const sessionId = createRes.body.sessionId;
      const historyRes = await request(server, 'GET', `/api/chat/history/${sessionId}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.messages).toEqual([]);
    });

    test('should accumulate messages in session', async () => {
      const createRes = await request(server, 'POST', '/api/chat/session');
      const sessionId = createRes.body.sessionId;

      // Send a message (will get "API key not configured" response)
      await request(server, 'POST', '/api/chat/message', { sessionId, message: 'Hello' });

      const historyRes = await request(server, 'GET', `/api/chat/history/${sessionId}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.messages.length).toBe(2); // user + agent
    });
  });

  // ===== Agent Tools Endpoint =====

  describe('agent tools', () => {
    test('should return tools list (unconfigured)', async () => {
      const res = await request(server, 'GET', '/api/chat/agent/tools');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.tools).toEqual([]);
    });

    test('should return 503 for agent history when not configured', async () => {
      const res = await request(server, 'GET', '/api/chat/agent/history/test-session');
      expect(res.status).toBe(503);
    });
  });
});
