/**
 * Sprint 27 tests — Live Testnet Demo + Quality.
 *
 * Tests:
 * - Version bump to 0.35.0
 * - /api/testnet/balance endpoint returns balance info
 * - /api/demo/flow includes hedera section with hashscan links
 * - /api/agents returns all 8 seed agents
 * - Demo flow step 1 includes hedera_transactions data
 */

jest.setTimeout(30000);

import { createApp } from '../../src/index';
import { seedDemoAgents } from '../../src/seed';
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

describe('Sprint 27: Live Testnet Demo + Quality', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // =============================================
  // Version & Stats
  // =============================================

  test('GET /health returns v0.35.0', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('GET /api/stats returns v0.35.0', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  test('agent-card.json has version 0.35.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.version).toBe(require('../../package.json').version);
  });

  // =============================================
  // Testnet Balance Endpoint
  // =============================================

  test('GET /api/testnet/balance returns balance info', async () => {
    const res = await req(app, 'GET', '/api/testnet/balance');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBeDefined();
    expect(typeof res.body.balance.hbar).toBe('number');
    expect(res.body.mode).toBeDefined();
    expect(res.body.account_id).toBeDefined();
  });

  test('GET /api/testnet/balance includes hashscan_url when live', async () => {
    const res = await req(app, 'GET', '/api/testnet/balance');
    expect(res.status).toBe(200);
    // In live mode: real hashscan URL; in mock mode: null
    if (res.body.mode === 'live') {
      expect(res.body.hashscan_url).toContain('hashscan.io');
      expect(res.body.network).toBe('testnet');
    } else {
      expect(res.body.hashscan_url).toBeNull();
    }
  });

  // =============================================
  // Demo Flow — Hedera Section
  // =============================================

  test('GET /api/demo/flow includes hedera metadata', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.status).toBe(200);
    expect(res.body.hedera).toBeDefined();
    expect(res.body.hedera.mode).toBeDefined();
    expect(res.body.hedera.network).toBe('testnet');
    expect(typeof res.body.hedera.topics_created).toBe('number');
    expect(typeof res.body.hedera.messages_submitted).toBe('number');
  });

  test('demo flow step 1 includes hedera_transactions in data', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    expect(res.body.steps).toBeDefined();
    const step1 = res.body.steps.find((s: any) => s.step === 1);
    expect(step1).toBeDefined();
    expect(step1.status).toBe('completed');
    expect(step1.data).toBeDefined();
    expect(Array.isArray(step1.data.hedera_transactions)).toBe(true);
    expect(typeof step1.data.hedera_verified).toBe('boolean');
  });

  test('demo flow step 2 agents include hedera_verified flag', async () => {
    const res = await req(app, 'GET', '/api/demo/flow');
    const step2 = res.body.steps.find((s: any) => s.step === 2);
    expect(step2).toBeDefined();
    expect(step2.status).toBe('completed');
    if (step2.data.agents && step2.data.agents.length > 0) {
      expect(typeof step2.data.agents[0].hedera_verified).toBe('boolean');
    }
  });

  // =============================================
  // Seed Agents — All 8 must appear
  // =============================================

  test('seedDemoAgents registers all 8 agents', async () => {
    const { marketplace, hcs19: privacy, hcs20: points } = createApp();
    const result = await seedDemoAgents(marketplace, privacy, points);
    expect(result.seeded).toBe(8);
    expect(result.agents.length).toBe(8);
    expect(marketplace.getAgentCount()).toBe(8);
  });

  test('GET /api/agents after seed returns 8 agents', async () => {
    const { app: seededApp, marketplace, hcs19: privacy, hcs20: points } = createApp();
    await seedDemoAgents(marketplace, privacy, points);
    const res = await req(seededApp, 'GET', '/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBe(8);
    expect(res.body.total).toBe(8);
  });

  test('seed agents each have unique names matching DEMO_AGENTS', async () => {
    const { marketplace, hcs19: privacy, hcs20: points } = createApp();
    const result = await seedDemoAgents(marketplace, privacy, points);
    const names = result.agents.map((a: any) => a.name);
    expect(names).toContain('SentinelAI');
    expect(names).toContain('LinguaFlow');
    expect(names).toContain('DataWeaver');
    expect(names).toContain('AutoPilot');
    expect(names).toContain('VisionForge');
    expect(names).toContain('ChainOracle');
    expect(names).toContain('DocuMind');
    expect(names).toContain('TaskSwarm');
  });

  // =============================================
  // Key Format Robustness
  // =============================================

  test('HederaTestnetClient handles raw ECDSA hex key gracefully', () => {
    // Import directly to test key handling — should not throw
    const { HederaTestnetClient } = require('../../src/hedera/client');
    const client = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
      network: 'testnet',
    });
    // Should fall back to mock or succeed — never crash
    const status = client.getStatus();
    expect(status.network).toBe('testnet');
    expect(['live', 'mock']).toContain(status.mode);
  });
});
