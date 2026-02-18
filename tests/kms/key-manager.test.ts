/**
 * Sprint 45 Tests — MultiKeyManager.
 *
 * Tests for:
 * - Key creation with derivation paths
 * - Derived key creation
 * - Signing with quotas
 * - Alias resolution and signing by alias
 * - Key rotation preserving metadata
 * - Auto-rotation based on policy
 * - Agent key lookups
 * - Status and compliance reporting
 * - Quota enforcement
 * - Audit log access
 */

import { MultiKeyManager, KeyDerivationPath, KeyRotationPolicy } from '../../src/kms/key-manager';
import { createMockKMSClient } from '../../src/hedera/mock-kms-client';
import { IKMSClient } from '../../src/hedera/kms-signer';

// ==========================================
// MultiKeyManager — Basic Operations
// ==========================================

describe('MultiKeyManager — Basic Operations', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    const client = createMockKMSClient();
    manager = new MultiKeyManager(client, 'us-east-1');
  });

  test('creates a key with defaults', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    expect(keyInfo.keyId).toBeDefined();
    expect(keyInfo.publicKey.length).toBe(32);
    expect(keyInfo.keySpec).toBe('ECC_NIST_EDWARDS25519');
  });

  test('creates a key with derivation path', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      derivationPath: {
        purpose: 'agent-signing',
        agentId: 'agent-1',
        index: 0,
      },
    });

    expect(keyInfo.keyId).toBeDefined();
    const entry = manager.getEntry(keyInfo.keyId);
    expect(entry).toBeDefined();
    expect(entry!.derivationPath).toEqual({
      purpose: 'agent-signing',
      agentId: 'agent-1',
      index: 0,
    });
  });

  test('creates a key with aliases', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      aliases: ['primary-signer', 'agent-1-key'],
    });

    expect(manager.resolveAlias('primary-signer')).toBe(keyInfo.keyId);
    expect(manager.resolveAlias('agent-1-key')).toBe(keyInfo.keyId);
    expect(manager.resolveAlias('nonexistent')).toBeUndefined();
  });

  test('creates a key with custom metadata', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      metadata: { team: 'alpha', environment: 'staging' },
    });

    const entry = manager.getEntry(keyInfo.keyId);
    expect(entry!.metadata.team).toBe('alpha');
    expect(entry!.metadata.environment).toBe('staging');
  });

  test('creates a key with custom rotation policy', async () => {
    const policy: KeyRotationPolicy = {
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxSignCount: 5000,
      enabled: true,
    };

    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      rotationPolicy: policy,
    });

    const entry = manager.getEntry(keyInfo.keyId);
    expect(entry!.rotationPolicy).toEqual(policy);
  });

  test('lists all entries', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({ keySpec: 'ECC_SECG_P256K1' });
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    const entries = manager.listEntries();
    expect(entries.length).toBe(3);
  });

  test('getEntry returns undefined for unknown key', () => {
    expect(manager.getEntry('nonexistent')).toBeUndefined();
  });

  test('getKeyManager returns underlying manager', () => {
    const km = manager.getKeyManager();
    expect(km).toBeDefined();
    expect(typeof km.listKeys).toBe('function');
  });
});

// ==========================================
// MultiKeyManager — Derived Keys
// ==========================================

describe('MultiKeyManager — Derived Keys', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('creates derived key with auto-incrementing index', async () => {
    const key1 = await manager.createDerivedKey('agent-signing', 'agent-1');
    const key2 = await manager.createDerivedKey('agent-signing', 'agent-1');

    const entry1 = manager.getEntry(key1.keyId);
    const entry2 = manager.getEntry(key2.keyId);

    expect(entry1!.derivationPath!.index).toBe(0);
    expect(entry2!.derivationPath!.index).toBe(1);
  });

  test('creates derived keys for different purposes', async () => {
    await manager.createDerivedKey('agent-signing', 'agent-1');
    await manager.createDerivedKey('identity', 'agent-1');
    await manager.createDerivedKey('payment', 'agent-1');

    const signingKeys = manager.getKeysByDerivationPath('agent-signing');
    const identityKeys = manager.getKeysByDerivationPath('identity');
    const paymentKeys = manager.getKeysByDerivationPath('payment');

    expect(signingKeys.length).toBe(1);
    expect(identityKeys.length).toBe(1);
    expect(paymentKeys.length).toBe(1);
  });

  test('creates derived key with custom key spec', async () => {
    const key = await manager.createDerivedKey('payment', 'agent-1', 'ECC_SECG_P256K1');
    expect(key.keySpec).toBe('ECC_SECG_P256K1');
  });

  test('derived key gets alias from path', async () => {
    const key = await manager.createDerivedKey('agent-signing', 'agent-1');
    const resolvedId = manager.resolveAlias('agent-signing/agent-1/0');
    expect(resolvedId).toBe(key.keyId);
  });

  test('getKeysByDerivationPath filters by purpose', async () => {
    await manager.createDerivedKey('agent-signing', 'agent-1');
    await manager.createDerivedKey('agent-signing', 'agent-2');
    await manager.createDerivedKey('identity', 'agent-1');

    const signing = manager.getKeysByDerivationPath('agent-signing');
    expect(signing.length).toBe(2);
  });

  test('getKeysByDerivationPath filters by agentId', async () => {
    await manager.createDerivedKey('agent-signing', 'agent-1');
    await manager.createDerivedKey('identity', 'agent-1');
    await manager.createDerivedKey('agent-signing', 'agent-2');

    const agent1Keys = manager.getKeysByDerivationPath(undefined, 'agent-1');
    expect(agent1Keys.length).toBe(2);
  });

  test('getKeysByDerivationPath filters by both purpose and agent', async () => {
    await manager.createDerivedKey('agent-signing', 'agent-1');
    await manager.createDerivedKey('agent-signing', 'agent-2');
    await manager.createDerivedKey('identity', 'agent-1');

    const specific = manager.getKeysByDerivationPath('agent-signing', 'agent-1');
    expect(specific.length).toBe(1);
  });
});

// ==========================================
// MultiKeyManager — Signing
// ==========================================

describe('MultiKeyManager — Signing', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('signs with a managed key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const result = await manager.sign(keyInfo.keyId, new Uint8Array(32));

    expect(result.signature).toBeDefined();
    expect(result.keyId).toBe(keyInfo.keyId);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('signs by alias', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      aliases: ['my-signer'],
    });

    const result = await manager.signByAlias('my-signer', new Uint8Array(32));
    expect(result.keyId).toBe(keyInfo.keyId);
    expect(result.signature).toBeDefined();
  });

  test('signByAlias throws for unknown alias', async () => {
    await expect(
      manager.signByAlias('nonexistent-alias', new Uint8Array(32))
    ).rejects.toThrow('not found');
  });

  test('gets signer function', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const signer = manager.getSigner(keyInfo.keyId);

    expect(typeof signer).toBe('function');
    const sig = await signer(new Uint8Array(32));
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
  });

  test('sign includes txHash', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const result = await manager.sign(keyInfo.keyId, new Uint8Array(32), '0xdeadbeef');

    expect(result.signature).toBeDefined();
  });
});

// ==========================================
// MultiKeyManager — Rotation
// ==========================================

describe('MultiKeyManager — Rotation', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('rotates a key and preserves metadata', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      metadata: { team: 'alpha' },
      aliases: ['primary'],
    });

    const newKeyInfo = await manager.rotateKey(keyInfo.keyId);
    expect(newKeyInfo.keyId).not.toBe(keyInfo.keyId);

    // Old key entry should exist but be retired
    const oldEntry = manager.getEntry(keyInfo.keyId);
    expect(oldEntry!.key.status).toBe('retired');
    expect(oldEntry!.aliases.length).toBe(0); // aliases transferred

    // New key should have metadata
    const newEntry = manager.getEntry(newKeyInfo.keyId);
    expect(newEntry!.metadata.rotatedFrom).toBe(keyInfo.keyId);

    // Alias should point to new key
    expect(manager.resolveAlias('primary')).toBe(newKeyInfo.keyId);
  });

  test('rotation increments derivation path index', async () => {
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      derivationPath: { purpose: 'agent-signing', agentId: 'agent-1', index: 0 },
    });

    const newKeyInfo = await manager.rotateKey(keyInfo.keyId);
    const newEntry = manager.getEntry(newKeyInfo.keyId);

    expect(newEntry!.derivationPath!.index).toBe(1);
    expect(newEntry!.derivationPath!.purpose).toBe('agent-signing');
    expect(newEntry!.derivationPath!.agentId).toBe('agent-1');
  });

  test('throws when rotating unmanaged key', async () => {
    await expect(manager.rotateKey('unmanaged-key')).rejects.toThrow('not managed');
  });
});

// ==========================================
// MultiKeyManager — Auto-Rotation
// ==========================================

describe('MultiKeyManager — Auto-Rotation', () => {
  test('getKeysNeedingRotation returns empty when no keys need rotation', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    const needing = manager.getKeysNeedingRotation();
    expect(needing.length).toBe(0);
  });

  test('getKeysNeedingRotation detects over-signed keys', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1', {
      maxSignCount: 3,
      maxAgeMs: 99999999999,
      enabled: true,
    });

    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    // Sign 4 times (exceeds policy of 3)
    for (let i = 0; i < 4; i++) {
      await manager.sign(keyInfo.keyId, new Uint8Array(32));
    }

    const needing = manager.getKeysNeedingRotation();
    expect(needing.length).toBe(1);
    expect(needing[0].reason).toContain('Sign count');
  });

  test('autoRotate rotates keys that exceed policy', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1', {
      maxSignCount: 2,
      maxAgeMs: 99999999999,
      enabled: true,
    });

    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    for (let i = 0; i < 3; i++) {
      await manager.sign(keyInfo.keyId, new Uint8Array(32));
    }

    const rotated = await manager.autoRotate();
    expect(rotated.length).toBe(1);
    expect(rotated[0].oldKeyId).toBe(keyInfo.keyId);
    expect(rotated[0].newKeyId).toBeDefined();
  });

  test('autoRotate returns empty when nothing needs rotation', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    const rotated = await manager.autoRotate();
    expect(rotated.length).toBe(0);
  });

  test('disabled rotation policy is skipped', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
    const keyInfo = await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      rotationPolicy: { maxAgeMs: 1, maxSignCount: 1, enabled: false },
    });

    // Even with maxSignCount=1, rotation is disabled
    await manager.sign(keyInfo.keyId, new Uint8Array(32));
    await manager.sign(keyInfo.keyId, new Uint8Array(32));

    const needing = manager.getKeysNeedingRotation();
    expect(needing.length).toBe(0);
  });
});

// ==========================================
// MultiKeyManager — Quotas
// ==========================================

describe('MultiKeyManager — Quotas', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('sets and enforces quota', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    manager.setQuota(keyInfo.keyId, 3);

    // 3 signs should succeed
    await manager.sign(keyInfo.keyId, new Uint8Array(32));
    await manager.sign(keyInfo.keyId, new Uint8Array(32));
    await manager.sign(keyInfo.keyId, new Uint8Array(32));

    // 4th should fail
    await expect(
      manager.sign(keyInfo.keyId, new Uint8Array(32))
    ).rejects.toThrow('Quota exceeded');
  });

  test('signing without quota set succeeds unlimited', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    for (let i = 0; i < 10; i++) {
      await manager.sign(keyInfo.keyId, new Uint8Array(32));
    }
    // No error expected
  });
});

// ==========================================
// MultiKeyManager — Agent Keys
// ==========================================

describe('MultiKeyManager — Agent Keys', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('getAgentKeys returns keys by derivation path agent', async () => {
    await manager.createDerivedKey('agent-signing', 'agent-1');
    await manager.createDerivedKey('identity', 'agent-1');
    await manager.createDerivedKey('agent-signing', 'agent-2');

    const agent1Keys = manager.getAgentKeys('agent-1');
    expect(agent1Keys.length).toBe(2);

    const agent2Keys = manager.getAgentKeys('agent-2');
    expect(agent2Keys.length).toBe(1);
  });

  test('getAgentKeys returns empty for unknown agent', () => {
    const keys = manager.getAgentKeys('nonexistent');
    expect(keys.length).toBe(0);
  });
});

// ==========================================
// MultiKeyManager — Status & Compliance
// ==========================================

describe('MultiKeyManager — Status & Compliance', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('getStatus returns correct initial status', () => {
    const status = manager.getStatus();
    expect(status.totalManagedKeys).toBe(0);
    expect(status.activeKeys).toBe(0);
    expect(status.retiredKeys).toBe(0);
    expect(status.rotatingKeys).toBe(0);
    expect(status.pendingRotations).toBe(0);
    expect(status.quotaExceeded).toBe(0);
  });

  test('getStatus reflects created keys', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({ keySpec: 'ECC_SECG_P256K1' });

    const status = manager.getStatus();
    expect(status.totalManagedKeys).toBe(2);
    expect(status.activeKeys).toBe(2);
  });

  test('getStatus counts keys by purpose', async () => {
    await manager.createDerivedKey('agent-signing', 'a1');
    await manager.createDerivedKey('agent-signing', 'a2');
    await manager.createDerivedKey('identity', 'a1');

    const status = manager.getStatus();
    expect(status.keysByPurpose['agent-signing']).toBe(2);
    expect(status.keysByPurpose['identity']).toBe(1);
  });

  test('getStatus counts keys by region', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    const status = manager.getStatus();
    expect(status.keysByRegion['us-east-1']).toBe(2);
  });

  test('getStatus reflects retired keys after rotation', async () => {
    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.rotateKey(key.keyId);

    const status = manager.getStatus();
    expect(status.totalManagedKeys).toBe(2);
    expect(status.activeKeys).toBe(1);
    expect(status.retiredKeys).toBe(1);
  });

  test('generateComplianceReport for empty manager', () => {
    const report = manager.generateComplianceReport();
    expect(report.totalKeys).toBe(0);
    expect(report.keysWithRotationPolicy).toBe(0);
    expect(report.recommendations).toContain('No keys managed — create keys to get started');
  });

  test('generateComplianceReport with active keys', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({
      keySpec: 'ECC_NIST_EDWARDS25519',
      rotationPolicy: { maxAgeMs: 1, maxSignCount: 1, enabled: false },
    });

    const report = manager.generateComplianceReport();
    expect(report.totalKeys).toBe(2);
    expect(report.keysWithRotationPolicy).toBe(1); // one has enabled: true (default), one false
    expect(report.oldestKeyAgeMs).toBeGreaterThanOrEqual(0);
    expect(report.averageKeyAgeMs).toBeGreaterThanOrEqual(0);
    expect(report.generatedAt).toBeDefined();
  });

  test('generateComplianceReport detects overdue rotations', async () => {
    const manager2 = new MultiKeyManager(createMockKMSClient(), 'us-east-1', {
      maxSignCount: 1,
      maxAgeMs: 99999999999,
      enabled: true,
    });

    const key = await manager2.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager2.sign(key.keyId, new Uint8Array(32));
    await manager2.sign(key.keyId, new Uint8Array(32));

    const report = manager2.generateComplianceReport();
    expect(report.keysOverdueForRotation).toBe(1);
    expect(report.recommendations.some(r => r.includes('overdue'))).toBe(true);
  });

  test('generateComplianceReport tracks sign operations', async () => {
    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.sign(key.keyId, new Uint8Array(32));
    await manager.sign(key.keyId, new Uint8Array(32));

    const report = manager.generateComplianceReport();
    expect(report.totalSignOperations).toBe(2);
  });
});

// ==========================================
// MultiKeyManager — Audit Log
// ==========================================

describe('MultiKeyManager — Audit Log', () => {
  let manager: MultiKeyManager;

  beforeEach(() => {
    manager = new MultiKeyManager(createMockKMSClient(), 'us-east-1');
  });

  test('getAuditLog returns entries', async () => {
    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.sign(key.keyId, new Uint8Array(32));

    const log = manager.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
  });

  test('getAuditLog filters by keyId', async () => {
    const key1 = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const key2 = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.sign(key1.keyId, new Uint8Array(32));
    await manager.sign(key2.keyId, new Uint8Array(32));

    const log1 = manager.getAuditLog(key1.keyId);
    expect(log1.every(e => e.keyId === key1.keyId)).toBe(true);
  });

  test('getAuditLog respects limit', async () => {
    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    for (let i = 0; i < 10; i++) {
      await manager.sign(key.keyId, new Uint8Array(32));
    }

    const log = manager.getAuditLog(undefined, 3);
    expect(log.length).toBe(3);
  });
});

// ==========================================
// MultiKeyManager — Constructor Options
// ==========================================

describe('MultiKeyManager — Constructor', () => {
  test('uses default rotation policy', async () => {
    const manager = new MultiKeyManager(createMockKMSClient());
    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const entry = manager.getEntry(key.keyId);

    expect(entry!.rotationPolicy!.maxAgeMs).toBe(90 * 24 * 60 * 60 * 1000);
    expect(entry!.rotationPolicy!.maxSignCount).toBe(100000);
    expect(entry!.rotationPolicy!.enabled).toBe(true);
  });

  test('uses custom default rotation policy', async () => {
    const manager = new MultiKeyManager(createMockKMSClient(), 'eu-west-1', {
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxSignCount: 5000,
    });

    const key = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const entry = manager.getEntry(key.keyId);

    expect(entry!.rotationPolicy!.maxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(entry!.rotationPolicy!.maxSignCount).toBe(5000);
    expect(entry!.region).toBe('eu-west-1');
  });
});
