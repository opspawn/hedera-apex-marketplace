/**
 * API endpoint tests for HCS-26 skill routes.
 * Tests publish, search, and lookup of skills via REST API.
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

const validManifest = {
  name: 'test-skill-manifest',
  version: '1.0.0',
  description: 'A test skill manifest for API testing',
  author: 'Test Author',
  license: 'MIT',
  skills: [{
    name: 'Text Analysis',
    description: 'Analyze text for sentiment',
    category: 'nlp',
    tags: ['text', 'sentiment', 'analysis'],
    input_schema: {},
    output_schema: {},
  }],
  tags: ['nlp', 'sentiment'],
};

describe('HCS-26 Skill Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('POST /api/skills/publish', () => {
    it('publishes a valid skill manifest', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', validManifest);
      expect(res.status).toBe(201);
      expect(res.body.topic_id).toBeDefined();
      expect(res.body.manifest.name).toBe('test-skill-manifest');
      expect(res.body.status).toBe('published');
      expect(res.body.published_at).toBeDefined();
    });

    it('returns topic_id in Hedera format', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', validManifest);
      expect(res.body.topic_id).toMatch(/^0\.0\.\d+$/);
    });

    it('preserves manifest metadata', async () => {
      const res = await request(app, 'POST', '/api/skills/publish', validManifest);
      expect(res.body.manifest.author).toBe('Test Author');
      expect(res.body.manifest.license).toBe('MIT');
      expect(res.body.manifest.version).toBe('1.0.0');
    });
  });

  describe('GET /api/skills/search', () => {
    it('finds published skills by name', async () => {
      await request(app, 'POST', '/api/skills/publish', validManifest);
      const res = await request(app, 'GET', '/api/skills/search?q=text+analysis');
      expect(res.status).toBe(200);
      expect(res.body.skills.length).toBeGreaterThanOrEqual(1);
    });

    it('finds skills by tag', async () => {
      await request(app, 'POST', '/api/skills/publish', validManifest);
      const res = await request(app, 'GET', '/api/skills/search?q=sentiment');
      expect(res.status).toBe(200);
      expect(res.body.skills.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for non-matching query', async () => {
      const res = await request(app, 'GET', '/api/skills/search?q=quantum-computing');
      expect(res.status).toBe(200);
      expect(res.body.skills).toEqual([]);
    });

    it('returns all skills with empty query', async () => {
      await request(app, 'POST', '/api/skills/publish', validManifest);
      const res = await request(app, 'GET', '/api/skills/search?q=');
      expect(res.status).toBe(200);
      expect(res.body.skills.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/skills/:topicId', () => {
    it('retrieves published skill by topic ID', async () => {
      const pubRes = await request(app, 'POST', '/api/skills/publish', validManifest);
      const topicId = pubRes.body.topic_id;

      const res = await request(app, 'GET', `/api/skills/${topicId}`);
      expect(res.status).toBe(200);
      expect(res.body.manifest.name).toBe('test-skill-manifest');
      expect(res.body.topic_id).toBe(topicId);
    });

    it('returns 404 for unknown topic', async () => {
      const res = await request(app, 'GET', '/api/skills/0.0.999999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  describe('POST /api/agents/:id/skills/publish', () => {
    it('publishes agent skills to HCS-26 registry', async () => {
      // First register an agent
      const regRes = await request(app, 'POST', '/api/agents/register', {
        name: 'Skill Agent',
        description: 'Agent with publishable skills',
        skills: [{
          id: 'code-gen',
          name: 'Code Generation',
          description: 'Generates code from specifications',
          category: 'development',
          tags: ['code', 'gen'],
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
          pricing: { amount: 5, token: 'HBAR', unit: 'per_call' },
        }],
        endpoint: 'https://skill-agent.example.com',
        protocols: ['a2a-v0.3'],
        payment_address: '0.0.skill',
      });
      expect(regRes.status).toBe(201);
      const agentId = regRes.body.agent_id;

      // Publish skills to registry
      const pubRes = await request(app, 'POST', `/api/agents/${agentId}/skills/publish`);
      expect(pubRes.status).toBe(201);
      expect(pubRes.body.topic_id).toBeDefined();
      expect(pubRes.body.manifest.skills.length).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent agent', async () => {
      const res = await request(app, 'POST', '/api/agents/0.0.fake/skills/publish');
      expect(res.status).toBe(404);
    });
  });
});
