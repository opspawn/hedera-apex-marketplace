/**
 * Sprint 25 tests — GET /demo/record scripted demo flow.
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

describe('Sprint 25: Demo Recording Route', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /demo/record returns structured result', async () => {
    const res = await req(app, '/demo/record?pause=50');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(Array.isArray(res.body.steps)).toBe(true);
  });

  test('demo runs 5 steps', async () => {
    const res = await req(app, '/demo/record?pause=50');
    expect(res.body.steps.length).toBe(5);
  });

  test('includes all expected step names', async () => {
    const res = await req(app, '/demo/record?pause=50');
    const names = res.body.steps.map((s: any) => s.name);
    expect(names).toContain('Register Agent');
    expect(names).toContain('Discover Agents');
    expect(names).toContain('Connect Agents (HCS-10)');
    expect(names).toContain('Chat Relay Message');
    expect(names).toContain('Show Skills (HCS-26)');
  });

  test('tracks total duration', async () => {
    const res = await req(app, '/demo/record?pause=50');
    expect(typeof res.body.total_duration_ms).toBe('number');
    expect(res.body.total_duration_ms).toBeGreaterThan(0);
  });

  test('includes a summary', async () => {
    const res = await req(app, '/demo/record?pause=50');
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.total_steps).toBe('number');
  });

  test('Register step completes', async () => {
    const res = await req(app, '/demo/record?pause=50');
    const step = res.body.steps.find((s: any) => s.name === 'Register Agent');
    expect(step.status).toBe('completed');
    expect(step.data).toBeDefined();
  });

  test('Discover step completes', async () => {
    const res = await req(app, '/demo/record?pause=50');
    const step = res.body.steps.find((s: any) => s.name === 'Discover Agents');
    expect(step.status).toBe('completed');
  });

  test('respects pause parameter', async () => {
    const res = await req(app, '/demo/record?pause=100');
    expect(res.body.pause_between_steps_ms).toBe(100);
  });

  test('steps numbered sequentially', async () => {
    const res = await req(app, '/demo/record?pause=50');
    for (let i = 0; i < res.body.steps.length; i++) {
      expect(res.body.steps[i].step).toBe(i + 1);
    }
  });

  test('each step has required fields', async () => {
    const res = await req(app, '/demo/record?pause=50');
    for (const step of res.body.steps) {
      expect(step.step).toBeDefined();
      expect(step.name).toBeDefined();
      expect(step.status).toBeDefined();
      expect(step.detail).toBeDefined();
      expect(typeof step.duration_ms).toBe('number');
    }
  });

  test('step durations are non-negative', async () => {
    const res = await req(app, '/demo/record?pause=50');
    for (const step of res.body.steps) {
      expect(step.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });
});
