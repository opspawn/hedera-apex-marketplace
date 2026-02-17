/**
 * Integration test: Full end-to-end demo flow via API endpoint
 *
 * Tests the /api/demo/full-flow endpoint which exercises:
 * 1. Agent registration (HCS-19)
 * 2. Skill publishing (HCS-26)
 * 3. Agent discovery (Registry Broker)
 * 4. Agent connection (HCS-10)
 * 5. Task execution (Chat Relay)
 * 6. Feedback submission (HCS-20)
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

  it('POST /api/demo/full-flow should complete all 6 steps', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.steps).toHaveLength(6);
    expect(res.body.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.started_at).toBeDefined();
    expect(res.body.completed_at).toBeDefined();
  }, 30000);

  it('should include correct phases in order', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const phases = res.body.steps.map((s: any) => s.phase);
    expect(phases).toEqual([
      'registration',
      'skills',
      'discovery',
      'connection',
      'execution',
      'feedback',
    ]);
  });

  it('should return a summary with key metrics', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const summary = res.body.summary;
    expect(summary).toBeDefined();
    expect(summary.total_steps).toBe(6);
    expect(summary.completed_steps).toBeGreaterThanOrEqual(5);
    expect(summary.agent_registered).toBeTruthy();
    expect(summary.feedback_submitted).toBe(true);
  });

  it('should register an agent with identity in step 1', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const regStep = res.body.steps[0];
    expect(regStep.phase).toBe('registration');
    expect(regStep.status).toBe('completed');
    expect(regStep.data.agent_id).toBeDefined();
    expect(regStep.data.agent_name).toBeDefined();
  });

  it('should publish skills in step 2', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const skillStep = res.body.steps[1];
    expect(skillStep.phase).toBe('skills');
    expect(skillStep.status).toBe('completed');
    expect(skillStep.data.count).toBeGreaterThanOrEqual(1);
  });

  it('should discover agents in step 3', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const discStep = res.body.steps[2];
    expect(discStep.phase).toBe('discovery');
    expect(discStep.status).toBe('completed');
    expect(discStep.data.local_agents).toBeDefined();
  });

  it('should establish connection in step 4', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const connStep = res.body.steps[3];
    expect(connStep.phase).toBe('connection');
    expect(connStep.status).toBe('completed');
    expect(connStep.data.protocol).toBe('hcs-10');
  });

  it('should execute task in step 5', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const execStep = res.body.steps[4];
    expect(execStep.phase).toBe('execution');
    expect(execStep.status).toBe('completed');
  });

  it('should submit feedback with HCS-20 points in step 6', async () => {
    const res = await request(app, 'POST', '/api/demo/full-flow');

    const fbStep = res.body.steps[5];
    expect(fbStep.phase).toBe('feedback');
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
    expect(res.body).toContain('v0.21.0');
  });
});
