import { createApp } from '../../src/index';
import { Express } from 'express';

// Lightweight request helper — no supertest dependency needed
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

describe('API Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /api/health returns ok', async () => {
    const res = await request(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('hedera-agent-marketplace');
  });

  test('GET /api/agents returns empty list initially', async () => {
    const res = await request(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('POST /api/agents/register creates an agent', async () => {
    const res = await request(app, 'POST', '/api/agents/register', {
      name: 'Test Agent',
      description: 'A test agent for API testing',
      skills: [{
        id: 'test',
        name: 'Test Skill',
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' },
      }],
      endpoint: 'https://test.example.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.999',
    });

    expect(res.status).toBe(201);
    expect(res.body.agent_id).toBeDefined();
    expect(res.body.name).toBe('Test Agent');
    expect(res.body.status).toBe('online');
  });

  test('POST /api/agents/register rejects invalid input', async () => {
    const res = await request(app, 'POST', '/api/agents/register', {
      name: 'Missing fields',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('GET /api/agents/:id returns 404 for non-existent', async () => {
    const res = await request(app, 'GET', '/api/agents/0.0.nonexistent');
    expect(res.status).toBe(404);
  });

  test('POST /api/privacy/consent creates consent', async () => {
    const res = await request(app, 'POST', '/api/privacy/consent', {
      agent_id: '0.0.7854018',
      purposes: ['service_delivery'],
      retention: '30d',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.purposes).toContain('service_delivery');
  });

  test('GET /.well-known/agent-card.json returns agent card', async () => {
    const res = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Hedera Agent Marketplace');
    expect(res.body.protocols).toContain('hcs-10');
  });
});
