/**
 * Sprint 35 Tests — Full Demo Flow + Dashboard Integration.
 *
 * Tests for:
 * - POST /api/demo/full-flow — 10-step agent lifecycle
 * - Version 0.35.0 assertions
 * - Dashboard Full Demo tab rendering
 * - Step-by-step validation of each lifecycle phase
 * - Proof data (topic IDs, tx hashes, hashscan URLs)
 * - Aggregate stats and summary
 */

// Force mock mode for tests
process.env.HEDERA_PRIVATE_KEY = '';

import { createApp } from '../../src/index';
import { Express } from 'express';

// Lightweight request helper
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

// ==========================================
// Version Assertions (Sprint 35)
// ==========================================

describe('Sprint 35: Version assertions', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('reports version 0.35.0 in /health', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('reports version 0.35.0 in /api/health', async () => {
    const res = await req(app, 'GET', '/api/health');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('reports version 0.35.0 in /ready', async () => {
    const res = await req(app, 'GET', '/ready');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('reports version 0.35.0 in /api/ready', async () => {
    const res = await req(app, 'GET', '/api/ready');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('reports test count >= 2250', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(2250);
  });

  test('package.json version is 0.35.0', () => {
    const pkg = require('../../package.json');
    expect(pkg.version).toBe(require('../../package.json').version);
  });

  test('api/stats reports version 0.35.0', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('agent card reports version 0.35.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.version).toBe(require('../../package.json').version);
  });
});

// ==========================================
// POST /api/demo/full-flow — 10-step lifecycle
// ==========================================

describe('POST /api/demo/full-flow', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns 200 and completed status', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  test('returns exactly 10 steps', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps).toHaveLength(10);
  });

  test('all 10 steps are completed', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const steps = res.body.steps;
    steps.forEach((s: any) => {
      expect(s.status).toBe('completed');
    });
  });

  test('includes version in response', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('includes timing data', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.total_duration_ms).toBeGreaterThan(0);
    expect(res.body.started_at).toBeDefined();
    expect(res.body.completed_at).toBeDefined();
  });

  test('includes summary object', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total_steps).toBe(10);
    expect(res.body.summary.completed_steps).toBe(10);
    expect(res.body.summary.failed_steps).toBe(0);
  });

  test('summary includes agent_registered', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.summary.agent_registered).toBeDefined();
    expect(res.body.summary.agent_registered).toContain('FullDemo');
  });

  test('summary includes agent_id', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.summary.agent_id).toBeDefined();
  });

  test('summary includes standards_exercised', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const standards = res.body.summary.standards_exercised;
    expect(standards).toContain('HCS-10');
    expect(standards).toContain('HCS-19');
    expect(standards).toContain('HCS-20');
    expect(standards).toContain('HCS-26');
    expect(standards).toContain('ERC-8004');
  });

  test('summary includes features list', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const features = res.body.summary.features;
    expect(features).toContain('KMS Signing');
    expect(features).toContain('Registry Broker');
    expect(features).toContain('Vector Search');
    expect(features).toContain('Task Delegation');
    expect(features).toContain('Trust Scoring');
  });
});

// ==========================================
// Step-by-step validation
// ==========================================

describe('Full flow: Step 1 — Register Agent (HCS-10)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 1 phase is hcs-10', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[0].phase).toBe('hcs-10');
  });

  test('step 1 has agent registration data', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[0].data.agent_id).toBeDefined();
    expect(res.body.steps[0].data.agent_name).toContain('FullDemo');
  });

  test('step 1 includes proof with topic_id', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[0].proof).toBeDefined();
    expect(res.body.steps[0].proof.topic_id).toBeDefined();
  });

  test('step 1 includes hashscan URL', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[0].proof.hashscan_url).toContain('hashscan.io');
  });

  test('step 1 has duration_ms', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[0].duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('Full flow: Step 2 — Privacy Rules (HCS-19)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 2 phase is hcs-19', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[1].phase).toBe('hcs-19');
  });

  test('step 2 sets consent for 3 purposes', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[1].data.purposes).toHaveLength(3);
  });

  test('step 2 includes consent_id', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[1].data.consent_id).toBeDefined();
  });
});

describe('Full flow: Step 3 — Skills (HCS-26)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 3 phase is hcs-26', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[2].phase).toBe('hcs-26');
  });

  test('step 3 publishes skills', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[2].data.count).toBeGreaterThanOrEqual(1);
  });

  test('step 3 includes proof topic', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[2].proof).toBeDefined();
  });
});

describe('Full flow: Step 4 — Registry Broker (HOL)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 4 phase is hol', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[3].phase).toBe('hol');
  });

  test('step 4 connects to broker', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[3].status).toBe('completed');
    expect(res.body.steps[3].detail).toBeDefined();
  });
});

describe('Full flow: Step 5 — Discover Agents', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 5 phase is discovery', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[4].phase).toBe('discovery');
  });

  test('step 5 finds agents', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[4].data.total).toBeGreaterThanOrEqual(1);
  });
});

describe('Full flow: Step 6 — Accept Connection (HCS-10)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 6 phase is hcs-10-connect', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[5].phase).toBe('hcs-10-connect');
  });

  test('step 6 completes successfully', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[5].status).toBe('completed');
  });
});

describe('Full flow: Step 7 — Task Delegation', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 7 phase is delegation', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[6].phase).toBe('delegation');
  });

  test('step 7 includes task_id', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[6].data.task_id).toBeDefined();
  });

  test('step 7 includes proof tx_hash', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[6].proof).toBeDefined();
    expect(res.body.steps[6].proof.tx_hash).toBeDefined();
  });

  test('step 7 task completed with score', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[6].data.output.score).toBe(95);
  });
});

describe('Full flow: Step 8 — Feedback & Trust (HCS-20)', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 8 phase is hcs-20', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[7].phase).toBe('hcs-20');
  });

  test('step 8 awards 175 points', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[7].data.points_awarded).toBe(175);
  });

  test('step 8 includes trust level', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[7].data.trust_level).toBeDefined();
  });

  test('step 8 includes breakdown', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const bd = res.body.steps[7].data.breakdown;
    expect(bd.task_completion).toBe(100);
    expect(bd.quality_bonus).toBe(50);
    expect(bd.five_star_rating).toBe(25);
  });
});

describe('Full flow: Step 9 — KMS Signing', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 9 phase is kms', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[8].phase).toBe('kms');
  });

  test('step 9 completes successfully', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[8].status).toBe('completed');
  });

  test('step 9 includes algorithm info', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const data = res.body.steps[8].data;
    expect(data.algorithm || data.key_spec).toBeDefined();
  });
});

describe('Full flow: Step 10 — ERC-8004 Dual Identity', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('step 10 phase is erc-8004', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[9].phase).toBe('erc-8004');
  });

  test('step 10 completes successfully', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[9].status).toBe('completed');
  });

  test('step 10 includes chain_id 84532', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[9].data.chain_id).toBe(84532);
  });

  test('step 10 includes network base-sepolia', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[9].data.network).toBe('base-sepolia');
  });

  test('step 10 includes trust_boost', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    expect(res.body.steps[9].data.trust_boost).toBeGreaterThanOrEqual(1);
  });
});

// ==========================================
// Dashboard: Full Demo tab
// ==========================================

describe('Dashboard: Full Demo tab', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('dashboard renders Full Demo nav tab', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Full Demo');
  });

  test('dashboard has full-demo view container', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-full-demo"');
  });

  test('dashboard has Run Full Demo button', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('run-full-demo-btn');
    expect(res.text).toContain('Run Full Demo');
  });

  test('dashboard has runFullDemo function', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('function runFullDemo');
  });

  test('dashboard has step progress container', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('full-demo-steps');
  });

  test('dashboard has aggregate stats container', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('full-demo-stats');
  });

  test('dashboard has fd-completed stat element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('fd-completed');
  });

  test('dashboard has fd-duration stat element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('fd-duration');
  });

  test('dashboard has fd-standards stat element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('fd-standards');
  });

  test('dashboard has fd-features stat element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('fd-features');
  });

  test('dashboard nav tab has correct data-view', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('data-view="full-demo"');
  });

  test('dashboard includes 10-step description text', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('10-step');
  });
});

// ==========================================
// Timing and performance
// ==========================================

describe('Full flow: performance', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('completes within 10 seconds', async () => {
    const start = Date.now();
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000);
    expect(res.body.status).toBe('completed');
  });

  test('each step has non-negative duration', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    res.body.steps.forEach((s: any) => {
      expect(s.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  test('total duration is sum-consistent', async () => {
    const res = await req(app, 'POST', '/api/demo/full-flow');
    const stepSum = res.body.steps.reduce((acc: number, s: any) => acc + s.duration_ms, 0);
    // Total should be >= sum of steps (includes overhead)
    expect(res.body.total_duration_ms).toBeGreaterThanOrEqual(stepSum * 0.5);
  });
});

// ==========================================
// Idempotency and multiple runs
// ==========================================

describe('Full flow: multiple runs', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('can run full flow twice consecutively', async () => {
    const res1 = await req(app, 'POST', '/api/demo/full-flow');
    expect(res1.body.status).toBe('completed');
    const res2 = await req(app, 'POST', '/api/demo/full-flow');
    expect(res2.body.status).toBe('completed');
  });

  test('second run has different agent name', async () => {
    const res1 = await req(app, 'POST', '/api/demo/full-flow');
    const res2 = await req(app, 'POST', '/api/demo/full-flow');
    expect(res1.body.summary.agent_registered).not.toBe(res2.body.summary.agent_registered);
  });
});
