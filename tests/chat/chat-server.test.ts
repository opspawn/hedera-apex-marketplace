/**
 * Tests for chat server routes and session management.
 *
 * Mocks ConversationalAgent to avoid needing real API keys or Hedera creds.
 */

import express from 'express';
import http from 'http';
import { createChatRouter } from '../../src/chat/chat-server';

// --------------------------------------------------------------------------
// Helpers — lightweight request function (no supertest dependency)
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('Chat Server Routes', () => {
  let app: express.Application;
  let server: http.Server;

  beforeAll((done) => {
    // Ensure no API keys are set so we test the "not configured" path
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

  // --- POST /api/chat/session ---
  describe('POST /api/chat/session', () => {
    test('should create a new session with an id', async () => {
      const res = await request(server, 'POST', '/api/chat/session');
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
      expect(typeof res.body.sessionId).toBe('string');
      expect(res.body.createdAt).toBeDefined();
    });

    test('should create unique sessions', async () => {
      const res1 = await request(server, 'POST', '/api/chat/session');
      const res2 = await request(server, 'POST', '/api/chat/session');
      expect(res1.body.sessionId).not.toBe(res2.body.sessionId);
    });
  });

  // --- GET /api/chat/history/:sessionId ---
  describe('GET /api/chat/history/:sessionId', () => {
    test('should return 404 for non-existent session', async () => {
      const res = await request(server, 'GET', '/api/chat/history/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    test('should return empty messages for a new session', async () => {
      const sessionRes = await request(server, 'POST', '/api/chat/session');
      const sessionId = sessionRes.body.sessionId;

      const res = await request(server, 'GET', `/api/chat/history/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.messages).toEqual([]);
    });
  });

  // --- POST /api/chat/message ---
  describe('POST /api/chat/message', () => {
    test('should reject empty message', async () => {
      const sessionRes = await request(server, 'POST', '/api/chat/session');
      const res = await request(server, 'POST', '/api/chat/message', {
        sessionId: sessionRes.body.sessionId,
        message: '',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Message is required');
    });

    test('should reject missing message', async () => {
      const res = await request(server, 'POST', '/api/chat/message', {
        sessionId: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Message is required');
    });

    test('should return API key not configured message when no key set', async () => {
      const sessionRes = await request(server, 'POST', '/api/chat/session');
      const sessionId = sessionRes.body.sessionId;

      const res = await request(server, 'POST', '/api/chat/message', {
        sessionId,
        message: 'Hello, agent!',
      });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.userMessage.role).toBe('user');
      expect(res.body.userMessage.content).toBe('Hello, agent!');
      expect(res.body.agentMessage.role).toBe('agent');
      expect(res.body.agentMessage.content).toContain('API key not configured');
    });

    test('should create session if sessionId is not provided', async () => {
      const res = await request(server, 'POST', '/api/chat/message', {
        message: 'Test without session',
      });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
    });

    test('should store messages in session history', async () => {
      const sessionRes = await request(server, 'POST', '/api/chat/session');
      const sessionId = sessionRes.body.sessionId;

      // Send a message
      await request(server, 'POST', '/api/chat/message', {
        sessionId,
        message: 'First message',
      });

      // Check history
      const historyRes = await request(server, 'GET', `/api/chat/history/${sessionId}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.messages).toHaveLength(2); // user + agent response
      expect(historyRes.body.messages[0].role).toBe('user');
      expect(historyRes.body.messages[0].content).toBe('First message');
      expect(historyRes.body.messages[1].role).toBe('agent');
    });
  });

  // --- GET /api/chat/status ---
  describe('GET /api/chat/status', () => {
    test('should report not configured when no API key set', async () => {
      const res = await request(server, 'GET', '/api/chat/status');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.provider).toBeNull();
      expect(res.body.agentReady).toBe(false);
    });
  });

  // --- GET /chat ---
  describe('GET /chat', () => {
    test('should return HTML chat page', async () => {
      const res = await request(server, 'GET', '/chat');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('Hedera Agent');
      expect(res.text).toContain('Chat');
      expect(res.text).toContain('chatContainer');
    });
  });
});
