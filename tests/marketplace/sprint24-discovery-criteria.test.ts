/**
 * Sprint 24: MarketplaceService.discoverAgents extended criteria tests.
 *
 * Tests the new skill, standard, and name filters at the service level.
 */

import { MarketplaceService, DiscoveryCriteria } from '../../src/marketplace/marketplace-service';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';

function createMarketplace(): MarketplaceService {
  const config = { accountId: '0.0.test', privateKey: 'test', network: 'testnet' as const };
  const hcs10 = new HCS10Client({ ...config, registryTopicId: '0.0.1' });
  const hcs11 = new HCS11ProfileManager(config);
  const hcs14 = new HCS14IdentityManager(config);
  const hcs19 = new HCS19AgentIdentity(config);
  const hcs26 = new HCS26SkillRegistry(config);
  return new MarketplaceService(hcs10, hcs11, hcs14, hcs19, hcs26);
}

describe('MarketplaceService Discovery Criteria (Sprint 24)', () => {
  let marketplace: MarketplaceService;

  beforeAll(async () => {
    marketplace = createMarketplace();
    // Register two test agents
    await marketplace.registerAgentWithIdentity({
      name: 'AlphaBot',
      description: 'Alpha testing bot',
      endpoint: 'https://alpha.test/a2a',
      protocols: ['a2a-v0.3', 'hcs-10', 'mcp'],
      payment_address: '0.0.100',
      skills: [
        { id: 'code-review', name: 'Code Review', description: 'Automated code review', category: 'dev', tags: ['code'], input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' } },
      ],
    });
    await marketplace.registerAgentWithIdentity({
      name: 'BetaOracle',
      description: 'Beta oracle service',
      endpoint: 'https://beta.test/a2a',
      protocols: ['a2a-v0.3', 'hcs-10', 'x402-v2'],
      payment_address: '0.0.101',
      skills: [
        { id: 'price-feed', name: 'Price Feed', description: 'Real-time price feeds', category: 'blockchain', tags: ['oracle'], input_schema: {}, output_schema: {}, pricing: { amount: 0.5, token: 'HBAR', unit: 'per_call' } },
      ],
    });
  });

  it('should filter by skill name', async () => {
    const result = await marketplace.discoverAgents({ skill: 'code-review' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('AlphaBot');
  });

  it('should filter by skill name partial match', async () => {
    const result = await marketplace.discoverAgents({ skill: 'price' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('BetaOracle');
  });

  it('should filter by standard (mcp)', async () => {
    const result = await marketplace.discoverAgents({ standard: 'mcp' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('AlphaBot');
  });

  it('should filter by standard (x402)', async () => {
    const result = await marketplace.discoverAgents({ standard: 'x402' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('BetaOracle');
  });

  it('should filter by standard (hcs-10) matching both', async () => {
    const result = await marketplace.discoverAgents({ standard: 'hcs-10' });
    expect(result.agents.length).toBe(2);
  });

  it('should filter by name', async () => {
    const result = await marketplace.discoverAgents({ name: 'Alpha' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('AlphaBot');
  });

  it('should filter by name case-insensitively', async () => {
    const result = await marketplace.discoverAgents({ name: 'betaoracle' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('BetaOracle');
  });

  it('should return empty for non-matching name', async () => {
    const result = await marketplace.discoverAgents({ name: 'Nonexistent' });
    expect(result.agents.length).toBe(0);
  });

  it('should combine skill + standard', async () => {
    const result = await marketplace.discoverAgents({ skill: 'code', standard: 'mcp' });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent.name).toBe('AlphaBot');
  });

  it('should combine name + skill', async () => {
    const result = await marketplace.discoverAgents({ name: 'Beta', skill: 'price' });
    expect(result.agents.length).toBe(1);
  });

  it('should return empty when combined filters conflict', async () => {
    const result = await marketplace.discoverAgents({ name: 'Alpha', standard: 'x402' });
    expect(result.agents.length).toBe(0);
  });

  it('should handle all criteria together', async () => {
    const result = await marketplace.discoverAgents({
      q: 'bot',
      skill: 'code',
      standard: 'mcp',
      name: 'Alpha',
      category: 'dev',
    });
    expect(result.agents.length).toBe(1);
  });
});
