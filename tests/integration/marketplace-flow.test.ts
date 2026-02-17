/**
 * Integration test: Full marketplace flow
 * register agent → register skill → search → hire
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

describe('Full Marketplace Flow Integration', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('register agent → publish skill → search → hire → check points', async () => {
    // Step 1: Register agent via marketplace (creates HCS-10/11/14/19/26 identities)
    const regRes = await request(app, 'POST', '/api/marketplace/register', {
      name: 'Integration Test Agent',
      description: 'Agent for integration testing of full flow',
      skills: [{
        id: 'data-analysis',
        name: 'Data Analysis',
        description: 'Analyze datasets and produce insights',
        category: 'analytics',
        tags: ['data', 'analytics', 'insights'],
        input_schema: { type: 'object', properties: { dataset: { type: 'string' } } },
        output_schema: { type: 'object', properties: { report: { type: 'string' } } },
        pricing: { amount: 5, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://integration-test.example.com/a2a',
      protocols: ['a2a-v0.3', 'hcs-10'],
      payment_address: '0.0.integration',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.agent).toBeDefined();
    expect(regRes.body.identity).toBeDefined();
    expect(regRes.body.identity.did).toMatch(/^did:hedera:/);
    expect(regRes.body.profile).toBeDefined();
    expect(regRes.body.publishedSkills).toBeDefined();
    expect(regRes.body.verificationStatus).toBe('verified');

    const agentId = regRes.body.agent.agent_id;

    // Step 2: Publish additional skill manifest via HCS-26
    const skillRes = await request(app, 'POST', '/api/skills/publish', {
      name: 'integration-test-agent-skills',
      version: '1.0.0',
      description: 'Skills for integration test agent',
      author: 'Integration Test Agent',
      license: 'MIT',
      skills: [{
        name: 'Data Analysis',
        description: 'Advanced data analysis with ML',
        category: 'analytics',
        tags: ['data', 'ml', 'analytics'],
        input_schema: {},
        output_schema: {},
      }],
      tags: ['analytics', 'ml'],
    });

    expect(skillRes.status).toBe(201);
    expect(skillRes.body.topic_id).toBeDefined();
    expect(skillRes.body.status).toBe('published');

    // Step 3: Search via marketplace discover
    const searchRes = await request(app, 'GET', '/api/marketplace/discover?q=analysis');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total).toBeGreaterThanOrEqual(1);
    const found = searchRes.body.agents.find(
      (a: any) => a.agent.agent_id === agentId
    );
    expect(found).toBeDefined();
    expect(found.agent.name).toBe('Integration Test Agent');

    // Step 4: Search via skills API
    const skillSearchRes = await request(app, 'GET', '/api/skills/search?q=analytics');
    expect(skillSearchRes.status).toBe(200);
    expect(skillSearchRes.body.skills.length).toBeGreaterThanOrEqual(1);

    // Step 5: Hire the agent
    const hireRes = await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.client-integration',
      agentId,
      skillId: 'data-analysis',
      input: { dataset: 'test-dataset.csv' },
    });

    expect(hireRes.status).toBe(201);
    expect(hireRes.body.task_id).toBeDefined();
    expect(hireRes.body.status).toBe('pending');
    expect(hireRes.body.settlement).toBeDefined();

    // Step 6: Verify points were accumulated
    const pointsRes = await request(app, 'GET', `/api/v1/points/${agentId}`);
    expect(pointsRes.status).toBe(200);
    // 100 (registration) + 25 (skill_published) + 50 (task_completion) = 175
    expect(pointsRes.body.total_points).toBe(175);
    expect(pointsRes.body.entries.length).toBe(3);

    // Step 7: Check leaderboard includes this agent
    const leaderRes = await request(app, 'GET', '/api/v1/points/leaderboard');
    expect(leaderRes.status).toBe(200);
    expect(leaderRes.body.leaderboard.length).toBe(1);
    expect(leaderRes.body.total_agents).toBe(1);
    expect(leaderRes.body.total_points_awarded).toBe(175);
  });

  it('register multiple agents → discover → filter by category', async () => {
    // Register NLP agent
    const nlpRes = await request(app, 'POST', '/api/marketplace/register', {
      name: 'NLP Agent',
      description: 'Natural language processing agent',
      skills: [{
        id: 'translate',
        name: 'Translation',
        description: 'Translates text',
        category: 'nlp',
        tags: ['translate', 'language'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 2, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://nlp.example.com/a2a',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.nlp',
    });
    expect(nlpRes.status).toBe(201);

    // Register blockchain agent
    const chainRes = await request(app, 'POST', '/api/marketplace/register', {
      name: 'Chain Agent',
      description: 'Blockchain analytics agent',
      skills: [{
        id: 'audit',
        name: 'Smart Contract Audit',
        description: 'Audits smart contracts',
        category: 'blockchain',
        tags: ['audit', 'security'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 10, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://chain.example.com/a2a',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.chain',
    });
    expect(chainRes.status).toBe(201);

    // Discover all
    const allRes = await request(app, 'GET', '/api/marketplace/discover');
    expect(allRes.status).toBe(200);
    expect(allRes.body.total).toBe(2);

    // Filter by NLP category
    const nlpSearch = await request(app, 'GET', '/api/marketplace/discover?category=nlp');
    expect(nlpSearch.status).toBe(200);
    expect(nlpSearch.body.total).toBe(1);
    expect(nlpSearch.body.agents[0].agent.name).toBe('NLP Agent');

    // Filter by blockchain category
    const chainSearch = await request(app, 'GET', '/api/marketplace/discover?category=blockchain');
    expect(chainSearch.status).toBe(200);
    expect(chainSearch.body.total).toBe(1);
    expect(chainSearch.body.agents[0].agent.name).toBe('Chain Agent');
  });

  it('register agent → publish agent skills to registry → verify', async () => {
    // Register via basic /api/agents/register (which uses the shared AgentRegistry)
    const regRes = await request(app, 'POST', '/api/agents/register', {
      name: 'Skill Publisher Agent',
      description: 'Agent that publishes skills to HCS-26',
      skills: [{
        id: 'code-review',
        name: 'Code Review',
        description: 'Automated code review',
        category: 'development',
        tags: ['code', 'review'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 3, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://skill-pub.example.com/a2a',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.pub',
    });
    expect(regRes.status).toBe(201);
    const agentId = regRes.body.agent_id;

    // Publish agent skills to HCS-26 registry via /api/agents/:id/skills/publish
    const pubRes = await request(app, 'POST', `/api/agents/${agentId}/skills/publish`);
    expect(pubRes.status).toBe(201);
    expect(pubRes.body.topic_id).toBeDefined();
    expect(pubRes.body.manifest.name).toContain('skill-publisher');

    // Search for the published skill
    const searchRes = await request(app, 'GET', '/api/skills/search?q=code+review');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.skills.length).toBeGreaterThanOrEqual(1);
  });

  it('full lifecycle: register → hire → award points → check leaderboard', async () => {
    // Register two agents
    const agent1 = await request(app, 'POST', '/api/marketplace/register', {
      name: 'Agent Alpha',
      description: 'First agent',
      skills: [{
        id: 'task-a',
        name: 'Task A',
        description: 'General task A',
        category: 'general',
        tags: ['general'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://alpha.example.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.alpha',
    });
    const agent2 = await request(app, 'POST', '/api/marketplace/register', {
      name: 'Agent Beta',
      description: 'Second agent',
      skills: [{
        id: 'task-b',
        name: 'Task B',
        description: 'General task B',
        category: 'general',
        tags: ['general'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 2, token: 'HBAR', unit: 'per_call' },
      }],
      endpoint: 'https://beta.example.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.beta',
    });

    const id1 = agent1.body.agent.agent_id;
    const id2 = agent2.body.agent.agent_id;

    // Hire agent1 twice, agent2 once
    await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.client', agentId: id1, skillId: 'task-a', input: {},
    });
    await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.client', agentId: id1, skillId: 'task-a', input: {},
    });
    await request(app, 'POST', '/api/marketplace/hire', {
      clientId: '0.0.client', agentId: id2, skillId: 'task-b', input: {},
    });

    // Award additional bonus
    await request(app, 'POST', '/api/v1/points/award', {
      agentId: id2, amount: 200, reason: 'community_contribution', fromAgent: 'system',
    });

    // Check leaderboard
    const lbRes = await request(app, 'GET', '/api/v1/points/leaderboard');
    expect(lbRes.status).toBe(200);
    expect(lbRes.body.leaderboard.length).toBe(2);
    expect(lbRes.body.total_agents).toBe(2);

    // Agent1: 100 (reg) + 25 (skill) + 50 + 50 (two hires) = 225
    const a1Points = await request(app, 'GET', `/api/v1/points/${id1}`);
    expect(a1Points.body.total_points).toBe(225);

    // Agent2: 100 (reg) + 25 (skill) + 50 (hire) + 200 (bonus) = 375
    const a2Points = await request(app, 'GET', `/api/v1/points/${id2}`);
    expect(a2Points.body.total_points).toBe(375);
  });
});
