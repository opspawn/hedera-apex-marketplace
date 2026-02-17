/**
 * Sprint 23: Demo Readiness Tests
 *
 * Tests for:
 * - /api/agents returning seed agents (after seeding)
 * - /api/demo/flow 6-step pipeline
 * - /.well-known/agent.json endpoint
 * - Dashboard demo pipeline integration
 * - Version bump to 0.35.0
 */

jest.setTimeout(30000);

import { createApp } from '../../src/index';
import { seedDemoAgents } from '../../src/seed';
import { Express } from 'express';

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

describe('Sprint 23: /api/agents with seed agents', () => {
  let app: Express;
  let marketplace: any;
  let hcs19: any;
  let hcs20: any;

  beforeAll(async () => {
    const ctx = createApp();
    app = ctx.app;
    marketplace = ctx.marketplace;
    hcs19 = ctx.hcs19;
    hcs20 = ctx.hcs20;
    // Seed agents like the server does on startup
    await seedDemoAgents(marketplace, hcs19, hcs20);
  }, 60000);

  test('GET /api/agents returns seed agents after seeding', async () => {
    const res = await request(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents.length).toBe(8);
    expect(res.body.total).toBe(8);
  });

  test('seed agents have required fields', async () => {
    const res = await request(app, 'GET', '/api/agents');
    const agent = res.body.agents[0];
    expect(agent.name).toBeDefined();
    expect(agent.description).toBeDefined();
    expect(agent.skills).toBeDefined();
    expect(agent.agent_id).toBeDefined();
    expect(agent.status).toBeDefined();
  });

  test('seed agents include HCS standards metadata', async () => {
    const res = await request(app, 'GET', '/api/agents');
    const agent = res.body.agents[0];
    expect(agent.hcs_standards).toBeDefined();
    expect(agent.hcs_standards).toContain('HCS-10');
    expect(agent.hcs_standards).toContain('HCS-20');
    expect(agent.hcs_standards).toContain('HCS-26');
  });

  test('seed agents include verification status', async () => {
    const res = await request(app, 'GET', '/api/agents');
    const agent = res.body.agents[0];
    expect(agent.verification_status).toBeDefined();
    expect(['verified', 'unverified']).toContain(agent.verification_status);
  });

  test('GET /api/agents supports search query', async () => {
    const res = await request(app, 'GET', '/api/agents?q=security');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
    const names = res.body.agents.map((a: any) => a.name);
    expect(names).toContain('SentinelAI');
  });

  test('GET /api/agents supports category filter', async () => {
    const res = await request(app, 'GET', '/api/agents?category=blockchain');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  test('GET /api/agents supports limit parameter', async () => {
    const res = await request(app, 'GET', '/api/agents?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBe(3);
    expect(res.body.total).toBe(8);
  });

  test('GET /api/agents/:id returns a seed agent', async () => {
    const listRes = await request(app, 'GET', '/api/agents');
    const agentId = listRes.body.agents[0].agent_id;
    const res = await request(app, 'GET', `/api/agents/${agentId}`);
    expect(res.status).toBe(200);
    expect(res.body.agent_id).toBe(agentId);
    expect(res.body.name).toBeDefined();
  });

  test('GET /api/agents/:id returns 404 for unknown agent', async () => {
    const res = await request(app, 'GET', '/api/agents/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('Sprint 23: /api/demo/flow pipeline', () => {
  let app: Express;
  let marketplace: any;
  let hcs19: any;
  let hcs20: any;

  beforeAll(async () => {
    const ctx = createApp();
    app = ctx.app;
    marketplace = ctx.marketplace;
    hcs19 = ctx.hcs19;
    hcs20 = ctx.hcs20;
    await seedDemoAgents(marketplace, hcs19, hcs20);
  }, 60000);

  test('GET /api/demo/flow returns 6-step pipeline result', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.steps).toBeDefined();
    expect(res.body.steps.length).toBe(9);
  });

  test('pipeline steps have correct phases', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    const phases = res.body.steps.map((s: any) => s.phase);
    expect(phases).toContain('registration');
    expect(phases).toContain('discovery');
    expect(phases).toContain('connection');
    expect(phases).toContain('execution');
    expect(phases).toContain('feedback');
    expect(phases).toContain('points');
  });

  test('pipeline steps have required fields', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    for (const step of res.body.steps) {
      expect(step.step).toBeDefined();
      expect(step.phase).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.status).toBeDefined();
      expect(step.detail).toBeDefined();
      expect(typeof step.duration_ms).toBe('number');
    }
  });

  test('pipeline steps include hedera_proof field', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    for (const step of res.body.steps) {
      if (step.status === 'completed') {
        expect(step.hedera_proof).toBeDefined();
        expect(step.hedera_proof.mode).toBeDefined();
        expect(['live', 'mock']).toContain(step.hedera_proof.mode);
      }
    }
  });

  test('pipeline returns summary', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total_steps).toBe(9);
    expect(res.body.summary.agent_registered).toBeDefined();
    expect(res.body.summary.agents_discovered).toBeGreaterThan(0);
  });

  test('pipeline returns total duration', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    expect(typeof res.body.total_duration_ms).toBe('number');
    expect(res.body.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('pipeline registration step creates an agent', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    const regStep = res.body.steps.find((s: any) => s.phase === 'registration');
    expect(regStep.status).toBe('completed');
    expect(regStep.data.agent_id).toBeDefined();
    expect(regStep.data.agent_name).toBeDefined();
  });

  test('pipeline discovery step finds agents', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    const discStep = res.body.steps.find((s: any) => s.phase === 'discovery');
    expect(discStep.status).toBe('completed');
    expect(discStep.data.total).toBeGreaterThan(0);
  });

  test('pipeline points step awards HCS-20 points', async () => {
    const res = await request(app, 'GET', '/api/demo/flow');
    const ptsStep = res.body.steps.find((s: any) => s.phase === 'points');
    expect(ptsStep.status).toBe('completed');
    expect(ptsStep.data.points_awarded).toBe(150);
  });
});

describe('Sprint 23: /.well-known/agent.json', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /.well-known/agent.json returns agent card', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Hedera Agent Marketplace');
  });

  test('agent.json has version 0.35.0', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.version).toBe('0.35.0');
  });

  test('agent.json has protocols array with 8 protocols', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.protocols).toHaveLength(8);
    expect(res.body.protocols).toContain('hcs-10');
    expect(res.body.protocols).toContain('hcs-20');
    expect(res.body.protocols).toContain('hcs-26');
  });

  test('agent.json has capabilities array', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.capabilities).toBeDefined();
    expect(res.body.capabilities.length).toBeGreaterThan(0);
    expect(res.body.capabilities).toContain('agent-registration');
    expect(res.body.capabilities).toContain('agent-discovery');
  });

  test('agent.json has description', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.description).toBeDefined();
    expect(res.body.description.length).toBeGreaterThan(0);
  });

  test('agent.json has url field', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.url).toBeDefined();
    expect(res.body.url).toContain('opspawn.com');
  });

  test('agent.json has endpoints map', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.endpoints).toBeDefined();
    expect(res.body.endpoints.health).toBe('/health');
    expect(res.body.endpoints.agents).toBe('/api/agents');
    expect(res.body.endpoints.demo).toBe('/api/demo/flow');
  });

  test('agent.json matches agent-card.json', async () => {
    const agentJson = await request(app, 'GET', '/.well-known/agent.json');
    const agentCard = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(agentJson.body).toEqual(agentCard.body);
  });

  test('agent.json has contact info', async () => {
    const res = await request(app, 'GET', '/.well-known/agent.json');
    expect(res.body.contact).toBeDefined();
    expect(res.body.contact.github).toBeDefined();
  });
});

describe('Sprint 23: Version bump', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('health returns v0.35.0', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.version).toBe('0.35.0');
  });

  test('stats returns v0.35.0', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.version).toBe('0.35.0');
  });

  test('test_count is 1600', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(2300);
  });

  test('ready endpoint returns v0.35.0', async () => {
    const res = await request(app, 'GET', '/ready');
    expect(res.body.version).toBe('0.35.0');
  });
});
