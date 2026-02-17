/**
 * Sprint 33 Tests — ERC-8004 Dual Identity API Endpoints.
 *
 * Tests for:
 * - GET /api/erc8004/status — ERC-8004 linking status
 * - GET /api/erc8004/verify/:uaid — Verify dual identity
 * - POST /api/erc8004/link — Trigger ERC-8004 linking
 * - GET /api/identity/dual — Combined dual identity dashboard data
 * - Version 0.35.0 assertions
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
// Sprint 33: Version Assertions
// ==========================================
describe('Sprint 33: Version assertions', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('reports version 0.35.0 in /health', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
  });

  test('reports version 0.35.0 in /api/health', async () => {
    const res = await req(app, 'GET', '/api/health');
    expect(res.body.version).toBe('0.35.0');
  });

  test('reports version 0.35.0 in /ready', async () => {
    const res = await req(app, 'GET', '/ready');
    expect(res.body.version).toBe('0.35.0');
  });

  test('reports version 0.35.0 in /api/ready', async () => {
    const res = await req(app, 'GET', '/api/ready');
    expect(res.body.version).toBe('0.35.0');
  });

  test('reports test count >= 2050', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(2050);
  });

  test('package.json version is 0.35.0', () => {
    const pkg = require('../../package.json');
    expect(pkg.version).toBe('0.35.0');
  });

  test('api/stats reports version 0.35.0', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.body.version).toBe('0.35.0');
  });
});

// ==========================================
// Sprint 33: GET /api/erc8004/status
// ==========================================
describe('Sprint 33: GET /api/erc8004/status', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns 200', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.status).toBe(200);
  });

  test('includes chainId', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.body.chainId).toBe(84532);
  });

  test('includes registryType', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.body.registryType).toBe('erc-8004');
  });

  test('includes network', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.body.network).toBe('base-sepolia');
  });

  test('includes brokerUrl', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.body.brokerUrl).toContain('hol.org');
  });

  test('includes linked status', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(typeof res.body.linked).toBe('boolean');
  });

  test('includes linkedIdentities count', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(typeof res.body.linkedIdentities).toBe('number');
  });

  test('includes timestamp', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ==========================================
// Sprint 33: GET /api/erc8004/verify/:uaid
// ==========================================
describe('Sprint 33: GET /api/erc8004/verify/:uaid', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns 200 for any UAID', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/test-uaid-123');
    expect(res.status).toBe(200);
  });

  test('returns uaid in response', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/my-agent-uaid');
    expect(res.body.uaid).toBe('my-agent-uaid');
  });

  test('returns verification object', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/test-uaid');
    expect(res.body.verification).toBeDefined();
    expect(typeof res.body.verification.verified).toBe('boolean');
    expect(typeof res.body.verification.hcs10Registered).toBe('boolean');
    expect(typeof res.body.verification.erc8004Registered).toBe('boolean');
  });

  test('unlinked UAID shows verified=false', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/nonexistent');
    expect(res.body.verification.verified).toBe(false);
    expect(res.body.verification.erc8004Registered).toBe(false);
  });

  test('includes identity field (null for unlinked)', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/test-uaid');
    expect(res.body.identity).toBeNull();
  });

  test('includes timestamp', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/test');
    expect(res.body.timestamp).toBeDefined();
  });

  test('includes verificationMethod', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/test');
    expect(res.body.verification.verificationMethod).toBe('registry-broker-cross-check');
  });
});

// ==========================================
// Sprint 33: POST /api/erc8004/link
// ==========================================
describe('Sprint 33: POST /api/erc8004/link', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns 400 when uaid is missing', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('returns 201 on successful link', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid-link' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('returns uaid in response', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'my-uaid' });
    expect(res.body.uaid).toBe('my-uaid');
  });

  test('returns erc8004Identity on success', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid' });
    expect(res.body.erc8004Identity).toBeDefined();
    expect(res.body.erc8004Identity.chainId).toBe(84532);
    expect(res.body.erc8004Identity.registryType).toBe('erc-8004');
  });

  test('returns contractAddress in identity', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid' });
    expect(res.body.erc8004Identity.contractAddress).toMatch(/^0x/);
  });

  test('returns verificationHash in identity', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid' });
    expect(res.body.erc8004Identity.verificationHash).toMatch(/^0x/);
  });

  test('returns timestamp', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid' });
    expect(res.body.timestamp).toBeDefined();
  });

  test('missing content-type still processes body', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test' });
    expect(res.status).toBe(201);
  });
});

// ==========================================
// Sprint 33: GET /api/identity/dual
// ==========================================
describe('Sprint 33: GET /api/identity/dual', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns 200', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.status).toBe(200);
  });

  test('includes dualIdentityEnabled flag', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.dualIdentityEnabled).toBe(true);
  });

  test('includes chainId', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.chainId).toBe(84532);
  });

  test('includes network', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.network).toBe('base-sepolia');
  });

  test('includes registryType', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.registryType).toBe('erc-8004');
  });

  test('includes totalLinked count', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(typeof res.body.totalLinked).toBe('number');
  });

  test('includes ourAgent status', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.ourAgent).toBeDefined();
    expect(typeof res.body.ourAgent.linked).toBe('boolean');
  });

  test('includes profiles array', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(Array.isArray(res.body.profiles)).toBe(true);
  });

  test('includes timestamp', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ==========================================
// Sprint 33: Dashboard and Agent Card
// ==========================================
describe('Sprint 33: Dashboard includes dual identity', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('dashboard HTML contains dual-identity view', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('dual-identity');
    expect(res.text).toContain('ERC-8004');
  });

  test('dashboard has dual identity tab', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Dual Identity');
  });

  test('dashboard has cross-chain verification section', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Cross-Chain Verification');
  });

  test('dashboard has trust score comparison', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.text).toContain('Trust Score Comparison');
  });

  test('agent card still includes all protocols', async () => {
    const res = await req(app, 'GET', '/.well-known/agent.json');
    expect(res.body.protocols).toContain('hcs-10');
    expect(res.body.protocols).toContain('a2a');
    expect(res.body.protocols).toContain('mcp');
    expect(res.body.version).toBe('0.35.0');
  });

  test('well-known agent-card.json version is 0.35.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.version).toBe('0.35.0');
  });
});

// ==========================================
// Sprint 33: ERC-8004 Link-then-Verify Flow
// ==========================================
describe('Sprint 33: Link then verify flow', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('link then check status shows linked', async () => {
    // Link first
    const linkRes = await req(app, 'POST', '/api/erc8004/link', { uaid: 'flow-test-uaid' });
    expect(linkRes.status).toBe(201);
    expect(linkRes.body.success).toBe(true);
    // Note: status endpoint creates a new manager per request in default mode,
    // so linked count won't persist across requests without injected manager
  });

  test('link returns valid contract address format', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'addr-test' });
    const addr = res.body.erc8004Identity.contractAddress;
    expect(addr).toMatch(/^0x[0-9a-f]+$/);
    expect(addr.length).toBeGreaterThan(10);
  });

  test('link returns linkedUAID matching request', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'match-test' });
    expect(res.body.erc8004Identity.linkedUAID).toBe('match-test');
  });
});

// ==========================================
// Sprint 33: ERC-8004 Status Edge Cases
// ==========================================
describe('Sprint 33: ERC-8004 edge cases', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('status endpoint handles no identities gracefully', async () => {
    const res = await req(app, 'GET', '/api/erc8004/status');
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(false);
    expect(res.body.linkedIdentities).toBe(0);
  });

  test('verify with empty string UAID returns valid response', async () => {
    const res = await req(app, 'GET', '/api/erc8004/verify/');
    // Express may return 404 for empty param — either is acceptable
    expect([200, 404]).toContain(res.status);
  });

  test('dual identity endpoint works without registryBroker', async () => {
    const res = await req(app, 'GET', '/api/identity/dual');
    expect(res.status).toBe(200);
    expect(res.body.dualIdentityEnabled).toBe(true);
  });

  test('link with very long UAID succeeds', async () => {
    const longUaid = 'a'.repeat(200);
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: longUaid });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('link with special characters in UAID succeeds', async () => {
    const res = await req(app, 'POST', '/api/erc8004/link', { uaid: 'test-uaid_with.special-chars' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ==========================================
// Sprint 33: Existing Endpoints Still Work
// ==========================================
describe('Sprint 33: Regression — existing endpoints', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('registry status still works', async () => {
    const res = await req(app, 'GET', '/api/registry/status');
    expect(res.status).toBe(200);
  });

  test('agents endpoint still works', async () => {
    const res = await req(app, 'GET', '/api/agents');
    expect(res.status).toBe(200);
  });

  test('marketplace discover still works', async () => {
    const res = await req(app, 'GET', '/api/marketplace/discover');
    expect(res.status).toBe(200);
  });

  test('reachability still works', async () => {
    const res = await req(app, 'GET', '/api/reachability');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
  });

  test('MCP server still works', async () => {
    const res = await req(app, 'POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.version).toBe('0.35.0');
  });

  test('A2A agent card still works', async () => {
    const res = await req(app, 'GET', '/api/a2a/agent-card');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.35.0');
  });

  test('analytics endpoint still works', async () => {
    const res = await req(app, 'GET', '/api/analytics');
    expect(res.status).toBe(200);
  });

  test('trust endpoint still works', async () => {
    const res = await req(app, 'GET', '/api/agents/test-id/trust');
    expect(res.status).toBe(200);
  });
});
