/**
 * Integration test: Full end-to-end demo flow via API endpoint
 *
 * Tests the /api/demo/full-flow endpoint which exercises the 10-step lifecycle:
 * 1. Register Agent (HCS-10)
 * 2. Set Privacy Rules (HCS-19)
 * 3. Register Skills (HCS-26)
 * 4. Connect to Registry Broker (HOL)
 * 5. Discover Agents (Vector Search)
 * 6. Accept Connection (HCS-10)
 * 7. Delegate Task
 * 8. Feedback & Trust (HCS-20)
 * 9. KMS Signing
 * 10. ERC-8004 Dual Identity
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

describe('Full Flow E2E Integration', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('POST /api/demo/full-flow should complete all 10 steps', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.steps).toHaveLength(10);
    expect(res.body.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.started_at).toBeDefined();
    expect(res.body.completed_at).toBeDefined();
  }, 30000);

  it('should include correct phases in order', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const phases = res.body.steps.map((s: any) => s.phase);
    expect(phases).toEqual([
      'hcs-10',
      'hcs-19',
      'hcs-26',
      'hol',
      'discovery',
      'hcs-10-connect',
      'delegation',
      'hcs-20',
      'kms',
      'erc-8004',
    ]);
  });

  it('should return a summary with key metrics', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const summary = res.body.summary;
    expect(summary).toBeDefined();
    expect(summary.total_steps).toBe(10);
    expect(summary.completed_steps).toBeGreaterThanOrEqual(9);
    expect(summary.agent_registered).toBeTruthy();
  });

  it('should register an agent with identity in step 1', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const regStep = res.body.steps[0];
    expect(regStep.phase).toBe('hcs-10');
    expect(regStep.status).toBe('completed');
    expect(regStep.data.agent_id).toBeDefined();
    expect(regStep.data.agent_name).toBeDefined();
  });

  it('should set privacy rules in step 2', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const privStep = res.body.steps[1];
    expect(privStep.phase).toBe('hcs-19');
    expect(privStep.status).toBe('completed');
    expect(privStep.data.consent_id).toBeDefined();
  });

  it('should publish skills in step 3', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const skillStep = res.body.steps[2];
    expect(skillStep.phase).toBe('hcs-26');
    expect(skillStep.status).toBe('completed');
    expect(skillStep.data.count).toBeGreaterThanOrEqual(1);
  });

  it('should discover agents in step 5', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const discStep = res.body.steps[4];
    expect(discStep.phase).toBe('discovery');
    expect(discStep.status).toBe('completed');
    expect(discStep.data.total).toBeGreaterThanOrEqual(1);
  });

  it('should delegate task in step 7', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const taskStep = res.body.steps[6];
    expect(taskStep.phase).toBe('delegation');
    expect(taskStep.status).toBe('completed');
    expect(taskStep.data.task_id).toBeDefined();
  });

  it('should submit feedback with HCS-20 points in step 8', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const fbStep = res.body.steps[7];
    expect(fbStep.phase).toBe('hcs-20');
    expect(fbStep.status).toBe('completed');
    expect(fbStep.data.points_awarded).toBe(175);
    expect(fbStep.data.rating).toBe(5);
  });

  it('should include timing data for each step', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    for (const step of res.body.steps) {
      expect(step.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Demo Flow Dashboard', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('GET /demo-flow should return HTML dashboard', async () => {
    const res = await new Promise<{ status: number; contentType: string; body: string }>((resolve) => {
      const server = app.listen(0, async () => {
        const addr = server.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}/demo-flow`;
        try {
          const r = await fetch(url);
          const body = await r.text();
          resolve({
            status: r.status,
            contentType: r.headers.get('content-type') || '',
            body,
          });
        } finally {
          server.close();
        }
      });
    });

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('End-to-End Demo Flow');
    expect(res.body).toContain('Run Full Demo');
    expect(res.body).toContain('/api/demo/full-flow');
  });
});
