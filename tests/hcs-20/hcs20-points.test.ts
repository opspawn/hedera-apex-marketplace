import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';

const TEST_CONFIG = {
  accountId: '0.0.7854018',
  privateKey: 'test-key',
  network: 'testnet' as const,
};

describe('HCS20PointsTracker', () => {
  let tracker: HCS20PointsTracker;

  beforeEach(() => {
    tracker = new HCS20PointsTracker(TEST_CONFIG);
  });

  describe('awardPoints', () => {
    it('should award points to an agent', async () => {
      const entry = await tracker.awardPoints({
        agentId: '0.0.123',
        points: 100,
        reason: 'task_completion',
        fromAgent: '0.0.456',
      });
      expect(entry.agent_id).toBe('0.0.123');
      expect(entry.points).toBe(100);
      expect(entry.reason).toBe('task_completion');
      expect(entry.from_agent).toBe('0.0.456');
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
    });

    it('should accumulate points for the same agent', async () => {
      await tracker.awardPoints({ agentId: '0.0.123', points: 50, reason: 'first' });
      await tracker.awardPoints({ agentId: '0.0.123', points: 30, reason: 'second' });
      expect(tracker.getAgentPoints('0.0.123')).toBe(80);
    });

    it('should track points independently per agent', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 100, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.2', points: 200, reason: 'test' });
      expect(tracker.getAgentPoints('0.0.1')).toBe(100);
      expect(tracker.getAgentPoints('0.0.2')).toBe(200);
    });

    it('should reject zero points', async () => {
      await expect(tracker.awardPoints({ agentId: '0.0.1', points: 0, reason: 'test' }))
        .rejects.toThrow('Points must be positive');
    });

    it('should reject negative points', async () => {
      await expect(tracker.awardPoints({ agentId: '0.0.1', points: -5, reason: 'test' }))
        .rejects.toThrow('Points must be positive');
    });

    it('should reject empty agentId', async () => {
      await expect(tracker.awardPoints({ agentId: '', points: 10, reason: 'test' }))
        .rejects.toThrow('agentId is required');
    });

    it('should reject empty reason', async () => {
      await expect(tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: '' }))
        .rejects.toThrow('Reason is required');
    });

    it('should default from_agent to system', async () => {
      const entry = await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'test' });
      expect(entry.from_agent).toBe('system');
    });
  });

  describe('getAgentPoints', () => {
    it('should return 0 for unknown agent', () => {
      expect(tracker.getAgentPoints('0.0.unknown')).toBe(0);
    });

    it('should return correct total after multiple awards', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'a' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 20, reason: 'b' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 30, reason: 'c' });
      expect(tracker.getAgentPoints('0.0.1')).toBe(60);
    });
  });

  describe('getAgentSummary', () => {
    it('should return empty summary for unknown agent', () => {
      const summary = tracker.getAgentSummary('0.0.unknown');
      expect(summary.total_points).toBe(0);
      expect(summary.entries).toEqual([]);
      expect(summary.breakdown).toEqual({});
    });

    it('should include breakdown by reason category', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 100, reason: 'initial_registration' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 25, reason: 'skill_published:Translation' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 25, reason: 'skill_published:Sentiment' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 50, reason: 'task_completion' });

      const summary = tracker.getAgentSummary('0.0.1');
      expect(summary.total_points).toBe(200);
      expect(summary.breakdown['initial_registration']).toBe(100);
      expect(summary.breakdown['skill_published']).toBe(50);
      expect(summary.breakdown['task_completion']).toBe(50);
    });

    it('should include all entries in history', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'a' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 20, reason: 'b' });
      const summary = tracker.getAgentSummary('0.0.1');
      expect(summary.entries.length).toBe(2);
      expect(summary.entries[0].points).toBe(10);
      expect(summary.entries[1].points).toBe(20);
    });
  });

  describe('getPointHistory', () => {
    it('should return empty array for unknown agent', () => {
      expect(tracker.getPointHistory('0.0.unknown')).toEqual([]);
    });

    it('should return entries in order', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'first' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 20, reason: 'second' });
      const history = tracker.getPointHistory('0.0.1');
      expect(history[0].reason).toBe('first');
      expect(history[1].reason).toBe('second');
    });
  });

  describe('getLeaderboard', () => {
    it('should return empty leaderboard when no agents', () => {
      expect(tracker.getLeaderboard()).toEqual([]);
    });

    it('should sort by total points descending', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 50, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.2', points: 200, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.3', points: 100, reason: 'test' });

      const board = tracker.getLeaderboard(10);
      expect(board[0].agent_id).toBe('0.0.2');
      expect(board[1].agent_id).toBe('0.0.3');
      expect(board[2].agent_id).toBe('0.0.1');
    });

    it('should respect limit parameter', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.2', points: 20, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.3', points: 30, reason: 'test' });

      const board = tracker.getLeaderboard(2);
      expect(board.length).toBe(2);
    });
  });

  describe('getAgentCount', () => {
    it('should return 0 initially', () => {
      expect(tracker.getAgentCount()).toBe(0);
    });

    it('should count unique agents', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 10, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.1', points: 20, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.2', points: 30, reason: 'test' });
      expect(tracker.getAgentCount()).toBe(2);
    });
  });

  describe('getTotalPointsAwarded', () => {
    it('should return 0 initially', () => {
      expect(tracker.getTotalPointsAwarded()).toBe(0);
    });

    it('should sum all points across agents', async () => {
      await tracker.awardPoints({ agentId: '0.0.1', points: 100, reason: 'test' });
      await tracker.awardPoints({ agentId: '0.0.2', points: 200, reason: 'test' });
      expect(tracker.getTotalPointsAwarded()).toBe(300);
    });
  });

  describe('getConfig', () => {
    it('should return config copy', () => {
      const config = tracker.getConfig();
      expect(config.accountId).toBe(TEST_CONFIG.accountId);
      expect(config.network).toBe('testnet');
    });
  });
});
