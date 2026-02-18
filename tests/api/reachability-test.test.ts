/**
 * Tests for the /api/reachability/test endpoint (Sprint 47).
 *
 * Verifies that the endpoint correctly tests all 3 protocol
 * connectivity checks: HCS-10, MCP, and A2A.
 */

import express from 'express';
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

describe('Reachability Test Endpoint', () => {
  let server: http.Server;

  beforeAll((done) => {
    const { app } = createApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/reachability/test returns 200', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.status).toBe(200);
  });

  it('returns status field (healthy, partial, or degraded)', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(['healthy', 'partial', 'degraded']).toContain(res.body.status);
  });

  it('returns timestamp', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.timestamp).toBeTruthy();
    expect(new Date(res.body.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('returns version', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.version).toBe('0.43.0');
  });

  it('includes tests object with hcs10, mcp, a2a', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.tests).toBeDefined();
    expect(res.body.tests.hcs10).toBeDefined();
    expect(res.body.tests.mcp).toBeDefined();
    expect(res.body.tests.a2a).toBeDefined();
  });

  it('each test has status, latencyMs, details', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    for (const key of ['hcs10', 'mcp', 'a2a']) {
      const test = res.body.tests[key];
      expect(test.status).toBeDefined();
      expect(['pass', 'fail', 'warn']).toContain(test.status);
      expect(typeof test.latencyMs).toBe('number');
      expect(test.latencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof test.details).toBe('string');
      expect(test.details.length).toBeGreaterThan(0);
    }
  });

  it('MCP test passes', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.tests.mcp.status).toBe('pass');
    expect(res.body.tests.mcp.details).toContain('5 tools');
  });

  it('A2A test passes (agent card exists)', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.tests.a2a.status).toBe('pass');
    expect(res.body.tests.a2a.details).toContain('agent.json');
  });

  it('HCS-10 test returns pass or warn (listener may or may not be running)', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(['pass', 'warn']).toContain(res.body.tests.hcs10.status);
  });

  it('summary has correct total count', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total).toBe(3);
  });

  it('summary passing + failing + warnings = total', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, failing, warnings, total } = res.body.summary;
    expect(passing + failing + warnings).toBe(total);
  });

  it('summary protocols_reachable = passing + warnings', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, warnings, protocols_reachable } = res.body.summary;
    expect(protocols_reachable).toBe(passing + warnings);
  });

  it('overall status is healthy when all pass', async () => {
    const res = await request(server, 'GET', '/api/reachability/test');
    const { passing, total, warnings } = res.body.summary;
    if (passing === total) {
      expect(res.body.status).toBe('healthy');
    } else if (warnings > 0) {
      expect(res.body.status).toBe('partial');
    }
  });
});

describe('Reachability Status Endpoint', () => {
  let server: http.Server;

  beforeAll((done) => {
    const { app } = createApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/reachability returns 200', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.status).toBe(200);
  });

  it('returns protocol status for mcp, a2a, hcs10', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.protocols).toBeDefined();
    expect(res.body.protocols.mcp).toBeDefined();
    expect(res.body.protocols.a2a).toBeDefined();
    expect(res.body.protocols.hcs10).toBeDefined();
  });

  it('MCP protocol has status active', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.protocols.mcp.status).toBe('active');
  });

  it('MCP protocol reports 5 tools', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.protocols.mcp.tools_available).toBe(5);
  });

  it('A2A protocol has status active', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.protocols.a2a.status).toBe('active');
  });

  it('A2A protocol reports agent card path', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.protocols.a2a.agent_card).toBe('/.well-known/agent.json');
  });

  it('returns connections object', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.connections).toBeDefined();
    expect(Array.isArray(res.body.connections.active)).toBe(true);
    expect(Array.isArray(res.body.connections.pending)).toBe(true);
  });

  it('returns summary with reachable_via array', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.reachable_via).toContain('MCP');
    expect(res.body.summary.reachable_via).toContain('A2A');
    expect(res.body.summary.reachable_via).toContain('HCS-10');
  });

  it('returns version string', async () => {
    const res = await request(server, 'GET', '/api/reachability');
    expect(res.body.version).toBe('0.43.0');
  });
});
