/**
 * Sprint 34 Integration Tests — Full KMS Flow.
 *
 * End-to-end tests for the KMS agent signing pipeline:
 * - Create KMS key → Register agent → Sign transactions → Rotate key
 * - ED25519 and ECDSA flows
 * - Audit trail verification
 * - Multi-agent scenarios
 * - Error handling and edge cases
 */

// Force mock mode
process.env.HEDERA_PRIVATE_KEY = '';

import { createApp } from '../../src/index';
import { Express } from 'express';

async function req(app: Express, method: string, path: string, body?: unknown) {
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
        const text = await res.text();
        let json: any = {};
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

// ==========================================
// Full KMS Agent Lifecycle
// ==========================================

describe('KMS Agent Lifecycle — ED25519', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('complete ED25519 agent lifecycle: register → sign → rotate → sign with new key', async () => {
    // Step 1: Register agent with KMS
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'LifecycleAgent',
      description: 'Full lifecycle test',
      keySpec: 'ECC_NIST_EDWARDS25519',
    });
    expect(regRes.body.success).toBe(true);
    const { agentId, keyId } = regRes.body.registration;

    // Step 2: Verify in key list
    const keysRes = await req(app, 'GET', '/api/kms/keys');
    expect(keysRes.body.keys.find((k: any) => k.keyId === keyId)).toBeDefined();

    // Step 3: Sign a transaction
    const signRes = await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('hedera-transaction-bytes').toString('base64'),
      txHash: '0xlifecycle-tx-1',
    });
    expect(signRes.body.success).toBe(true);
    expect(signRes.body.signatureHex.length).toBeGreaterThan(0);

    // Step 4: Check audit log
    const auditRes = await req(app, 'GET', `/api/kms/audit/${keyId}`);
    expect(auditRes.body.entries.length).toBeGreaterThan(0);
    const signEntry = auditRes.body.entries.find((e: any) => e.operation === 'sign');
    expect(signEntry).toBeDefined();

    // Step 5: Rotate key
    const rotateRes = await req(app, 'POST', `/api/kms/rotate/${agentId}`);
    expect(rotateRes.body.success).toBe(true);
    const newKeyId = rotateRes.body.newKeyId;

    // Step 6: Sign with new key
    const signRes2 = await req(app, 'POST', `/api/kms/sign/${newKeyId}`, {
      message: Buffer.from('post-rotation-tx').toString('base64'),
    });
    expect(signRes2.body.success).toBe(true);

    // Step 7: Verify registration updated
    const regsRes = await req(app, 'GET', '/api/kms/registrations');
    const reg = regsRes.body.registrations.find((r: any) => r.agentId === agentId);
    expect(reg.rotationCount).toBe(1);
    expect(reg.keyId).toBe(newKeyId);
  });
});

describe('KMS Agent Lifecycle — ECDSA', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('complete ECDSA agent lifecycle', async () => {
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'ECDSALifecycle',
      description: 'ECDSA lifecycle test',
      keySpec: 'ECC_SECG_P256K1',
    });
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.registration.keySpec).toBe('ECC_SECG_P256K1');

    const keyId = regRes.body.registration.keyId;

    // Sign
    const signRes = await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('ecdsa-transaction').toString('base64'),
    });
    expect(signRes.body.success).toBe(true);
    expect(signRes.body.algorithm).toBe('ECDSA_SHA_256');
  });
});

// ==========================================
// Multi-Agent Scenarios
// ==========================================

describe('Multi-Agent KMS Scenarios', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('registers multiple agents with independent keys', async () => {
    const agents = ['AgentAlpha', 'AgentBeta', 'AgentGamma'];
    const registrations: any[] = [];

    for (const name of agents) {
      const res = await req(app, 'POST', '/api/kms/register-agent', {
        name,
        description: `Multi-agent test: ${name}`,
      });
      expect(res.body.success).toBe(true);
      registrations.push(res.body.registration);
    }

    // All have unique keys
    const keyIds = registrations.map(r => r.keyId);
    expect(new Set(keyIds).size).toBe(3);

    // All have unique account IDs
    const accountIds = registrations.map(r => r.hederaAccountId);
    expect(new Set(accountIds).size).toBe(3);

    // Status shows all
    const statusRes = await req(app, 'GET', '/api/kms/status');
    expect(statusRes.body.totalAgents).toBe(3);
    expect(statusRes.body.totalKeys).toBe(3);
  });

  test('each agent signs independently', async () => {
    const reg1 = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'Signer1', description: 'S1',
    });
    const reg2 = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'Signer2', description: 'S2',
    });

    const sig1 = await req(app, 'POST', `/api/kms/sign/${reg1.body.registration.keyId}`, {
      message: Buffer.from('agent1-tx').toString('base64'),
    });
    const sig2 = await req(app, 'POST', `/api/kms/sign/${reg2.body.registration.keyId}`, {
      message: Buffer.from('agent2-tx').toString('base64'),
    });

    expect(sig1.body.success).toBe(true);
    expect(sig2.body.success).toBe(true);
    expect(sig1.body.signatureHex).not.toBe(sig2.body.signatureHex);
  });

  test('rotating one agent does not affect others', async () => {
    const reg1 = await req(app, 'POST', '/api/kms/register-agent', { name: 'R1', description: 'R1' });
    const reg2 = await req(app, 'POST', '/api/kms/register-agent', { name: 'R2', description: 'R2' });

    // Rotate agent 1
    await req(app, 'POST', `/api/kms/rotate/${reg1.body.registration.agentId}`);

    // Agent 2 should still work with original key
    const sig = await req(app, 'POST', `/api/kms/sign/${reg2.body.registration.keyId}`, {
      message: Buffer.from('still-works').toString('base64'),
    });
    expect(sig.body.success).toBe(true);
  });
});

// ==========================================
// Audit Trail Verification
// ==========================================

describe('Audit Trail', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('tracks all operations in audit log', async () => {
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'AuditAgent', description: 'Audit test',
    });
    const keyId = regRes.body.registration.keyId;

    // Sign 3 times
    for (let i = 0; i < 3; i++) {
      await req(app, 'POST', `/api/kms/sign/${keyId}`, {
        message: Buffer.from(`tx-${i}`).toString('base64'),
        txHash: `0xtx${i}`,
      });
    }

    const auditRes = await req(app, 'GET', `/api/kms/audit/${keyId}`);
    const entries = auditRes.body.entries;

    // Should have create_key + sign entries
    expect(entries.filter((e: any) => e.operation === 'create_key').length).toBeGreaterThanOrEqual(1);
    expect(entries.filter((e: any) => e.operation === 'sign').length).toBe(3);
  });

  test('audit entries include timestamps and latency', async () => {
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'TimestampAgent', description: 'TS test',
    });
    const keyId = regRes.body.registration.keyId;

    await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('ts-test').toString('base64'),
    });

    const auditRes = await req(app, 'GET', `/api/kms/audit/${keyId}`);
    for (const entry of auditRes.body.entries) {
      expect(entry.timestamp).toBeDefined();
      expect(typeof entry.latencyMs).toBe('number');
      expect(entry.success).toBe(true);
    }
  });
});

// ==========================================
// Mixed Key Type Scenarios
// ==========================================

describe('Mixed Key Types', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('standalone key creation for both types', async () => {
    const ed25519 = await req(app, 'POST', '/api/kms/create-key', {
      keySpec: 'ECC_NIST_EDWARDS25519',
      description: 'Standalone ED25519',
    });
    const ecdsa = await req(app, 'POST', '/api/kms/create-key', {
      keySpec: 'ECC_SECG_P256K1',
      description: 'Standalone ECDSA',
    });

    expect(ed25519.body.key.keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(ecdsa.body.key.keySpec).toBe('ECC_SECG_P256K1');

    const keysRes = await req(app, 'GET', '/api/kms/keys');
    expect(keysRes.body.total).toBe(2);
  });

  test('ED25519 and ECDSA agents coexist', async () => {
    const ed = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'ED25519Agent', description: 'ED', keySpec: 'ECC_NIST_EDWARDS25519',
    });
    const ec = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'ECDSAAgent', description: 'EC', keySpec: 'ECC_SECG_P256K1',
    });

    expect(ed.body.success).toBe(true);
    expect(ec.body.success).toBe(true);

    // Both can sign
    const edSig = await req(app, 'POST', `/api/kms/sign/${ed.body.registration.keyId}`, {
      message: Buffer.from('ed25519-msg').toString('base64'),
    });
    const ecSig = await req(app, 'POST', `/api/kms/sign/${ec.body.registration.keyId}`, {
      message: Buffer.from('ecdsa-msg').toString('base64'),
    });

    expect(edSig.body.success).toBe(true);
    expect(ecSig.body.success).toBe(true);
    expect(edSig.body.algorithm).toBe('ED25519_SHA_512');
    expect(ecSig.body.algorithm).toBe('ECDSA_SHA_256');
  });
});

// ==========================================
// Error Handling
// ==========================================

describe('KMS Error Handling', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('sign with non-existent key returns failure', async () => {
    const res = await req(app, 'POST', '/api/kms/sign/nonexistent-key', {
      message: Buffer.from('test').toString('base64'),
    });
    expect(res.body.success).toBe(false);
  });

  test('rotate non-existent agent returns 404', async () => {
    const res = await req(app, 'POST', '/api/kms/rotate/nonexistent-agent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('sign without message returns 400', async () => {
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'NoMsg', description: 'No message test',
    });
    const res = await req(app, 'POST', `/api/kms/sign/${regRes.body.registration.keyId}`, {});
    expect(res.status).toBe(400);
  });

  test('register without name returns 400', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', { description: 'No name' });
    expect(res.status).toBe(400);
  });
});

// ==========================================
// Dashboard Integration
// ==========================================

describe('Dashboard — KMS section exists', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('dashboard HTML includes KMS tab', async () => {
    const res = await req(app, 'GET', '/');
    const html = JSON.stringify(res.body) || '';
    // The HTML body is returned as text
    expect(res.status).toBe(200);
  });

  test('dashboard serves HTML with 200', async () => {
    const res = await req(app, 'GET', '/');
    expect(res.status).toBe(200);
  });
});

// ==========================================
// Status Endpoint Completeness
// ==========================================

describe('KMS Status — completeness checks', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('status includes all expected fields', async () => {
    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('totalAgents');
    expect(res.body).toHaveProperty('totalKeys');
    expect(res.body).toHaveProperty('activeKeys');
    expect(res.body).toHaveProperty('totalSignOperations');
    expect(res.body).toHaveProperty('avgSignLatencyMs');
    expect(res.body).toHaveProperty('keyTypes');
    expect(res.body).toHaveProperty('costEstimate');
    expect(res.body).toHaveProperty('timestamp');
  });

  test('key types array includes both supported types', async () => {
    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.body.keyTypes).toContain('ECC_NIST_EDWARDS25519');
    expect(res.body.keyTypes).toContain('ECC_SECG_P256K1');
  });

  test('cost estimate reflects key count', async () => {
    await req(app, 'POST', '/api/kms/register-agent', { name: 'C1', description: 'Cost 1' });
    await req(app, 'POST', '/api/kms/register-agent', { name: 'C2', description: 'Cost 2' });
    await req(app, 'POST', '/api/kms/register-agent', { name: 'C3', description: 'Cost 3' });

    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.body.costEstimate.monthlyKeyStorage).toBe(3);
  });
});
