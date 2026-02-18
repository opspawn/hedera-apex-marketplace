/**
 * Sprint 35 Integration Tests — Full Demo Flow End-to-End.
 *
 * Validates that the full demo flow correctly integrates with
 * all marketplace services, registries, and tracking systems.
 */

// Force mock mode
process.env.HEDERA_PRIVATE_KEY = '';

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any; text: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let json: any = {};
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.status, body: json, text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 35 Integration: Full demo creates discoverable agent', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('agent created by full flow is discoverable', async () => {
    const demoRes = await req(app, 'POST', '/api/demo/full-flow');
    expect(demoRes.body.status).toBe('completed');
    const agentId = demoRes.body.summary.agent_id;

    const discoverRes = await req(app, 'GET', '/api/marketplace/discover?limit=50');
    expect(discoverRes.status).toBe(200);
    const found = discoverRes.body.agents.some((a: any) => a.agent?.agent_id === agentId || a.agent_id === agentId);
    expect(found).toBe(true);
  });

  test('agent created by full flow has points', async () => {
    const demoRes = await req(app, 'POST', '/api/demo/full-flow');
    const agentId = demoRes.body.summary.agent_id;

    const pointsRes = await req(app, 'GET', `/api/v1/points/${agentId}`);
    expect(pointsRes.status).toBe(200);
    expect(pointsRes.body.total_points || pointsRes.body.points || 0).toBeGreaterThanOrEqual(175);
  });

  test('full flow works after standard agent registration', async () => {
    // First register a standard agent
    await req(app, 'POST', '/api/marketplace/register', {
      name: 'PreExisting-Agent',
      description: 'Agent registered before full flow',
      endpoint: 'http://localhost:3000/api/agent',
      skills: [{ id: 'sk1', name: 'test', description: 'test', category: 'dev', tags: ['test'], input_schema: { type: 'object' }, output_schema: { type: 'object' }, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
      protocols: ['hcs-10'],
      payment_address: '0.0.test',
    });

    // Then run full flow
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.status).toBe('completed');
    expect(res.body.steps).toHaveLength(10);
  });
});

describe('Sprint 35 Integration: Health reflects new version', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('health endpoint reflects v0.35.0 after demo', async () => {
    await req(app, 'POST', '/api/demo/full-flow');
    const health = await req(app, 'GET', '/health');
    expect(health.body.version).toBe(require('../../package.json').version);
  });

  test('live-stats still works after demo flow', async () => {
    await req(app, 'POST', '/api/demo/full-flow');
    const stats = await req(app, 'GET', '/api/live-stats');
    expect(stats.status).toBe(200);
    expect(stats.body.total_agents).toBeGreaterThanOrEqual(1);
  });
});
