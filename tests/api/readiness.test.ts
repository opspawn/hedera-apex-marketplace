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

describe('Readiness & Health Endpoints (Sprint 14)', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /ready returns ready status', async () => {
    const res = await request(app, 'GET', '/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.version).toBe('0.32.0');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /api/ready returns ready status', async () => {
    const res = await request(app, 'GET', '/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.version).toBe('0.32.0');
  });

  test('health endpoint reports updated version', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.32.0');
    expect(res.body.test_count).toBe(1950);
  });

  test('health endpoint includes uptime', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.uptime).toBeDefined();
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  test('health endpoint includes standards array', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.standards).toHaveLength(6);
    expect(res.body.standards).toContain('HCS-10');
    expect(res.body.standards).toContain('HCS-20');
    expect(res.body.standards).toContain('HCS-26');
  });

  test('health endpoint includes endpoints map', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.endpoints).toBeDefined();
    expect(res.body.endpoints.health).toBe('/health');
    expect(res.body.endpoints.agents).toBe('/api/agents');
    expect(res.body.endpoints.marketplace).toBe('/api/marketplace/discover');
  });

  test('agent-card.json has updated version', async () => {
    const res = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.32.0');
  });
});
