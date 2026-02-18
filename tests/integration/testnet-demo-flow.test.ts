/**
 * Integration test: Demo flow with testnet integration wired through HCS10Client.
 * Verifies that when TestnetIntegration is attached, the demo flow
 * creates real topics and submits messages via the testnet layer.
 */

import { DemoFlow } from '../../src/demo/flow';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';
import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { TestnetIntegration } from '../../src/hedera/testnet-integration';

function createDepsWithTestnet() {
  const config = {
    accountId: '0.0.test',
    privateKey: 'test-key',
    network: 'testnet' as const,
  };

  const testnet = new TestnetIntegration({
    accountId: '',
    privateKey: '',
    network: 'testnet',
  });

  const hcs10 = new HCS10Client({ ...config, registryTopicId: '0.0.registry' }, testnet);
  const hcs11 = new HCS11ProfileManager(config);
  const hcs14 = new HCS14IdentityManager(config);
  const hcs19 = new HCS19PrivacyManager(config);
  const hcs19Identity = new HCS19AgentIdentity(config);
  const hcs26 = new HCS26SkillRegistry(config);
  const hcs20 = new HCS20PointsTracker(config);
  const marketplace = new MarketplaceService(hcs10, hcs11, hcs14, hcs19Identity, hcs26);

  return { marketplace, hcs19, hcs20, testnet, hcs10 };
}

describe('Demo Flow with Testnet Integration', () => {
  it('should complete the full demo flow with testnet wired', async () => {
    const { marketplace, hcs19, hcs20, testnet } = createDepsWithTestnet();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const state = await flow.run();

    expect(state.status).toBe('completed');
    expect(state.steps.length).toBe(8);

    // Testnet should have recorded topic creations for agent registration
    const summary = testnet.getSessionSummary();
    expect(summary.topicsCreated).toBeGreaterThan(0);
    expect(summary.messagesSubmitted).toBeGreaterThan(0);
  });

  it('should create topics for each registered agent', async () => {
    const { marketplace, hcs19, hcs20, testnet } = createDepsWithTestnet();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    await flow.run();

    // Each of 24 demo agents creates 3 topics (inbound, outbound, profile)
    // Plus 1 task topic created during hire
    // Total: 24 * 3 + 1 = 73
    const topics = testnet.getTopics();
    expect(topics.length).toBeGreaterThanOrEqual(72); // At least 24 agents * 3 topics
  });

  it('should submit registration messages for each agent', async () => {
    const { marketplace, hcs19, hcs20, testnet } = createDepsWithTestnet();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    await flow.run();

    // Each of 24 demo agents sends 1 registration message
    // Plus task channel messages during hire
    const messages = testnet.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(24);
  });

  it('should have testnet integration attached to HCS10Client', () => {
    const { hcs10 } = createDepsWithTestnet();
    expect(hcs10.hasTestnetIntegration()).toBe(true);
  });

  it('should track all testnet operations in session summary', async () => {
    const { marketplace, hcs19, hcs20, testnet } = createDepsWithTestnet();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    await flow.run();

    const summary = testnet.getSessionSummary();
    expect(summary.mode).toBe('mock'); // No real credentials
    expect(summary.network).toBe('testnet');
    expect(summary.topicsCreated).toBe(summary.topics.length);
    expect(summary.messagesSubmitted).toBe(summary.messages.length);
  });
});
