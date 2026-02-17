/**
 * Sprint 23: Seed Agent Quality Tests
 *
 * Validates each seed agent has proper data for demo readiness.
 */

jest.setTimeout(30000);

import { createApp } from '../../src/index';
import { seedDemoAgents } from '../../src/seed';
import { Express } from 'express';

async function request(app: Express, method: string, path: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, { method });
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 23: Seed Agent Quality', () => {
  let app: Express;

  beforeAll(async () => {
    const ctx = createApp();
    app = ctx.app;
    await seedDemoAgents(ctx.marketplace, ctx.hcs19, ctx.hcs20);
  }, 60000);

  test('all 8 seed agents are present', async () => {
    const res = await request(app, 'GET', '/api/agents');
    expect(res.body.agents.length).toBe(8);
  });

  test('SentinelAI is the security agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=sentinel');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('SentinelAI');
    expect(res.body.agents[0].skills.length).toBe(2);
  });

  test('LinguaFlow is the NLP agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=lingua');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('LinguaFlow');
  });

  test('DataWeaver is the analytics agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=dataweaver');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('DataWeaver');
  });

  test('AutoPilot is the automation agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=autopilot');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('AutoPilot');
  });

  test('VisionForge is the CV agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=visionforge');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('VisionForge');
  });

  test('ChainOracle is the oracle agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=chainoracle');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('ChainOracle');
  });

  test('DocuMind is the document processing agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=documind');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('DocuMind');
  });

  test('TaskSwarm is the coordination agent', async () => {
    const res = await request(app, 'GET', '/api/agents?q=taskswarm');
    expect(res.body.agents.length).toBe(1);
    expect(res.body.agents[0].name).toBe('TaskSwarm');
  });

  test('each seed agent has at least one skill', async () => {
    const res = await request(app, 'GET', '/api/agents');
    for (const agent of res.body.agents) {
      expect(agent.skills.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('each seed agent has a payment address', async () => {
    const res = await request(app, 'GET', '/api/agents');
    for (const agent of res.body.agents) {
      expect(agent.payment_address).toBeDefined();
      expect(agent.payment_address.startsWith('0.0.')).toBe(true);
    }
  });

  test('each seed agent has skills with pricing', async () => {
    const res = await request(app, 'GET', '/api/agents');
    for (const agent of res.body.agents) {
      for (const skill of agent.skills) {
        expect(skill.pricing).toBeDefined();
        expect(skill.pricing.amount).toBeGreaterThan(0);
        expect(skill.pricing.token).toBe('HBAR');
      }
    }
  });

  test('each seed agent has a description', async () => {
    const res = await request(app, 'GET', '/api/agents');
    for (const agent of res.body.agents) {
      expect(agent.description.length).toBeGreaterThan(10);
    }
  });

  test('each seed agent has an endpoint URL', async () => {
    const res = await request(app, 'GET', '/api/agents');
    for (const agent of res.body.agents) {
      expect(agent.endpoint).toBeDefined();
      expect(agent.endpoint.startsWith('https://')).toBe(true);
    }
  });

  test('marketplace discover matches agents list count', async () => {
    const agentsRes = await request(app, 'GET', '/api/agents');
    const discoverRes = await request(app, 'GET', '/api/marketplace/discover');
    expect(agentsRes.body.total).toBe(discoverRes.body.total);
  });

  test('leaderboard has 8 agents after seeding', async () => {
    const res = await request(app, 'GET', '/api/v1/points/leaderboard');
    expect(res.body.leaderboard.length).toBe(8);
    expect(res.body.total_agents).toBe(8);
  });

  test('all agents have positive points after seeding', async () => {
    const res = await request(app, 'GET', '/api/v1/points/leaderboard');
    for (const entry of res.body.leaderboard) {
      expect(entry.total_points).toBeGreaterThan(0);
    }
  });
});
