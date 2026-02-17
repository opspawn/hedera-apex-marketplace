/**
 * Sprint 24: Enhanced discover endpoint filter tests.
 *
 * Tests for new query params: skill, standard, name
 * on GET /api/marketplace/discover
 */

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

describe('Sprint 24: Marketplace Discover Filters', () => {
  let app: Express;

  beforeAll(async () => {
    const result = createApp();
    app = result.app;
    await seedDemoAgents(result.marketplace, result.hcs19, result.hcs20);
  });

  test('returns all agents when no filters applied', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover');
    expect(res.status).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('filters by skill name', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?skill=translation');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBeGreaterThan(0);
    for (const ma of agents) {
      const hasSkill = ma.agent.skills.some((s: any) =>
        s.name.toLowerCase().includes('translation') ||
        s.id.toLowerCase().includes('translation'),
      );
      expect(hasSkill).toBe(true);
    }
  });

  test('filters by skill id', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?skill=smart-contract-audit');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  test('returns empty when skill not found', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?skill=nonexistent-skill-xyz');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBe(0);
  });

  test('filters by standard/protocol (hcs-10)', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?standard=hcs-10');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBeGreaterThan(0);
    for (const ma of agents) {
      const hasProtocol = ma.agent.protocols.some((p: string) =>
        p.toLowerCase().includes('hcs-10'),
      );
      expect(hasProtocol).toBe(true);
    }
  });

  test('filters by standard/protocol (mcp)', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?standard=mcp');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBeGreaterThan(0);
    for (const ma of agents) {
      const hasProtocol = ma.agent.protocols.some((p: string) =>
        p.toLowerCase().includes('mcp'),
      );
      expect(hasProtocol).toBe(true);
    }
  });

  test('filters by standard/protocol (x402)', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?standard=x402');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  test('filters by agent name', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?name=Sentinel');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBe(1);
    expect(agents[0].agent.name).toBe('SentinelAI');
  });

  test('filters by name case-insensitively', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?name=sentinel');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBe(1);
  });

  test('combines skill + category filters', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?skill=audit&category=blockchain');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  test('combines name + standard filters', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?name=Auto&standard=mcp');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBe(1);
    expect(agents[0].agent.name).toBe('AutoPilot');
  });

  test('combines q + skill filters', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?q=security&skill=audit');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
  });

  test('returns empty when combined filters match nothing', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?name=Sentinel&standard=x402');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBe(0);
  });

  test('supports pagination with new filters', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?standard=hcs-10&limit=2&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeLessThanOrEqual(2);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('supports all filters simultaneously', async () => {
    const res = await request(app, 'GET', '/api/marketplace/discover?q=agent&standard=hcs-10');
    expect(res.status).toBe(200);
  });
});
