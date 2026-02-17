/**
 * Error handling tests for all API endpoints.
 * Tests invalid inputs, duplicate registrations, non-existent resources.
 */
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

describe('Error Handling', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // ==========================================
  // Agent Registration Errors
  // ==========================================
  describe('Agent Registration Errors', () => {
    it('rejects empty body', async () => {
      const res = await request(app, 'POST', '/api/agents/register', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('rejects missing description', async () => {
      const res = await request(app, 'POST', '/api/agents/register', {
        name: 'Agent',
        endpoint: 'https://test.com',
        skills: [{ id: 's1', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'H', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('description');
    });

    it('rejects missing endpoint', async () => {
      const res = await request(app, 'POST', '/api/agents/register', {
        name: 'Agent',
        description: 'Test',
        skills: [{ id: 's1', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'H', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('endpoint');
    });

    it('rejects empty skills array', async () => {
      const res = await request(app, 'POST', '/api/agents/register', {
        name: 'Agent',
        description: 'Test',
        endpoint: 'https://test.com',
        skills: [],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('skill');
    });

    it('rejects missing skills field', async () => {
      const res = await request(app, 'POST', '/api/agents/register', {
        name: 'Agent',
        description: 'Test',
        endpoint: 'https://test.com',
      });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Agent Lookup Errors
  // ==========================================
  describe('Agent Lookup Errors', () => {
    it('returns 404 for non-existent agent ID', async () => {
      const res = await request(app, 'GET', '/api/agents/0.0.nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns 404 for random UUID agent ID', async () => {
      const res = await request(app, 'GET', '/api/agents/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns 404 when hiring non-existent agent (legacy)', async () => {
      const res = await request(app, 'POST', '/api/agents/0.0.fake/hire', {});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ==========================================
  // Privacy Consent Errors
  // ==========================================
  describe('Privacy Consent Errors', () => {
    it('rejects consent without agent_id', async () => {
      const res = await request(app, 'POST', '/api/privacy/consent', {
        purposes: ['service_delivery'],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('rejects consent without purposes', async () => {
      const res = await request(app, 'POST', '/api/privacy/consent', {
        agent_id: '0.0.test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects consent with empty purposes array', async () => {
      const res = await request(app, 'POST', '/api/privacy/consent', {
        agent_id: '0.0.test',
        purposes: [],
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent consent ID', async () => {
      const res = await request(app, 'GET', '/api/privacy/consent/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ==========================================
  // Skill Registry Errors (HCS-26)
  // ==========================================
  describe('Skill Registry Errors', () => {
    it('rejects invalid skill manifest (missing name)', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', {
        version: '1.0.0',
        description: 'Test',
        author: 'Test',
        license: 'MIT',
        skills: [{ name: 'S', description: 'D', category: 'C' }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('publish_failed');
    });

    it('rejects invalid skill manifest (missing skills array)', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', {
        name: 'test-skill',
        version: '1.0.0',
        description: 'Test',
        author: 'Test',
        license: 'MIT',
        skills: [],
      });
      expect(res.status).toBe(400);
    });

    it('rejects invalid semver version', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', {
        name: 'test-skill',
        version: 'invalid',
        description: 'Test',
        author: 'Test',
        license: 'MIT',
        skills: [{ name: 'S', description: 'D', category: 'C' }],
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent skill topic', async () => {
      const res = await request(app, 'GET', '/api/skills/0.0.nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns empty results for non-matching skill search', async () => {
      const res = await request(app, 'GET', '/api/skills/search?q=zzzznonexistent');
      expect(res.status).toBe(200);
      expect(res.body.skills).toEqual([]);
    });

    it('rejects publishing skills for non-existent agent', async () => {
      const res = await request(app, 'POST', '/api/agents/0.0.fake/skills/publish');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ==========================================
  // Points API Errors (HCS-20)
  // ==========================================
  describe('Points API Errors', () => {
    it('rejects award with missing agentId', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        amount: 50,
        reason: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('rejects award with missing amount', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects award with missing reason', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: 50,
      });
      expect(res.status).toBe(400);
    });

    it('rejects award with zero amount', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: 0,
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects award with negative amount', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: -10,
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects award with string amount', async () => {
      const res = await request(app, 'POST', '/api/v1/points/award', {
        agentId: '0.0.test',
        amount: 'fifty',
        reason: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('returns zero points for unknown agent', async () => {
      const res = await request(app, 'GET', '/api/v1/points/0.0.unknown-agent');
      expect(res.status).toBe(200);
      expect(res.body.total_points).toBe(0);
      expect(res.body.entries).toEqual([]);
      expect(res.body.agent_id).toBe('0.0.unknown-agent');
    });
  });

  // ==========================================
  // Marketplace Errors
  // ==========================================
  describe('Marketplace Registration Errors', () => {
    it('rejects marketplace registration without name', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        description: 'No name',
        endpoint: 'https://test.com',
        skills: [{ id: 's', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'H', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects marketplace registration without description', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        name: 'Agent',
        endpoint: 'https://test.com',
        skills: [{ id: 's', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'H', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects marketplace registration without endpoint', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        name: 'Agent',
        description: 'Test',
        skills: [{ id: 's', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'H', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects marketplace registration with empty skills', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        name: 'Agent',
        description: 'Test',
        endpoint: 'https://test.com',
        skills: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Marketplace Hire Errors', () => {
    it('rejects hire without clientId', async () => {
      const res = await request(app, 'POST', '/api/marketplace/hire', {
        agentId: '0.0.test',
        skillId: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('rejects hire without agentId', async () => {
      const res = await request(app, 'POST', '/api/marketplace/hire', {
        clientId: '0.0.client',
        skillId: 'test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects hire without skillId', async () => {
      const res = await request(app, 'POST', '/api/marketplace/hire', {
        clientId: '0.0.client',
        agentId: '0.0.test',
      });
      expect(res.status).toBe(400);
    });

    it('rejects hire with empty body', async () => {
      const res = await request(app, 'POST', '/api/marketplace/hire', {});
      expect(res.status).toBe(400);
    });
  });

  describe('Marketplace Agent Profile Errors', () => {
    it('returns 404 for non-existent marketplace agent', async () => {
      const res = await request(app, 'GET', '/api/marketplace/agent/0.0.nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ==========================================
  // Well-Known Endpoint
  // ==========================================
  describe('Well-Known Endpoint', () => {
    it('returns proper agent card structure', async () => {
      const res = await request(app, 'GET', '/.well-known/agent-card.json');
      expect(res.status).toBe(200);
      expect(res.body.name).toBeDefined();
      expect(res.body.version).toBeDefined();
      expect(res.body.capabilities).toBeDefined();
      expect(Array.isArray(res.body.capabilities)).toBe(true);
      expect(res.body.protocols).toBeDefined();
      expect(Array.isArray(res.body.protocols)).toBe(true);
    });
  });
});
