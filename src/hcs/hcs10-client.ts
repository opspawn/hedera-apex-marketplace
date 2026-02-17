/**
 * HCS-10: Agent Communication Protocol
 *
 * Handles agent registration on the OpenConvAI registry topic,
 * inbound/outbound topic creation, and agent-to-agent messaging.
 *
 * When a TestnetIntegration is provided, topic creation and message
 * submission execute on the real Hedera testnet. Otherwise falls back
 * to local mock implementation.
 */

import { AgentRegistration, RegisteredAgent } from '../types';
import { TestnetIntegration } from '../hedera/testnet-integration';

export interface HCS10Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  registryTopicId: string;
}

export class HCS10Client {
  private config: HCS10Config;
  private counter = 0;
  private testnet: TestnetIntegration | null = null;

  constructor(config: HCS10Config, testnet?: TestnetIntegration) {
    this.config = config;
    this.testnet = testnet || null;
  }

  /**
   * Attach a testnet integration layer for real HCS operations.
   */
  setTestnetIntegration(testnet: TestnetIntegration): void {
    this.testnet = testnet;
  }

  /**
   * Check if testnet integration is active.
   */
  hasTestnetIntegration(): boolean {
    return this.testnet !== null;
  }

  /**
   * Register an agent on the HCS-10 registry topic.
   * Creates inbound/outbound topics and writes registration message.
   *
   * When testnet integration is available:
   * - Creates real inbound topic on Hedera
   * - Creates real outbound topic on Hedera
   * - Submits registration message to registry topic
   */
  async registerAgent(registration: AgentRegistration): Promise<RegisteredAgent> {
    let inboundTopic: string;
    let outboundTopic: string;
    let profileTopic: string;

    if (this.testnet) {
      // Real testnet: create actual HCS topics
      const inbound = await this.testnet.createTopic(`hcs10:inbound:${registration.name}`);
      const outbound = await this.testnet.createTopic(`hcs10:outbound:${registration.name}`);
      const profile = await this.testnet.createTopic(`hcs10:profile:${registration.name}`);

      inboundTopic = inbound.topicId;
      outboundTopic = outbound.topicId;
      profileTopic = profile.topicId;

      // Submit registration message to registry topic
      await this.testnet.submitMessage(this.config.registryTopicId, {
        type: 'hcs-10-registration',
        name: registration.name,
        description: registration.description,
        inbound_topic: inboundTopic,
        outbound_topic: outboundTopic,
        profile_topic: profileTopic,
        endpoint: registration.endpoint,
        protocols: registration.protocols,
        skills: registration.skills.map(s => s.name),
        timestamp: new Date().toISOString(),
      });
    } else {
      // Mock: generate local topic IDs
      inboundTopic = this.config.registryTopicId;
      outboundTopic = this.config.registryTopicId;
      profileTopic = this.config.registryTopicId;
    }

    const agent: RegisteredAgent = {
      ...registration,
      agent_id: `0.0.${Date.now()}${++this.counter}`,
      inbound_topic: inboundTopic,
      outbound_topic: outboundTopic,
      profile_topic: profileTopic,
      reputation_score: 0,
      status: 'online',
      registered_at: new Date().toISOString(),
    };
    return agent;
  }

  /**
   * Send a message to an agent via their inbound topic.
   *
   * When testnet integration is available:
   * - Submits message to topic via TopicMessageSubmitTransaction
   * - Returns real consensus timestamp and sequence number
   */
  async sendMessage(topicId: string, message: Record<string, unknown>): Promise<{ sequenceNumber: number; timestamp: string }> {
    if (this.testnet) {
      const result = await this.testnet.submitMessage(topicId, message);
      return {
        sequenceNumber: result.sequenceNumber,
        timestamp: result.timestamp,
      };
    }

    // Mock fallback
    return {
      sequenceNumber: 1,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Read messages from a topic via mirror node.
   *
   * When testnet integration is available:
   * - Queries the Hedera mirror node REST API
   * - Decodes base64 message content
   */
  async readMessages(topicId: string, limit: number = 10): Promise<Array<{ content: Record<string, unknown>; sequenceNumber: number; timestamp: string }>> {
    if (this.testnet) {
      const msgs = await this.testnet.readMessages(topicId, limit);
      return msgs.map(m => {
        let content: Record<string, unknown>;
        try {
          content = JSON.parse(m.content);
        } catch {
          content = { raw: m.content };
        }
        return {
          content,
          sequenceNumber: m.sequenceNumber,
          timestamp: m.timestamp,
        };
      });
    }

    // Mock fallback
    return [];
  }

  /**
   * Create a new HCS topic for agent communication.
   *
   * When testnet integration is available:
   * - Uses TopicCreateTransaction from @hashgraph/sdk
   * - Returns real topic ID from testnet
   */
  async createTopic(memo: string): Promise<string> {
    if (this.testnet) {
      const result = await this.testnet.createTopic(memo);
      return result.topicId;
    }

    // Mock fallback
    return `0.0.${Date.now()}`;
  }

  getConfig(): HCS10Config {
    return { ...this.config };
  }
}
