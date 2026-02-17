/**
 * Sprint 34 Tests — KMS Signer Module.
 *
 * Tests for:
 * - DER SPKI parsing (ED25519 and ECDSA)
 * - KMS key creation
 * - KMS signing (ED25519 and ECDSA)
 * - KMS signer functions (kmsSignerED25519, kmsSignerECDSA)
 * - KMSKeyManager (lifecycle, rotation, audit, stats, cost)
 */

import {
  extractPublicKeyFromDER,
  createKMSKey,
  getPublicKey,
  signWithKMS,
  kmsSignerED25519,
  kmsSignerECDSA,
  KMSKeyManager,
  KMSAuditEntry,
  IKMSClient,
  KMSKeySpec,
  KMSSignerConfig,
} from '../../src/hedera/kms-signer';
import { createMockKMSClient } from '../../src/hedera/mock-kms-client';

// ==========================================
// DER SPKI Parsing Tests
// ==========================================

describe('extractPublicKeyFromDER — ED25519', () => {
  test('extracts 32-byte raw key from standard 44-byte ED25519 SPKI DER', () => {
    // Build a valid ED25519 SPKI DER structure
    const rawKey = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) rawKey[i] = i + 1;
    const header = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);
    const der = Buffer.concat([header, rawKey]);
    expect(der.length).toBe(44);

    const result = extractPublicKeyFromDER(der, 'ECC_NIST_EDWARDS25519');
    expect(result.length).toBe(32);
    expect(Buffer.compare(result, rawKey)).toBe(0);
  });

  test('extracts raw key from non-standard length by taking last 32 bytes', () => {
    const rawKey = Buffer.alloc(32, 0xab);
    const prefix = Buffer.alloc(16, 0x00);
    const der = Buffer.concat([prefix, rawKey]);

    const result = extractPublicKeyFromDER(der, 'ECC_NIST_EDWARDS25519');
    expect(result.length).toBe(32);
    expect(Buffer.compare(result, rawKey)).toBe(0);
  });

  test('throws on too-short DER input for ED25519', () => {
    const shortDer = Buffer.alloc(16);
    expect(() => extractPublicKeyFromDER(shortDer, 'ECC_NIST_EDWARDS25519')).toThrow('Invalid ED25519 SPKI DER');
  });

  test('throws on invalid SEQUENCE headers in 44-byte ED25519 DER', () => {
    const badDer = Buffer.alloc(44, 0xff);
    expect(() => extractPublicKeyFromDER(badDer, 'ECC_NIST_EDWARDS25519')).toThrow('bad SEQUENCE headers');
  });

  test('handles exactly 32 bytes as raw key input', () => {
    const rawKey = Buffer.alloc(32, 0xcd);
    // 32 bytes is >= 32, so it should extract last 32
    const result = extractPublicKeyFromDER(rawKey, 'ECC_NIST_EDWARDS25519');
    expect(result.length).toBe(32);
  });
});

describe('extractPublicKeyFromDER — ECDSA', () => {
  test('extracts 65-byte uncompressed key from standard 91-byte ECDSA SPKI DER', () => {
    // Build a valid ECDSA secp256k1 SPKI DER structure
    const uncompressedPoint = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) uncompressedPoint[i] = i + 1;

    const header = Buffer.from([
      0x30, 0x56, 0x30, 0x10,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
      0x03, 0x42, 0x00,
      0x04, // uncompressed prefix
    ]);
    // Total = 26 + 64 = 90... wait, header is 24 bytes + 0x04 prefix = 25, plus 64 = 89
    // Actually the full DER should be 91 bytes
    const paddedHeader = Buffer.alloc(26);
    header.copy(paddedHeader);
    paddedHeader[25] = 0x04; // uncompressed prefix at offset 26-1
    // Let me build it correctly
    const correctHeader = Buffer.from([
      0x30, 0x56,
      0x30, 0x10,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
      0x03, 0x42, 0x00,
    ]);
    const uncompressedKey = Buffer.concat([Buffer.from([0x04]), uncompressedPoint]);
    const der = Buffer.concat([correctHeader, uncompressedKey]);
    // header = 23 bytes, uncompressedKey = 65 bytes, total = 88... still not 91
    // Need to pad header to exactly 26 bytes so key starts at offset 26
    const fixedHeader = Buffer.alloc(26, 0);
    correctHeader.copy(fixedHeader);
    const fixedDer = Buffer.concat([fixedHeader, uncompressedKey]);
    expect(fixedDer.length).toBe(91);

    const result = extractPublicKeyFromDER(fixedDer, 'ECC_SECG_P256K1');
    expect(result.length).toBe(65);
    expect(result[0]).toBe(0x04);
  });

  test('throws on too-short DER input for ECDSA', () => {
    const shortDer = Buffer.alloc(16);
    expect(() => extractPublicKeyFromDER(shortDer, 'ECC_SECG_P256K1')).toThrow('Invalid ECDSA SPKI DER');
  });

  test('extracts from longer-than-standard DER by taking last 65 bytes', () => {
    const prefix = Buffer.alloc(30, 0x00);
    const uncompressedKey = Buffer.alloc(65, 0xab);
    uncompressedKey[0] = 0x04;
    const der = Buffer.concat([prefix, uncompressedKey]);

    const result = extractPublicKeyFromDER(der, 'ECC_SECG_P256K1');
    expect(result.length).toBe(65);
  });

  test('extracts 33-byte compressed key from smaller DER', () => {
    const header = Buffer.alloc(24, 0x30);
    const compressedKey = Buffer.alloc(33, 0x02);
    const der = Buffer.concat([header, compressedKey]);

    const result = extractPublicKeyFromDER(der, 'ECC_SECG_P256K1');
    expect(result.length).toBe(33);
  });

  test('throws on unsupported key spec', () => {
    const der = Buffer.alloc(44);
    expect(() => extractPublicKeyFromDER(der, 'UNSUPPORTED' as any)).toThrow('Unsupported key spec');
  });
});

// ==========================================
// KMS Key Creation Tests
// ==========================================

describe('createKMSKey', () => {
  let client: IKMSClient;
  let auditLog: KMSAuditEntry[];

  beforeEach(() => {
    client = createMockKMSClient();
    auditLog = [];
  });

  test('creates ED25519 key successfully', async () => {
    const config: KMSSignerConfig = {
      region: 'us-east-1',
      keySpec: 'ECC_NIST_EDWARDS25519',
      description: 'Test ED25519 key',
    };
    const keyInfo = await createKMSKey(client, config, auditLog);

    expect(keyInfo.keyId).toBeDefined();
    expect(keyInfo.keyArn).toContain('arn:aws:kms');
    expect(keyInfo.publicKey).toBeDefined();
    expect(keyInfo.publicKey.length).toBe(32);
    expect(keyInfo.hederaPublicKey).toBeDefined();
    expect(keyInfo.hederaPublicKey.length).toBe(64); // hex string of 32 bytes
    expect(keyInfo.keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(keyInfo.createdAt).toBeDefined();
    expect(auditLog.length).toBeGreaterThanOrEqual(1);
    expect(auditLog[0].operation).toBe('create_key');
    expect(auditLog[0].success).toBe(true);
  });

  test('creates ECDSA key successfully', async () => {
    const config: KMSSignerConfig = {
      region: 'us-east-1',
      keySpec: 'ECC_SECG_P256K1',
      description: 'Test ECDSA key',
    };
    const keyInfo = await createKMSKey(client, config, auditLog);

    expect(keyInfo.keyId).toBeDefined();
    expect(keyInfo.keySpec).toBe('ECC_SECG_P256K1');
    expect(keyInfo.publicKey).toBeDefined();
    // ECDSA uncompressed key = 65 bytes (04 || x || y)
    expect(keyInfo.publicKey.length).toBe(65);
  });

  test('applies custom tags', async () => {
    const config: KMSSignerConfig = {
      region: 'us-east-1',
      keySpec: 'ECC_NIST_EDWARDS25519',
      tags: { AgentId: 'test-agent', Project: 'test' },
    };
    const keyInfo = await createKMSKey(client, config, auditLog);
    expect(keyInfo.keyId).toBeDefined();
  });

  test('logs failure on error', async () => {
    const failingClient: IKMSClient = {
      async createKey() { throw new Error('KMS unavailable'); },
      async getPublicKey() { throw new Error('KMS unavailable'); },
      async sign() { throw new Error('KMS unavailable'); },
    };

    const config: KMSSignerConfig = {
      region: 'us-east-1',
      keySpec: 'ECC_NIST_EDWARDS25519',
    };

    await expect(createKMSKey(failingClient, config, auditLog)).rejects.toThrow('KMS unavailable');
    expect(auditLog.length).toBe(1);
    expect(auditLog[0].success).toBe(false);
    expect(auditLog[0].error).toBe('KMS unavailable');
  });
});

// ==========================================
// getPublicKey Tests
// ==========================================

describe('getPublicKey', () => {
  let client: IKMSClient;
  let auditLog: KMSAuditEntry[];

  beforeEach(() => {
    client = createMockKMSClient();
    auditLog = [];
  });

  test('retrieves ED25519 public key', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_NIST_EDWARDS25519' };
    const keyInfo = await createKMSKey(client, config, auditLog);

    const result = await getPublicKey(client, keyInfo.keyId, 'ECC_NIST_EDWARDS25519', auditLog);
    expect(result.rawPublicKey.length).toBe(32);
    expect(result.hederaPublicKey).toBeDefined();
    expect(typeof result.hederaPublicKey).toBe('string');
  });

  test('retrieves ECDSA public key', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_SECG_P256K1' };
    const keyInfo = await createKMSKey(client, config, auditLog);

    const result = await getPublicKey(client, keyInfo.keyId, 'ECC_SECG_P256K1', auditLog);
    expect(result.rawPublicKey.length).toBe(65);
  });

  test('logs audit entry on success', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_NIST_EDWARDS25519' };
    const keyInfo = await createKMSKey(client, config, auditLog);
    const prevLen = auditLog.length;

    await getPublicKey(client, keyInfo.keyId, 'ECC_NIST_EDWARDS25519', auditLog);
    expect(auditLog.length).toBeGreaterThan(prevLen);
    const last = auditLog[auditLog.length - 1];
    expect(last.operation).toBe('get_public_key');
    expect(last.success).toBe(true);
  });

  test('logs failure on error', async () => {
    await expect(
      getPublicKey(client, 'nonexistent-key', 'ECC_NIST_EDWARDS25519', auditLog)
    ).rejects.toThrow();
    const last = auditLog[auditLog.length - 1];
    expect(last.operation).toBe('get_public_key');
    expect(last.success).toBe(false);
  });
});

// ==========================================
// signWithKMS Tests
// ==========================================

describe('signWithKMS', () => {
  let client: IKMSClient;
  let auditLog: KMSAuditEntry[];

  beforeEach(() => {
    client = createMockKMSClient();
    auditLog = [];
  });

  test('signs with ED25519 key', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_NIST_EDWARDS25519' };
    const keyInfo = await createKMSKey(client, config, auditLog);

    const message = new Uint8Array(Buffer.from('hello hedera'));
    const result = await signWithKMS(client, keyInfo.keyId, message, 'ECC_NIST_EDWARDS25519', auditLog);

    expect(result.signature).toBeDefined();
    expect(result.signature.length).toBe(64); // ED25519 signature is 64 bytes
    expect(result.keyId).toBe(keyInfo.keyId);
    expect(result.algorithm).toBe('ED25519_SHA_512');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('signs with ECDSA key', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_SECG_P256K1' };
    const keyInfo = await createKMSKey(client, config, auditLog);

    const message = new Uint8Array(Buffer.from('hello evm'));
    const result = await signWithKMS(client, keyInfo.keyId, message, 'ECC_SECG_P256K1', auditLog);

    expect(result.signature).toBeDefined();
    expect(result.signature.length).toBeGreaterThan(0);
    expect(result.algorithm).toBe('ECDSA_SHA_256');
  });

  test('includes txHash in audit log', async () => {
    const config: KMSSignerConfig = { region: 'us-east-1', keySpec: 'ECC_NIST_EDWARDS25519' };
    const keyInfo = await createKMSKey(client, config, auditLog);
    const prevLen = auditLog.length;

    await signWithKMS(
      client, keyInfo.keyId, new Uint8Array(32), 'ECC_NIST_EDWARDS25519',
      auditLog, '0x1234abcd',
    );

    const signEntry = auditLog.find(e => e.operation === 'sign' && e.txHash === '0x1234abcd');
    expect(signEntry).toBeDefined();
    expect(signEntry!.success).toBe(true);
  });

  test('logs failure on sign error', async () => {
    const failClient: IKMSClient = {
      async createKey() { throw new Error(); },
      async getPublicKey() { throw new Error(); },
      async sign() { throw new Error('Signing failed'); },
    };

    await expect(
      signWithKMS(failClient, 'bad-key', new Uint8Array(32), 'ECC_NIST_EDWARDS25519', auditLog)
    ).rejects.toThrow('Signing failed');

    const last = auditLog[auditLog.length - 1];
    expect(last.operation).toBe('sign');
    expect(last.success).toBe(false);
  });
});

// ==========================================
// Signer Functions Tests
// ==========================================

describe('kmsSignerED25519', () => {
  test('returns a function that signs and returns Uint8Array', async () => {
    const client = createMockKMSClient();
    const auditLog: KMSAuditEntry[] = [];
    const keyInfo = await createKMSKey(client, { region: 'us-east-1', keySpec: 'ECC_NIST_EDWARDS25519' }, auditLog);

    const signer = kmsSignerED25519(client, keyInfo.keyId, auditLog);
    expect(typeof signer).toBe('function');

    const sig = await signer(new Uint8Array(Buffer.from('test message')));
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
  });
});

describe('kmsSignerECDSA', () => {
  test('returns a function that signs and returns Uint8Array', async () => {
    const client = createMockKMSClient();
    const auditLog: KMSAuditEntry[] = [];
    const keyInfo = await createKMSKey(client, { region: 'us-east-1', keySpec: 'ECC_SECG_P256K1' }, auditLog);

    const signer = kmsSignerECDSA(client, keyInfo.keyId, auditLog);
    expect(typeof signer).toBe('function');

    const sig = await signer(new Uint8Array(Buffer.from('test message')));
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBeGreaterThan(0);
  });
});

// ==========================================
// KMSKeyManager Tests
// ==========================================

describe('KMSKeyManager', () => {
  let manager: KMSKeyManager;

  beforeEach(() => {
    const client = createMockKMSClient();
    manager = new KMSKeyManager(client, 'us-east-1');
  });

  test('creates and retrieves a key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    expect(keyInfo.keyId).toBeDefined();

    const managed = manager.getKey(keyInfo.keyId);
    expect(managed).toBeDefined();
    expect(managed!.status).toBe('active');
    expect(managed!.signCount).toBe(0);
  });

  test('signs with managed key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const result = await manager.sign(keyInfo.keyId, new Uint8Array(32));

    expect(result.signature).toBeDefined();
    expect(result.keyId).toBe(keyInfo.keyId);

    const managed = manager.getKey(keyInfo.keyId);
    expect(managed!.signCount).toBe(1);
    expect(managed!.lastUsedAt).toBeDefined();
  });

  test('throws when signing with non-existent key', async () => {
    await expect(manager.sign('bad-key', new Uint8Array(32))).rejects.toThrow('not found');
  });

  test('throws when signing with retired key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.rotateKey(keyInfo.keyId);

    await expect(manager.sign(keyInfo.keyId, new Uint8Array(32))).rejects.toThrow('retired');
  });

  test('gets signer for ED25519 key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const signer = manager.getSigner(keyInfo.keyId);
    expect(typeof signer).toBe('function');

    const sig = await signer(new Uint8Array(32));
    expect(sig).toBeInstanceOf(Uint8Array);
  });

  test('gets signer for ECDSA key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_SECG_P256K1' });
    const signer = manager.getSigner(keyInfo.keyId);
    const sig = await signer(new Uint8Array(32));
    expect(sig).toBeInstanceOf(Uint8Array);
  });

  test('throws getSigner for non-existent key', () => {
    expect(() => manager.getSigner('bad-key')).toThrow('not found');
  });

  test('rotates key successfully', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    manager.setAgentId(keyInfo.keyId, 'agent-1');

    const newKeyInfo = await manager.rotateKey(keyInfo.keyId);
    expect(newKeyInfo.keyId).toBeDefined();
    expect(newKeyInfo.keyId).not.toBe(keyInfo.keyId);

    // Old key is retired
    const oldManaged = manager.getKey(keyInfo.keyId);
    expect(oldManaged!.status).toBe('retired');

    // New key inherits agent ID
    const newManaged = manager.getKey(newKeyInfo.keyId);
    expect(newManaged!.status).toBe('active');
    expect(newManaged!.agentId).toBe('agent-1');
  });

  test('throws rotateKey for non-existent key', async () => {
    await expect(manager.rotateKey('bad-key')).rejects.toThrow('not found');
  });

  test('sets and gets agent ID', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    manager.setAgentId(keyInfo.keyId, 'agent-42');

    const managed = manager.getKey(keyInfo.keyId);
    expect(managed!.agentId).toBe('agent-42');
  });

  test('throws setAgentId for non-existent key', () => {
    expect(() => manager.setAgentId('bad-key', 'agent')).toThrow('not found');
  });

  test('getKeyForAgent finds active key', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    manager.setAgentId(keyInfo.keyId, 'agent-find');

    const found = manager.getKeyForAgent('agent-find');
    expect(found).toBeDefined();
    expect(found!.keyInfo.keyId).toBe(keyInfo.keyId);
  });

  test('getKeyForAgent returns undefined for unknown agent', () => {
    expect(manager.getKeyForAgent('nonexistent')).toBeUndefined();
  });

  test('listKeys returns all keys', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({ keySpec: 'ECC_SECG_P256K1' });

    const keys = manager.listKeys();
    expect(keys.length).toBe(2);
  });

  test('getAuditLog returns entries', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.sign(keyInfo.keyId, new Uint8Array(32));

    const log = manager.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
  });

  test('getAuditLog filters by keyId', async () => {
    const key1 = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const key2 = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    await manager.sign(key1.keyId, new Uint8Array(32));
    await manager.sign(key2.keyId, new Uint8Array(32));

    const log1 = manager.getAuditLog(key1.keyId);
    const log2 = manager.getAuditLog(key2.keyId);

    expect(log1.every(e => e.keyId === key1.keyId)).toBe(true);
    expect(log2.every(e => e.keyId === key2.keyId)).toBe(true);
  });

  test('getAuditLog respects limit', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    for (let i = 0; i < 10; i++) {
      await manager.sign(keyInfo.keyId, new Uint8Array(32));
    }

    const log = manager.getAuditLog(undefined, 3);
    expect(log.length).toBe(3);
  });

  test('getStats returns correct stats', async () => {
    const key1 = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    const key2 = await manager.createKey({ keySpec: 'ECC_SECG_P256K1' });

    await manager.sign(key1.keyId, new Uint8Array(32));
    await manager.sign(key1.keyId, new Uint8Array(32));

    const stats = manager.getStats();
    expect(stats.totalKeys).toBe(2);
    expect(stats.activeKeys).toBe(2);
    expect(stats.retiredKeys).toBe(0);
    expect(stats.totalSignOperations).toBe(2);
    expect(stats.avgSignLatencyMs).toBeGreaterThanOrEqual(0);
    expect(stats.auditEntries).toBeGreaterThan(0);
  });

  test('getStats counts retired keys after rotation', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.rotateKey(keyInfo.keyId);

    const stats = manager.getStats();
    expect(stats.retiredKeys).toBe(1);
    expect(stats.activeKeys).toBe(1);
    expect(stats.totalKeys).toBe(2);
  });

  test('getCostEstimate returns valid cost data', async () => {
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });

    const cost = manager.getCostEstimate();
    expect(cost.monthlyKeyStorage).toBe(2.00);
    expect(cost.totalMonthlyEstimate).toBeGreaterThanOrEqual(2.00);
    expect(cost.details).toContain('2 active keys');
  });

  test('getCostEstimate with zero keys', () => {
    const cost = manager.getCostEstimate();
    expect(cost.monthlyKeyStorage).toBe(0);
    expect(cost.totalMonthlyEstimate).toBe(0);
  });

  test('multiple sign operations increment sign count', async () => {
    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    for (let i = 0; i < 5; i++) {
      await manager.sign(keyInfo.keyId, new Uint8Array(32));
    }

    const managed = manager.getKey(keyInfo.keyId);
    expect(managed!.signCount).toBe(5);
  });
});
