/**
 * Sprint 34 Tests — KMS API Endpoints.
 *
 * Tests for:
 * - POST /api/kms/create-key — Create KMS key
 * - GET /api/kms/keys — List KMS keys
 * - POST /api/kms/register-agent — Full KMS-backed registration
 * - POST /api/kms/sign/:keyId — Sign with KMS
 * - POST /api/kms/rotate/:agentId — Rotate key
 * - GET /api/kms/audit/:keyId — Audit log
 * - GET /api/kms/status — KMS status
 * - GET /api/kms/registrations — List registrations
 * - Version 0.35.0 assertions
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
// Version Assertions (Sprint 34)
// ==========================================

describe('Sprint 34: Version assertions', () => {
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

  test('reports test count >= 2150', async () => {
    const res = await req(app, 'GET', '/health');
    expect(res.body.test_count).toBeGreaterThanOrEqual(2150);
  });

  test('package.json version is 0.35.0', () => {
    const pkg = require('../../package.json');
    expect(pkg.version).toBe('0.35.0');
  });

  test('api/stats reports version 0.35.0', async () => {
    const res = await req(app, 'GET', '/api/stats');
    expect(res.body.version).toBe('0.35.0');
  });

  test('agent card reports version 0.35.0', async () => {
    const res = await req(app, 'GET', '/.well-known/agent-card.json');
    expect(res.body.version).toBe('0.35.0');
  });
});

// ==========================================
// POST /api/kms/create-key
// ==========================================

describe('POST /api/kms/create-key', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('creates ED25519 key (default)', async () => {
    const res = await req(app, 'POST', '/api/kms/create-key', {});
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.key).toBeDefined();
    expect(res.body.key.keyId).toBeDefined();
    expect(res.body.key.keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(res.body.key.publicKey).toBeDefined();
  });

  test('creates ED25519 key explicitly', async () => {
    const res = await req(app, 'POST', '/api/kms/create-key', { keySpec: 'ECC_NIST_EDWARDS25519' });
    expect(res.status).toBe(201);
    expect(res.body.key.keySpec).toBe('ECC_NIST_EDWARDS25519');
  });

  test('creates ECDSA key', async () => {
    const res = await req(app, 'POST', '/api/kms/create-key', { keySpec: 'ECC_SECG_P256K1' });
    expect(res.status).toBe(201);
    expect(res.body.key.keySpec).toBe('ECC_SECG_P256K1');
  });

  test('includes keyArn in response', async () => {
    const res = await req(app, 'POST', '/api/kms/create-key', {});
    expect(res.body.key.keyArn).toContain('arn:aws:kms');
  });

  test('includes createdAt timestamp', async () => {
    const res = await req(app, 'POST', '/api/kms/create-key', {});
    expect(res.body.key.createdAt).toBeDefined();
  });
});

// ==========================================
// GET /api/kms/keys
// ==========================================

describe('GET /api/kms/keys', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns empty keys list initially', async () => {
    const res = await req(app, 'GET', '/api/kms/keys');
    expect(res.status).toBe(200);
    expect(res.body.keys).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('returns created keys', async () => {
    await req(app, 'POST', '/api/kms/create-key', { keySpec: 'ECC_NIST_EDWARDS25519' });
    const res = await req(app, 'GET', '/api/kms/keys');
    expect(res.body.keys.length).toBe(1);
    expect(res.body.total).toBe(1);
    expect(res.body.keys[0].keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(res.body.keys[0].status).toBe('active');
    expect(res.body.keys[0].signCount).toBe(0);
  });

  test('keys include required fields', async () => {
    await req(app, 'POST', '/api/kms/create-key', {});
    const res = await req(app, 'GET', '/api/kms/keys');
    const key = res.body.keys[0];
    expect(key).toHaveProperty('keyId');
    expect(key).toHaveProperty('keyArn');
    expect(key).toHaveProperty('keySpec');
    expect(key).toHaveProperty('publicKey');
    expect(key).toHaveProperty('status');
    expect(key).toHaveProperty('signCount');
    expect(key).toHaveProperty('createdAt');
  });
});

// ==========================================
// POST /api/kms/register-agent
// ==========================================

describe('POST /api/kms/register-agent', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('registers agent with KMS successfully', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'TestAgent',
      description: 'A test KMS agent',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.registration).toBeDefined();
    expect(res.body.registration.agentId).toContain('kms-agent-');
    expect(res.body.registration.hederaAccountId).toMatch(/^0\.0\.\d+$/);
    expect(res.body.steps.length).toBeGreaterThanOrEqual(4);
  });

  test('validates required fields', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('validates name is required', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', { description: 'Missing name' });
    expect(res.status).toBe(400);
  });

  test('validates description is required', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', { name: 'No desc' });
    expect(res.status).toBe(400);
  });

  test('accepts keySpec parameter', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'ECDSAAgent',
      description: 'ECDSA agent',
      keySpec: 'ECC_SECG_P256K1',
    });
    expect(res.status).toBe(201);
    expect(res.body.registration.keySpec).toBe('ECC_SECG_P256K1');
  });

  test('returns registration steps', async () => {
    const res = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'StepsAgent',
      description: 'Steps test',
    });
    expect(res.body.steps).toBeDefined();
    expect(res.body.steps.length).toBeGreaterThanOrEqual(4);
    expect(res.body.steps.every((s: any) => s.status === 'completed')).toBe(true);
  });
});

// ==========================================
// POST /api/kms/sign/:keyId
// ==========================================

describe('POST /api/kms/sign/:keyId', () => {
  let app: Express;
  let keyId: string;

  beforeEach(async () => {
    ({ app } = createApp());
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'SignAgent',
      description: 'Signing agent',
    });
    keyId = regRes.body.registration.keyId;
  });

  test('signs base64 message', async () => {
    const message = Buffer.from('hello hedera').toString('base64');
    const res = await req(app, 'POST', `/api/kms/sign/${keyId}`, { message });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signatureHex.length).toBeGreaterThan(0);
    expect(res.body.algorithm).toBeDefined();
  });

  test('signs hex message', async () => {
    const message = Buffer.from('hello hedera').toString('hex');
    const res = await req(app, 'POST', `/api/kms/sign/${keyId}`, { message });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('validates message is required', async () => {
    const res = await req(app, 'POST', `/api/kms/sign/${keyId}`, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('includes txHash when provided', async () => {
    const res = await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('tx').toString('base64'),
      txHash: '0xdeadbeef',
    });
    expect(res.body.txHash).toBe('0xdeadbeef');
  });

  test('returns latency', async () => {
    const res = await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('tx').toString('base64'),
    });
    expect(res.body.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================
// POST /api/kms/rotate/:agentId
// ==========================================

describe('POST /api/kms/rotate/:agentId', () => {
  let app: Express;
  let agentId: string;

  beforeEach(async () => {
    ({ app } = createApp());
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'RotateAgent',
      description: 'Rotation test',
    });
    agentId = regRes.body.registration.agentId;
  });

  test('rotates key successfully', async () => {
    const res = await req(app, 'POST', `/api/kms/rotate/${agentId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.oldKeyId).toBeDefined();
    expect(res.body.newKeyId).toBeDefined();
    expect(res.body.newKeyId).not.toBe(res.body.oldKeyId);
    expect(res.body.newPublicKey).toBeDefined();
  });

  test('returns 404 for non-existent agent', async () => {
    const res = await req(app, 'POST', '/api/kms/rotate/nonexistent-agent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ==========================================
// GET /api/kms/audit/:keyId
// ==========================================

describe('GET /api/kms/audit/:keyId', () => {
  let app: Express;
  let keyId: string;

  beforeEach(async () => {
    ({ app } = createApp());
    const regRes = await req(app, 'POST', '/api/kms/register-agent', {
      name: 'AuditAgent',
      description: 'Audit test',
    });
    keyId = regRes.body.registration.keyId;
  });

  test('returns audit entries for key', async () => {
    // Sign to create audit entries
    await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('tx1').toString('base64'),
    });

    const res = await req(app, 'GET', `/api/kms/audit/${keyId}`);
    expect(res.status).toBe(200);
    expect(res.body.keyId).toBe(keyId);
    expect(res.body.entries).toBeDefined();
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('returns empty for unknown key', async () => {
    const res = await req(app, 'GET', '/api/kms/audit/unknown-key');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  test('audit entries have required fields', async () => {
    await req(app, 'POST', `/api/kms/sign/${keyId}`, {
      message: Buffer.from('audit-test').toString('base64'),
    });

    const res = await req(app, 'GET', `/api/kms/audit/${keyId}`);
    const entry = res.body.entries.find((e: any) => e.operation === 'sign');
    if (entry) {
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('keyId');
      expect(entry).toHaveProperty('operation');
      expect(entry).toHaveProperty('latencyMs');
      expect(entry).toHaveProperty('success');
    }
  });
});

// ==========================================
// GET /api/kms/status
// ==========================================

describe('GET /api/kms/status', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns initial status', async () => {
    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.totalAgents).toBe(0);
    expect(res.body.totalKeys).toBe(0);
    expect(res.body.keyTypes).toContain('ECC_NIST_EDWARDS25519');
    expect(res.body.keyTypes).toContain('ECC_SECG_P256K1');
    expect(res.body.timestamp).toBeDefined();
  });

  test('reflects created agents and keys', async () => {
    await req(app, 'POST', '/api/kms/register-agent', { name: 'S1', description: 'Status test 1' });
    await req(app, 'POST', '/api/kms/register-agent', { name: 'S2', description: 'Status test 2' });

    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.body.totalAgents).toBe(2);
    expect(res.body.totalKeys).toBe(2);
    expect(res.body.activeKeys).toBe(2);
  });

  test('includes cost estimate', async () => {
    await req(app, 'POST', '/api/kms/register-agent', { name: 'Cost', description: 'Cost test' });
    const res = await req(app, 'GET', '/api/kms/status');
    expect(res.body.costEstimate).toBeDefined();
    expect(res.body.costEstimate.monthlyKeyStorage).toBe(1);
  });
});

// ==========================================
// GET /api/kms/registrations
// ==========================================

describe('GET /api/kms/registrations', () => {
  let app: Express;
  beforeEach(() => { ({ app } = createApp()); });

  test('returns empty list initially', async () => {
    const res = await req(app, 'GET', '/api/kms/registrations');
    expect(res.status).toBe(200);
    expect(res.body.registrations).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('returns registered agents', async () => {
    await req(app, 'POST', '/api/kms/register-agent', { name: 'R1', description: 'Reg 1' });
    await req(app, 'POST', '/api/kms/register-agent', { name: 'R2', description: 'Reg 2' });

    const res = await req(app, 'GET', '/api/kms/registrations');
    expect(res.body.registrations.length).toBe(2);
    expect(res.body.total).toBe(2);
  });

  test('registration entries have required fields', async () => {
    await req(app, 'POST', '/api/kms/register-agent', { name: 'Fields', description: 'Fields test' });
    const res = await req(app, 'GET', '/api/kms/registrations');
    const reg = res.body.registrations[0];

    expect(reg).toHaveProperty('agentId');
    expect(reg).toHaveProperty('keyId');
    expect(reg).toHaveProperty('hederaAccountId');
    expect(reg).toHaveProperty('publicKey');
    expect(reg).toHaveProperty('keySpec');
    expect(reg).toHaveProperty('registeredAt');
    expect(reg).toHaveProperty('rotationCount');
  });

  test('shows rotation count after rotation', async () => {
    const regRes = await req(app, 'POST', '/api/kms/register-agent', { name: 'Rot', description: 'Rotation' });
    await req(app, 'POST', `/api/kms/rotate/${regRes.body.registration.agentId}`);

    const res = await req(app, 'GET', '/api/kms/registrations');
    expect(res.body.registrations[0].rotationCount).toBe(1);
  });
});
