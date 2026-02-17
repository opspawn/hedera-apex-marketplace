/**
 * Sprint 35 Dashboard Tests — Full Demo Tab Integration.
 *
 * Verifies that the dashboard correctly renders the Full Demo tab,
 * including all UI elements, accessibility attributes, and interactive features.
 */

// Force mock mode for tests
process.env.HEDERA_PRIVATE_KEY = '';

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any; text: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let json: any = {};
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.status, body: json, text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 35: Dashboard Full Demo tab rendering', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('dashboard returns 200', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.status).toBe(200);
  });

  test('Full Demo tab has role=tab', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toMatch(/data-view="full-demo"[^>]*role="tab"/);
  });

  test('Full Demo tab has tabindex=0', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toMatch(/data-view="full-demo"[^>]*tabindex="0"/);
  });

  test('Full Demo view has role=tabpanel', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toMatch(/id="view-full-demo"[^>]*role="tabpanel"/);
  });

  test('dashboard includes lifecycle description', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Full Agent Lifecycle Demo');
  });

  test('button has onclick handler', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('onclick="runFullDemo()"');
  });

  test('status element present with initial text', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Ready to run');
  });

  test('references /api/demo/full-flow in script', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('/api/demo/full-flow');
  });

  test('renders step progress display area', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="full-demo-steps"');
  });

  test('renders aggregate stats area (hidden initially)', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="full-demo-stats"');
    expect(res.text).toContain('display:none');
  });

  test('has Steps Completed stat', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Steps Completed');
  });

  test('has Total Duration stat', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Total Duration');
  });

  test('has Standards Exercised stat', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Standards Exercised');
  });

  test('has Features Tested stat', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Features Tested');
  });

  test('includes all previous tabs alongside Full Demo', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('data-view="marketplace"');
    expect(res.text).toContain('data-view="registry"');
    expect(res.text).toContain('data-view="demo"');
    expect(res.text).toContain('data-view="kms"');
    expect(res.text).toContain('data-view="dual-identity"');
    expect(res.text).toContain('data-view="full-demo"');
  });
});

describe('Sprint 35: Dashboard still renders other views', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('marketplace view still present', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-marketplace"');
  });

  test('KMS view still present', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-kms"');
  });

  test('dual identity view still present', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-dual-identity"');
  });

  test('analytics view still present', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-analytics"');
  });
});
