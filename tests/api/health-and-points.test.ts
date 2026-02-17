import { createApp } from '../../src/index';
import { Express } from 'express';

// Request helper
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

describe('Health and Points API', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('GET /health', () => {
    it('should return 200 with required fields', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBeDefined();
      expect(res.body.test_count).toBeDefined();
      expect(res.body.standards).toBeDefined();
      expect(res.body.uptime).toBeDefined();
    });

    it('should include standards list with HCS-20', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.standards).toContain('HCS-20');
      expect(res.body.standards.length).toBe(6);
    });

    it('should include uptime_seconds as a number', async () => {
      const res = await request(app, 'GET', '/health');
      expect(typeof res.body.uptime_seconds).toBe('number');
      expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
    });

    it('should include version string', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should include endpoints map', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.endpoints).toBeDefined();
      expect(res.body.endpoints.health).toBe('/health');
    });
  });

  describe('GET /api/health (alias)', () => {
    it('should return same data as /health', async () => {
      const res = await request(app, 'GET', '/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBeDefined();
    });
  });

  describe('GET /api/v1/points/:agentId', () => {
    it('should return empty summary for unknown agent', async () => {
      const res = await request(app, 'GET', '/api/v1/points/0.0.unknown');
      expect(res.status).toBe(200);
      expect(res.body.total_points).toBe(0);
      expect(res.body.entries).toEqual([]);
    });
  });

  describe('POST /api/v1/points/award', () => {
    it('should award points and return entry', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: 100,
        reason: 'test_award',
        fromAgent: '0.0.system',
      });
      expect(res.status).toBe(201);
      expect(res.body.agent_id).toBe('0.0.test');
      expect(res.body.points).toBe(100);
      expect(res.body.reason).toBe('test_award');
    });

    it('should reject missing fields', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
      });
      expect(res.status).toBe(400);
    });

    it('should reject non-positive amount', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: -5,
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/points/leaderboard', () => {
    it('should return leaderboard structure', async () => {
      const res = await request(app, 'GET', '/api/v1/points/leaderboard');
      expect(res.status).toBe(200);
      expect(res.body.leaderboard).toBeDefined();
      expect(Array.isArray(res.body.leaderboard)).toBe(true);
      expect(res.body.total_agents).toBeDefined();
      expect(res.body.total_points_awarded).toBeDefined();
    });
  });

  describe('Hire with HCS-20 points', () => {
    it('should award points on successful hire', async () => {
      // First register an agent via marketplace
      const regRes = await request(app, 'POST', '/api/marketplace/register', {
        name: 'Test Agent',
        description: 'Test description',
        endpoint: 'https://test.example.com/a2a',
        skills: [{
          id: 'test-skill',
          name: 'Test Skill',
          description: 'Test',
          category: 'test',
          tags: ['test'],
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
        }],
        protocols: ['a2a-v0.3', 'hcs-10'],
        payment_address: '0.0.payment',
      });
      expect(regRes.status).toBe(201);
      const agentId = regRes.body.agent.agent_id;

      // Hire the agent
      const hireRes = await request(app, 'POST', '/api/marketplace/hire', {
        clientId: '0.0.client',
        agentId,
        skillId: 'test-skill',
        input: {},
      });
      expect(hireRes.status).toBe(201);

      // Check points were awarded
      const pointsRes = await request(app, 'GET', `/api/v1/points/${agentId}`);
      expect(pointsRes.status).toBe(200);
      // Should have registration points (100) + skill_published (25) + hire points (50)
      expect(pointsRes.body.total_points).toBe(175);
    });
  });
});
