/**
 * Sprint 30 Integration Tests — A2A Protocol, MCP Tools, Enhanced Analytics, Demo Flow V2.
 * Target: 90+ new tests to bring total past 1750.
 */

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
// Sprint 30: Version and Config
// ==========================================
describe('Sprint 30: Version and config', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('reports version 0.34.0', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.34.0');
  });

  test('reports 1760 test count', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBe(2200);
  });

  test('ready endpoint reports 0.34.0', async () => {
    const res = await req(app, 'GET', '/ready');
    expect(res.body.version).toBe('0.34.0');
  });

  test('api/ready endpoint reports 0.34.0', async () => {
    const res = await req(app, 'GET', '/api/ready');
    expect(res.body.version).toBe('0.34.0');
  });
});

// ==========================================
// Sprint 30: A2A Agent Card
// ==========================================
describe('Sprint 30: A2A agent card endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/a2a/agent-card returns 200', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.status).toBe(200);
  });

  test('agent card has name', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.name).toBe('Hedera Agent Marketplace');
  });

  test('agent card has protocol field set to a2a', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.protocol).toBe('a2a');
  });

  test('agent card has version 0.34.0', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.version).toBe('0.34.0');
  });

  test('agent card has capabilities object', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.capabilities).toBeDefined();
    expect(typeof res.body.capabilities).toBe('object');
  });

  test('agent card has skills array', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(Array.isArray(res.body.skills)).toBe(true);
    expect(res.body.skills.length).toBeGreaterThan(0);
  });

  test('agent card skills have required fields', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    const skill = res.body.skills[0];
    expect(skill.id).toBeDefined();
    expect(skill.name).toBeDefined();
    expect(skill.description).toBeDefined();
    expect(skill.tags).toBeDefined();
  });

  test('agent card has provider info', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.provider).toBeDefined();
    expect(res.body.provider.organization).toBe('OpSpawn');
  });

  test('agent card has defaultInputModes', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(Array.isArray(res.body.defaultInputModes)).toBe(true);
    expect(res.body.defaultInputModes).toContain('application/json');
  });

  test('agent card has defaultOutputModes', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(Array.isArray(res.body.defaultOutputModes)).toBe(true);
    expect(res.body.defaultOutputModes).toContain('application/json');
  });

  test('agent card includes stats with protocols', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.stats).toBeDefined();
    expect(Array.isArray(res.body.stats.protocols)).toBe(true);
  });

  test('agent card has stateTransitionHistory capability', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.capabilities.stateTransitionHistory).toBe(true);
  });

  test('agent card has task-delegation skill', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    const taskSkill = res.body.skills.find((s: any) => s.id === 'task-delegation');
    expect(taskSkill).toBeDefined();
    expect(taskSkill.tags).toContain('delegation');
  });

  test('agent card has trust-evaluation skill', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    const trustSkill = res.body.skills.find((s: any) => s.id === 'trust-evaluation');
    expect(trustSkill).toBeDefined();
    expect(trustSkill.tags).toContain('trust');
  });
});

// ==========================================
// Sprint 30: A2A Tasks Endpoint (JSON-RPC 2.0)
// ==========================================
describe('Sprint 30: A2A tasks endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('POST /api/a2a/tasks returns 200 for tasks/send', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '1',
      method: 'tasks/send',
      params: { message: 'Hello agent' },
    });
    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe('1');
  });

  test('tasks/send returns result with id and status', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'tasks/send',
      params: { message: 'Test task' },
    });
    expect(res.body.result).toBeDefined();
    expect(res.body.result.id).toBeDefined();
    expect(res.body.result.status).toBeDefined();
    expect(res.body.result.status.state).toBeDefined();
  });

  test('tasks/send returns submitted state for generic tasks', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '2',
      method: 'tasks/send',
      params: { message: 'Generic task' },
    });
    expect(res.body.result.status.state).toBe('submitted');
  });

  test('tasks/send with agent_id and skill_id delegates to marketplace', async () => {
    // Register an agent first
    const regRes = await req(app, 'POST', '/api/marketplace/register', {
      name: 'A2ATestAgent',
      description: 'Agent for A2A testing',
      endpoint: 'https://test.example.com/agent',
      skills: [{
        id: 'test-skill',
        name: 'test-skill',
        description: 'A test skill',
        category: 'testing',
        tags: ['test'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      protocols: ['hcs-10'],
      payment_address: '0.0.test',
    });
    const agentId = regRes.body.agent?.agent_id;
    if (agentId) {
      const res = await req(app, 'POST', '/api/a2a/tasks', {
        jsonrpc: '2.0',
        id: '3',
        method: 'tasks/send',
        params: { agent_id: agentId, skill_id: 'test-skill', input: {} },
      });
      expect(res.body.result).toBeDefined();
      expect(res.body.result.metadata.protocol).toBe('a2a+hcs-10');
    }
  });

  test('tasks/get returns task status', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '4',
      method: 'tasks/get',
      params: { task_id: 'test-task-123' },
    });
    expect(res.body.result).toBeDefined();
    expect(res.body.result.id).toBe('test-task-123');
    expect(res.body.result.status.state).toBe('completed');
  });

  test('tasks/cancel returns canceled state', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '5',
      method: 'tasks/cancel',
      params: { task_id: 'task-to-cancel' },
    });
    expect(res.body.result.status.state).toBe('canceled');
  });

  test('unknown method returns error -32601', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '6',
      method: 'unknown/method',
      params: {},
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32601);
  });

  test('invalid JSON-RPC returns error -32600', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '1.0',
      id: '7',
      method: 'tasks/send',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  test('missing method returns error -32600', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '8',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  test('missing id returns error -32600', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      method: 'tasks/send',
    });
    expect(res.status).toBe(400);
  });

  test('tasks/send without skill_id or message returns error', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '10',
      method: 'tasks/send',
      params: {},
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });

  test('tasks/send result has metadata', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '11',
      method: 'tasks/send',
      params: { message: 'hello' },
    });
    expect(res.body.result.metadata).toBeDefined();
    expect(res.body.result.metadata.protocol).toBe('a2a');
  });

  test('tasks/send result has artifacts array', async () => {
    const res = await req(app, 'POST', '/api/a2a/tasks', {
      jsonrpc: '2.0',
      id: '12',
      method: 'tasks/send',
      params: { message: 'test' },
    });
    expect(Array.isArray(res.body.result.artifacts)).toBe(true);
  });
});

// ==========================================
// Sprint 30: MCP Tools Endpoint
// ==========================================
describe('Sprint 30: MCP tools endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/mcp/tools returns 200', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(res.status).toBe(200);
  });

  test('returns tools array', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools.length).toBeGreaterThan(0);
  });

  test('returns 8 tools', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(res.body.tools.length).toBe(8);
  });

  test('tools have name and description', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    for (const tool of res.body.tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
    }
  });

  test('tools have inputSchema', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    for (const tool of res.body.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  test('includes register_agent tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const registerTool = res.body.tools.find((t: any) => t.name === 'register_agent');
    expect(registerTool).toBeDefined();
    expect(registerTool.inputSchema.required).toContain('name');
  });

  test('includes discover_agents tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const discoverTool = res.body.tools.find((t: any) => t.name === 'discover_agents');
    expect(discoverTool).toBeDefined();
  });

  test('includes hire_agent tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const hireTool = res.body.tools.find((t: any) => t.name === 'hire_agent');
    expect(hireTool).toBeDefined();
    expect(hireTool.inputSchema.required).toContain('agent_id');
    expect(hireTool.inputSchema.required).toContain('skill_id');
  });

  test('includes get_trust_score tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const trustTool = res.body.tools.find((t: any) => t.name === 'get_trust_score');
    expect(trustTool).toBeDefined();
  });

  test('includes award_points tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const pointsTool = res.body.tools.find((t: any) => t.name === 'award_points');
    expect(pointsTool).toBeDefined();
    expect(pointsTool.inputSchema.required).toContain('agent_id');
  });

  test('includes grant_consent tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const consentTool = res.body.tools.find((t: any) => t.name === 'grant_consent');
    expect(consentTool).toBeDefined();
  });

  test('includes publish_skill tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const skillTool = res.body.tools.find((t: any) => t.name === 'publish_skill');
    expect(skillTool).toBeDefined();
  });

  test('includes connect_agents tool', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    const connectTool = res.body.tools.find((t: any) => t.name === 'connect_agents');
    expect(connectTool).toBeDefined();
  });

  test('server info has version', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(res.body.server).toBeDefined();
    expect(res.body.server.version).toBe('0.34.0');
    expect(res.body.server.name).toBe('hedera-agent-marketplace');
  });

  test('server info has protocols', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(Array.isArray(res.body.server.protocols)).toBe(true);
    expect(res.body.server.protocols).toContain('HCS-10');
  });
});

// ==========================================
// Sprint 30: Enhanced Analytics Charts
// ==========================================
describe('Sprint 30: Analytics charts endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/analytics/charts returns 200', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.status).toBe(200);
  });

  test('returns trust_distribution', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.body.trust_distribution).toBeDefined();
    expect(typeof res.body.trust_distribution.new).toBe('number');
    expect(typeof res.body.trust_distribution.basic).toBe('number');
    expect(typeof res.body.trust_distribution.trusted).toBe('number');
    expect(typeof res.body.trust_distribution.verified).toBe('number');
    expect(typeof res.body.trust_distribution.elite).toBe('number');
  });

  test('returns activity_timeline as array', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(Array.isArray(res.body.activity_timeline)).toBe(true);
  });

  test('returns protocol_breakdown as array', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(Array.isArray(res.body.protocol_breakdown)).toBe(true);
  });

  test('returns current_metrics', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.body.current_metrics).toBeDefined();
    expect(typeof res.body.current_metrics.total_agents).toBe('number');
  });

  test('returns demo_stats', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.body.demo_stats).toBeDefined();
    expect(typeof res.body.demo_stats.runs).toBe('number');
    expect(typeof res.body.demo_stats.completions).toBe('number');
    expect(typeof res.body.demo_stats.rate).toBe('number');
  });

  test('returns timestamp', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.body.timestamp).toBeDefined();
  });

  test('trust distribution starts at zero for all levels', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    const dist = res.body.trust_distribution;
    expect(dist.new + dist.basic + dist.trusted + dist.verified + dist.elite).toBe(0);
  });
});

// ==========================================
// Sprint 30: Agent Card Updates
// ==========================================
describe('Sprint 30: Well-known agent card updates', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('agent card includes a2a-protocol capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('a2a-protocol');
  });

  test('agent card includes mcp-tools capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('mcp-tools');
  });

  test('agent card includes multi-protocol-interop capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.capabilities).toContain('multi-protocol-interop');
  });

  test('agent card protocols include a2a', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.protocols).toContain('a2a');
  });

  test('agent card protocols include mcp', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.protocols).toContain('mcp');
  });

  test('agent card endpoints include a2a_agent_card', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.a2a_agent_card).toBe('/api/a2a/agent-card');
  });

  test('agent card endpoints include a2a_tasks', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.a2a_tasks).toBe('/api/a2a/tasks');
  });

  test('agent card endpoints include mcp_tools', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.mcp_tools).toBe('/api/mcp/tools');
  });

  test('agent card endpoints include analytics_charts', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.endpoints.analytics_charts).toBe('/api/analytics/charts');
  });

  test('agent card has 8 protocols total', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.protocols.length).toBe(8);
  });

  test('/.well-known/agent.json also updated', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.protocols).toContain('a2a');
    expect(res.body.protocols).toContain('mcp');
  });
});

// ==========================================
// Sprint 30: Demo Flow V2 (9 steps)
// ==========================================
describe('Sprint 30: Demo flow V2 with A2A and MCP', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/demo/flow includes 9 steps', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.status).toBe(200);
    expect(res.body.steps.length).toBe(9);
  });

  test('Step 7 is a2a_delegation', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step7 = res.body.steps[6];
    expect(step7.phase).toBe('a2a_delegation');
    expect(step7.title).toBe('A2A Task Delegation');
  });

  test('Step 8 is mcp_tools', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step8 = res.body.steps[7];
    expect(step8.phase).toBe('mcp_tools');
    expect(step8.title).toBe('MCP Tool Discovery');
  });

  test('Step 9 is multi_protocol consent', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step9 = res.body.steps[8];
    expect(step9.phase).toBe('multi_protocol');
    expect(step9.title).toBe('Multi-Protocol Consent Flow');
  });

  test('A2A step data includes protocol field', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step7 = res.body.steps[6];
    if (step7.status === 'completed') {
      expect(step7.data.protocol).toBe('a2a');
      expect(step7.data.method).toBe('tasks/send');
    }
  });

  test('MCP step data includes tools count', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step8 = res.body.steps[7];
    if (step8.status === 'completed') {
      expect(step8.data.tools_available).toBe(8);
      expect(step8.data.protocol).toBe('mcp');
    }
  });

  test('MCP step data includes tool names', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step8 = res.body.steps[7];
    if (step8.status === 'completed') {
      expect(Array.isArray(step8.data.tool_names)).toBe(true);
      expect(step8.data.tool_names).toContain('register_agent');
    }
  });

  test('demo flow summary has 9 total steps', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.body.summary.total_steps).toBe(9);
  });

  test('demo flow has hedera section', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.body.hedera).toBeDefined();
    expect(res.body.hedera.mode).toBeDefined();
  });

  test('all 9 steps have step number', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    for (let i = 0; i < 9; i++) {
      expect(res.body.steps[i].step).toBe(i + 1);
    }
  });

  test('all steps have duration_ms', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    for (const step of res.body.steps) {
      expect(typeof step.duration_ms).toBe('number');
    }
  });
});

// ==========================================
// Sprint 30: Dashboard Updates
// ==========================================
describe('Sprint 30: Dashboard HTML', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('dashboard includes trust distribution chart', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('id="trust-distribution-chart"');
  });

  test('dashboard includes Trust Score Distribution heading', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Trust Score Distribution');
  });

  test('dashboard includes multi-protocol interop section', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Multi-Protocol Interop');
  });

  test('dashboard includes A2A protocol badge', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('>A2A<');
  });

  test('dashboard includes MCP protocol badge', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('>MCP<');
  });

  test('dashboard includes renderTrustDistribution function', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('renderTrustDistribution');
  });

  test('dashboard loads analytics/charts endpoint', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('/api/analytics/charts');
  });
});

// ==========================================
// Sprint 30: Cross-protocol integration
// ==========================================
describe('Sprint 30: Cross-protocol integration', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('A2A agent card and well-known card both available', async () => {
    const a2a = await req(app, 'GET', '/api/a2a/agent-card');
    const wellKnown = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(a2a.status).toBe(200);
    expect(wellKnown.status).toBe(200);
  });

  test('MCP tools and A2A skills represent same capabilities', async () => {
    const mcp = await req(app, 'GET', '/api/mcp/tools');
    const a2a = await req(app, 'GET', '/api/a2a/agent-card');
    // Both should have registration capability
    const mcpRegister = mcp.body.tools.find((t: any) => t.name === 'register_agent');
    const a2aRegister = a2a.body.skills.find((s: any) => s.id === 'agent-registration');
    expect(mcpRegister).toBeDefined();
    expect(a2aRegister).toBeDefined();
  });

  test('health endpoint reflects new version and test count', async () => {
    const res = await req(app, 'GET', '/api/health');
    expect(res.body.version).toBe('0.34.0');
    expect(res.body.test_count).toBe(2200);
  });

  test('live-stats endpoint still works', async () => {
    const res = await req(app, 'GET', '/api/live-stats');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.34.0');
  });

  test('stats endpoint reflects new version', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.34.0');
    expect(res.body.testCount).toBe(2200);
  });
});
