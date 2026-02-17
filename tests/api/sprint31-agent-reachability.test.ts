/**
 * Sprint 31 Tests — Agent Reachability, MCP Server, A2A Enhancement, HCS-10 Auto-Accept.
 * Target: 85+ new tests to bring total past 1880.
 */

// Force mock mode for tests — prevent Hedera SDK network calls
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
// Sprint 31: Version and Config
// ==========================================
describe('Sprint 31: Version and config', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('reports version 0.31.0', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.31.0');
  });

  test('reports 1880 test count', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBe(1880);
  });

  test('ready endpoint reports 0.31.0', async () => {
    const res = await req(app, 'GET', '/ready');
    expect(res.body.version).toBe('0.31.0');
  });

  test('api/ready reports 0.31.0', async () => {
    const res = await req(app, 'GET', '/api/ready');
    expect(res.body.version).toBe('0.31.0');
  });
});

// ==========================================
// Sprint 31: MCP Server — POST /mcp
// ==========================================
describe('Sprint 31: MCP Server endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('POST /mcp returns 400 for invalid JSON-RPC', async () => {
    const res = await req(app, 'POST', '/mcp', { foo: 'bar' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32600);
  });

  test('POST /mcp with missing method returns 400', async () => {
    const res = await req(app, 'POST', '/mcp', { jsonrpc: '2.0', id: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  test('POST /mcp initialize returns server info', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.serverInfo).toBeDefined();
    expect(res.body.result.serverInfo.name).toBe('hedera-agent-marketplace');
    expect(res.body.result.serverInfo.version).toBe('0.31.0');
  });

  test('POST /mcp initialize returns protocol version', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
    });
    expect(res.body.result.protocolVersion).toBe('2024-11-05');
  });

  test('POST /mcp initialize returns capabilities', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
    });
    expect(res.body.result.capabilities).toBeDefined();
    expect(res.body.result.capabilities.tools).toBeDefined();
  });

  test('POST /mcp tools/list returns tool array', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(Array.isArray(res.body.result.tools)).toBe(true);
  });

  test('POST /mcp tools/list has 5 tools', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    expect(res.body.result.tools.length).toBe(5);
  });

  test('POST /mcp tools/list includes search_agents', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('search_agents');
  });

  test('POST /mcp tools/list includes get_agent_details', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('get_agent_details');
  });

  test('POST /mcp tools/list includes register_agent', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('register_agent');
  });

  test('POST /mcp tools/list includes hire_agent', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('hire_agent');
  });

  test('POST /mcp tools/list includes get_trust_score', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('get_trust_score');
  });

  test('POST /mcp tools/list has server info', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    expect(res.body.result.server).toBeDefined();
    expect(res.body.result.server.name).toBe('hedera-agent-marketplace');
  });

  test('POST /mcp tools/list tools have inputSchema', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    for (const tool of res.body.result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  test('POST /mcp unknown method returns error', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 3, method: 'unknown/method',
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32601);
  });

  test('POST /mcp tools/call with unknown tool returns error', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32601);
  });

  test('POST /mcp tools/call search_agents returns results', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'search_agents', arguments: { q: 'test' } },
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.content).toBeDefined();
    expect(Array.isArray(res.body.result.content)).toBe(true);
  });

  test('POST /mcp tools/call search_agents content is text type', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'search_agents', arguments: {} },
    });
    expect(res.body.result.content[0].type).toBe('text');
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed).toHaveProperty('agents');
    expect(parsed).toHaveProperty('total');
  });

  test('POST /mcp tools/call get_agent_details without id returns error', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'get_agent_details', arguments: {} },
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });

  test('POST /mcp tools/call get_agent_details with missing agent returns not found', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'get_agent_details', arguments: { agent_id: 'nonexistent' } },
    });
    expect(res.body.result).toBeDefined();
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.error).toBe('Agent not found');
  });

  test('POST /mcp tools/call get_trust_score without id returns error', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'get_trust_score', arguments: {} },
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });

  test('POST /mcp tools/call get_trust_score returns trust data', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'get_trust_score', arguments: { agent_id: 'test-agent' } },
    });
    expect(res.body.result).toBeDefined();
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed).toHaveProperty('level');
  });

  test('POST /mcp tools/call hire_agent without required params returns error', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'hire_agent', arguments: {} },
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32602);
  });

  test('POST /mcp tools/call register_agent creates agent', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 9, method: 'tools/call',
      params: { name: 'register_agent', arguments: { name: 'MCP Test Agent', description: 'Test via MCP' } },
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.agent_id).toBeDefined();
    expect(parsed.name).toBe('MCP Test Agent');
    expect(parsed.status).toBe('registered');
  });

  test('POST /mcp preserves JSON-RPC id', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 'custom-id-42', method: 'initialize',
    });
    expect(res.body.id).toBe('custom-id-42');
  });

  test('POST /mcp responds with jsonrpc 2.0', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
    });
    expect(res.body.jsonrpc).toBe('2.0');
  });
});

// ==========================================
// Sprint 31: MCP Tools Discovery (existing endpoint)
// ==========================================
describe('Sprint 31: MCP tools discovery still works', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/mcp/tools returns 200', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(res.status).toBe(200);
  });

  test('GET /api/mcp/tools has tools array', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools.length).toBeGreaterThanOrEqual(5);
  });

  test('GET /api/mcp/tools has server info', async () => {
    const res = await req(app, 'GET', '/api/mcp/tools');
    expect(res.body.server).toBeDefined();
    expect(res.body.server.version).toBe('0.31.0');
  });
});

// ==========================================
// Sprint 31: A2A Agent Card — Enhanced
// ==========================================
describe('Sprint 31: Enhanced A2A agent card', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /.well-known/agent.json returns 200', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.status).toBe(200);
  });

  test('GET /.well-known/agent-card.json returns 200', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.status).toBe(200);
  });

  test('agent card has version 0.31.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.version).toBe('0.31.0');
  });

  test('agent card has reachability field', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.reachability).toBeDefined();
  });

  test('agent card reachability has mcp info', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.reachability.mcp).toBeDefined();
    expect(res.body.reachability.mcp.endpoint).toBe('/mcp');
    expect(res.body.reachability.mcp.transport).toBe('json-rpc-2.0-http');
  });

  test('agent card reachability has a2a info', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.reachability.a2a).toBeDefined();
    expect(res.body.reachability.a2a.agent_card).toBe('/.well-known/agent.json');
  });

  test('agent card reachability has hcs10 info', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.reachability.hcs10).toBeDefined();
    expect(res.body.reachability.hcs10.auto_accept).toBe(true);
    expect(res.body.reachability.hcs10.natural_language).toBe(true);
  });

  test('agent card includes mcp-server capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.capabilities).toContain('mcp-server');
  });

  test('agent card includes agent-reachability capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.capabilities).toContain('agent-reachability');
  });

  test('agent card includes auto-accept-connections capability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.capabilities).toContain('auto-accept-connections');
  });

  test('agent card endpoints includes mcp_server', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.endpoints.mcp_server).toBe('/mcp');
  });

  test('agent card endpoints includes reachability', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.endpoints.reachability).toBe('/api/reachability');
  });

  test('agent card endpoints includes chat', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.endpoints.chat).toBe('/api/chat/agent');
  });

  test('agent card has 8 protocols', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.protocols.length).toBe(8);
    expect(res.body.protocols).toContain('mcp');
    expect(res.body.protocols).toContain('a2a');
    expect(res.body.protocols).toContain('hcs-10');
  });
});

// ==========================================
// Sprint 31: A2A Agent Card API endpoint
// ==========================================
describe('Sprint 31: A2A agent card API endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/a2a/agent-card returns 200', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.status).toBe(200);
  });

  test('agent card has version 0.31.0', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.version).toBe('0.31.0');
  });

  test('agent card has skills array', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(Array.isArray(res.body.skills)).toBe(true);
    expect(res.body.skills.length).toBeGreaterThanOrEqual(4);
  });

  test('agent card has capabilities object', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.body.capabilities).toBeDefined();
  });
});

// ==========================================
// Sprint 31: Reachability API
// ==========================================
describe('Sprint 31: Reachability endpoint', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /api/reachability returns 200', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.status).toBe(200);
  });

  test('reachability has version', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.version).toBe('0.31.0');
  });

  test('reachability has protocols object', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols).toBeDefined();
  });

  test('reachability protocols has mcp', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.mcp).toBeDefined();
    expect(res.body.protocols.mcp.status).toBe('active');
    expect(res.body.protocols.mcp.endpoint).toBe('/mcp');
  });

  test('reachability mcp has transport info', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.mcp.transport).toBe('json-rpc-2.0-http');
    expect(res.body.protocols.mcp.tools_available).toBe(5);
  });

  test('reachability protocols has a2a', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.a2a).toBeDefined();
    expect(res.body.protocols.a2a.status).toBe('active');
    expect(res.body.protocols.a2a.agent_card).toBe('/.well-known/agent.json');
  });

  test('reachability a2a has tasks endpoint', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.a2a.tasks_endpoint).toBe('/api/a2a/tasks');
  });

  test('reachability protocols has hcs10', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.hcs10).toBeDefined();
  });

  test('reachability hcs10 has auto_accept true', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.hcs10.auto_accept).toBe(true);
  });

  test('reachability hcs10 has natural_language true', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.protocols.hcs10.natural_language).toBe(true);
  });

  test('reachability has connections object', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.connections).toBeDefined();
    expect(res.body.connections.active).toBeDefined();
    expect(res.body.connections.pending).toBeDefined();
  });

  test('reachability has recent_inbound array', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(Array.isArray(res.body.recent_inbound)).toBe(true);
  });

  test('reachability has summary', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.reachable_via).toBeDefined();
    expect(res.body.summary.reachable_via).toContain('MCP');
    expect(res.body.summary.reachable_via).toContain('A2A');
    expect(res.body.summary.reachable_via).toContain('HCS-10');
  });

  test('reachability summary has chat endpoint', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.summary.chat_endpoint).toBe('/api/chat/agent');
  });

  test('reachability has timestamp', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).getTime()).toBeGreaterThan(0);
  });
});

// ==========================================
// Sprint 31: Connection Handler Enhancements
// ==========================================
describe('Sprint 31: Connection handler auto-accept and NL', () => {
  test('ConnectionHandler has auto-accept enabled by default', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    expect(handler.isAutoAcceptEnabled()).toBe(true);
  });

  test('ConnectionHandler auto-accept can be disabled', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test', autoAccept: false,
    }, hcs10);
    expect(handler.isAutoAcceptEnabled()).toBe(false);
  });

  test('ConnectionHandler setAutoAccept toggles state', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    handler.setAutoAccept(false);
    expect(handler.isAutoAcceptEnabled()).toBe(false);
    handler.setAutoAccept(true);
    expect(handler.isAutoAcceptEnabled()).toBe(true);
  });

  test('ConnectionHandler getRecentInboundLog returns empty initially', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    const log = handler.getRecentInboundLog();
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBe(0);
  });

  test('ConnectionHandler getHandlerStatus includes auto_accept', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    const status = handler.getHandlerStatus();
    expect(status.auto_accept).toBe(true);
    expect(status.inbound_log_size).toBe(0);
  });

  test('ConnectionHandler getHandlerStatus includes inbound_log_size', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    const status = handler.getHandlerStatus();
    expect(typeof status.inbound_log_size).toBe('number');
  });

  test('ConnectionHandler is not running by default', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    expect(handler.isRunning()).toBe(false);
  });

  test('ConnectionHandler start and stop work', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
      pollIntervalMs: 60000,
    }, hcs10);
    handler.start();
    expect(handler.isRunning()).toBe(true);
    handler.stop();
    expect(handler.isRunning()).toBe(false);
  });

  test('ConnectionHandler getAllConnections returns empty initially', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    expect(handler.getAllConnections()).toEqual([]);
  });

  test('ConnectionHandler getPendingRequests returns empty initially', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    expect(handler.getPendingRequests()).toEqual([]);
  });

  test('ConnectionHandler getActiveConnections returns empty initially', () => {
    const { ConnectionHandler } = require('../../src/hol/connection-handler');
    const { HCS10Client } = require('../../src/hcs/hcs10-client');
    const hcs10 = new HCS10Client({
      accountId: '0.0.test', privateKey: 'test-key', network: 'testnet', registryTopicId: '0.0.123',
    });
    const handler = new ConnectionHandler({
      inboundTopicId: '0.0.100', outboundTopicId: '0.0.101', accountId: '0.0.test',
    }, hcs10);
    expect(handler.getActiveConnections()).toEqual([]);
  });
});

// ==========================================
// Sprint 31: Dashboard Reachability Tab
// ==========================================
describe('Sprint 31: Dashboard reachability view', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET / returns HTML with reachability tab', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('reachability');
  });

  test('dashboard HTML contains view-reachability div', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('view-reachability');
  });

  test('dashboard HTML mentions MCP Server in reachability', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('MCP Server');
  });

  test('dashboard HTML mentions A2A Agent Card in reachability', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('A2A Agent Card');
  });

  test('dashboard HTML mentions HCS-10 Connections in reachability', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('HCS-10 Connections');
  });

  test('dashboard HTML has loadReachability function', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('loadReachability');
  });

  test('dashboard HTML has reach-mcp-tools element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('reach-mcp-tools');
  });

  test('dashboard HTML has reach-inbound-log element', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('reach-inbound-log');
  });
});

// ==========================================
// Sprint 31: Existing endpoints still work
// ==========================================
describe('Sprint 31: Backward compatibility', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('GET /health returns ok', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/agents returns 200', async () => {
    const res = await req(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
  });

  test('GET /api/marketplace/discover returns agents', async () => {
    const res = await req(app, 'GET', '/api/marketplace/discover');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
  });

  test('GET /api/connections returns 200', async () => {
    const res = await req(app, 'GET', '/api/connections');
    expect(res.status).toBe(200);
  });

  test('GET /api/analytics returns 200', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(res.status).toBe(200);
  });

  test('GET /api/analytics/charts returns 200', async () => {
    const res = await req(app, 'GET', '/api/analytics/charts');
    expect(res.status).toBe(200);
  });
});
