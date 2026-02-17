/**
 * Seed Loader — Populates the marketplace with demo agents on server start.
 *
 * Registers each demo agent through the full marketplace flow:
 * HCS-10 registration → HCS-19 identity → HCS-11 profile → HCS-14 DID → HCS-26 skills
 * Then grants HCS-19 privacy consent and awards initial HCS-20 reputation points.
 */

import { MarketplaceService } from '../marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../hcs/hcs19-privacy';
import { HCS20PointsTracker } from '../hcs-20/hcs20-points';
import { DEMO_AGENTS, SeedAgent } from './demo-agents';

export interface SeedResult {
  seeded: number;
  agents: Array<{
    name: string;
    agent_id: string;
    reputation: number;
    hasConsent: boolean;
    points: number;
  }>;
}

/**
 * Seed the marketplace with demo agents.
 *
 * Called once at server startup. Idempotent — checks if agents already exist
 * via marketplace agent count.
 */
export async function seedDemoAgents(
  marketplace: MarketplaceService,
  privacy: HCS19PrivacyManager,
  points: HCS20PointsTracker,
): Promise<SeedResult> {
  // Skip if already seeded
  if (marketplace.getAgentCount() > 0) {
    return { seeded: 0, agents: [] };
  }

  const results: SeedResult = { seeded: 0, agents: [] };

  for (const seed of DEMO_AGENTS) {
    try {
      const ma = await marketplace.registerAgentWithIdentity({
        name: seed.name,
        description: seed.description,
        endpoint: seed.endpoint,
        skills: seed.skills,
        protocols: seed.protocols,
        payment_address: seed.payment_address,
      });

      // Set reputation score on the registered agent
      ma.agent.reputation_score = seed.reputation;

      // Grant HCS-19 privacy consent if configured
      if (seed.hasPrivacyConsent && seed.consentPurposes) {
        await privacy.grantConsent({
          agent_id: ma.agent.agent_id,
          purposes: seed.consentPurposes,
          retention: '6m',
        });
      }

      // Award initial HCS-20 reputation points based on seed reputation
      const initialPoints = Math.floor(seed.reputation * 10);
      await points.awardPoints({
        agentId: ma.agent.agent_id,
        points: initialPoints,
        reason: 'initial_registration',
        fromAgent: 'marketplace-system',
      });

      // Award bonus points for having privacy consent
      if (seed.hasPrivacyConsent) {
        await points.awardPoints({
          agentId: ma.agent.agent_id,
          points: 50,
          reason: 'privacy_consent_granted',
          fromAgent: 'marketplace-system',
        });
      }

      // Award points for each published skill
      for (const skill of seed.skills) {
        await points.awardPoints({
          agentId: ma.agent.agent_id,
          points: 25,
          reason: `skill_published:${skill.name}`,
          fromAgent: 'marketplace-system',
        });
      }

      results.agents.push({
        name: seed.name,
        agent_id: ma.agent.agent_id,
        reputation: seed.reputation,
        hasConsent: seed.hasPrivacyConsent,
        points: points.getAgentPoints(ma.agent.agent_id),
      });
      results.seeded++;
    } catch (err) {
      // Log but continue seeding remaining agents — don't let one failure block all
      console.warn(`Failed to seed agent ${seed.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return results;
}
