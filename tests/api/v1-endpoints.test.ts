/**
 * Verification tests for /api/v1/ endpoints.
 * Ensures all endpoints return proper JSON with correct status codes.
 */
import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any; contentType: string }>((resolve) => {
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
        let json;
        try { json = JSON.parse(text); } catch { json = text; }
        resolve({
          status: res.status,
          body: json,
          contentType: res.headers.get('content-type') || '',
        });
      } finally {
        server.close();
      }
    });
  });
}

describe('/api/v1/ Endpoint Verification', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('GET /api/v1/points/leaderboard', () => {
    it('returns 200 with JSON content type', async () => {
      const res = await request(app, 'GET', '/api/v1/points/leaderboard');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('application/json');
    });

    it('returns required fields', async () => {
      const res = await request(app, 'GET', '/api/v1/points/leaderboard');
      expect(res.body).toHaveProperty('leaderboard');
      expect(res.body).toHaveProperty('total_agents');
      expect(res.body).toHaveProperty('total_points_awarded');
      expect(Array.isArray(res.body.leaderboard)).toBe(true);
      expect(typeof res.body.total_agents).toBe('number');
      expect(typeof res.body.total_points_awarded).toBe('number');
    });

    it('starts with empty leaderboard', async () => {
      const res = await request(app, 'GET', '/api/v1/points/leaderboard');
      expect(res.body.leaderboard).toEqual([]);
      expect(res.body.total_agents).toBe(0);
      expect(res.body.total_points_awarded).toBe(0);
    });

    it('populates leaderboard after awarding points', async () => {
      await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.agent-a', amount: 100, reason: 'test', fromAgent: 'system',
      });
      await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.agent-b', amount: 200, reason: 'test', fromAgent: 'system',
      });
      const res = await request(app, 'GET', '/api/v1/points/leaderboard');
      expect(res.body.leaderboard.length).toBe(2);
      expect(res.body.total_agents).toBe(2);
      expect(res.body.total_points_awarded).toBe(300);
      // First entry should be the higher scorer
      expect(res.body.leaderboard[0].total_points).toBe(200);
    });
  });

  describe('POST /api/v1/points/award', () => {
    it('returns 201 with JSON content type', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test', amount: 50, reason: 'test_award', fromAgent: 'system',
      });
      expect(res.status).toBe(201);
      expect(res.contentType).toContain('application/json');
    });

    it('returns PointEntry structure', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test', amount: 50, reason: 'test_award', fromAgent: 'system',
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('agent_id', '0.0.test');
      expect(res.body).toHaveProperty('points', 50);
      expect(res.body).toHaveProperty('reason', 'test_award');
      expect(res.body).toHaveProperty('from_agent', 'system');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('returns 400 for invalid input with JSON error', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {});
      expect(res.status).toBe(400);
      expect(res.contentType).toContain('application/json');
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/points/:agentId', () => {
    it('returns 200 with JSON content type', async () => {
      const res = await request(app, 'GET', '/api/v1/points/0.0.test');
      expect(res.status).toBe(200);
      expect(res.contentType).toContain('application/json');
    });

    it('returns AgentPointsSummary structure', async () => {
      const res = await request(app, 'GET', '/api/v1/points/0.0.test');
      expect(res.body).toHaveProperty('agent_id', '0.0.test');
      expect(res.body).toHaveProperty('total_points');
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('breakdown');
      expect(typeof res.body.total_points).toBe('number');
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(typeof res.body.breakdown).toBe('object');
    });

    it('accumulates points correctly', async () => {
      await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.accumulate', amount: 30, reason: 'first', fromAgent: 'sys',
      });
      await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.accumulate', amount: 70, reason: 'second', fromAgent: 'sys',
      });
      const res = await request(app, 'GET', '/api/v1/points/0.0.accumulate');
      expect(res.body.total_points).toBe(100);
      expect(res.body.entries.length).toBe(2);
      expect(res.body.breakdown).toHaveProperty('first');
      expect(res.body.breakdown).toHaveProperty('second');
    });
  });

  // Verify all main API endpoints return JSON
  describe('JSON Response Verification', () => {
    it('GET /health returns JSON', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /api/agents returns JSON', async () => {
      const res = await request(app, 'GET', '/api/agents');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /api/marketplace/discover returns JSON', async () => {
      const res = await request(app, 'GET', '/api/marketplace/discover');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /api/skills/search returns JSON', async () => {
      const res = await request(app, 'GET', '/api/skills/search?q=test');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /.well-known/agent-card.json returns JSON', async () => {
      const res = await request(app, 'GET', '/.well-known/agent-card.json');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /api/demo/status returns JSON', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });

    it('GET /api/dashboard/stats returns JSON', async () => {
      const res = await request(app, 'GET', '/api/dashboard/stats');
      expect(res.contentType).toContain('application/json');
      expect(typeof res.body).toBe('object');
    });
  });
});
