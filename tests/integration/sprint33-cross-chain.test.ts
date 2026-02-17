/**
 * Sprint 33 Integration Tests — Cross-Chain Dual Identity Flow.
 *
 * Tests the full flow:
 * 1. Create ERC-8004 manager
 * 2. Link identity
 * 3. Verify dual identity
 * 4. Get profile
 * 5. Calculate trust boost
 * 6. Multi-agent linking
 */

import { ERC8004IdentityManager } from '../../src/hol/erc8004-identity';

describe('Sprint 33 Integration: Full Dual Identity Flow', () => {
  let manager: ERC8004IdentityManager;

  beforeEach(() => {
    manager = new ERC8004IdentityManager({
      brokerBaseUrl: 'https://hol.org/registry/api/v1',
      chainId: 84532,
    });
  });

  test('complete link-verify-profile-boost flow', async () => {
    const uaid = 'integration-test-uaid-1';

    // Step 1: Link identity
    const linkResult = await manager.linkERC8004Identity(uaid);
    expect(linkResult.success).toBe(true);
    expect(linkResult.erc8004Identity).toBeDefined();
    expect(linkResult.erc8004Identity!.chainId).toBe(84532);

    // Step 2: Verify dual identity
    const verification = await manager.verifyDualIdentity(uaid);
    expect(verification.verified).toBe(true);
    expect(verification.hcs10Registered).toBe(true);
    expect(verification.erc8004Registered).toBe(true);

    // Step 3: Get profile
    const profile = await manager.getDualIdentityProfile(uaid, {
      displayName: 'Integration Test Agent',
      alias: 'int-test',
    });
    expect(profile.hcs10Agent.displayName).toBe('Integration Test Agent');
    expect(profile.erc8004Identity).not.toBeNull();
    expect(profile.crossChainVerification.verified).toBe(true);

    // Step 4: Calculate trust boost
    const boost = await manager.getERC8004TrustBoost(uaid, 50);
    expect(boost.baseScore).toBe(50);
    expect(boost.erc8004Boost).toBeGreaterThan(0);
    expect(boost.totalScore).toBeGreaterThan(50);
    expect(boost.onChainActivity.transactionCount).toBeGreaterThan(0);
  });

  test('multi-agent linking flow', async () => {
    const agents = ['agent-a', 'agent-b', 'agent-c'];

    // Link all agents
    for (const uaid of agents) {
      const result = await manager.linkERC8004Identity(uaid);
      expect(result.success).toBe(true);
    }

    // Verify all linked
    const all = manager.getAllLinkedIdentities();
    expect(all).toHaveLength(3);

    // Each has unique contract address
    const addresses = all.map(i => i.identity.contractAddress);
    const uniqueAddresses = new Set(addresses);
    expect(uniqueAddresses.size).toBe(3);

    // Verify each individually
    for (const uaid of agents) {
      const v = await manager.verifyDualIdentity(uaid);
      expect(v.verified).toBe(true);
    }
  });

  test('unlinked agent returns correct defaults', async () => {
    const uaid = 'unlinked-agent';

    // Verify before linking
    const verification = await manager.verifyDualIdentity(uaid);
    expect(verification.verified).toBe(false);
    expect(verification.erc8004Registered).toBe(false);
    expect(verification.linkedAt).toBeNull();

    // Profile before linking
    const profile = await manager.getDualIdentityProfile(uaid);
    expect(profile.erc8004Identity).toBeNull();

    // Trust boost before linking
    const boost = await manager.getERC8004TrustBoost(uaid, 100);
    expect(boost.erc8004Boost).toBe(0);
    expect(boost.totalScore).toBe(100); // Just base score
  });

  test('link-verify-relink flow', async () => {
    const uaid = 'relink-test';

    // First link
    const first = await manager.linkERC8004Identity(uaid);
    expect(first.success).toBe(true);
    const firstAddr = first.erc8004Identity!.contractAddress;

    // Re-link
    const second = await manager.linkERC8004Identity(uaid);
    expect(second.success).toBe(true);
    const secondAddr = second.erc8004Identity!.contractAddress;

    // Contract address should be deterministic for same UAID+chainId
    expect(firstAddr).toBe(secondAddr);

    // Still only one identity for this UAID
    expect(manager.getAllLinkedIdentities()).toHaveLength(1);
  });

  test('trust boost comparison: linked vs unlinked', async () => {
    const linkedUaid = 'linked-agent';
    const unlinkedUaid = 'unlinked-agent';
    const baseScore = 75;

    // Link one agent
    await manager.linkERC8004Identity(linkedUaid);

    // Compare trust boosts
    const linkedBoost = await manager.getERC8004TrustBoost(linkedUaid, baseScore);
    const unlinkedBoost = await manager.getERC8004TrustBoost(unlinkedUaid, baseScore);

    expect(linkedBoost.totalScore).toBeGreaterThan(unlinkedBoost.totalScore);
    expect(linkedBoost.erc8004Boost).toBeGreaterThan(0);
    expect(unlinkedBoost.erc8004Boost).toBe(0);
    expect(unlinkedBoost.totalScore).toBe(baseScore);
  });

  test('cross-chain verification status transitions', async () => {
    const uaid = 'status-transition';

    // Not linked: verified=false
    const before = await manager.verifyDualIdentity(uaid);
    expect(before.verified).toBe(false);

    // Link: verified=true
    await manager.linkERC8004Identity(uaid);
    const after = await manager.verifyDualIdentity(uaid);
    expect(after.verified).toBe(true);
    expect(after.linkedAt).toBeDefined();
  });

  test('profile includes all DualIdentityProfile fields', async () => {
    const uaid = 'full-profile';
    await manager.linkERC8004Identity(uaid);

    const profile = await manager.getDualIdentityProfile(uaid, {
      displayName: 'Full Profile Agent',
      alias: 'full-profile',
      inboundTopic: '0.0.789',
      outboundTopic: '0.0.790',
    });

    // hcs10Agent section
    expect(profile.hcs10Agent.uaid).toBe(uaid);
    expect(profile.hcs10Agent.displayName).toBe('Full Profile Agent');
    expect(profile.hcs10Agent.alias).toBe('full-profile');
    expect(profile.hcs10Agent.protocol).toBe('hcs-10');
    expect(profile.hcs10Agent.inboundTopic).toBe('0.0.789');
    expect(profile.hcs10Agent.outboundTopic).toBe('0.0.790');
    expect(profile.hcs10Agent.registered).toBe(true);

    // erc8004Identity section
    expect(profile.erc8004Identity).not.toBeNull();
    expect(profile.erc8004Identity!.contractAddress).toMatch(/^0x/);
    expect(profile.erc8004Identity!.chainId).toBe(84532);
    expect(profile.erc8004Identity!.registryType).toBe('erc-8004');
    expect(profile.erc8004Identity!.linkedUAID).toBe(uaid);

    // crossChainVerification section
    expect(profile.crossChainVerification.verified).toBe(true);
    expect(profile.crossChainVerification.hcs10Registered).toBe(true);
    expect(profile.crossChainVerification.erc8004Registered).toBe(true);
    expect(profile.crossChainVerification.verificationMethod).toBe('registry-broker-cross-check');
  });

  test('trust boost includes valid on-chain activity', async () => {
    const uaid = 'onchain-activity';
    await manager.linkERC8004Identity(uaid);

    const boost = await manager.getERC8004TrustBoost(uaid);

    // Verify activity structure
    expect(boost.onChainActivity).toBeDefined();
    expect(boost.onChainActivity.transactionCount).toBeGreaterThanOrEqual(0);
    expect(boost.onChainActivity.contractInteractions).toBeGreaterThanOrEqual(0);
    expect(boost.onChainActivity.reputationTokens).toBeGreaterThanOrEqual(0);

    // Verify boost calculation consistency
    // Base: 10, tx: min(12*2, 20)=20, contract: min(5*3, 15)=15, tokens: min(3*5, 25)=15
    // Total: 10 + 20 + 15 + 15 = 60
    expect(boost.erc8004Boost).toBe(60);
  });

  test('custom chain ID support', async () => {
    const customManager = new ERC8004IdentityManager({ chainId: 11155111 }); // Sepolia
    const uaid = 'custom-chain';

    const result = await customManager.linkERC8004Identity(uaid);
    expect(result.success).toBe(true);
    expect(result.erc8004Identity!.chainId).toBe(11155111);

    const profile = await customManager.getDualIdentityProfile(uaid);
    expect(profile.erc8004Identity!.chainId).toBe(11155111);
  });

  test('deterministic contract addresses for same input', async () => {
    const manager1 = new ERC8004IdentityManager();
    const manager2 = new ERC8004IdentityManager();
    const uaid = 'deterministic-test';

    const r1 = await manager1.linkERC8004Identity(uaid);
    const r2 = await manager2.linkERC8004Identity(uaid);

    // Same UAID + same chainId = same contract address
    expect(r1.erc8004Identity!.contractAddress).toBe(r2.erc8004Identity!.contractAddress);
  });
});
