import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { seedDemoAgents } from '../../src/seed';

const HEDERA_CONFIG = {
  accountId: '0.0.7854018',
  privateKey: 'test-key',
  network: 'testnet' as const,
};

describe('Seed Demo Agents', () => {
  let marketplace: MarketplaceService;
  let privacy: HCS19PrivacyManager;
  let points: HCS20PointsTracker;

  beforeEach(() => {
    const hcs10 = new HCS10Client({ ...HEDERA_CONFIG, registryTopicId: '0.0.test' });
    const hcs11 = new HCS11ProfileManager(HEDERA_CONFIG);
    const hcs14 = new HCS14IdentityManager(HEDERA_CONFIG);
    const hcs19Identity = new HCS19AgentIdentity(HEDERA_CONFIG);
    const hcs26 = new HCS26SkillRegistry(HEDERA_CONFIG);
    privacy = new HCS19PrivacyManager(HEDERA_CONFIG);
    points = new HCS20PointsTracker(HEDERA_CONFIG);
    marketplace = new MarketplaceService(hcs10, hcs11, hcs14, hcs19Identity, hcs26);
  });

  it('should seed 8 demo agents', async () => {
    const result = await seedDemoAgents(marketplace, privacy, points);
    expect(result.seeded).toBe(8);
    expect(result.agents.length).toBe(8);
  });

  it('should populate marketplace with agents', async () => {
    await seedDemoAgents(marketplace, privacy, points);
    expect(marketplace.getAgentCount()).toBe(8);
  });

  it('should assign unique agent IDs', async () => {
    const result = await seedDemoAgents(marketplace, privacy, points);
    const ids = result.agents.map(a => a.agent_id);
    expect(new Set(ids).size).toBe(8);
  });

  it('should set reputation scores', async () => {
    const result = await seedDemoAgents(marketplace, privacy, points);
    for (const agent of result.agents) {
      expect(agent.reputation).toBeGreaterThan(0);
      expect(agent.reputation).toBeLessThanOrEqual(100);
    }
  });

  it('should award HCS-20 points for each agent', async () => {
    const result = await seedDemoAgents(marketplace, privacy, points);
    for (const agent of result.agents) {
      expect(agent.points).toBeGreaterThan(0);
    }
  });

  it('should award bonus points for privacy consent', async () => {
    const result = await seedDemoAgents(marketplace, privacy, points);
    const withConsent = result.agents.filter(a => a.hasConsent);
    const withoutConsent = result.agents.filter(a => !a.hasConsent);
    expect(withConsent.length).toBeGreaterThan(0);
    expect(withoutConsent.length).toBeGreaterThan(0);
    // Agents with consent should have more points (extra 50)
    for (const a of withConsent) {
      expect(a.points).toBeGreaterThanOrEqual(50);
    }
  });

  it('should be idempotent (skip if already seeded)', async () => {
    const first = await seedDemoAgents(marketplace, privacy, points);
    expect(first.seeded).toBe(8);
    const second = await seedDemoAgents(marketplace, privacy, points);
    expect(second.seeded).toBe(0);
    expect(marketplace.getAgentCount()).toBe(8);
  });

  it('should discover seeded agents through marketplace', async () => {
    await seedDemoAgents(marketplace, privacy, points);
    const result = await marketplace.discoverAgents({});
    expect(result.total).toBe(8);
    expect(result.agents.length).toBe(8);
  });

  it('should make agents searchable by name', async () => {
    await seedDemoAgents(marketplace, privacy, points);
    const result = await marketplace.discoverAgents({ q: 'Sentinel' });
    expect(result.total).toBe(1);
    expect(result.agents[0].agent.name).toBe('SentinelAI');
  });

  it('should make agents filterable by category', async () => {
    await seedDemoAgents(marketplace, privacy, points);
    const result = await marketplace.discoverAgents({ category: 'blockchain' });
    expect(result.total).toBeGreaterThanOrEqual(2);
  });
});
