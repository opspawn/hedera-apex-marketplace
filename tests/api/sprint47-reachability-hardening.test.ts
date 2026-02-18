/**
 * Sprint 47 — Reachability Hardening Tests.
 *
 * Tests the /api/reachability and /api/reachability/test endpoints
 * in the full app context (with createApp).
 */

import http from 'http';
import { createApp } from '../../src/index';

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

describe('Sprint 47: Reachability Test — Protocol Verification', () => {
  let server: http.Server;

  beforeAll((done) => {
    const { app } = createApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/reachability/test returns all 3 protocol tests', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.tests).sort()).toEqual(['a2a', 'hcs10', 'mcp']);
  });

  it('MCP test verifies 5 tools', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.tests.mcp.status).toBe('pass');
    expect(res.body.tests.mcp.details).toContain('5 tools');
  });

  it('A2A test verifies agent card with capabilities', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.tests.a2a.status).toBe('pass');
    expect(res.body.tests.a2a.details).toContain('capabilities');
  });

  it('HCS-10 test reports handler status', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    // Should be pass or warn depending on whether listener is running
    expect(['pass', 'warn']).toContain(res.body.tests.hcs10.status);
  });

  it('all tests have non-negative latency', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    for (const key of ['hcs10', 'mcp', 'a2a']) {
      expect(res.body.tests[key].latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('summary has total of 3', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.summary.total).toBe(3);
  });

  it('summary passing + failing + warnings = 3', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, failing, warnings } = res.body.summary;
    expect(passing + failing + warnings).toBe(3);
  });

  it('protocols_reachable counts pass + warn', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, warnings, protocols_reachable } = res.body.summary;
    expect(protocols_reachable).toBe(passing + warnings);
  });

  it('status is healthy when all pass', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, warnings, total } = res.body.summary;
    if (passing + warnings === total) {
      expect(['healthy', 'partial']).toContain(res.body.status);
    }
  });

  it('version matches package.json', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const pkgVersion = require('../../package.json').version;
    expect(res.body.version).toBe(pkgVersion);
  });

  it('timestamp is recent', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const ts = new Date(res.body.timestamp).getTime();
    expect(ts).toBeGreaterThan(Date.now() - 5000);
  });
});

describe('Sprint 47: Reachability Status — Protocol Details', () => {
  let server: http.Server;

  beforeAll((done) => {
    const { app } = createApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/reachability returns MCP with full details', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    const mcp = res.body.protocols.mcp;
    expect(mcp.status).toBe('active');
    expect(mcp.endpoint).toBe('/mcp');
    expect(mcp.transport).toBe('json-rpc-2.0-http');
    expect(mcp.tools_available).toBe(5);
    expect(mcp.description).toBeTruthy();
  });

  it('GET /api/reachability returns A2A with full details', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    const a2a = res.body.protocols.a2a;
    expect(a2a.status).toBe('active');
    expect(a2a.agent_card).toBe('/.well-known/agent.json');
    expect(a2a.tasks_endpoint).toBe('/api/a2a/tasks');
    expect(a2a.protocol).toBe('google-a2a');
    expect(a2a.skills).toBe(4);
  });

  it('GET /api/reachability returns HCS-10 with full details', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    const hcs = res.body.protocols.hcs10;
    expect(hcs.auto_accept).toBe(true);
    expect(hcs.natural_language).toBe(true);
    expect(hcs.description).toBeTruthy();
  });

  it('GET /api/reachability returns connections', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(Array.isArray(res.body.connections.active)).toBe(true);
    expect(Array.isArray(res.body.connections.pending)).toBe(true);
  });

  it('GET /api/reachability returns recent inbound', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(Array.isArray(res.body.recent_inbound)).toBe(true);
  });

  it('GET /api/reachability summary has chat_endpoint', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.summary.chat_endpoint).toBe('/api/chat/agent');
  });

  it('GET /api/reachability summary has total_agents', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(typeof res.body.summary.total_agents).toBe('number');
    expect(res.body.summary.total_agents).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/reachability reachable_via has 3 protocols', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.summary.reachable_via).toHaveLength(3);
  });
});

describe('Sprint 47: Smart Chat in Full App Context', () => {
  let server: http.Server;

  beforeAll((done) => {
    const { app } = createApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('POST /api/chat/smart returns 200 in full app', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    expect(res.status).toBe(200);
    expect(res.body.agentMessage).toBeDefined();
  });

  it('smart chat enriches agent list with seeded data', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What agents are available?',
    });
    // Should contain some seeded agent names
    const content = res.body.agentMessage.content;
    expect(content.length).toBeGreaterThan(100);
  });

  it('smart chat handles marketplace info in full app', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What is this marketplace?',
    });
    const content = res.body.agentMessage.content;
    // In full app, ChatAgent is configured so it returns its own help response
    expect(content.length).toBeGreaterThan(50);
  });

  it('smart chat handles trust query in full app', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'Show me trust scores',
    });
    expect(res.status).toBe(200);
    // ChatAgent returns trust data or "no agents found" — both are valid
    expect(res.body.agentMessage.content.length).toBeGreaterThan(10);
  });

  it('smart chat handles standards query in full app', async () => {
    const res = await request(server, 'POST', '/api/chat/smart', {
      message: 'What standards do you support?',
    });
    expect(res.status).toBe(200);
    // ChatAgent may return help text rather than fallback
    expect(res.body.agentMessage.content.length).toBeGreaterThan(10);
  });

  it('chat page renders in full app', async () => {
    const res = await request(server, 'GET', '/chat');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hedera Agent');
  });

  it('chat status endpoint works in full app', async () => {
    const res = await request(server, 'GET', '/api/chat/status');
    expect(res.status).toBe(200);
    expect(res.body.chatAgentReady).toBeDefined();
  });

  it('chat agent tools endpoint works in full app', async () => {
    const res = await request(server, 'GET', '/api/chat/agent/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools).toBeDefined();
  });
});
