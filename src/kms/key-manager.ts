/**
 * Multi-Key Manager for AWS KMS Hedera Integration.
 *
 * Manages multiple KMS keys across agents with:
 * - Key derivation paths (hierarchical key naming)
 * - Automatic key rotation policies
 * - Key lifecycle management (create → active → rotating → retired → deleted)
 * - Multi-region key replication tracking
 * - Compliance reporting and audit trails
 * - Key usage quotas and alerts
 *
 * Builds on top of KMSKeyManager from src/hedera/kms-signer.ts
 * to add enterprise-grade multi-key orchestration.
 */

import {
  KMSKeyManager,
  KMSKeyInfo,
  KMSAuditEntry,
  IKMSClient,
  KMSKeySpec,
  ManagedKey,
} from '../hedera/kms-signer';

// ==========================================
// Types
// ==========================================

export interface KeyDerivationPath {
  purpose: 'agent-signing' | 'topic-submit' | 'identity' | 'payment' | 'backup';
  agentId: string;
  index: number;
}

export interface KeyRotationPolicy {
  maxAgeMs: number;         // Auto-rotate after this age
  maxSignCount: number;     // Auto-rotate after this many signatures
  enabled: boolean;
}

export interface ManagedKeyEntry {
  key: ManagedKey;
  derivationPath?: KeyDerivationPath;
  rotationPolicy?: KeyRotationPolicy;
  region: string;
  aliases: string[];
  metadata: Record<string, string>;
}

export interface KeyUsageQuota {
  keyId: string;
  maxSignsPerHour: number;
  currentHourSigns: number;
  hourStartedAt: string;
  exceeded: boolean;
}

export interface MultiKeyManagerStatus {
  totalManagedKeys: number;
  activeKeys: number;
  retiredKeys: number;
  rotatingKeys: number;
  keysByPurpose: Record<string, number>;
  keysByRegion: Record<string, number>;
  pendingRotations: number;
  quotaExceeded: number;
  lastAuditAt: string;
}

export interface ComplianceReport {
  generatedAt: string;
  totalKeys: number;
  keysWithRotationPolicy: number;
  keysOverdueForRotation: number;
  keysExceedingQuota: number;
  oldestKeyAgeMs: number;
  averageKeyAgeMs: number;
  totalSignOperations: number;
  recommendations: string[];
}

// ==========================================
// Multi-Key Manager
// ==========================================

export class MultiKeyManager {
  private keyManager: KMSKeyManager;
  private entries: Map<string, ManagedKeyEntry> = new Map();
  private aliases: Map<string, string> = new Map(); // alias → keyId
  private quotas: Map<string, KeyUsageQuota> = new Map();
  private defaultRotationPolicy: KeyRotationPolicy;
  private region: string;

  constructor(
    client: IKMSClient,
    region: string = 'us-east-1',
    defaultRotationPolicy?: Partial<KeyRotationPolicy>,
  ) {
    this.keyManager = new KMSKeyManager(client, region);
    this.region = region;
    this.defaultRotationPolicy = {
      maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days default
      maxSignCount: 100000,
      enabled: true,
      ...defaultRotationPolicy,
    };
  }

  /**
   * Create a new managed key with derivation path and metadata.
   */
  async createKey(params: {
    keySpec: KMSKeySpec;
    derivationPath?: KeyDerivationPath;
    rotationPolicy?: KeyRotationPolicy;
    aliases?: string[];
    metadata?: Record<string, string>;
    description?: string;
  }): Promise<KMSKeyInfo> {
    const description = params.description
      || (params.derivationPath
        ? `${params.derivationPath.purpose}/${params.derivationPath.agentId}/${params.derivationPath.index}`
        : undefined);

    const keyInfo = await this.keyManager.createKey({
      keySpec: params.keySpec,
      description,
    });

    // Associate with agent if derivation path specified
    if (params.derivationPath?.agentId) {
      this.keyManager.setAgentId(keyInfo.keyId, params.derivationPath.agentId);
    }

    // Track in entries
    const managed = this.keyManager.getKey(keyInfo.keyId)!;
    const entry: ManagedKeyEntry = {
      key: managed,
      derivationPath: params.derivationPath,
      rotationPolicy: params.rotationPolicy || this.defaultRotationPolicy,
      region: this.region,
      aliases: params.aliases || [],
      metadata: params.metadata || {},
    };

    this.entries.set(keyInfo.keyId, entry);

    // Register aliases
    for (const alias of entry.aliases) {
      this.aliases.set(alias, keyInfo.keyId);
    }

    return keyInfo;
  }

  /**
   * Create a key using a standard derivation path.
   */
  async createDerivedKey(
    purpose: KeyDerivationPath['purpose'],
    agentId: string,
    keySpec: KMSKeySpec = 'ECC_NIST_EDWARDS25519',
  ): Promise<KMSKeyInfo> {
    // Find the next available index for this purpose/agent combo
    const existing = this.getKeysByDerivationPath(purpose, agentId);
    const nextIndex = existing.length;

    const alias = `${purpose}/${agentId}/${nextIndex}`;

    return this.createKey({
      keySpec,
      derivationPath: { purpose, agentId, index: nextIndex },
      aliases: [alias],
      metadata: {
        purpose,
        agentId,
        index: String(nextIndex),
      },
    });
  }

  /**
   * Sign with a managed key, respecting quotas.
   */
  async sign(keyId: string, message: Uint8Array, txHash?: string): Promise<{
    signature: Buffer;
    keyId: string;
    algorithm: string;
    latencyMs: number;
  }> {
    // Check quota
    this.checkQuota(keyId);

    const result = await this.keyManager.sign(keyId, message, txHash);

    // Update quota tracking
    this.incrementQuota(keyId);

    return result;
  }

  /**
   * Sign using a key alias instead of keyId.
   */
  async signByAlias(alias: string, message: Uint8Array, txHash?: string) {
    const keyId = this.aliases.get(alias);
    if (!keyId) {
      throw new Error(`Key alias "${alias}" not found`);
    }
    return this.sign(keyId, message, txHash);
  }

  /**
   * Get a signer function for a key.
   */
  getSigner(keyId: string): (message: Uint8Array) => Promise<Uint8Array> {
    return this.keyManager.getSigner(keyId);
  }

  /**
   * Resolve alias to keyId.
   */
  resolveAlias(alias: string): string | undefined {
    return this.aliases.get(alias);
  }

  /**
   * Rotate a key, preserving derivation path and metadata.
   */
  async rotateKey(keyId: string): Promise<KMSKeyInfo> {
    const entry = this.entries.get(keyId);
    if (!entry) {
      throw new Error(`Key ${keyId} not managed by MultiKeyManager`);
    }

    const newKeyInfo = await this.keyManager.rotateKey(keyId);

    // Create entry for new key
    const newManagedKey = this.keyManager.getKey(newKeyInfo.keyId)!;
    const newDerivationPath = entry.derivationPath
      ? { ...entry.derivationPath, index: entry.derivationPath.index + 1 }
      : undefined;

    const newEntry: ManagedKeyEntry = {
      key: newManagedKey,
      derivationPath: newDerivationPath,
      rotationPolicy: entry.rotationPolicy,
      region: entry.region,
      aliases: [], // New key gets fresh aliases
      metadata: { ...entry.metadata, rotatedFrom: keyId },
    };

    this.entries.set(newKeyInfo.keyId, newEntry);

    // Update aliases to point to new key
    for (const alias of entry.aliases) {
      this.aliases.set(alias, newKeyInfo.keyId);
      newEntry.aliases.push(alias);
    }
    entry.aliases = []; // Old key loses aliases

    // Update old entry status
    entry.key = this.keyManager.getKey(keyId)!;

    return newKeyInfo;
  }

  /**
   * Check all keys against rotation policies and return those needing rotation.
   */
  getKeysNeedingRotation(): Array<{ keyId: string; reason: string }> {
    const results: Array<{ keyId: string; reason: string }> = [];
    const now = Date.now();

    for (const [keyId, entry] of this.entries) {
      if (entry.key.status !== 'active' || !entry.rotationPolicy?.enabled) {
        continue;
      }

      const keyAge = now - new Date(entry.key.createdAt).getTime();
      if (keyAge > entry.rotationPolicy.maxAgeMs) {
        results.push({
          keyId,
          reason: `Key age (${Math.round(keyAge / (24 * 60 * 60 * 1000))}d) exceeds policy (${Math.round(entry.rotationPolicy.maxAgeMs / (24 * 60 * 60 * 1000))}d)`,
        });
      }

      if (entry.key.signCount > entry.rotationPolicy.maxSignCount) {
        results.push({
          keyId,
          reason: `Sign count (${entry.key.signCount}) exceeds policy (${entry.rotationPolicy.maxSignCount})`,
        });
      }
    }

    return results;
  }

  /**
   * Auto-rotate all keys that exceed their rotation policy.
   */
  async autoRotate(): Promise<Array<{ oldKeyId: string; newKeyId: string; reason: string }>> {
    const keysToRotate = this.getKeysNeedingRotation();
    const results: Array<{ oldKeyId: string; newKeyId: string; reason: string }> = [];

    for (const { keyId, reason } of keysToRotate) {
      try {
        const newKey = await this.rotateKey(keyId);
        results.push({ oldKeyId: keyId, newKeyId: newKey.keyId, reason });
      } catch {
        // Skip keys that fail rotation — will be retried next cycle
      }
    }

    return results;
  }

  /**
   * Set a usage quota for a key.
   */
  setQuota(keyId: string, maxSignsPerHour: number): void {
    this.quotas.set(keyId, {
      keyId,
      maxSignsPerHour,
      currentHourSigns: 0,
      hourStartedAt: new Date().toISOString(),
      exceeded: false,
    });
  }

  /**
   * Get keys by derivation path components.
   */
  getKeysByDerivationPath(
    purpose?: KeyDerivationPath['purpose'],
    agentId?: string,
  ): ManagedKeyEntry[] {
    return Array.from(this.entries.values()).filter(entry => {
      if (!entry.derivationPath) return false;
      if (purpose && entry.derivationPath.purpose !== purpose) return false;
      if (agentId && entry.derivationPath.agentId !== agentId) return false;
      return true;
    });
  }

  /**
   * Get all keys for a specific agent.
   */
  getAgentKeys(agentId: string): ManagedKeyEntry[] {
    return Array.from(this.entries.values()).filter(
      entry => entry.derivationPath?.agentId === agentId || entry.key.agentId === agentId,
    );
  }

  /**
   * Get a specific managed entry.
   */
  getEntry(keyId: string): ManagedKeyEntry | undefined {
    return this.entries.get(keyId);
  }

  /**
   * List all managed entries.
   */
  listEntries(): ManagedKeyEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get the underlying KMSKeyManager for direct operations.
   */
  getKeyManager(): KMSKeyManager {
    return this.keyManager;
  }

  /**
   * Get comprehensive status.
   */
  getStatus(): MultiKeyManagerStatus {
    const entries = this.listEntries();
    const keysByPurpose: Record<string, number> = {};
    const keysByRegion: Record<string, number> = {};

    for (const entry of entries) {
      if (entry.derivationPath) {
        keysByPurpose[entry.derivationPath.purpose] = (keysByPurpose[entry.derivationPath.purpose] || 0) + 1;
      }
      keysByRegion[entry.region] = (keysByRegion[entry.region] || 0) + 1;
    }

    const quotaExceeded = Array.from(this.quotas.values()).filter(q => q.exceeded).length;

    return {
      totalManagedKeys: entries.length,
      activeKeys: entries.filter(e => e.key.status === 'active').length,
      retiredKeys: entries.filter(e => e.key.status === 'retired').length,
      rotatingKeys: entries.filter(e => e.key.status === 'rotating').length,
      keysByPurpose,
      keysByRegion,
      pendingRotations: this.getKeysNeedingRotation().length,
      quotaExceeded,
      lastAuditAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a compliance report.
   */
  generateComplianceReport(): ComplianceReport {
    const entries = this.listEntries();
    const now = Date.now();
    const recommendations: string[] = [];

    const keysWithPolicy = entries.filter(e => e.rotationPolicy?.enabled);
    const overdueKeys = this.getKeysNeedingRotation();
    const exceededQuotas = Array.from(this.quotas.values()).filter(q => q.exceeded);

    const keyAges = entries
      .filter(e => e.key.status === 'active')
      .map(e => now - new Date(e.key.createdAt).getTime());

    const oldestAge = keyAges.length > 0 ? Math.max(...keyAges) : 0;
    const avgAge = keyAges.length > 0
      ? Math.round(keyAges.reduce((s, a) => s + a, 0) / keyAges.length)
      : 0;

    const stats = this.keyManager.getStats();

    // Generate recommendations
    if (overdueKeys.length > 0) {
      recommendations.push(`${overdueKeys.length} key(s) overdue for rotation — run autoRotate()`);
    }
    if (entries.length > 0 && keysWithPolicy.length < entries.length) {
      recommendations.push(`${entries.length - keysWithPolicy.length} key(s) have no rotation policy`);
    }
    if (exceededQuotas.length > 0) {
      recommendations.push(`${exceededQuotas.length} key(s) exceeded usage quota`);
    }
    if (oldestAge > 180 * 24 * 60 * 60 * 1000) {
      recommendations.push('Oldest key exceeds 180 days — consider rotation');
    }
    if (entries.length === 0) {
      recommendations.push('No keys managed — create keys to get started');
    }

    return {
      generatedAt: new Date().toISOString(),
      totalKeys: entries.length,
      keysWithRotationPolicy: keysWithPolicy.length,
      keysOverdueForRotation: overdueKeys.length,
      keysExceedingQuota: exceededQuotas.length,
      oldestKeyAgeMs: oldestAge,
      averageKeyAgeMs: avgAge,
      totalSignOperations: stats.totalSignOperations,
      recommendations,
    };
  }

  /**
   * Get audit log from the underlying key manager.
   */
  getAuditLog(keyId?: string, limit?: number): KMSAuditEntry[] {
    return this.keyManager.getAuditLog(keyId, limit);
  }

  // ==========================================
  // Private helpers
  // ==========================================

  private checkQuota(keyId: string): void {
    const quota = this.quotas.get(keyId);
    if (!quota) return;

    // Reset if hour has passed
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (new Date(quota.hourStartedAt).getTime() < hourAgo) {
      quota.currentHourSigns = 0;
      quota.hourStartedAt = new Date().toISOString();
      quota.exceeded = false;
    }

    if (quota.currentHourSigns >= quota.maxSignsPerHour) {
      quota.exceeded = true;
      throw new Error(`Quota exceeded for key ${keyId}: ${quota.currentHourSigns}/${quota.maxSignsPerHour} signs/hour`);
    }
  }

  private incrementQuota(keyId: string): void {
    const quota = this.quotas.get(keyId);
    if (quota) {
      quota.currentHourSigns++;
    }
  }
}
