/**
 * Sprint 24: Dashboard testnet banner and UX polish tests.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, method: string, path: string) {
  return new Promise<{ status: number; text: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, { method });
        const text = await res.text();
        resolve({ status: res.status, text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 24: Dashboard UX Polish', () => {
  let app: Express;

  beforeAll(() => {
    ({ app } = createApp());
  });

  test('serves dashboard HTML', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  test('includes version v0.33.0', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('v0.33.0');
  });

  test('includes testnet banner', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('testnet-banner');
  });

  test('includes testnet status indicators', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('testnet-mode');
    expect(res.text).toContain('testnet-topics');
    expect(res.text).toContain('testnet-messages');
  });

  test('includes account ID display', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('0.0.7854018');
  });

  test('includes all 6 HCS standard badges', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('HCS-10');
    expect(res.text).toContain('HCS-11');
    expect(res.text).toContain('HCS-14');
    expect(res.text).toContain('HCS-19');
    expect(res.text).toContain('HCS-20');
    expect(res.text).toContain('HCS-26');
  });

  test('includes marketplace view', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('view-marketplace');
  });

  test('includes demo view', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('view-demo');
  });

  test('includes registry view', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('view-registry');
  });

  test('includes connections view', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('view-connections');
  });

  test('includes responsive styles', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('@media');
  });

  test('includes loading skeletons', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('skeleton');
  });

  test('includes toast system', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('toast-container');
  });

  test('includes category chips', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('category-chips');
  });

  test('includes stats panel', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('stat-agents');
    expect(res.text).toContain('stat-skills');
  });

  test('includes accessibility features', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('role="tablist"');
    expect(res.text).toContain('aria-label');
  });

  test('includes demo pipeline steps', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('demo-phase-1');
    expect(res.text).toContain('demo-phase-6');
  });

  test('calls loadTestnetStatus on init', async () => {
    const res = await request(app, 'GET', '/');
    expect(res.text).toContain('loadTestnetStatus');
  });
});
