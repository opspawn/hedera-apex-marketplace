/**
 * Sprint 26 tests — Live Hedera Testnet Integration + Demo Polish.
 *
 * Tests:
 * - Agent registration returns hedera_verified and hedera_transactions
 * - Agent detail API exposes Hedera transaction links
 * - Live stats endpoint returns Hedera metrics
 * - Demo record flow includes 7 steps (with Hedera tx + live stats)
 * - Chat message length validation
 * - Version bump to 0.28.0
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, method: string, path: string, body?: any) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const opts: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, opts);
        const data = await res.json();
        resolve({ status: res.status, body: data });
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 26: Live Hedera Testnet + Demo Polish', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // =============================================
  // Version & Stats
  // =============================================

  test('GET /health returns v0.28.0', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.version).toBe('0.28.0');
  });

  test('GET /api/stats returns v0.28.0 with hedera section', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.body.version).toBe('0.28.0');
    expect(res.body.hedera).toBeDefined();
    expect(res.body.hedera.mode).toBeDefined();
    expect(res.body.hedera.network).toBe('testnet');
    expect(typeof res.body.hedera.topicsCreated).toBe('number');
    expect(typeof res.body.hedera.messagesSubmitted).toBe('number');
  });

  test('GET /api/live-stats returns live dashboard metrics', async () => {
    const res = await req(app, 'GET', '/api/live-stats');
    expect(res.status).toBe(200);
    expect(typeof res.body.total_agents).toBe('number');
    expect(typeof res.body.total_hedera_messages).toBe('number');
    expect(typeof res.body.topics_created).toBe('number');
    expect(typeof res.body.active_connections).toBe('number');
    expect(res.body.hedera_network).toBe('testnet');
    expect(res.body.version).toBe('0.28.0');
    expect(res.body.timestamp).toBeDefined();
  });

  // =============================================
  // Agent Registration — Hedera Fields
  // =============================================

  test('POST /api/marketplace/register returns hedera_verified field', async () => {
    const res = await req(app, 'POST', '/api/marketplace/register', {
      name: 'TestAgent-' + Date.now(),
      description: 'Test agent for Hedera verification',
      endpoint: 'https://example.com/agent',
      skills: [{
        id: 'sk-test',
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
    expect(res.status).toBe(201);
    expect(res.body.agent).toBeDefined();
    expect(typeof res.body.agent.hedera_verified).toBe('boolean');
    expect(Array.isArray(res.body.agent.hedera_transactions)).toBe(true);
  });

  test('GET /api/agents/:id includes hedera_verified and hedera_transactions', async () => {
    // First register an agent
    const regRes = await req(app, 'POST', '/api/marketplace/register', {
      name: 'DetailAgent-' + Date.now(),
      description: 'Agent for detail view test',
      endpoint: 'https://example.com/agent',
      skills: [{
        id: 'sk-detail',
        name: 'detail-skill',
        description: 'Testing detail view',
        category: 'testing',
        tags: ['test'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      protocols: ['hcs-10'],
      payment_address: '0.0.test',
    });
    const agentId = regRes.body.agent.agent_id;

    const res = await req(app, 'GET', `/api/agents/${agentId}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.hedera_verified).toBe('boolean');
    expect(Array.isArray(res.body.hedera_transactions)).toBe(true);
  });

  test('GET /api/agents list includes hedera_verified flag', async () => {
    const res = await req(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
    if (res.body.agents && res.body.agents.length > 0) {
      const agent = res.body.agents[0];
      expect(typeof agent.hedera_verified).toBe('boolean');
    }
  });

  // =============================================
  // Demo Flow — 7 Steps
  // =============================================

  test('GET /demo/record includes View Hedera Transaction step', async () => {
    const res = await req(app, 'GET', '/demo/record?pause=50');
    expect(res.status).toBe(200);
    const names = res.body.steps.map((s: any) => s.name);
    expect(names).toContain('View Hedera Transaction');
  });

  test('GET /demo/record includes Live Stats Summary step', async () => {
    const res = await req(app, 'GET', '/demo/record?pause=50');
    const names = res.body.steps.map((s: any) => s.name);
    expect(names).toContain('Live Stats Summary');
  });

  test('demo record register step includes hedera_verified in data', async () => {
    const res = await req(app, 'GET', '/demo/record?pause=50');
    const step = res.body.steps.find((s: any) => s.name === 'Register Agent');
    expect(step.status).toBe('completed');
    expect(step.data).toBeDefined();
    expect(typeof step.data.hedera_verified).toBe('boolean');
  });

  // =============================================
  // Chat Validation
  // =============================================

  test('POST /api/chat/message rejects message over 10000 chars', async () => {
    const sessionRes = await req(app, 'POST', '/api/chat/session');
    const longMsg = 'a'.repeat(10001);
    const res = await req(app, 'POST', '/api/chat/message', {
      sessionId: sessionRes.body.sessionId,
      message: longMsg,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toContain('10,000');
  });

  // =============================================
  // Hedera Transaction Ref Type
  // =============================================

  test('HederaTransactionRef has correct shape when present', async () => {
    const res = await req(app, 'POST', '/api/marketplace/register', {
      name: 'TxRefAgent-' + Date.now(),
      description: 'Testing transaction ref structure',
      endpoint: 'https://example.com/agent',
      skills: [{
        id: 'sk-txref',
        name: 'txref-skill',
        description: 'Test',
        category: 'testing',
        tags: ['test'],
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 1, token: 'HBAR', unit: 'per_call' },
      }],
      protocols: ['hcs-10'],
      payment_address: '0.0.test',
    });
    const txs = res.body.agent.hedera_transactions;
    // In mock mode, there should be no transactions (onChain=false means no testnet writes)
    // But the array should still be valid
    expect(Array.isArray(txs)).toBe(true);
    for (const tx of txs) {
      expect(typeof tx.topicId).toBe('string');
      expect(typeof tx.sequenceNumber).toBe('number');
      expect(typeof tx.timestamp).toBe('string');
      expect(typeof tx.hashscanUrl).toBe('string');
      expect(typeof tx.onChain).toBe('boolean');
      expect(tx.hashscanUrl).toContain('hashscan.io');
    }
  });

  // =============================================
  // Testnet Status
  // =============================================

  test('GET /api/testnet/status returns session info', async () => {
    const res = await req(app, 'GET', '/api/testnet/status');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBeDefined();
    expect(res.body.network).toBeDefined();
    expect(res.body.session).toBeDefined();
    expect(typeof res.body.session.topicsCreated).toBe('number');
    expect(typeof res.body.session.messagesSubmitted).toBe('number');
  });

  // =============================================
  // Agent Card Version
  // =============================================

  test('agent-card.json has version 0.28.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.version).toBe('0.28.0');
  });
});
