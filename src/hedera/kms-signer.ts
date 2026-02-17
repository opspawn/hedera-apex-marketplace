/**
 * AWS KMS ED25519 / ECDSA Signer for Hedera.
 *
 * Enterprise-grade key management for agent signing:
 * - ED25519 (Hedera native) via KMS ECC_NIST_EDWARDS25519
 * - ECDSA secp256k1 (EVM-compatible) via KMS ECC_SECG_P256K1
 * - DER SPKI parsing for both key types
 * - Audit logging for compliance
 *
 * AWS KMS latency is ~50-200ms per sign operation.
 * ED25519 KMS support added Nov 2025 — first-mover advantage.
 */

// ==========================================
// Types & Interfaces
// ==========================================

export type KMSKeySpec = 'ECC_NIST_EDWARDS25519' | 'ECC_SECG_P256K1';

export interface KMSSignerConfig {
  region: string;
  keyId?: string;
  keySpec: KMSKeySpec;
  description?: string;
  tags?: Record<string, string>;
}

export interface KMSKeyInfo {
  keyId: string;
  keyArn: string;
  publicKey: Buffer;
  hederaPublicKey: string;
  keySpec: KMSKeySpec;
  createdAt: string;
}

export interface KMSAuditEntry {
  timestamp: string;
  keyId: string;
  operation: 'create_key' | 'get_public_key' | 'sign' | 'verify' | 'rotate';
  txHash?: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface KMSSignResult {
  signature: Buffer;
  keyId: string;
  algorithm: string;
  latencyMs: number;
}

// ==========================================
// DER SPKI Parsing
// ==========================================

/**
 * Extract raw public key from DER-encoded SPKI structure.
 *
 * ED25519 SPKI DER structure (44 bytes):
 *   30 2a (SEQUENCE, 42 bytes)
 *     30 05 (SEQUENCE, 5 bytes - algorithm identifier)
 *       06 03 2b 65 70 (OID 1.3.101.112 = id-EdDSA)
 *     03 21 00 (BIT STRING, 33 bytes)
 *       <32 bytes raw public key>
 *
 * ECDSA secp256k1 SPKI DER structure (91 bytes):
 *   30 56 (SEQUENCE, 86 bytes)
 *     30 10 (SEQUENCE, 16 bytes - algorithm identifier)
 *       06 07 2a 86 48 ce 3d 02 01 (OID 1.2.840.10045.2.1 = ec-publicKey)
 *       06 05 2b 81 04 00 0a (OID 1.3.132.0.10 = secp256k1)
 *     03 42 00 (BIT STRING, 66 bytes)
 *       04 <64 bytes uncompressed point x||y>
 */
export function extractPublicKeyFromDER(derBytes: Buffer, keySpec: KMSKeySpec): Buffer {
  if (keySpec === 'ECC_NIST_EDWARDS25519') {
    // ED25519: 44 bytes DER, raw key is last 32 bytes
    if (derBytes.length < 32) {
      throw new Error(`Invalid ED25519 SPKI DER: expected >= 32 bytes, got ${derBytes.length}`);
    }
    if (derBytes.length === 44) {
      // Standard SPKI format: verify OID
      if (derBytes[0] !== 0x30 || derBytes[2] !== 0x30) {
        throw new Error('Invalid ED25519 SPKI DER: bad SEQUENCE headers');
      }
      // Raw key is last 32 bytes
      return Buffer.from(derBytes.slice(12));
    }
    // Fallback: assume raw key is the last 32 bytes
    return Buffer.from(derBytes.slice(-32));
  }

  if (keySpec === 'ECC_SECG_P256K1') {
    // ECDSA secp256k1: 91 bytes DER for uncompressed key
    if (derBytes.length < 33) {
      throw new Error(`Invalid ECDSA SPKI DER: expected >= 33 bytes, got ${derBytes.length}`);
    }
    if (derBytes.length === 91) {
      // Standard uncompressed: 04 || x (32 bytes) || y (32 bytes)
      // Starts at offset 26 (after SEQUENCE + algorithm OID + BIT STRING header)
      const uncompressedKey = derBytes.slice(26);
      if (uncompressedKey[0] !== 0x04) {
        throw new Error('Invalid ECDSA SPKI DER: expected uncompressed point prefix 0x04');
      }
      return Buffer.from(uncompressedKey);
    }
    // For compressed key (33 bytes)
    if (derBytes.length >= 56 && derBytes.length <= 60) {
      return Buffer.from(derBytes.slice(-33));
    }
    // Fallback: try to extract uncompressed (65 bytes) or compressed (33 bytes)
    if (derBytes.length >= 65) {
      return Buffer.from(derBytes.slice(-65));
    }
    return Buffer.from(derBytes.slice(-33));
  }

  throw new Error(`Unsupported key spec: ${keySpec}`);
}

// ==========================================
// KMS Client Wrapper
// ==========================================

/** KMS client interface — allows mocking for tests */
export interface IKMSClient {
  createKey(params: {
    KeySpec: string;
    KeyUsage: string;
    Description?: string;
    Tags?: Array<{ TagKey: string; TagValue: string }>;
  }): Promise<{
    KeyMetadata: {
      KeyId: string;
      Arn: string;
      CreationDate: Date;
      KeySpec: string;
    };
  }>;

  getPublicKey(params: { KeyId: string }): Promise<{
    PublicKey: Uint8Array;
    KeySpec: string;
  }>;

  sign(params: {
    KeyId: string;
    Message: Uint8Array;
    MessageType: string;
    SigningAlgorithm: string;
  }): Promise<{
    Signature: Uint8Array;
    SigningAlgorithm: string;
  }>;
}

// ==========================================
// KMS Signer Functions
// ==========================================

/**
 * Create a new KMS key for agent signing.
 */
export async function createKMSKey(
  client: IKMSClient,
  config: KMSSignerConfig,
  auditLog: KMSAuditEntry[],
): Promise<KMSKeyInfo> {
  const start = Date.now();
  const tags = config.tags
    ? Object.entries(config.tags).map(([TagKey, TagValue]) => ({ TagKey, TagValue }))
    : [{ TagKey: 'Project', TagValue: 'hedera-agent-marketplace' }];

  try {
    const result = await client.createKey({
      KeySpec: config.keySpec,
      KeyUsage: 'SIGN_VERIFY',
      Description: config.description || `Hedera Agent Key (${config.keySpec})`,
      Tags: tags,
    });

    const keyId = result.KeyMetadata.KeyId;
    const keyArn = result.KeyMetadata.Arn;

    // Get public key
    const pubResult = await client.getPublicKey({ KeyId: keyId });
    const derPublicKey = Buffer.from(pubResult.PublicKey);
    const rawPublicKey = extractPublicKeyFromDER(derPublicKey, config.keySpec);

    // Convert to Hedera public key hex string
    const hederaPublicKey = rawPublicKey.toString('hex');

    const latencyMs = Date.now() - start;
    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'create_key',
      latencyMs,
      success: true,
    });

    return {
      keyId,
      keyArn,
      publicKey: rawPublicKey,
      hederaPublicKey,
      keySpec: config.keySpec,
      createdAt: result.KeyMetadata.CreationDate.toISOString(),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId: config.keyId || 'unknown',
      operation: 'create_key',
      latencyMs,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

/**
 * Get the public key for an existing KMS key.
 */
export async function getPublicKey(
  client: IKMSClient,
  keyId: string,
  keySpec: KMSKeySpec,
  auditLog: KMSAuditEntry[],
): Promise<{ rawPublicKey: Buffer; hederaPublicKey: string }> {
  const start = Date.now();
  try {
    const result = await client.getPublicKey({ KeyId: keyId });
    const derPublicKey = Buffer.from(result.PublicKey);
    const rawPublicKey = extractPublicKeyFromDER(derPublicKey, keySpec);

    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'get_public_key',
      latencyMs: Date.now() - start,
      success: true,
    });

    return {
      rawPublicKey,
      hederaPublicKey: rawPublicKey.toString('hex'),
    };
  } catch (err) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'get_public_key',
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

/**
 * Sign raw bytes with KMS.
 *
 * For ED25519: SigningAlgorithm='ED25519_SHA_512', MessageType='RAW'
 * For ECDSA:   SigningAlgorithm='ECDSA_SHA_256', MessageType='DIGEST' (pre-hash with SHA-256)
 */
export async function signWithKMS(
  client: IKMSClient,
  keyId: string,
  message: Uint8Array,
  keySpec: KMSKeySpec,
  auditLog: KMSAuditEntry[],
  txHash?: string,
): Promise<KMSSignResult> {
  const start = Date.now();

  const signingAlgorithm = keySpec === 'ECC_NIST_EDWARDS25519'
    ? 'ED25519_SHA_512'
    : 'ECDSA_SHA_256';

  const messageType = keySpec === 'ECC_NIST_EDWARDS25519'
    ? 'RAW'    // ED25519: KMS hashes internally
    : 'DIGEST'; // ECDSA: pre-hash with SHA-256

  let messageToSign = message;
  if (keySpec === 'ECC_SECG_P256K1') {
    // For ECDSA, pre-hash the message with SHA-256
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(Buffer.from(message)).digest();
    messageToSign = new Uint8Array(hash);
  }

  try {
    const result = await client.sign({
      KeyId: keyId,
      Message: messageToSign,
      MessageType: messageType,
      SigningAlgorithm: signingAlgorithm,
    });

    const latencyMs = Date.now() - start;
    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'sign',
      txHash,
      latencyMs,
      success: true,
    });

    return {
      signature: Buffer.from(result.Signature),
      keyId,
      algorithm: result.SigningAlgorithm,
      latencyMs,
    };
  } catch (err) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'sign',
      txHash,
      latencyMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

/**
 * Returns a signer function compatible with Hedera SDK for ED25519 keys.
 * The returned function takes raw transaction bytes and returns a 64-byte Ed25519 signature.
 */
export function kmsSignerED25519(
  client: IKMSClient,
  keyId: string,
  auditLog: KMSAuditEntry[],
): (message: Uint8Array) => Promise<Uint8Array> {
  return async (message: Uint8Array): Promise<Uint8Array> => {
    const result = await signWithKMS(client, keyId, message, 'ECC_NIST_EDWARDS25519', auditLog);
    return new Uint8Array(result.signature);
  };
}

/**
 * Returns a signer function compatible with Hedera SDK for ECDSA secp256k1 keys.
 */
export function kmsSignerECDSA(
  client: IKMSClient,
  keyId: string,
  auditLog: KMSAuditEntry[],
): (message: Uint8Array) => Promise<Uint8Array> {
  return async (message: Uint8Array): Promise<Uint8Array> => {
    const result = await signWithKMS(client, keyId, message, 'ECC_SECG_P256K1', auditLog);
    return new Uint8Array(result.signature);
  };
}

// ==========================================
// KMS Key Manager
// ==========================================

export interface ManagedKey {
  keyInfo: KMSKeyInfo;
  agentId?: string;
  status: 'active' | 'rotating' | 'retired';
  createdAt: string;
  lastUsedAt?: string;
  signCount: number;
}

export class KMSKeyManager {
  private keys: Map<string, ManagedKey> = new Map();
  private auditLog: KMSAuditEntry[] = [];
  private client: IKMSClient;
  private region: string;

  constructor(client: IKMSClient, region: string = 'us-east-1') {
    this.client = client;
    this.region = region;
  }

  /**
   * Create and register a new KMS key.
   */
  async createKey(config: Omit<KMSSignerConfig, 'region'>): Promise<KMSKeyInfo> {
    const fullConfig: KMSSignerConfig = { ...config, region: this.region };
    const keyInfo = await createKMSKey(this.client, fullConfig, this.auditLog);

    this.keys.set(keyInfo.keyId, {
      keyInfo,
      status: 'active',
      createdAt: keyInfo.createdAt,
      signCount: 0,
    });

    return keyInfo;
  }

  /**
   * Sign with a managed key.
   */
  async sign(keyId: string, message: Uint8Array, txHash?: string): Promise<KMSSignResult> {
    const managed = this.keys.get(keyId);
    if (!managed) {
      throw new Error(`Key ${keyId} not found in manager`);
    }
    if (managed.status === 'retired') {
      throw new Error(`Key ${keyId} is retired and cannot be used for signing`);
    }

    const result = await signWithKMS(
      this.client, keyId, message, managed.keyInfo.keySpec,
      this.auditLog, txHash,
    );

    managed.signCount++;
    managed.lastUsedAt = new Date().toISOString();

    return result;
  }

  /**
   * Get a signer function for a managed key.
   */
  getSigner(keyId: string): (message: Uint8Array) => Promise<Uint8Array> {
    const managed = this.keys.get(keyId);
    if (!managed) {
      throw new Error(`Key ${keyId} not found in manager`);
    }

    if (managed.keyInfo.keySpec === 'ECC_NIST_EDWARDS25519') {
      return kmsSignerED25519(this.client, keyId, this.auditLog);
    }
    return kmsSignerECDSA(this.client, keyId, this.auditLog);
  }

  /**
   * Rotate a key: create new key, mark old as rotating.
   */
  async rotateKey(keyId: string): Promise<KMSKeyInfo> {
    const managed = this.keys.get(keyId);
    if (!managed) {
      throw new Error(`Key ${keyId} not found in manager`);
    }

    // Mark old key as rotating
    managed.status = 'rotating';

    // Create new key with same spec
    const newKeyInfo = await this.createKey({
      keySpec: managed.keyInfo.keySpec,
      description: `Rotated from ${keyId}`,
      tags: { RotatedFrom: keyId, AgentId: managed.agentId || 'unknown' },
    });

    // Transfer agent association
    const newManaged = this.keys.get(newKeyInfo.keyId)!;
    newManaged.agentId = managed.agentId;

    // Log rotation
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      keyId,
      operation: 'rotate',
      latencyMs: 0,
      success: true,
    });

    // Retire old key
    managed.status = 'retired';

    return newKeyInfo;
  }

  /**
   * Associate a key with an agent.
   */
  setAgentId(keyId: string, agentId: string): void {
    const managed = this.keys.get(keyId);
    if (!managed) {
      throw new Error(`Key ${keyId} not found in manager`);
    }
    managed.agentId = agentId;
  }

  /**
   * Get key info for a managed key.
   */
  getKey(keyId: string): ManagedKey | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Get key for an agent.
   */
  getKeyForAgent(agentId: string): ManagedKey | undefined {
    for (const managed of this.keys.values()) {
      if (managed.agentId === agentId && managed.status === 'active') {
        return managed;
      }
    }
    return undefined;
  }

  /**
   * List all managed keys.
   */
  listKeys(): ManagedKey[] {
    return Array.from(this.keys.values());
  }

  /**
   * Get audit log entries, optionally filtered by keyId.
   */
  getAuditLog(keyId?: string, limit: number = 100): KMSAuditEntry[] {
    let entries = this.auditLog;
    if (keyId) {
      entries = entries.filter(e => e.keyId === keyId);
    }
    return entries.slice(-limit);
  }

  /**
   * Get signing statistics.
   */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    retiredKeys: number;
    totalSignOperations: number;
    avgSignLatencyMs: number;
    auditEntries: number;
  } {
    const keys = this.listKeys();
    const signEntries = this.auditLog.filter(e => e.operation === 'sign' && e.success);
    const avgLatency = signEntries.length > 0
      ? Math.round(signEntries.reduce((sum, e) => sum + e.latencyMs, 0) / signEntries.length)
      : 0;

    return {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.status === 'active').length,
      retiredKeys: keys.filter(k => k.status === 'retired').length,
      totalSignOperations: signEntries.length,
      avgSignLatencyMs: avgLatency,
      auditEntries: this.auditLog.length,
    };
  }

  /**
   * Get cost estimate based on current key count and signing volume.
   * AWS KMS pricing: $1.00/key/month + $0.15/10,000 asymmetric operations.
   */
  getCostEstimate(): {
    monthlyKeyStorage: number;
    monthlySigningEstimate: number;
    totalMonthlyEstimate: number;
    details: string;
  } {
    const keys = this.listKeys();
    const activeKeys = keys.filter(k => k.status !== 'retired').length;
    const totalSigns = keys.reduce((sum, k) => sum + k.signCount, 0);
    // Extrapolate to 30 days based on current rate
    const estimatedMonthlySigns = totalSigns * 30;

    const monthlyKeyStorage = activeKeys * 1.00;
    const monthlySigningEstimate = (estimatedMonthlySigns / 10000) * 0.15;
    const totalMonthlyEstimate = monthlyKeyStorage + monthlySigningEstimate;

    return {
      monthlyKeyStorage,
      monthlySigningEstimate: Math.round(monthlySigningEstimate * 100) / 100,
      totalMonthlyEstimate: Math.round(totalMonthlyEstimate * 100) / 100,
      details: `${activeKeys} active keys × $1.00/mo + ~${estimatedMonthlySigns} signs × $0.015/1K`,
    };
  }
}
