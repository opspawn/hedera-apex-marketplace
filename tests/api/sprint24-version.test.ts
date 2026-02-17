/**
 * Sprint 24: Version bump and health check tests.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, method: string, path: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, { method });
        const json = await res.json().catch(() => ({}));
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 24: Version and Health', () => {
  let app: Express;

  beforeAll(() => {
    ({ app } = createApp());
  });

  test('GET /health returns v0.35.0', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
  });

  test('reports test count >= 1500', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(1500);
  });

  test('lists all 6 HCS standards', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.standards).toContain('HCS-10');
    expect(res.body.standards).toContain('HCS-11');
    expect(res.body.standards).toContain('HCS-14');
    expect(res.body.standards).toContain('HCS-19');
    expect(res.body.standards).toContain('HCS-20');
    expect(res.body.standards).toContain('HCS-26');
  });

  test('includes marketplace discover endpoint', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.body.endpoints.marketplace).toBe('/api/marketplace/discover');
  });

  test('GET /api/health mirrors /health', async () => {
    const res = await request(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
  });

  test('GET /ready reports ready with v0.35.0', async () => {
    const res = await request(app, 'GET', '/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.version).toBe('0.35.0');
  });

  test('GET /.well-known/agent-card.json returns v0.35.0', async () => {
    const res = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
    expect(res.body.protocols).toContain('hcs-10');
    expect(res.body.protocols).toContain('hcs-26');
  });

  test('agent card includes discover endpoint', async () => {
    const res = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.discover).toBe('/api/marketplace/discover');
  });

  test('package.json version is 0.35.0', () => {
    const pkg = require('../../package.json');
    expect(pkg.version).toBe('0.35.0');
  });
});
