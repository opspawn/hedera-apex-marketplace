/**
 * Sprint 47 — Chat quality hardening tests.
 *
 * Verifies the /api/chat/message endpoint uses the smart fallback
 * when no LLM API key is configured, instead of showing an error.
 */

import express from 'express';
import http from 'http';
import { createChatRouter } from '../../src/chat/chat-server';

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

describe('Sprint 47: Chat Quality with Smart Fallback', () => {
  let server: http.Server;

  beforeAll((done) => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const app = express();
    app.use(express.json());
    app.use(createChatRouter());
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('POST /api/chat/message returns smart fallback (not error) when no API key', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'What agents are available?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage).toBeDefined();
    expect(res.body.agentMessage.content).not.toContain('API key not configured');
    expect(res.body.agentMessage.content).toContain('/api/agents');
  });

  it('returns fallback flag', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'Hello',
    });
    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
  });

  it('returns intent field', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'What standards do you support?',
    });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('standards');
  });

  it('answers "What is this marketplace?" with useful info', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'What is this marketplace?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('Hedera Agent Marketplace');
    expect(res.body.agentMessage.content).toContain('Agent Registration');
  });

  it('answers "How do I hire an agent?" with step-by-step', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'How do I hire an agent?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('Step 1');
    expect(res.body.agentMessage.content).toContain('/api/marketplace/hire');
  });

  it('answers "Show me trust scores" with trust level info', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'Show me trust scores',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('Trust Scores');
    expect(res.body.agentMessage.content).toContain('Elite');
  });

  it('answers "What standards do you support?" with all 10 HCS standards', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'What standards do you support?',
    });
    expect(res.status).toBe(200);
    const content = res.body.agentMessage.content;
    expect(content).toContain('HCS-1');
    expect(content).toContain('HCS-10');
    expect(content).toContain('HCS-26');
    expect(content).toContain('10 HCS standards');
  });

  it('answers random question with helpful general response', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'tell me something interesting',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('Hedera Agent Marketplace');
    expect(res.body.agentMessage.content).toContain('Try asking');
  });

  it('maintains session across fallback messages', async () => {
    // First message
    const res1 = await request(server, 'POST', '/api/chat/message', {
      message: 'Hello',
    });
    expect(res1.status).toBe(200);
    const sessionId = res1.body.sessionId;
    expect(sessionId).toBeTruthy();

    // Second message with same session
    const res2 = await request(server, 'POST', '/api/chat/message', {
      sessionId,
      message: 'What agents are available?',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.sessionId).toBe(sessionId);
  });

  it('creates session and tracks history with fallback messages', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'What is this marketplace?',
    });
    const sessionId = res.body.sessionId;

    const historyRes = await request(server, 'GET', `/api/chat/history/${sessionId}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.messages.length).toBeGreaterThanOrEqual(2);

    // First message should be user, second should be agent fallback
    const messages = historyRes.body.messages;
    const lastTwo = messages.slice(-2);
    expect(lastTwo[0].role).toBe('user');
    expect(lastTwo[1].role).toBe('agent');
    expect(lastTwo[1].content).toContain('Hedera Agent Marketplace');
  });

  it('fallback response does not contain error field', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'Help me find agents',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.error).toBeUndefined();
  });

  it('answers registration query with API endpoint', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'How do I register an agent?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('/api/marketplace/register');
    expect(res.body.agentMessage.content).toContain('KMS');
  });

  it('answers reachability query', async () => {
    const res = await request(server, 'POST', '/api/chat/message', {
      message: 'Check protocol connectivity',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('HCS-10');
    expect(res.body.agentMessage.content).toContain('A2A');
    expect(res.body.agentMessage.content).toContain('MCP');
  });
});

describe('Sprint 47: Chat UI and Status', () => {
  let server: http.Server;

  beforeAll((done) => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const app = express();
    app.use(express.json());
    app.use(createChatRouter());
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /chat returns HTML with updated suggestions', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.status).toBe(200);
    expect(res.text).toContain('What agents are available?');
    expect(res.text).toContain('What is this marketplace?');
    expect(res.text).toContain('How do I hire an agent?');
    expect(res.text).toContain('What standards do you support?');
  });

  it('GET /chat includes typing indicator with dynamic labels', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.status).toBe(200);
    expect(res.text).toContain('typing-label');
    expect(res.text).toContain('Thinking...');
    expect(res.text).toContain('Processing your request...');
    expect(res.text).toContain('Querying marketplace...');
  });

  it('GET /chat includes typing indicator cleanup on remove', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('clearInterval');
  });

  it('GET /api/chat/status returns chatAgentReady false without config', async () => {
    const res = await request(server, 'GET', '/api/chat/status');
    expect(res.status).toBe(200);
    // Without chatAgentConfig, chatAgentReady is false
    expect(res.body.chatAgentReady).toBe(false);
  });

  it('GET /api/chat/status reports configured false without API key', async () => {
    const res = await request(server, 'GET', '/api/chat/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });
});
