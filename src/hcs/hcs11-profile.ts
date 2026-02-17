/**
 * HCS-11: Agent Profile Standard
 *
 * Creates and manages agent profiles stored on HCS topics.
 * Profiles include display name, bio, capabilities, skills, and payment info.
 */

import { AgentProfile, RegisteredAgent } from '../types';

export interface HCS11Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
}

export class HCS11ProfileManager {
  private config: HCS11Config;

  constructor(config: HCS11Config) {
    this.config = config;
  }

  /**
   * Create an HCS-11 profile for a registered agent.
   *
   * TODO [Sprint 1]: Implement with standards-sdk
   * - Build profile JSON per HCS-11 spec
   * - Submit to agent's profile topic
   * - Verify via mirror node
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
