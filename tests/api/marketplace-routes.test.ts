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

const validRegistration = {
  name: 'Marketplace Agent',
  description: 'A full marketplace agent',
  skills: [{
    id: 'translate',
    name: 'Translation',
    description: 'Translates text between languages',
    category: 'nlp',
    tags: ['translate', 'language'],
    input_schema: { type: 'object' },
    output_schema: { type: 'object' },
    pricing: { amount: 10, token: 'HBAR', unit: 'per_call' },
  }],
  endpoint: 'https://marketplace-agent.example.com',
  protocols: ['a2a-v0.3', 'hcs-10'],
  payment_address: '0.0.payment',
};

describe('Marketplace API Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('POST /api/marketplace/register', () => {
    test('registers agent with full HCS integration', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', validRegistration);

      expect(res.status).toBe(201);
      expect(res.body.agent).toBeDefined();
      expect(res.body.identity).toBeDefined();
      expect(res.body.identity.did).toMatch(/^did:hedera:/);
      expect(res.body.profile).toBeDefined();
      expect(res.body.publishedSkills).toBeDefined();
      expect(res.body.verificationStatus).toBe('verified');
    });

    test('rejects registration without name', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        description: 'No name',
        endpoint: 'https://test.com',
        skills: [{ id: 's1', name: 'S', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    test('rejects registration without skills', async () => {
      const res = await request(app, 'POST', '/api/marketplace/register', {
        name: 'Agent',
        description: 'No skills',
        endpoint: 'https://test.com',
        skills: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/marketplace/discover', () => {
    test('returns empty list initially', async () => {
      const res = await request(app, 'GET', '/api/marketplace/discover');
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    test('discovers agents after registration', async () => {
      // Register via marketplace first
      await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const res = await request(app, 'GET', '/api/marketplace/discover');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.agents[0].agent.name).toBe('Marketplace Agent');
    });

    test('filters by query parameter', async () => {
      await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const res = await request(app, 'GET', '/api/marketplace/discover?q=translate');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('filters by category', async () => {
      await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const res = await request(app, 'GET', '/api/marketplace/discover?category=nlp');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('returns empty for non-matching query', async () => {
      await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const res = await request(app, 'GET', '/api/marketplace/discover?q=blockchain');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });
  });

  describe('POST /api/marketplace/hire', () => {
    test('hires agent successfully', async () => {
      const regRes = await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const agentId = regRes.body.agent.agent_id;

      const res = await request(app, 'POST', '/api/marketplace/hire', {
        clientId: '0.0.client',
        agentId,
        skillId: 'translate',
        input: { text: 'Hello', target_lang: 'es' },
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.task_id).toBeDefined();
      expect(res.body.settlement).toBeDefined();
    });

    test('rejects hire without required fields', async () => {
      const res = await request(app, 'POST', '/api/marketplace/hire', {
        agentId: '0.0.test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    test('returns 422 for skill mismatch', async () => {
      const regRes = await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const agentId = regRes.body.agent.agent_id;

      const res = await request(app, 'POST', '/api/marketplace/hire', {
        clientId: '0.0.client',
        agentId,
        skillId: 'nonexistent',
        input: {},
      });

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('failed');
    });
  });

  describe('GET /api/marketplace/agent/:id', () => {
    test('returns full agent profile', async () => {
      const regRes = await request(app, 'POST', '/api/marketplace/register', validRegistration);
      const agentId = regRes.body.agent.agent_id;

      const res = await request(app, 'GET', `/api/marketplace/agent/${agentId}`);
      expect(res.status).toBe(200);
      expect(res.body.agent.name).toBe('Marketplace Agent');
      expect(res.body.identity.did).toMatch(/^did:hedera:/);
      expect(res.body.profile.type).toBe('hcs-11-profile');
      expect(res.body.publishedSkills.length).toBeGreaterThan(0);
    });

    test('returns 404 for non-existent agent', async () => {
      const res = await request(app, 'GET', '/api/marketplace/agent/0.0.nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
