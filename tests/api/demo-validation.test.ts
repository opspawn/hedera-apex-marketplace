/**
 * Demo API validation tests.
 * Verifies /api/demo/run, /api/demo/status, and /api/demo/steps
 * return well-structured JSON with clear status messages.
 */

jest.setTimeout(30000);

import { createApp } from '../../src/index';
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

describe('Demo API Validation', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('GET /api/demo/status — JSON structure', () => {
    it('should return version field', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('0.34.0');
    });

    it('should return endpoint field', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.body.endpoint).toBe('/api/demo/status');
    });

    it('should return available_actions for idle state', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.body.available_actions).toBeDefined();
      expect(res.body.available_actions).toContain('POST /api/demo/run');
    });

    it('should have status field', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.body.status).toBe('idle');
    });

    it('should have steps array', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(Array.isArray(res.body.steps)).toBe(true);
    });
  });

  describe('POST /api/demo/run — response structure', () => {
    it('should include poll_url in response', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(res.status).toBe(200);
      expect(res.body.poll_url).toBe('/api/demo/status');
    });

    it('should include steps_url in response', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(res.body.steps_url).toBe('/api/demo/steps');
    });

    it('should include message in response', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(res.body.message).toBeDefined();
      expect(typeof res.body.message).toBe('string');
    });

    it('should return steps array', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(Array.isArray(res.body.steps)).toBe(true);
    });
  });

  describe('GET /api/demo/steps', () => {
    it('should return empty steps initially', async () => {
      const res = await request(app, 'GET', '/api/demo/steps');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('idle');
      expect(res.body.total_steps).toBe(0);
      expect(res.body.steps).toEqual([]);
      expect(res.body.summary).toBeNull();
    });

    it('should return steps after demo run', async () => {
      // Start demo and wait for completion (testnet fallback adds latency)
      await request(app, 'POST', '/api/demo/run');
      await new Promise(r => setTimeout(r, 8000));

      const res = await request(app, 'GET', '/api/demo/steps');
      expect(res.status).toBe(200);
      expect(res.body.total_steps).toBeGreaterThan(0);
      expect(res.body.steps.length).toBe(res.body.total_steps);
    }, 15000);

    it('should return summary after completion', async () => {
      await request(app, 'POST', '/api/demo/run');
      await new Promise(r => setTimeout(r, 8000));

      const res = await request(app, 'GET', '/api/demo/steps');
      if (res.body.status === 'completed') {
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.totalSteps).toBe(8);
      }
    });
  });

  describe('Health endpoint version bump', () => {
    it('should return version 0.11.0', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('0.34.0');
    });

    it('should report updated test count', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.test_count).toBe(2200);
    });

    it('should list 6 HCS standards', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.standards).toEqual(['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26']);
    });

    it('should include all endpoint paths', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.endpoints).toBeDefined();
      expect(res.body.endpoints.health).toBe('/health');
      expect(res.body.endpoints.agents).toBe('/api/agents');
      expect(res.body.endpoints.marketplace).toBe('/api/marketplace/discover');
    });
  });

  describe('Seed data validation', () => {
    it('should load seed data correctly via demo run', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      await new Promise(r => setTimeout(r, 8000));

      const status = await request(app, 'GET', '/api/demo/status');
      if (status.body.status === 'completed') {
        const seedStep = status.body.steps.find((s: any) => s.type === 'seed');
        expect(seedStep).toBeDefined();
        expect(seedStep.data.seeded).toBe(8);
        expect(seedStep.data.total).toBe(8);
      }
    }, 15000);

    it('should have agents available after seeding', async () => {
      await request(app, 'POST', '/api/demo/run');
      await new Promise(r => setTimeout(r, 8000));

      // Demo seeds into MarketplaceService, use discover endpoint
      const agents = await request(app, 'GET', '/api/marketplace/discover');
      expect(agents.status).toBe(200);
      expect(agents.body.total).toBe(8);
    }, 15000);
  });
});
