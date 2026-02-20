/**
 * Testnet Integration Layer
 *
 * Bridges the HCS module stubs to real Hedera testnet operations
 * via the HederaTestnetClient. When credentials are available,
 * topic creation and message submission execute on the real network.
 *
 * When running in mock mode (no credentials), falls back gracefully
 * to local simulation — no testnet calls are made.
 */

import { HederaTestnetClient, TopicInfo, MessageSubmitResult } from './client';

export interface TestnetIntegrationConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  /** Maximum number of on-chain topics to create. After this limit, falls back to mock. */
  maxOnChainTopics?: number;
}

export interface TestnetTopicRecord {
  topicId: string;
  memo: string;
  createdAt: string;
  onChain: boolean;
}

export interface TestnetMessageRecord {
  topicId: string;
  sequenceNumber: number;
  timestamp: string;
  content: string;
  onChain: boolean;
}

export interface TestnetIntegrationStatus {
  mode: 'live' | 'mock';
  network: string;
  accountId: string;
  topicsCreated: number;
  messagesSubmitted: number;
  connected: boolean;
}

/**
 * TestnetIntegration wraps HederaTestnetClient to provide
 * higher-level operations used by the demo and marketplace flows.
 *
 * It tracks all topics and messages created during a session,
 * which is useful for demo recording and submission evidence.
 */
export class TestnetIntegration {
  private client: HederaTestnetClient;
  private topics: TestnetTopicRecord[] = [];
  private messages: TestnetMessageRecord[] = [];
  private config: TestnetIntegrationConfig;
  private onChainTopicCount = 0;

  constructor(config: TestnetIntegrationConfig) {
    this.config = config;
    this.client = new HederaTestnetClient({
      accountId: config.accountId,
      privateKey: config.privateKey,
      network: config.network,
    });
  }

  /**
   * Check if on-chain topic limit has been reached.
   * Used to budget HBAR by limiting on-chain topics to first N agents.
   */
  isOnChainLimitReached(): boolean {
    const limit = this.config.maxOnChainTopics;
    if (!limit) return false;
    return this.onChainTopicCount >= limit;
  }

  /**
   * Check if operating against real testnet or in mock mode.
   */
  isLive(): boolean {
    return !this.client.isMockMode();
  }

  /**
   * Get integration status.
   */
  getStatus(): TestnetIntegrationStatus {
    const clientStatus = this.client.getStatus();
    return {
      mode: clientStatus.mode,
      network: clientStatus.network,
      accountId: clientStatus.accountId,
      topicsCreated: this.topics.length,
      messagesSubmitted: this.messages.length,
      connected: clientStatus.connected,
    };
  }

  /**
   * Create an HCS topic on the testnet.
   * Used for agent registration, skill publishing, and task channels.
   * Respects maxOnChainTopics budget limit — falls back to mock when reached.
   */
  async createTopic(memo: string): Promise<TestnetTopicRecord> {
    const withinLimit = this.isLive() && !this.isOnChainLimitReached();

    let result: TopicInfo;
    let onChain: boolean;

    if (withinLimit) {
      // Create real on-chain topic
      result = await this.client.createTopic(memo);
      onChain = true;
      this.onChainTopicCount++;
    } else {
      // Generate mock topic ID (budget limit reached or not live)
      const mockCounter = this.topics.length + 1;
      result = {
        topicId: `0.0.${8000000 + mockCounter}`,
        memo,
        createdAt: new Date().toISOString(),
      };
      onChain = false;
    }

    const record: TestnetTopicRecord = {
      topicId: result.topicId,
      memo: result.memo,
      createdAt: result.createdAt,
      onChain,
    };
    this.topics.push(record);
    return record;
  }

  /**
   * Submit a message to an HCS topic on the testnet.
   * Used for agent registration messages, task specs, and profile updates.
   * Only submits on-chain when the topic is a real Hedera topic (not a mock ID).
   */
  async submitMessage(topicId: string, content: string | Record<string, unknown>): Promise<TestnetMessageRecord> {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    // Check if topicId is a mock topic (generated locally, not real Hedera)
    const isMockTopic = topicId.startsWith('0.0.800') || !this.isLive();

    let result: MessageSubmitResult;
    let onChain: boolean;

    if (!isMockTopic && this.isLive()) {
      result = await this.client.submitMessage(topicId, content);
      onChain = true;
    } else {
      // Mock submit for non-real topics
      const seq = this.messages.filter(m => m.topicId === topicId).length + 1;
      result = {
        topicId,
        sequenceNumber: seq,
        timestamp: new Date().toISOString(),
      };
      onChain = false;
    }

    const record: TestnetMessageRecord = {
      topicId: result.topicId,
      sequenceNumber: result.sequenceNumber,
      timestamp: result.timestamp,
      content: contentStr,
      onChain,
    };
    this.messages.push(record);
    return record;
  }

  /**
   * Read messages from a topic via mirror node.
   */
  async readMessages(topicId: string, limit?: number): Promise<Array<{ content: string; sequenceNumber: number; timestamp: string }>> {
    return this.client.getTopicMessages(topicId, limit);
  }

  /**
   * Get the account balance (HBAR).
   */
  async getAccountBalance(): Promise<{ hbar: number; tokens: Record<string, number> }> {
    return this.client.getAccountBalance();
  }

  /**
   * Get all topics created in this session.
   */
  getTopics(): TestnetTopicRecord[] {
    return [...this.topics];
  }

  /**
   * Get all messages submitted in this session.
   */
  getMessages(): TestnetMessageRecord[] {
    return [...this.messages];
  }

  /**
   * Get session summary for demo recording.
   */
  getSessionSummary(): {
    mode: string;
    network: string;
    topicsCreated: number;
    messagesSubmitted: number;
    onChainTopics: number;
    onChainMessages: number;
    topics: TestnetTopicRecord[];
    messages: TestnetMessageRecord[];
  } {
    return {
      mode: this.isLive() ? 'live' : 'mock',
      network: this.config.network,
      topicsCreated: this.topics.length,
      messagesSubmitted: this.messages.length,
      onChainTopics: this.topics.filter(t => t.onChain).length,
      onChainMessages: this.messages.filter(m => m.onChain).length,
      topics: this.getTopics(),
      messages: this.getMessages(),
    };
  }

  /**
   * Get the underlying HederaTestnetClient.
   */
  getClient(): HederaTestnetClient {
    return this.client;
  }

  /**
   * Close the client connection.
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}
