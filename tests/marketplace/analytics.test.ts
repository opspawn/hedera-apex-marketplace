/**
 * Tests for the Analytics Tracker.
 * Sprint 29 — aggregate stats, protocol usage, demo tracking.
 */

import { AnalyticsTracker } from '../../src/marketplace/analytics';

describe('AnalyticsTracker', () => {
  let tracker: AnalyticsTracker;

  beforeEach(() => {
    tracker = new AnalyticsTracker();
  });

  describe('agent registration tracking', () => {
    it('starts with zero agents', () => {
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.total_agents).toBe(0);
    });

    it('increments agent count on registration', () => {
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.total_agents).toBe(1);
    });

    it('tracks multiple registrations', () => {
      tracker.recordAgentRegistration(['hcs-10']);
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      tracker.recordAgentRegistration(['a2a']);
      expect(tracker.getCurrentMetrics().total_agents).toBe(3);
    });

    it('tracks protocol usage from registrations', () => {
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      tracker.recordAgentRegistration(['hcs-10', 'hcs-26']);
      const usage = tracker.getProtocolUsage();
      const hcs10 = usage.find(u => u.protocol === 'hcs-10');
      expect(hcs10).toBeDefined();
      expect(hcs10!.agent_count).toBe(2);
    });
  });

  describe('connection tracking', () => {
    it('starts with zero connections', () => {
      expect(tracker.getCurrentMetrics().active_connections).toBe(0);
    });

    it('increments on connection', () => {
      tracker.recordConnection();
      expect(tracker.getCurrentMetrics().active_connections).toBe(1);
    });

    it('decrements on disconnection', () => {
      tracker.recordConnection();
      tracker.recordConnection();
      tracker.recordDisconnection();
      expect(tracker.getCurrentMetrics().active_connections).toBe(1);
    });

    it('does not go below zero', () => {
      tracker.recordDisconnection();
      expect(tracker.getCurrentMetrics().active_connections).toBe(0);
    });
  });

  describe('task tracking', () => {
    it('starts with zero tasks', () => {
      expect(tracker.getCurrentMetrics().total_tasks).toBe(0);
    });

    it('increments on task', () => {
      tracker.recordTask();
      tracker.recordTask();
      expect(tracker.getCurrentMetrics().total_tasks).toBe(2);
    });
  });

  describe('consent tracking', () => {
    it('starts with zero consents', () => {
      expect(tracker.getCurrentMetrics().total_consents).toBe(0);
    });

    it('increments on consent', () => {
      tracker.recordConsent();
      expect(tracker.getCurrentMetrics().total_consents).toBe(1);
    });
  });

  describe('demo tracking', () => {
    it('starts with zero demo runs', () => {
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.demo_runs).toBe(0);
      expect(metrics.demo_completions).toBe(0);
    });

    it('tracks completed demo runs', () => {
      tracker.recordDemoRun(true);
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.demo_runs).toBe(1);
      expect(metrics.demo_completions).toBe(1);
    });

    it('tracks failed demo runs', () => {
      tracker.recordDemoRun(false);
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.demo_runs).toBe(1);
      expect(metrics.demo_completions).toBe(0);
    });

    it('calculates completion rate correctly', () => {
      tracker.recordDemoRun(true);
      tracker.recordDemoRun(true);
      tracker.recordDemoRun(false);
      const summary = tracker.getSummary();
      expect(summary.current.demo_completion_rate).toBe(67); // 2/3 = 67%
    });

    it('returns 0% completion rate when no demos run', () => {
      const summary = tracker.getSummary();
      expect(summary.current.demo_completion_rate).toBe(0);
    });
  });

  describe('snapshots', () => {
    it('takes a point-in-time snapshot', () => {
      tracker.recordAgentRegistration(['hcs-10']);
      tracker.recordTask();
      const snapshot = tracker.takeSnapshot();
      expect(snapshot.total_agents).toBe(1);
      expect(snapshot.total_tasks).toBe(1);
      expect(snapshot.timestamp).toBeDefined();
    });

    it('includes snapshots in summary history', () => {
      tracker.takeSnapshot();
      tracker.takeSnapshot();
      const summary = tracker.getSummary();
      expect(summary.history.length).toBe(2);
    });

    it('limits history to 100 snapshots', () => {
      for (let i = 0; i < 110; i++) {
        tracker.takeSnapshot();
      }
      const summary = tracker.getSummary();
      expect(summary.history.length).toBe(100);
    });
  });

  describe('getSummary', () => {
    it('returns complete summary structure', () => {
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      tracker.recordConnection();
      tracker.recordTask();
      tracker.recordConsent();
      tracker.recordDemoRun(true);

      const summary = tracker.getSummary();
      expect(summary.current.total_agents).toBe(1);
      expect(summary.current.active_connections).toBe(1);
      expect(summary.current.total_tasks).toBe(1);
      expect(summary.current.total_consents).toBe(1);
      expect(summary.current.demo_runs).toBe(1);
      expect(summary.current.demo_completions).toBe(1);
      expect(summary.current.demo_completion_rate).toBe(100);
      expect(summary.protocol_usage.length).toBeGreaterThan(0);
      expect(summary.timestamp).toBeDefined();
    });

    it('sorts protocol usage by count descending', () => {
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      tracker.recordAgentRegistration(['hcs-10', 'hcs-26']);
      tracker.recordAgentRegistration(['hcs-10']);
      const summary = tracker.getSummary();
      expect(summary.protocol_usage[0].protocol).toBe('hcs-10');
      expect(summary.protocol_usage[0].agent_count).toBe(3);
    });
  });

  describe('getProtocolUsage', () => {
    it('returns empty array when no agents registered', () => {
      expect(tracker.getProtocolUsage()).toEqual([]);
    });

    it('calculates percentage correctly', () => {
      tracker.recordAgentRegistration(['hcs-10']);
      tracker.recordAgentRegistration(['hcs-10', 'hcs-19']);
      const usage = tracker.getProtocolUsage();
      const hcs10 = usage.find(u => u.protocol === 'hcs-10');
      expect(hcs10!.percentage).toBe(100); // 2 out of 2 agents
    });

    it('normalizes protocol names to lowercase', () => {
      tracker.recordAgentRegistration(['HCS-10', 'A2A']);
      const usage = tracker.getProtocolUsage();
      expect(usage.map(u => u.protocol)).toContain('hcs-10');
      expect(usage.map(u => u.protocol)).toContain('a2a');
    });
  });

  describe('setInitialState', () => {
    it('sets all metrics at once', () => {
      tracker.setInitialState(10, 5, 20, 8);
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.total_agents).toBe(10);
      expect(metrics.active_connections).toBe(5);
      expect(metrics.total_tasks).toBe(20);
      expect(metrics.total_consents).toBe(8);
    });
  });
});
