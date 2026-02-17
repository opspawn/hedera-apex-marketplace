/**
 * Sprint 25 tests — Homepage polish with live stats and Try Chat button.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, path: string) {
  return new Promise<{ status: number; body: any; text: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const text = await res.text();
        let body: any = {};
        try { body = JSON.parse(text); } catch {}
        resolve({ status: res.status, body, text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 25: Homepage Polish', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('homepage includes hero banner', async () => {
    const res = await req(app, '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Decentralized Agent Marketplace');
  });

  test('homepage includes Chat with Agents CTA', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Chat with Agents');
    expect(res.text).toContain('/chat');
  });

  test('homepage includes HCS standards reference', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('HCS standards');
  });

  test('stats panel shows Connections', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Connections');
  });

  test('stats panel shows Messages', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Messages');
  });

  test('stats panel shows Published Skills', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Published Skills');
  });

  test('stats panel shows Registered Agents', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Registered Agents');
  });

  test('displays version 0.34.0', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('v0.34.0');
  });

  test('includes Agent Chat link in nav', async () => {
    const res = await req(app, '/');
    expect(res.text).toContain('Agent Chat');
  });

  test('GET /health returns version 0.34.0', async () => {
    const res = await req(app, '/health');
    expect(res.body.version).toBe('0.34.0');
  });

  test('GET /health shows test_count >= 1600', async () => {
    const res = await req(app, '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(1600);
  });

  test('GET /api/stats returns version 0.34.0', async () => {
    const res = await req(app, '/api/stats');
    expect(res.body.version).toBe('0.34.0');
  });

  test('GET /api/stats shows testCount >= 1600', async () => {
    const res = await req(app, '/api/stats');
    expect(res.body.testCount).toBeGreaterThanOrEqual(1600);
  });

  test('agent-card.json lists demo-recording capability', async () => {
    const res = await req(app, '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('demo-recording');
    expect(res.body.capabilities).toContain('natural-language-chat');
  });

  test('GET /api/connections returns structured data', async () => {
    const res = await req(app, '/api/connections');
    expect(res.status).toBe(200);
    expect(typeof res.body.active).toBe('number');
    expect(typeof res.body.pending).toBe('number');
  });
});
