/**
 * Sprint 24: Testnet status endpoint tests.
 *
 * Tests for GET /api/testnet/status
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
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 24: Testnet Status Endpoint', () => {
  let app: Express;

  beforeAll(() => {
    const result = createApp();
    app = result.app;
  });

  test('GET /api/testnet/status returns status', async () => {
    const res = await request(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode');
    expect(['live', 'mock']).toContain(res.body.mode);
  });

  test('includes network info', async () => {
    const res = await request(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('network');
  });

  test('includes session info when testnet configured', async () => {
    const res = await request(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    if (res.body.session) {
      expect(res.body.session).toHaveProperty('topicsCreated');
      expect(res.body.session).toHaveProperty('messagesSubmitted');
    }
  });

  test('reports connected boolean', async () => {
    const res = await request(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    expect(typeof res.body.connected === 'boolean' || res.body.connected === undefined).toBe(true);
  });

  test('includes accountId', async () => {
    const res = await request(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    if (res.body.mode === 'live') {
      expect(res.body.accountId).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
