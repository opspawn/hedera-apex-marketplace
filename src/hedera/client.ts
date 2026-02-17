/**
 * Hedera Testnet Client
 *
 * Initializes a Hedera testnet client using environment variables.
 * Falls back to mock mode when credentials are not available.
 *
 * Environment variables:
 * - HEDERA_ACCOUNT_ID: Hedera account ID (e.g. 0.0.12345)
 * - HEDERA_PRIVATE_KEY: ED25519 or ECDSA private key
 */

export interface HederaClientConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
}

export interface HederaClientStatus {
  mode: 'live' | 'mock';
  network: string;
  accountId: string;
  connected: boolean;
  mirrorNode: string;
}

export interface TopicInfo {
  topicId: string;
  memo: string;
  createdAt: string;
}

export interface MessageSubmitResult {
  topicId: string;
  sequenceNumber: number;
  timestamp: string;
}

export class HederaTestnetClient {
  private config: HederaClientConfig;
  private mockMode: boolean;
  private client: unknown = null;
  private mockTopicCounter = 0;
  private mockSequenceCounters: Map<string, number> = new Map();

  constructor(config?: Partial<HederaClientConfig>) {
    const accountId = config?.accountId || process.env.HEDERA_ACCOUNT_ID || '';
    const privateKey = config?.privateKey || process.env.HEDERA_PRIVATE_KEY || '';
    const network = config?.network || (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet';

    this.config = { accountId, privateKey, network };
    this.mockMode = !accountId || !privateKey;

    if (!this.mockMode) {
      this.initLiveClient();
    }
  }

  /**
   * Initialize live Hedera SDK client.
   * Uses Client.forTestnet() with operator credentials.
   */
  private initLiveClient(): void {
    let sdkClient: any = null;
    try {
      // Attempt to load @hashgraph/sdk dynamically
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('@hashgraph/sdk');
      if (this.config.network === 'testnet') {
        sdkClient = Client.forTestnet();
      } else {
        sdkClient = Client.forMainnet();
      }
      sdkClient.setOperator(this.config.accountId, this.config.privateKey);
      this.client = sdkClient;
    } catch {
      // SDK not available or credentials invalid — fall back to mock
      // Close the SDK client if it was created to prevent leaked timers
      if (sdkClient) {
        try { sdkClient.close(); } catch { /* ignore */ }
      }
      this.mockMode = true;
      this.client = null;
    }
  }

  /**
   * Check if running in mock mode.
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Get current client status.
   */
  getStatus(): HederaClientStatus {
    return {
      mode: this.mockMode ? 'mock' : 'live',
      network: this.config.network,
      accountId: this.config.accountId || 'mock-account',
      connected: !this.mockMode && this.client !== null,
      mirrorNode: this.config.network === 'testnet'
        ? 'testnet.mirrornode.hedera.com'
        : 'mainnet-public.mirrornode.hedera.com',
    };
  }

  /**
   * Create a new HCS topic.
   */
  async createTopic(memo: string): Promise<TopicInfo> {
    if (this.mockMode) {
      this.mockTopicCounter++;
      const topicId = `0.0.${8000000 + this.mockTopicCounter}`;
      return {
        topicId,
        memo,
        createdAt: new Date().toISOString(),
      };
    }

    // Live mode: use @hashgraph/sdk TopicCreateTransaction
    try {
      const { TopicCreateTransaction } = require('@hashgraph/sdk');
      const tx = new TopicCreateTransaction().setTopicMemo(memo);
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      return {
        topicId: receipt.topicId.toString(),
        memo,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`Failed to create topic: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Submit a message to an HCS topic.
   */
  async submitMessage(topicId: string, message: string | Record<string, unknown>): Promise<MessageSubmitResult> {
    const msgStr = typeof message === 'string' ? message : JSON.stringify(message);

    if (this.mockMode) {
      const seq = (this.mockSequenceCounters.get(topicId) || 0) + 1;
      this.mockSequenceCounters.set(topicId, seq);
      return {
        topicId,
        sequenceNumber: seq,
        timestamp: new Date().toISOString(),
      };
    }

    // Live mode
    try {
      const { TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(msgStr);
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      return {
        topicId,
        sequenceNumber: receipt.topicSequenceNumber?.toNumber() || 0,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`Failed to submit message: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Query messages from a topic via mirror node REST API.
   */
  async getTopicMessages(topicId: string, limit: number = 10): Promise<Array<{ content: string; sequenceNumber: number; timestamp: string }>> {
    if (this.mockMode) {
      return [];
    }

    const mirrorNode = this.getStatus().mirrorNode;
    const url = `https://${mirrorNode}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Mirror node returned ${res.status}`);
      }
      const data = await res.json() as { messages: Array<{ consensus_timestamp: string; sequence_number: number; message: string }> };
      return (data.messages || []).map(m => ({
        content: Buffer.from(m.message, 'base64').toString('utf-8'),
        sequenceNumber: m.sequence_number,
        timestamp: m.consensus_timestamp,
      }));
    } catch (err) {
      throw new Error(`Failed to query topic messages: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Get account balance (useful for demo status display).
   */
  async getAccountBalance(): Promise<{ hbar: number; tokens: Record<string, number> }> {
    if (this.mockMode) {
      return { hbar: 10000, tokens: {} };
    }

    try {
      const { AccountBalanceQuery } = require('@hashgraph/sdk');
      const balance = await new AccountBalanceQuery()
        .setAccountId(this.config.accountId)
        .execute(this.client);
      return {
        hbar: balance.hbars.toBigNumber().toNumber(),
        tokens: {},
      };
    } catch (err) {
      throw new Error(`Failed to get balance: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Close the client connection.
   */
  async close(): Promise<void> {
    if (this.client && !this.mockMode) {
      try {
        await (this.client as any).close();
      } catch {
        // Ignore close errors
      }
    }
    this.client = null;
  }
}
