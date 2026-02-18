/**
 * Sprint 47 — Enhanced Chat UI tests.
 *
 * Tests that the chat HTML includes all Sprint 47 enhancements:
 * - Smart endpoint usage
 * - Typing indicators with status rotation
 * - Suggestion chips matching fallback intents
 * - Markdown rendering support
 * - Agent card display support
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

describe('Sprint 47: Chat HTML Enhanced Features', () => {
  let server: http.Server;

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use(createChatRouter());
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('uses /api/chat/smart endpoint', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('/api/chat/smart');
  });

  it('has typing indicator with 3 animated dots', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('typing-dots');
    expect(res.text).toContain('<span></span><span></span><span></span>');
  });

  it('has rotating typing labels', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('Thinking...');
    expect(res.text).toContain('Processing your request...');
    expect(res.text).toContain('Querying marketplace...');
    expect(res.text).toContain('Almost ready...');
  });

  it('cleans up typing interval on remove', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('clearInterval');
    expect(res.text).toContain('data-interval');
  });

  it('has suggestion chips (6 inline + 6 in JS rebuild template)', async () => {
    const res = await request(server, 'GET', '/chat');
    const matches = res.text.match(/class="suggestion"/g);
    // 6 in the initial HTML + 6 in the getWelcomeHTML JS function
    expect(matches!.length).toBeGreaterThanOrEqual(6);
  });

  it('suggestion chips cover key intents', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('What agents are available?');
    expect(res.text).toContain('What is this marketplace?');
    expect(res.text).toContain('How do I hire an agent?');
    expect(res.text).toContain('Show me trust scores');
    expect(res.text).toContain('What standards do you support?');
    expect(res.text).toContain('Check protocol reachability');
  });

  it('has suggestion labels for each category', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('Discover');
    expect(res.text).toContain('About');
    expect(res.text).toContain('Guide');
    expect(res.text).toContain('Trust');
    expect(res.text).toContain('Standards');
    expect(res.text).toContain('Status');
  });

  it('has formatContent function for markdown', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('formatContent');
  });

  it('formatContent handles code blocks', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('CODEBLOCK_');
    expect(res.text).toContain('<pre><code>');
  });

  it('formatContent handles inline code', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('INLINE_');
  });

  it('formatContent handles bold text', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('<strong>');
  });

  it('formatContent handles bullet lists', async () => {
    const res = await request(server, 'GET', '/chat');
    // Check bullet list rendering
    expect(res.text).toContain('margin-left:1rem');
  });

  it('has agent card display CSS', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('chat-agent-card');
    expect(res.text).toContain('chat-agent-card-name');
    expect(res.text).toContain('chat-agent-card-bio');
    expect(res.text).toContain('chat-agent-card-tags');
    expect(res.text).toContain('chat-agent-card-score');
  });

  it('has new session button', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('new-session-btn');
    expect(res.text).toContain('newSession()');
  });

  it('has auto-resize textarea', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('autoResize');
    expect(res.text).toContain('scrollHeight');
  });

  it('has keyboard shortcut (Enter to send)', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('handleKeyDown');
    expect(res.text).toContain("event.key === 'Enter'");
  });

  it('has header with marketplace link', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('Hedera Agent');
    expect(res.text).toContain('Marketplace');
    expect(res.text).toContain('href="/"');
  });

  it('has status bar with connection status', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('status-bar');
    expect(res.text).toContain('statusDot');
    expect(res.text).toContain('statusText');
  });

  it('has send button with disabled state', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('send-btn');
    expect(res.text).toContain('updateSendBtn');
    expect(res.text).toContain('btn.disabled');
  });

  it('has welcome screen with icon', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('welcome-icon');
    expect(res.text).toContain('Hedera Agent Marketplace Chat');
  });

  it('has responsive CSS media queries', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('@media (max-width: 768px)');
    expect(res.text).toContain('@media (max-width: 480px)');
  });

  it('has error badge CSS', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('error-badge');
  });

  it('has pulse animation for typing dots', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('@keyframes pulse');
  });

  it('has fadeInUp animation for messages', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('@keyframes fadeInUp');
  });

  it('has scrollbar styling', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('webkit-scrollbar');
  });

  it('has input hint text', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('Press Enter to send');
    expect(res.text).toContain('Shift+Enter for new line');
  });

  it('handles tool calls display', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('tool-call');
    expect(res.text).toContain('tool-call-header');
    expect(res.text).toContain('tool-call-output');
  });

  it('has glowPulse animation for status dot', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.text).toContain('@keyframes glowPulse');
  });
});

describe('Sprint 47: Chat Session Management', () => {
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

  it('POST /api/chat/session creates new session', async () => {
    const res = await request(server, 'POST', '/api/chat/session');
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
  });

  it('GET /api/chat/history/:id returns 404 for unknown session', async () => {
    const res = await request(server, 'GET', '/api/chat/history/nonexistent-session');
    expect(res.status).toBe(404);
  });

  it('session history builds up correctly', async () => {
    const sessionRes = await request(server, 'POST', '/api/chat/session');
    const sid = sessionRes.body.sessionId;

    await request(server, 'POST', '/api/chat/message', { sessionId: sid, message: 'Hello' });
    await request(server, 'POST', '/api/chat/message', { sessionId: sid, message: 'What agents are available?' });

    const historyRes = await request(server, 'GET', `/api/chat/history/${sid}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 agent
  });

  it('different sessions have separate histories', async () => {
    const res1 = await request(server, 'POST', '/api/chat/message', { message: 'Session A message' });
    const sid1 = res1.body.sessionId;

    const res2 = await request(server, 'POST', '/api/chat/message', { message: 'Session B message' });
    const sid2 = res2.body.sessionId;

    expect(sid1).not.toBe(sid2);
  });

  it('POST /api/chat/message rejects empty string', async () => {
    const res = await request(server, 'POST', '/api/chat/message', { message: '   ' });
    expect(res.status).toBe(400);
  });

  it('POST /api/chat/message rejects missing message field', async () => {
    const res = await request(server, 'POST', '/api/chat/message', { sessionId: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /api/chat/message rejects overly long messages', async () => {
    const longMsg = 'x'.repeat(10001);
    const res = await request(server, 'POST', '/api/chat/message', { message: longMsg });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('too long');
  });

  it('POST /api/chat/message accepts messages up to 10000 chars', async () => {
    const msg = 'x'.repeat(10000);
    const res = await request(server, 'POST', '/api/chat/message', { message: msg });
    expect(res.status).toBe(200);
  });
});
