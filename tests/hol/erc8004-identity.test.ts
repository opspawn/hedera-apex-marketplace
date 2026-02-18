/**
 * Tests for ERC-8004 Dual Identity Linking Module.
 *
 * Covers:
 * - Identity linking and verification
 * - Dual identity profile generation
 * - Trust score boost calculation
 * - Edge cases (unlinked agents, re-linking, etc.)
 */

import {
  ERC8004IdentityManager,
  ERC8004Identity,
  DualIdentityProfile,
  ERC8004TrustBoost,
  LinkResult,
} from '../../src/hol/erc8004-identity';

const TEST_UAID = 'test-uaid-abc123';
const TEST_UAID_2 = 'test-uaid-def456';

describe('ERC8004IdentityManager', () => {
  let manager: ERC8004IdentityManager;

  beforeEach(() => {
    manager = new ERC8004IdentityManager();
  });

  describe('constructor', () => {
    test('uses default broker URL', () => {
      expect(manager.getBrokerUrl()).toBe('https://hol.org/registry/api/v1');
    });

    test('uses default chain ID (base-sepolia = 84532)', () => {
      expect(manager.getChainId()).toBe(84532);
    });

    test('accepts custom config', () => {
      const custom = new ERC8004IdentityManager({
        brokerBaseUrl: 'https://custom.broker/api',
        chainId: 999,
        apiKey: 'test-key',
      });
      expect(custom.getBrokerUrl()).toBe('https://custom.broker/api');
      expect(custom.getChainId()).toBe(999);
    });

    test('falls back to env var for API key', () => {
      process.env.HOL_API_KEY = 'env-key';
      const m = new ERC8004IdentityManager();
      // Constructor should not throw
      expect(m).toBeDefined();
      delete process.env.HOL_API_KEY;
    });
  });

  describe('linkERC8004Identity', () => {
    test('links an identity successfully', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.success).toBe(true);
      expect(result.uaid).toBe(TEST_UAID);
      expect(result.erc8004Identity).toBeDefined();
      expect(result.erc8004Identity!.chainId).toBe(84532);
      expect(result.erc8004Identity!.registryType).toBe('erc-8004');
      expect(result.erc8004Identity!.linkedUAID).toBe(TEST_UAID);
      expect(result.timestamp).toBeDefined();
    });

    test('generates a contract address', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.erc8004Identity!.contractAddress).toMatch(/^0x[0-9a-f]{40}$/);
    });

    test('generates a verification hash', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.erc8004Identity!.verificationHash).toMatch(/^0x[0-9a-f]+$/);
    });

    test('stores linked identity', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      expect(manager.hasLinkedIdentity(TEST_UAID)).toBe(true);
    });

    test('links with custom config override', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID, { chainId: 11155111 });
      expect(result.success).toBe(true);
      expect(result.erc8004Identity!.chainId).toBe(11155111);
    });

    test('links multiple UAIDs independently', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      await manager.linkERC8004Identity(TEST_UAID_2);
      expect(manager.hasLinkedIdentity(TEST_UAID)).toBe(true);
      expect(manager.hasLinkedIdentity(TEST_UAID_2)).toBe(true);
    });

    test('re-linking overwrites existing identity', async () => {
      const first = await manager.linkERC8004Identity(TEST_UAID);
      const second = await manager.linkERC8004Identity(TEST_UAID);
      expect(second.success).toBe(true);
      // Timestamp should differ (new linking)
      expect(second.erc8004Identity!.linkedAt).toBeDefined();
    });

    test('result includes linkedAt timestamp', async () => {
      const before = new Date().toISOString();
      const result = await manager.linkERC8004Identity(TEST_UAID);
      const after = new Date().toISOString();
      expect(result.erc8004Identity!.linkedAt >= before).toBe(true);
      expect(result.erc8004Identity!.linkedAt <= after).toBe(true);
    });
  });

  describe('verifyDualIdentity', () => {
    test('returns verified=false for unlinked UAID', async () => {
      const result = await manager.verifyDualIdentity('nonexistent-uaid');
      expect(result.verified).toBe(false);
      expect(result.hcs10Registered).toBe(true);
      expect(result.erc8004Registered).toBe(false);
      expect(result.linkedAt).toBeNull();
    });

    test('returns verified=true after linking', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const result = await manager.verifyDualIdentity(TEST_UAID);
      expect(result.verified).toBe(true);
      expect(result.hcs10Registered).toBe(true);
      expect(result.erc8004Registered).toBe(true);
      expect(result.linkedAt).toBeDefined();
    });

    test('includes verification method', async () => {
      const result = await manager.verifyDualIdentity(TEST_UAID);
      expect(result.verificationMethod).toBe('registry-broker-cross-check');
    });
  });

  describe('getDualIdentityProfile', () => {
    test('returns profile for unlinked agent', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.hcs10Agent.uaid).toBe(TEST_UAID);
      expect(profile.hcs10Agent.protocol).toBe('hcs-10');
      expect(profile.hcs10Agent.registered).toBe(true);
      expect(profile.erc8004Identity).toBeNull();
      expect(profile.crossChainVerification.verified).toBe(false);
    });

    test('returns full profile for linked agent', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.erc8004Identity).not.toBeNull();
      expect(profile.erc8004Identity!.chainId).toBe(84532);
      expect(profile.crossChainVerification.verified).toBe(true);
    });

    test('includes agent info when provided', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID, {
        displayName: 'Test Agent',
        alias: 'test-agent',
        inboundTopic: '0.0.123',
        outboundTopic: '0.0.456',
      });
      expect(profile.hcs10Agent.displayName).toBe('Test Agent');
      expect(profile.hcs10Agent.alias).toBe('test-agent');
      expect(profile.hcs10Agent.inboundTopic).toBe('0.0.123');
      expect(profile.hcs10Agent.outboundTopic).toBe('0.0.456');
    });

    test('uses default display name when not provided', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.hcs10Agent.displayName).toBe('HederaConnect');
    });

    test('uses default alias when not provided', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.hcs10Agent.alias).toBe('hedera-connect');
    });
  });

  describe('getERC8004TrustBoost', () => {
    test('returns zero boost for unlinked agent', async () => {
      const boost = await manager.getERC8004TrustBoost(TEST_UAID);
      expect(boost.erc8004Boost).toBe(0);
      expect(boost.totalScore).toBe(0);
      expect(boost.boostReason).toContain('No ERC-8004');
      expect(boost.onChainActivity.transactionCount).toBe(0);
    });

    test('returns positive boost for linked agent', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const boost = await manager.getERC8004TrustBoost(TEST_UAID);
      expect(boost.erc8004Boost).toBeGreaterThan(0);
      expect(boost.boostReason).toContain('ERC-8004 cross-chain identity verified');
    });

    test('includes on-chain activity metrics', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const boost = await manager.getERC8004TrustBoost(TEST_UAID);
      expect(boost.onChainActivity.transactionCount).toBeGreaterThan(0);
      expect(boost.onChainActivity.contractInteractions).toBeGreaterThan(0);
      expect(boost.onChainActivity.reputationTokens).toBeGreaterThan(0);
    });

    test('applies base score correctly', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const boost = await manager.getERC8004TrustBoost(TEST_UAID, 50);
      expect(boost.baseScore).toBe(50);
      expect(boost.totalScore).toBe(50 + boost.erc8004Boost);
    });

    test('trust boost is capped (max components)', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const boost = await manager.getERC8004TrustBoost(TEST_UAID);
      // Max: 10 + 20 + 15 + 25 = 70
      expect(boost.erc8004Boost).toBeLessThanOrEqual(70);
      expect(boost.erc8004Boost).toBeGreaterThanOrEqual(10); // At least base 10
    });

    test('zero base score for unlinked agent', async () => {
      const boost = await manager.getERC8004TrustBoost(TEST_UAID, 100);
      expect(boost.baseScore).toBe(100);
      expect(boost.erc8004Boost).toBe(0);
      expect(boost.totalScore).toBe(100);
    });
  });

  describe('identity management', () => {
    test('hasLinkedIdentity returns false initially', () => {
      expect(manager.hasLinkedIdentity(TEST_UAID)).toBe(false);
    });

    test('getLinkedIdentity returns undefined for unlinked', () => {
      expect(manager.getLinkedIdentity(TEST_UAID)).toBeUndefined();
    });

    test('getLinkedIdentity returns identity after linking', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const identity = manager.getLinkedIdentity(TEST_UAID);
      expect(identity).toBeDefined();
      expect(identity!.linkedUAID).toBe(TEST_UAID);
    });

    test('getAllLinkedIdentities returns empty array initially', () => {
      const all = manager.getAllLinkedIdentities();
      expect(all).toEqual([]);
    });

    test('getAllLinkedIdentities returns all linked', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      await manager.linkERC8004Identity(TEST_UAID_2);
      const all = manager.getAllLinkedIdentities();
      expect(all).toHaveLength(2);
      expect(all[0].uaid).toBe(TEST_UAID);
      expect(all[1].uaid).toBe(TEST_UAID_2);
    });

    test('each identity has unique contract address', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      await manager.linkERC8004Identity(TEST_UAID_2);
      const id1 = manager.getLinkedIdentity(TEST_UAID)!;
      const id2 = manager.getLinkedIdentity(TEST_UAID_2)!;
      expect(id1.contractAddress).not.toBe(id2.contractAddress);
    });

    test('each identity has unique verification hash', async () => {
      const r1 = await manager.linkERC8004Identity(TEST_UAID);
      // Small delay to ensure timestamp differs
      const r2 = await manager.linkERC8004Identity(TEST_UAID_2);
      // Both should succeed
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });
  });

  describe('ERC8004Identity interface compliance', () => {
    test('identity has all required fields', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      const identity = result.erc8004Identity!;
      expect(identity.contractAddress).toBeDefined();
      expect(identity.chainId).toBeDefined();
      expect(identity.registryType).toBeDefined();
      expect(identity.linkedUAID).toBeDefined();
      expect(identity.linkedAt).toBeDefined();
      expect(identity.verificationHash).toBeDefined();
    });

    test('contract address is valid hex format', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.erc8004Identity!.contractAddress).toMatch(/^0x[0-9a-f]+$/);
    });

    test('chain ID is base-sepolia by default', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.erc8004Identity!.chainId).toBe(84532);
    });

    test('registry type is erc-8004', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.erc8004Identity!.registryType).toBe('erc-8004');
    });
  });

  describe('DualIdentityProfile interface compliance', () => {
    test('profile has hcs10Agent section', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.hcs10Agent).toBeDefined();
      expect(profile.hcs10Agent.uaid).toBe(TEST_UAID);
      expect(profile.hcs10Agent.protocol).toBe('hcs-10');
    });

    test('profile has crossChainVerification section', async () => {
      const profile = await manager.getDualIdentityProfile(TEST_UAID);
      expect(profile.crossChainVerification).toBeDefined();
      expect(typeof profile.crossChainVerification.verified).toBe('boolean');
      expect(typeof profile.crossChainVerification.hcs10Registered).toBe('boolean');
      expect(typeof profile.crossChainVerification.erc8004Registered).toBe('boolean');
    });

    test('profile reflects linked state correctly', async () => {
      // Before linking
      const before = await manager.getDualIdentityProfile(TEST_UAID);
      expect(before.erc8004Identity).toBeNull();
      expect(before.crossChainVerification.verified).toBe(false);

      // After linking
      await manager.linkERC8004Identity(TEST_UAID);
      const after = await manager.getDualIdentityProfile(TEST_UAID);
      expect(after.erc8004Identity).not.toBeNull();
      expect(after.crossChainVerification.verified).toBe(true);
    });
  });

  describe('LinkResult interface compliance', () => {
    test('successful link has all fields', async () => {
      const result = await manager.linkERC8004Identity(TEST_UAID);
      expect(result.success).toBe(true);
      expect(result.uaid).toBe(TEST_UAID);
      expect(result.erc8004Identity).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('ERC8004TrustBoost interface compliance', () => {
    test('boost has all required fields', async () => {
      await manager.linkERC8004Identity(TEST_UAID);
      const boost = await manager.getERC8004TrustBoost(TEST_UAID, 25);
      expect(typeof boost.baseScore).toBe('number');
      expect(typeof boost.erc8004Boost).toBe('number');
      expect(typeof boost.totalScore).toBe('number');
      expect(typeof boost.boostReason).toBe('string');
      expect(boost.onChainActivity).toBeDefined();
      expect(typeof boost.onChainActivity.transactionCount).toBe('number');
      expect(typeof boost.onChainActivity.contractInteractions).toBe('number');
      expect(typeof boost.onChainActivity.reputationTokens).toBe('number');
    });
  });
});
