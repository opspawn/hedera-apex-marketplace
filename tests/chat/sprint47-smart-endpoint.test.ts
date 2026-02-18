/**
 * Sprint 47 — Smart Chat Endpoint tests.
 *
 * Tests the /api/chat/smart endpoint which combines ChatAgent
 * tool-calling with smart fallback + live data enrichment.
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

describe('Sprint 47: /api/chat/smart endpoint (no ChatAgent)', () => {
  let server: http.Server;

  beforeAll((done) => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const app = express();
    app.use(express.json());
    app.use(createChatRouter({
      getAgentCount: () => 24,
      getAgentList: () => [
        { name: 'SentinelAI', agent_id: 'sentinel-001', description: 'Security monitoring agent', trust_score: 92 },
        { name: 'DataForge', agent_id: 'dataforge-001', description: 'Data analysis specialist', trust_score: 85 },
        { name: 'CodeReview Bot', agent_id: 'codereview-001', description: 'Automated code reviewer', trust_score: 78 },
      ],
    }));
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('POST /api/chat/smart returns 200 for valid message', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for empty message', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns 400 for missing message', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {});
    expect(res.status).toBe(400);
  });

  it('returns sessionId', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello',
    });
    expect(res.body.sessionId).toBeTruthy();
  });

  it('returns userMessage and agentMessage', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What is this marketplace?',
    });
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.agentMessage).toBeDefined();
    expect(res.body.userMessage.role).toBe('user');
    expect(res.body.agentMessage.role).toBe('agent');
  });

  it('returns source as smart_fallback when no ChatAgent', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello there',
    });
    expect(res.body.source).toBe('smart_fallback');
  });

  it('returns intent field', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What standards do you support?',
    });
    expect(res.body.intent).toBe('standards');
  });

  it('returns fallback flag', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello',
    });
    expect(res.body.fallback).toBe(true);
  });

  it('enriches list_agents with live agent data', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    expect(res.body.agentMessage.content).toContain('SentinelAI');
    expect(res.body.agentMessage.content).toContain('DataForge');
    expect(res.body.agentMessage.content).toContain('CodeReview Bot');
  });

  it('enriches about_marketplace with live agent count', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What is this marketplace?',
    });
    expect(res.body.agentMessage.content).toContain('24 registered agents');
  });

  it('enriches list_agents with trust scores', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'List all agents',
    });
    expect(res.body.agentMessage.content).toContain('Trust: 92');
    expect(res.body.agentMessage.content).toContain('Trust: 85');
  });

  it('maintains session state across messages', async () => {
    const res1 = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello',
    });
    const sid = res1.body.sessionId;

    const res2 = await request(server, 'POST', '/api/chat/smart', {
      sessionId: sid,
      message: 'What agents are available?',
    });
    expect(res2.body.sessionId).toBe(sid);
  });

  it('handles trust score queries', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Show me trust scores',
    });
    expect(res.body.intent).toBe('trust_scores');
    expect(res.body.agentMessage.content).toContain('Trust Scores');
  });

  it('handles hiring guide queries', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'How do I hire an agent?',
    });
    expect(res.body.intent).toBe('hire_guide');
    expect(res.body.agentMessage.content).toContain('Step 1');
  });

  it('handles standards queries', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What HCS standards do you implement?',
    });
    expect(res.body.intent).toBe('standards');
    expect(res.body.agentMessage.content).toContain('HCS-10');
    expect(res.body.agentMessage.content).toContain('HCS-26');
  });

  it('handles reachability queries', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Check protocol reachability',
    });
    expect(res.body.intent).toBe('reachability');
    expect(res.body.agentMessage.content).toContain('HCS-10');
    expect(res.body.agentMessage.content).toContain('A2A');
  });

  it('handles registration guide queries', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'How do I register an agent?',
    });
    expect(res.body.intent).toBe('register_guide');
    expect(res.body.agentMessage.content).toContain('/api/marketplace/register');
  });

  it('handles general queries with helpful suggestions', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What can you do?',
    });
    expect(res.body.agentMessage.content).toContain('Try asking');
  });

  it('timestamps are valid ISO strings', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello',
    });
    const ts = new Date(res.body.agentMessage.timestamp).getTime();
    expect(ts).toBeGreaterThan(0);
  });

  it('user message content matches input', async () => {
    const msg = 'Tell me about the Hedera marketplace';
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: msg,
    });
    expect(res.body.userMessage.content).toBe(msg);
  });

  it('agent messages have unique IDs', async () => {
    const res1 = await request(server, 'POST', '/api/chat/smart', {
      message: 'Hello',
    });
    const res2 = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    expect(res1.body.agentMessage.id).not.toBe(res2.body.agentMessage.id);
  });
});

describe('Sprint 47: /api/chat/smart without live data', () => {
  let server: http.Server;

  beforeAll((done) => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const app = express();
    app.use(express.json());
    app.use(createChatRouter()); // No getAgentList/getAgentCount
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('still works without live data providers', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toBeTruthy();
  });

  it('does not crash on about_marketplace without getAgentCount', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What is this marketplace?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage.content).toContain('Hedera Agent Marketplace');
  });

  it('does not crash on list_agents without getAgentList', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Show me available agents',
    });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('list_agents');
  });
});
