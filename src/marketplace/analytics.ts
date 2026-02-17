/**
 * Analytics Service — Aggregate stats for the marketplace dashboard.
 *
 * Tracks:
 * - Total agents over time
 * - Active connections
 * - Protocol usage breakdown
 * - Demo flow completion rate
 */

export interface ProtocolUsage {
  protocol: string;
  agent_count: number;
  percentage: number;
}

export interface AnalyticsSnapshot {
  timestamp: string;
  total_agents: number;
  active_connections: number;
  total_tasks: number;
  total_consents: number;
}

export interface AnalyticsSummary {
  current: {
    total_agents: number;
    active_connections: number;
    total_tasks: number;
    total_consents: number;
    demo_runs: number;
    demo_completions: number;
    demo_completion_rate: number;
  };
  protocol_usage: ProtocolUsage[];
  history: AnalyticsSnapshot[];
  timestamp: string;
}

export class AnalyticsTracker {
  private agentTimeline: Array<{ timestamp: string; count: number }> = [];
  private connectionTimeline: Array<{ timestamp: string; count: number }> = [];
  private totalAgents = 0;
  private activeConnections = 0;
  private totalTasks = 0;
  private totalConsents = 0;
  private demoRuns = 0;
  private demoCompletions = 0;
  private protocolCounts: Map<string, number> = new Map();
  private snapshots: AnalyticsSnapshot[] = [];

  /**
   * Record an agent registration event.
   */
  recordAgentRegistration(protocols: string[]): void {
    this.totalAgents++;
    this.agentTimeline.push({ timestamp: new Date().toISOString(), count: this.totalAgents });

    for (const protocol of protocols) {
      const normalized = protocol.toLowerCase();
      const current = this.protocolCounts.get(normalized) || 0;
      this.protocolCounts.set(normalized, current + 1);
    }
  }

  /**
   * Record a connection event.
   */
  recordConnection(): void {
    this.activeConnections++;
    this.connectionTimeline.push({ timestamp: new Date().toISOString(), count: this.activeConnections });
  }

  /**
   * Record a disconnection event.
   */
  recordDisconnection(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /**
   * Record a task execution.
   */
  recordTask(): void {
    this.totalTasks++;
  }

  /**
   * Record a consent grant.
   */
  recordConsent(): void {
    this.totalConsents++;
  }

  /**
   * Record a demo flow execution.
   */
  recordDemoRun(completed: boolean): void {
    this.demoRuns++;
    if (completed) {
      this.demoCompletions++;
    }
  }

  /**
   * Take a point-in-time snapshot for history.
   */
  takeSnapshot(): AnalyticsSnapshot {
    const snapshot: AnalyticsSnapshot = {
      timestamp: new Date().toISOString(),
      total_agents: this.totalAgents,
      active_connections: this.activeConnections,
      total_tasks: this.totalTasks,
      total_consents: this.totalConsents,
    };
    this.snapshots.push(snapshot);
    // Keep only the last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }
    return snapshot;
  }

  /**
   * Get the full analytics summary.
   */
  getSummary(): AnalyticsSummary {
    const protocolUsage: ProtocolUsage[] = [];
    const totalProtocolAgents = this.totalAgents || 1; // avoid division by zero

    for (const [protocol, count] of this.protocolCounts.entries()) {
      protocolUsage.push({
        protocol,
        agent_count: count,
        percentage: Math.round((count / totalProtocolAgents) * 100),
      });
    }

    // Sort by usage count descending
    protocolUsage.sort((a, b) => b.agent_count - a.agent_count);

    return {
      current: {
        total_agents: this.totalAgents,
        active_connections: this.activeConnections,
        total_tasks: this.totalTasks,
        total_consents: this.totalConsents,
        demo_runs: this.demoRuns,
        demo_completions: this.demoCompletions,
        demo_completion_rate: this.demoRuns > 0
          ? Math.round((this.demoCompletions / this.demoRuns) * 100)
          : 0,
      },
      protocol_usage: protocolUsage,
      history: this.snapshots,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get just the current metrics.
   */
  getCurrentMetrics() {
    return {
      total_agents: this.totalAgents,
      active_connections: this.activeConnections,
      total_tasks: this.totalTasks,
      total_consents: this.totalConsents,
      demo_runs: this.demoRuns,
      demo_completions: this.demoCompletions,
    };
  }

  /**
   * Get protocol usage breakdown.
   */
  getProtocolUsage(): ProtocolUsage[] {
    const usage: ProtocolUsage[] = [];
    const total = this.totalAgents || 1;
    for (const [protocol, count] of this.protocolCounts.entries()) {
      usage.push({
        protocol,
        agent_count: count,
        percentage: Math.round((count / total) * 100),
      });
    }
    return usage.sort((a, b) => b.agent_count - a.agent_count);
  }

  /**
   * Set initial state (used when loading from seed data).
   */
  setInitialState(agents: number, connections: number, tasks: number, consents: number): void {
    this.totalAgents = agents;
    this.activeConnections = connections;
    this.totalTasks = tasks;
    this.totalConsents = consents;
  }
}
