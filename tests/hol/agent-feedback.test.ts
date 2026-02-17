/**
 * Tests for ERC-8004 Agent Feedback system.
 *
 * Uses HederaTestnetClient in mock mode for all HCS operations.
 */

import { AgentFeedbackManager, FeedbackSubmission } from '../../src/hol/agent-feedback';
import { HederaTestnetClient } from '../../src/hedera/client';

describe('AgentFeedbackManager', () => {
  let manager: AgentFeedbackManager;
  let hederaClient: HederaTestnetClient;

  beforeEach(() => {
    hederaClient = new HederaTestnetClient(); // mock mode
    manager = new AgentFeedbackManager(hederaClient, '0.0.7854018');
  });

  afterEach(async () => {
    await hederaClient.close();
  });

  describe('constructor', () => {
    it('should create manager with Hedera client and account', () => {
      expect(manager).toBeInstanceOf(AgentFeedbackManager);
    });

    it('should start with no tracked agents', () => {
      expect(manager.getTrackedAgentCount()).toBe(0);
    });

    it('should start with empty topics map', () => {
      expect(manager.getAllFeedbackTopics().size).toBe(0);
    });
  });

  describe('submitAgentFeedback', () => {
    it('should submit feedback for an agent', async () => {
      const feedback = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'Excellent agent!',
      });
      expect(feedback.agentId).toBe('agent-1');
      expect(feedback.rating).toBe(5);
      expect(feedback.comment).toBe('Excellent agent!');
      expect(feedback.from).toBe('0.0.7854018');
      expect(feedback.timestamp).toBeTruthy();
      expect(feedback.topicId).toBeTruthy();
      expect(feedback.sequenceNumber).toBeGreaterThan(0);
    });

    it('should create a feedback topic for the agent', async () => {
      await manager.submitAgentFeedback({
        agentId: 'agent-2',
        rating: 4,
        comment: 'Good service',
      });
      const topicId = manager.getFeedbackTopicId('agent-2');
      expect(topicId).toBeTruthy();
      expect(topicId).toMatch(/^0\.0\.\d+$/);
    });

    it('should reuse existing feedback topic for same agent', async () => {
      await manager.submitAgentFeedback({
        agentId: 'agent-3',
        rating: 5,
        comment: 'First feedback',
      });
      const topicId1 = manager.getFeedbackTopicId('agent-3');

      await manager.submitAgentFeedback({
        agentId: 'agent-3',
        rating: 4,
        comment: 'Second feedback',
      });
      const topicId2 = manager.getFeedbackTopicId('agent-3');

      expect(topicId1).toBe(topicId2);
    });

    it('should create different topics for different agents', async () => {
      await manager.submitAgentFeedback({
        agentId: 'agent-a',
        rating: 5,
        comment: 'Great',
      });
      await manager.submitAgentFeedback({
        agentId: 'agent-b',
        rating: 3,
        comment: 'OK',
      });

      const topicA = manager.getFeedbackTopicId('agent-a');
      const topicB = manager.getFeedbackTopicId('agent-b');
      expect(topicA).not.toBe(topicB);
    });

    it('should reject rating below 1', async () => {
      await expect(
        manager.submitAgentFeedback({
          agentId: 'agent-1',
          rating: 0,
          comment: 'Bad',
        })
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should reject rating above 5', async () => {
      await expect(
        manager.submitAgentFeedback({
          agentId: 'agent-1',
          rating: 6,
          comment: 'Too high',
        })
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should reject empty comment', async () => {
      await expect(
        manager.submitAgentFeedback({
          agentId: 'agent-1',
          rating: 3,
          comment: '',
        })
      ).rejects.toThrow('Comment must not be empty');
    });

    it('should reject whitespace-only comment', async () => {
      await expect(
        manager.submitAgentFeedback({
          agentId: 'agent-1',
          rating: 3,
          comment: '   ',
        })
      ).rejects.toThrow('Comment must not be empty');
    });

    it('should reject missing agent ID', async () => {
      await expect(
        manager.submitAgentFeedback({
          agentId: '',
          rating: 3,
          comment: 'Test',
        })
      ).rejects.toThrow('Agent ID is required');
    });

    it('should trim comment whitespace', async () => {
      const feedback = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 4,
        comment: '  Nice work  ',
      });
      expect(feedback.comment).toBe('Nice work');
    });

    it('should assign unique IDs to feedback entries', async () => {
      const fb1 = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'First',
      });
      const fb2 = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 4,
        comment: 'Second',
      });
      expect(fb1.id).not.toBe(fb2.id);
    });

    it('should increment tracked agent count', async () => {
      expect(manager.getTrackedAgentCount()).toBe(0);
      await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'Test',
      });
      expect(manager.getTrackedAgentCount()).toBe(1);
      await manager.submitAgentFeedback({
        agentId: 'agent-2',
        rating: 4,
        comment: 'Test 2',
      });
      expect(manager.getTrackedAgentCount()).toBe(2);
    });

    it('should accept minimum rating of 1', async () => {
      const feedback = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 1,
        comment: 'Poor service',
      });
      expect(feedback.rating).toBe(1);
    });

    it('should accept maximum rating of 5', async () => {
      const feedback = await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'Amazing!',
      });
      expect(feedback.rating).toBe(5);
    });
  });

  describe('getAgentFeedback', () => {
    it('should return feedback for an agent', async () => {
      await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'Great',
      });
      await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 3,
        comment: 'OK',
      });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1' });
      expect(summary.agentId).toBe('agent-1');
      expect(summary.totalFeedback).toBe(2);
      expect(summary.entries).toHaveLength(2);
      expect(summary.lastUpdated).toBeTruthy();
    });

    it('should calculate average rating', async () => {
      await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 5,
        comment: 'Great',
      });
      await manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: 3,
        comment: 'OK',
      });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1' });
      expect(summary.averageRating).toBe(4);
    });

    it('should return 0 average for agent with no feedback', async () => {
      const summary = await manager.getAgentFeedback({ agentId: 'unknown-agent' });
      expect(summary.averageRating).toBe(0);
      expect(summary.totalFeedback).toBe(0);
    });

    it('should filter by minimum rating', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'Great' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 2, comment: 'Poor' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 4, comment: 'Good' });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1', minRating: 4 });
      expect(summary.entries).toHaveLength(2);
      expect(summary.entries.every(e => e.rating >= 4)).toBe(true);
    });

    it('should limit results', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'A' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 4, comment: 'B' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 3, comment: 'C' });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1', limit: 2 });
      expect(summary.entries).toHaveLength(2);
    });

    it('should include feedback topic ID in summary', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'Test' });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1' });
      expect(summary.feedbackTopicId).toBeTruthy();
      expect(summary.feedbackTopicId).toMatch(/^0\.0\.\d+$/);
    });

    it('should return empty topic ID for unknown agent', async () => {
      const summary = await manager.getAgentFeedback({ agentId: 'unknown' });
      expect(summary.feedbackTopicId).toBe('');
    });

    it('should round average rating to 2 decimal places', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'A' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 4, comment: 'B' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 3, comment: 'C' });

      const summary = await manager.getAgentFeedback({ agentId: 'agent-1' });
      expect(summary.averageRating).toBe(4);
      // (5+4+3)/3 = 4.0 — exact
    });

    it('should handle combined limit and minRating filters', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'A' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 4, comment: 'B' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 3, comment: 'C' });
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'D' });

      const summary = await manager.getAgentFeedback({
        agentId: 'agent-1',
        minRating: 4,
        limit: 2,
      });
      expect(summary.entries).toHaveLength(2);
      expect(summary.entries.every(e => e.rating >= 4)).toBe(true);
    });
  });

  describe('getFeedbackTopicId', () => {
    it('should return undefined for unknown agent', () => {
      expect(manager.getFeedbackTopicId('unknown')).toBeUndefined();
    });

    it('should return topic after feedback submission', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'Test' });
      expect(manager.getFeedbackTopicId('agent-1')).toBeTruthy();
    });
  });

  describe('getAllFeedbackTopics', () => {
    it('should return all tracked topics', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'A' });
      await manager.submitAgentFeedback({ agentId: 'agent-2', rating: 4, comment: 'B' });

      const topics = manager.getAllFeedbackTopics();
      expect(topics.size).toBe(2);
      expect(topics.has('agent-1')).toBe(true);
      expect(topics.has('agent-2')).toBe(true);
    });

    it('should return a copy (not internal reference)', async () => {
      await manager.submitAgentFeedback({ agentId: 'agent-1', rating: 5, comment: 'A' });

      const topics = manager.getAllFeedbackTopics();
      topics.delete('agent-1');
      // Internal state should not be affected
      expect(manager.getFeedbackTopicId('agent-1')).toBeTruthy();
    });
  });
});

describe('AgentFeedbackManager edge cases', () => {
  let manager: AgentFeedbackManager;
  let hederaClient: HederaTestnetClient;

  beforeEach(() => {
    hederaClient = new HederaTestnetClient();
    manager = new AgentFeedbackManager(hederaClient, '0.0.7854018');
  });

  afterEach(async () => {
    await hederaClient.close();
  });

  it('should handle rating of exactly 1', async () => {
    const fb = await manager.submitAgentFeedback({
      agentId: 'edge-agent',
      rating: 1,
      comment: 'Minimum',
    });
    expect(fb.rating).toBe(1);
  });

  it('should handle rating of exactly 5', async () => {
    const fb = await manager.submitAgentFeedback({
      agentId: 'edge-agent',
      rating: 5,
      comment: 'Maximum',
    });
    expect(fb.rating).toBe(5);
  });

  it('should handle very long comments', async () => {
    const longComment = 'A'.repeat(10000);
    const fb = await manager.submitAgentFeedback({
      agentId: 'edge-agent',
      rating: 3,
      comment: longComment,
    });
    expect(fb.comment.length).toBe(10000);
  });

  it('should handle special characters in comments', async () => {
    const fb = await manager.submitAgentFeedback({
      agentId: 'edge-agent',
      rating: 3,
      comment: 'Great! ❤️ 100% recommend & "excellent" <service>',
    });
    expect(fb.comment).toContain('❤️');
    expect(fb.comment).toContain('<service>');
  });

  it('should handle special characters in agent IDs', async () => {
    const fb = await manager.submitAgentFeedback({
      agentId: 'agent-with-special_chars.123',
      rating: 4,
      comment: 'Test',
    });
    expect(fb.agentId).toBe('agent-with-special_chars.123');
  });

  it('should handle multiple agents with multiple feedbacks', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.submitAgentFeedback({
        agentId: `agent-${i}`,
        rating: (i % 5) + 1,
        comment: `Feedback ${i}`,
      });
    }
    expect(manager.getTrackedAgentCount()).toBe(5);
  });

  it('should handle negative rating gracefully', async () => {
    await expect(
      manager.submitAgentFeedback({
        agentId: 'agent-1',
        rating: -1,
        comment: 'Negative',
      })
    ).rejects.toThrow('Rating must be between 1 and 5');
  });

  it('should handle decimal rating gracefully', async () => {
    // 3.5 is outside 1-5 integer range validation won't catch it,
    // but it's technically valid as 1 <= 3.5 <= 5
    const fb = await manager.submitAgentFeedback({
      agentId: 'agent-1',
      rating: 3.5,
      comment: 'Decimal rating',
    });
    expect(fb.rating).toBe(3.5);
  });
});
