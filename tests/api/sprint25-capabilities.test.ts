/**
 * Sprint 25 — API capability and versioning tests.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, path: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 25: API Capabilities', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('agent-card includes demo-recording capability', async () => {
    const res = await req(app, '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('demo-recording');
  });

  test('agent-card includes natural-language-chat capability', async () => {
    const res = await req(app, '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('natural-language-chat');
  });

  test('agent-card has version 0.35.0', async () => {
    const res = await req(app, '/.well-known/agent-card.json');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('agent.json mirrors agent-card.json', async () => {
    const card = await req(app, '/.well-known/agent-card.json');
    const agent = await req(app, '/.well-known/agent.json');
    expect(agent.body).toEqual(card.body);
  });

  test('health endpoint shows 6 HCS standards', async () => {
    const res = await req(app, '/health');
    expect(res.body.standards).toContain('HCS-10');
    expect(res.body.standards).toContain('HCS-20');
    expect(res.body.standards).toContain('HCS-26');
    expect(res.body.standards.length).toBe(6);
  });

  test('health endpoint has uptime_seconds', async () => {
    const res = await req(app, '/health');
    expect(typeof res.body.uptime_seconds).toBe('number');
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  test('ready endpoint returns true', async () => {
    const res = await req(app, '/ready');
    expect(res.body.ready).toBe(true);
    expect(res.body.version).toBe(require('../../package.json').version);
  });
});
