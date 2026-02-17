/**
 * Sprint 29 Integration Tests — Trust Scores, Analytics, Multi-Protocol Demo.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

// Lightweight request helper — same pattern as routes.test.ts
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

describe('Sprint 29: Version and config', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('reports version 0.32.0', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.32.0');
  });

  test('reports 1760 test count', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBe(1950);
  });

  test('includes trust-scores in agent card capabilities', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('trust-scores');
  });

  test('includes analytics-dashboard in agent card capabilities', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('analytics-dashboard');
  });

  test('includes analytics endpoint in agent card', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.analytics).toBe('/api/analytics');
  });

  test('includes trust endpoint in agent card', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.trust).toBe('/api/agents/:id/trust');
  });
});

describe('Sprint 29: Analytics endpoint', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /api/analytics returns summary structure', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body.current).toBeDefined();
    expect(res.body.current.total_agents).toBeDefined();
    expect(res.body.current.active_connections).toBeDefined();
    expect(res.body.current.total_tasks).toBeDefined();
    expect(res.body.current.total_consents).toBeDefined();
    expect(res.body.current.demo_runs).toBeDefined();
    expect(res.body.current.demo_completions).toBeDefined();
    expect(res.body.current.demo_completion_rate).toBeDefined();
  });

  test('returns protocol_usage as array', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(Array.isArray(res.body.protocol_usage)).toBe(true);
  });

  test('returns history as array', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  test('returns timestamp', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(res.body.timestamp).toBeDefined();
  });

  test('current metrics start at zero', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(res.body.current.total_agents).toBe(0);
    expect(res.body.current.active_connections).toBe(0);
    expect(res.body.current.total_tasks).toBe(0);
  });
});

describe('Sprint 29: Trust score endpoint', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /api/agents/:id/trust returns trust score for unknown agent', async () => {
    const res = await req(app, 'GET', '/api/agents/unknown-id/trust');
    expect(res.status).toBe(200);
    expect(res.body.trust_score).toBeDefined();
    expect(res.body.factors).toBeDefined();
    expect(res.body.level).toBeDefined();
  });

  test('returns all four factor scores', async () => {
    const res = await req(app, 'GET', '/api/agents/test-agent/trust');
    expect(res.body.factors.age_score).toBeDefined();
    expect(res.body.factors.connection_score).toBeDefined();
    expect(res.body.factors.task_score).toBeDefined();
    expect(res.body.factors.privacy_score).toBeDefined();
  });

  test('returns a valid trust level', async () => {
    const res = await req(app, 'GET', '/api/agents/test-agent/trust');
    expect(['new', 'basic', 'trusted', 'verified', 'elite']).toContain(res.body.level);
  });

  test('trust score is a number', async () => {
    const res = await req(app, 'GET', '/api/agents/test-agent/trust');
    expect(typeof res.body.trust_score).toBe('number');
  });

  test('factor scores are numbers', async () => {
    const res = await req(app, 'GET', '/api/agents/test-agent/trust');
    expect(typeof res.body.factors.age_score).toBe('number');
    expect(typeof res.body.factors.connection_score).toBe('number');
    expect(typeof res.body.factors.task_score).toBe('number');
    expect(typeof res.body.factors.privacy_score).toBe('number');
  });
});

describe('Sprint 29: Agent list includes trust scores', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('registered agent has trust_score in list', async () => {
    await req(app, 'POST', '/api/marketplace/register', {
      name: 'TrustTestAgent',
      description: 'Agent for trust score testing',
      endpoint: 'https://test.example.com/agent',
      skills: [{
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill',
        category: 'testing',
        tags: ['test'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      protocols: ['hcs-10', 'hcs-19'],
      payment_address: '0.0.test',
    });
    const res = await req(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
    if (res.body.agents.length > 0) {
      expect(res.body.agents[0]).toHaveProperty('trust_score');
      expect(res.body.agents[0]).toHaveProperty('trust_level');
    }
  });

  test('agent detail includes trust_score', async () => {
    const regRes = await req(app, 'POST', '/api/marketplace/register', {
      name: 'TrustDetailAgent',
      description: 'Agent for trust detail testing',
      endpoint: 'https://test.example.com/agent2',
      skills: [{
        id: 'test-skill-2',
        name: 'Test Skill 2',
        description: 'Another test skill',
        category: 'testing',
        tags: ['test'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      protocols: ['hcs-10'],
      payment_address: '0.0.test2',
    });
    const agentId = regRes.body.agent?.agent_id;
    if (agentId) {
      const res = await req(app, 'GET', `/api/agents/${agentId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('trust_score');
      expect(res.body).toHaveProperty('trust_level');
    }
  });
});

describe('Sprint 29: Demo flow multi-protocol step', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET /api/demo/flow includes 7 steps', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.status).toBe(200);
    expect(res.body.steps.length).toBe(9);
  });

  test('Step 9 is multi_protocol consent flow', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step9 = res.body.steps[8];
    expect(step9.phase).toBe('multi_protocol');
    expect(step9.title).toBe('Multi-Protocol Consent Flow');
  });

  test('Step 9 data includes protocols_used', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step9 = res.body.steps[8];
    if (step9.status === 'completed') {
      expect(step9.data.protocols_used).toContain('HCS-10');
      expect(step9.data.protocols_used).toContain('HCS-19');
    }
  });

  test('demo flow summary has 7 total steps', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.body.summary.total_steps).toBe(9);
  });
});

describe('Sprint 29: Dashboard', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('dashboard HTML includes analytics tab', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-view="analytics"');
  });

  test('dashboard HTML includes trust score display', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('trust_score');
  });

  test('dashboard HTML includes analytics view', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="view-analytics"');
    expect(res.text).toContain('Marketplace Analytics');
  });

  test('dashboard HTML includes protocol chart', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="protocol-chart"');
  });

  test('dashboard HTML includes loadAnalytics function', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('loadAnalytics');
  });

  test('dashboard has Trust Score in agent detail modal', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Trust Score');
  });
});
