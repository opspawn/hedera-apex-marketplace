/**
 * HCS-11: Agent Profile Standard
 *
 * Creates and manages agent profiles stored on HCS topics.
 * Profiles include display name, bio, capabilities, skills, and payment info.
 */

import { AgentProfile, RegisteredAgent } from '../types';
import { TestnetIntegration } from '../hedera/testnet-integration';

export interface HCS11Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
}

export class HCS11ProfileManager {
  private config: HCS11Config;
  private testnet: TestnetIntegration | null = null;

  constructor(config: HCS11Config, testnet?: TestnetIntegration) {
    this.config = config;
    this.testnet = testnet || null;
  }

  /**
   * Attach a testnet integration layer for real HCS profile submissions.
   */
  setTestnetIntegration(testnet: TestnetIntegration): void {
    this.testnet = testnet;
  }

  /**
   * Create an HCS-11 profile for a registered agent.
   * When testnet integration is available, submits the profile to the
   * agent's profile topic on the real Hedera testnet.
   */
  async createProfile(agent: RegisteredAgent): Promise<AgentProfile> {
    const profile: AgentProfile = {
      type: 'hcs-11-profile',
      version: '1.0',
      agent_id: agent.agent_id,
      display_name: agent.name,
      bio: agent.description,
      capabilities: this.inferCapabilities(agent),
      skills: agent.skills,
      protocols: agent.protocols,
      social: { github: 'opspawn', twitter: '@opspawn' },
      payment: {
        address: agent.payment_address,
        accepted_tokens: ['HBAR', 'OPSPAWN'],
      },
      topics: {
        inbound: agent.inbound_topic,
        outbound: agent.outbound_topic,
        profile: agent.profile_topic,
      },
    };

    // Submit profile to on-chain topic when testnet integration is available
    // and the agent has a real profile topic (not a mock ID matching registry topic)
    if (this.testnet && agent.profile_topic && agent.hedera_verified) {
      try {
        await this.testnet.submitMessage(agent.profile_topic, {
          ...profile,
          standard: 'hcs-11',
        });
      } catch (err) {
        // Non-fatal: profile is still usable even if on-chain submission fails
        console.warn(`HCS-11 profile on-chain submit failed for ${agent.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return profile;
  }

  /**
   * Update an existing agent profile on HCS.
   *
   * TODO [Sprint 1]: Submit updated profile to profile topic
   * - Latest message on profile topic = current profile
   * - New message overwrites (latest wins)
   */
  async updateProfile(profileTopicId: string, profile: Partial<AgentProfile>): Promise<AgentProfile> {
    // TODO: Merge with existing profile and submit to topic
    return profile as AgentProfile;
  }

  /**
   * Read a profile from the mirror node.
   *
   * TODO [Sprint 1]: Query mirror node for latest profile topic message
   * - GET testnet.mirrornode.hedera.com/api/v1/topics/{profileTopic}/messages?limit=1&order=desc
   * - Decode base64 content
   * - Parse and validate as HCS-11 profile
   */
  async readProfile(profileTopicId: string): Promise<AgentProfile | null> {
    // TODO: Replace with real mirror node query
    return null;
  }

  /**
   * Validate a profile against the HCS-11 spec.
   */
  validateProfile(profile: AgentProfile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!profile.agent_id) errors.push('Missing agent_id');
    if (!profile.display_name) errors.push('Missing display_name');
    if (!profile.bio) errors.push('Missing bio');
    if (profile.type !== 'hcs-11-profile') errors.push('Invalid type — must be hcs-11-profile');
    if (!profile.version) errors.push('Missing version');
    if (!profile.skills || profile.skills.length === 0) errors.push('Must have at least one skill');

    return { valid: errors.length === 0, errors };
  }

  private inferCapabilities(agent: RegisteredAgent): string[] {
    const caps: string[] = [];
    if (agent.protocols.includes('a2a-v0.3')) caps.push('A2A_INTEGRATION');
    if (agent.protocols.includes('x402-v2')) caps.push('PAYMENT_PROTOCOL');
    if (agent.protocols.includes('mcp')) caps.push('MCP_COMPATIBLE');
    if (agent.skills.length > 0) caps.push('API_INTEGRATION');
    return caps;
  }
}
