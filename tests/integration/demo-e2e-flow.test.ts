/**
 * End-to-end integration test: Full demo flow from
 * seed → register → search → hire → pay → verify
 *
 * This test exercises the complete marketplace lifecycle through
 * the API layer, verifying data consistency at each step.
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

describe('End-to-End Demo Flow: seed → register → search → hire → pay → verify', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('should complete full demo lifecycle via API', async () => {
    // Phase 1: Verify initial state
    const healthBefore = await request(app, 'GET', '/health');
    expect(healthBefore.status).toBe(200);
    expect(healthBefore.body.version).toBe('0.18.0');
    expect(healthBefore.body.agents).toBe(0);

    // Phase 2: Run demo to seed agents
    const demoRun = await request(app, 'POST', '/api/demo/run');
    expect(demoRun.status).toBe(200);
    expect(demoRun.body.poll_url).toBe('/api/demo/status');

    // Wait for demo to complete
    await new Promise(r => setTimeout(r, 500));

    // Phase 3: Verify demo completed
    const demoStatus = await request(app, 'GET', '/api/demo/status');
    expect(demoStatus.body.status).toBe('completed');
    expect(demoStatus.body.version).toBe('0.18.0');

    // Phase 4: Verify steps endpoint
    const demoSteps = await request(app, 'GET', '/api/demo/steps');
    expect(demoSteps.body.total_steps).toBe(7);
    expect(demoSteps.body.summary).toBeDefined();
    expect(demoSteps.body.summary.agentsSeeded).toBe(8);

    // Phase 5: Verify agents were seeded (via marketplace discover, not /api/agents)
    const allAgents = await request(app, 'GET', '/api/marketplace/discover');
    expect(allAgents.body.total).toBe(8);
    expect(allAgents.body.agents.length).toBe(8);

    // Phase 6: Search the marketplace
    const search = await request(app, 'GET', '/api/marketplace/discover?q=security');
    expect(search.status).toBe(200);
    expect(search.body.total).toBeGreaterThan(0);

    const secAgent = search.body.agents[0];
    expect(secAgent.agent).toBeDefined();
    expect(secAgent.agent.name).toBe('SentinelAI');

    // Phase 7: Get agent profile
    const agentId = secAgent.agent.agent_id;
    const profile = await request(app, 'GET', `/api/marketplace/agent/${agentId}`);
    expect(profile.status).toBe(200);
    expect(profile.body.agent).toBeDefined();
    expect(profile.body.points).toBeDefined();

    // Phase 8: Hire the agent
    const hire = await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.e2e-test',
      agentId,
      skillId: 'smart-contract-audit',
      input: { contract_address: '0.0.12345' },
    });
    expect(hire.status).toBe(201);
    expect(hire.body.task_id).toBeDefined();
    expect(hire.body.settlement).toBeDefined();

    // Phase 9: Verify points increased after hire
    const pointsAfter = await request(app, 'GET', `/api/v1/points/${agentId}`);
    expect(pointsAfter.status).toBe(200);
    expect(pointsAfter.body.total_points).toBeGreaterThan(0);

    // Phase 10: Check leaderboard
    const leaderboard = await request(app, 'GET', '/api/v1/points/leaderboard');
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.leaderboard.length).toBe(8);
    expect(leaderboard.body.total_agents).toBe(8);

    // Phase 11: Verify A2A discovery card
    const agentCard = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(agentCard.status).toBe(200);
    expect(agentCard.body.version).toBe('0.18.0');
    expect(agentCard.body.protocols).toContain('hcs-10');
    expect(agentCard.body.protocols.length).toBe(6);
  });

  it('should register a new agent after seeding, then search for it', async () => {
    // Seed first
    await request(app, 'POST', '/api/demo/run');
    await new Promise(r => setTimeout(r, 500));

    // Register a new agent
    const regRes = await request(app, 'POST', '/api/marketplace/register', {
      name: 'E2E Test Agent',
      description: 'Agent created during e2e test',
      skills: [{
        id: 'e2e-test-skill',
        name: 'E2E Testing',
        description: 'Runs end-to-end tests',
        category: 'testing',
        tags: ['e2e', 'testing', 'qa'],
        input_schema: { type: 'object', properties: { test_suite: { type: 'string' } } },
        output_schema: { type: 'object', properties: { passed: { type: 'number' }, failed: { type: 'number' } } },
        pricing: { amount: 3, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://e2e-test.example.com/a2a',
      protocols: ['a2a-v0.3', 'hcs-10'],
      payment_address: '0.0.e2e-test',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.agent).toBeDefined();
    const newAgentId = regRes.body.agent.agent_id;

    // Total should now be 9 (8 seeded + 1 new)
    const agents = await request(app, 'GET', '/api/marketplace/discover');
    expect(agents.body.total).toBe(9);

    // Search for the new agent
    const search = await request(app, 'GET', '/api/marketplace/discover?q=e2e');
    expect(search.body.total).toBeGreaterThanOrEqual(1);
    const found = search.body.agents.find((a: any) => a.agent.agent_id === newAgentId);
    expect(found).toBeDefined();
    expect(found.agent.name).toBe('E2E Test Agent');

    // Hire the new agent
    const hire = await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.e2e-client',
      agentId: newAgentId,
      skillId: 'e2e-test-skill',
      input: { test_suite: 'regression' },
    });
    expect(hire.status).toBe(201);

    // Verify points
    const points = await request(app, 'GET', `/api/v1/points/${newAgentId}`);
    expect(points.body.total_points).toBeGreaterThan(0);
  });

  it('should handle multiple hires and track points correctly', async () => {
    // Seed marketplace
    await request(app, 'POST', '/api/demo/run');
    await new Promise(r => setTimeout(r, 500));

    // Get an agent (from marketplace, which has the seeded agents)
    const agents = await request(app, 'GET', '/api/marketplace/discover');
    const agent = agents.body.agents[0].agent;
    const agentId = agent.agent_id;

    // Get initial points
    const pointsBefore = await request(app, 'GET', `/api/v1/points/${agentId}`);
    const initialPoints = pointsBefore.body.total_points;

    // Hire 3 times
    for (let i = 0; i < 3; i++) {
      await request(app, 'POST', '/api/marketplace/hire', {
        clientId: `0.0.client-${i}`,
        agentId,
        skillId: agent.skills[0].id,
        input: { iteration: i },
      });
    }

    // Verify points increased by 150 (3 hires * 50 points each)
    const pointsAfter = await request(app, 'GET', `/api/v1/points/${agentId}`);
    expect(pointsAfter.body.total_points).toBe(initialPoints + 150);
  });

  it('should maintain data consistency between demo steps and API state', async () => {
    // Run demo
    await request(app, 'POST', '/api/demo/run');
    await new Promise(r => setTimeout(r, 500));

    // Get demo steps
    const steps = await request(app, 'GET', '/api/demo/steps');
    expect(steps.body.status).toBe('completed');

    const seedStep = steps.body.steps.find((s: any) => s.type === 'seed');
    const hireStep = steps.body.steps.find((s: any) => s.type === 'hire');
    const pointsStep = steps.body.steps.find((s: any) => s.type === 'points');

    // Verify seed data matches API (marketplace discover, not /api/agents)
    const agents = await request(app, 'GET', '/api/marketplace/discover');
    expect(agents.body.total).toBe(seedStep.data.total);

    // Verify hire task exists
    expect(hireStep.data.taskId).toBeTruthy();

    // Verify points were actually awarded
    expect(pointsStep.data.pointsAwarded).toBe(150);
  });
});

describe('Demo Error Handling via API', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('should handle second demo run while first is running', async () => {
    const run1 = request(app, 'POST', '/api/demo/run');
    // Don't await — start second run immediately
    const run2Promise = new Promise<any>(resolve => setTimeout(async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      resolve(res);
    }, 50));

    const [res1, res2] = await Promise.all([run1, run2Promise]);
    // Both should succeed (second should report already running)
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('should return 400 for hire with missing fields', async () => {
    const res = await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.test',
      // Missing agentId and skillId
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should return 400 for register with missing fields', async () => {
    const res = await request(app, 'POST', '/api/marketplace/register', {
      name: 'Incomplete Agent',
      // Missing description, skills, endpoint
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should return 400 for register with no skills', async () => {
    const res = await request(app, 'POST', '/api/marketplace/register', {
      name: 'No Skills Agent',
      description: 'Agent with no skills',
      endpoint: 'https://test.com',
      skills: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should return 404 for non-existent agent profile', async () => {
    const res = await request(app, 'GET', '/api/marketplace/agent/non-existent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
