/**
 * ERC-8004 On-Chain Agent Feedback
 *
 * Stores and retrieves agent feedback/ratings on HCS topics, following
 * the ERC-8004 pattern for on-chain reputation and feedback.
 *
 * Each agent has a dedicated feedback topic (created lazily). Feedback
 * entries are JSON messages submitted to HCS, queryable via mirror node.
 *
 * Format per ERC-8004:
 * {
 *   "p": "erc-8004",
 *   "op": "feedback",
 *   "agent_id": "...",
 *   "rating": 1-5,
 *   "comment": "...",
 *   "from": "account_id",
 *   "timestamp": "ISO"
 * }
 */

import { HederaTestnetClient } from '../hedera/client';

export interface AgentFeedback {
  id: string;
  agentId: string;
  rating: number;
  comment: string;
  from: string;
  timestamp: string;
  topicId: string;
  sequenceNumber: number;
}

export interface FeedbackSubmission {
  agentId: string;
  rating: number;
  comment: string;
}

export interface AgentFeedbackSummary {
  agentId: string;
  averageRating: number;
  totalFeedback: number;
  feedbackTopicId: string;
  entries: AgentFeedback[];
  lastUpdated: string;
}

export interface FeedbackQuery {
  agentId: string;
  limit?: number;
  minRating?: number;
}

export class AgentFeedbackManager {
  private hederaClient: HederaTestnetClient;
  private accountId: string;
  private feedbackTopics: Map<string, string> = new Map();
  private feedbackCache: Map<string, AgentFeedback[]> = new Map();

  constructor(hederaClient: HederaTestnetClient, accountId: string) {
    this.hederaClient = hederaClient;
    this.accountId = accountId;
  }

  /**
   * Submit feedback for an agent. Creates a feedback topic if one
   * doesn't exist yet for this agent.
   */
  async submitAgentFeedback(submission: FeedbackSubmission): Promise<AgentFeedback> {
    if (submission.rating < 1 || submission.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    if (!submission.comment || submission.comment.trim().length === 0) {
      throw new Error('Comment must not be empty');
    }
    if (!submission.agentId) {
      throw new Error('Agent ID is required');
    }

    const topicId = await this.ensureFeedbackTopic(submission.agentId);

    const message = {
      p: 'erc-8004',
      op: 'feedback',
      agent_id: submission.agentId,
      rating: submission.rating,
      comment: submission.comment.trim(),
      from: this.accountId,
      timestamp: new Date().toISOString(),
    };

    const result = await this.hederaClient.submitMessage(topicId, message);

    const feedback: AgentFeedback = {
      id: `fb-${result.sequenceNumber}`,
      agentId: submission.agentId,
      rating: submission.rating,
      comment: submission.comment.trim(),
      from: this.accountId,
      timestamp: message.timestamp,
      topicId,
      sequenceNumber: result.sequenceNumber,
    };

    // Update cache
    const cached = this.feedbackCache.get(submission.agentId) || [];
    cached.push(feedback);
    this.feedbackCache.set(submission.agentId, cached);

    return feedback;
  }

  /**
   * Get feedback for an agent from the HCS topic via mirror node.
   * Falls back to local cache if mirror node is unavailable.
   */
  async getAgentFeedback(query: FeedbackQuery): Promise<AgentFeedbackSummary> {
    const topicId = this.feedbackTopics.get(query.agentId);
    let entries: AgentFeedback[] = [];

    if (topicId) {
      try {
        const messages = await this.hederaClient.getTopicMessages(
          topicId,
          query.limit || 50
        );

        entries = messages
          .map(msg => {
            try {
              const data = JSON.parse(msg.content);
              if (data.p !== 'erc-8004' || data.op !== 'feedback') return null;
              return {
                id: `fb-${msg.sequenceNumber}`,
                agentId: data.agent_id || query.agentId,
                rating: data.rating || 0,
                comment: data.comment || '',
                from: data.from || 'unknown',
                timestamp: data.timestamp || msg.timestamp,
                topicId,
                sequenceNumber: msg.sequenceNumber,
              } as AgentFeedback;
            } catch {
              return null;
            }
          })
          .filter((e): e is AgentFeedback => e !== null);

        // If mirror node returned no entries, fall back to cache
        if (entries.length === 0) {
          entries = this.feedbackCache.get(query.agentId) || [];
        }
      } catch {
        // Fall back to cache
        entries = this.feedbackCache.get(query.agentId) || [];
      }
    } else {
      // No topic yet — use cache
      entries = this.feedbackCache.get(query.agentId) || [];
    }

    // Apply filters
    if (query.minRating) {
      entries = entries.filter(e => e.rating >= (query.minRating || 0));
    }
    if (query.limit) {
      entries = entries.slice(0, query.limit);
    }

    const averageRating = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.rating, 0) / entries.length
      : 0;

    return {
      agentId: query.agentId,
      averageRating: Math.round(averageRating * 100) / 100,
      totalFeedback: entries.length,
      feedbackTopicId: topicId || '',
      entries,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get or create a feedback topic for an agent.
   */
  private async ensureFeedbackTopic(agentId: string): Promise<string> {
    const existing = this.feedbackTopics.get(agentId);
    if (existing) return existing;

    const topicInfo = await this.hederaClient.createTopic(
      `erc-8004:feedback:${agentId}`
    );
    this.feedbackTopics.set(agentId, topicInfo.topicId);
    return topicInfo.topicId;
  }

  /**
   * Get the feedback topic ID for an agent (if it exists).
   */
  getFeedbackTopicId(agentId: string): string | undefined {
    return this.feedbackTopics.get(agentId);
  }

  /**
   * Get all tracked feedback topics.
   */
  getAllFeedbackTopics(): Map<string, string> {
    return new Map(this.feedbackTopics);
  }

  /**
   * Get the number of agents with feedback topics.
   */
  getTrackedAgentCount(): number {
    return this.feedbackTopics.size;
  }
}
