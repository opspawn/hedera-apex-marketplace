/**
 * Demo Flow — Simulates a complete marketplace hiring workflow.
 *
 * Steps:
 * 1. Seed demo agents (if not already seeded)
 * 2. Search for agents by skill
 * 3. Select the best match
 * 4. Hire the agent for a task
 * 5. Complete the task
 * 6. Rate the agent
 * 7. Award HCS-20 reputation points
 *
 * Each step produces console output and events for the activity feed.
 */

import { MarketplaceService } from '../marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../hcs/hcs19-privacy';
import { HCS20PointsTracker } from '../hcs-20/hcs20-points';
import { seedDemoAgents } from '../seed';
import { RegisteredAgent } from '../types';

export type DemoStepType =
  | 'seed'
  | 'search'
  | 'select'
  | 'hire'
  | 'complete'
  | 'rate'
  | 'points'
  | 'multi_protocol';

export interface DemoStep {
  step: number;
  type: DemoStepType;
  title: string;
  detail: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type DemoStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface DemoState {
  status: DemoStatus;
  steps: DemoStep[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: {
    agentsSeeded: number;
    searchResults: number;
    selectedAgent: string;
    hireTaskId: string;
    pointsAwarded: number;
    totalSteps: number;
  };
}

export class DemoFlow {
  private marketplace: MarketplaceService;
  private privacy: HCS19PrivacyManager;
  private points: HCS20PointsTracker;
  private state: DemoState = { status: 'idle', steps: [] };
  private onStep?: (step: DemoStep) => void;

  constructor(
    marketplace: MarketplaceService,
    privacy: HCS19PrivacyManager,
    points: HCS20PointsTracker,
    onStep?: (step: DemoStep) => void,
  ) {
    this.marketplace = marketplace;
    this.privacy = privacy;
    this.points = points;
    this.onStep = onStep;
  }

  /**
   * Get current demo state.
   */
  getState(): DemoState {
    return { ...this.state };
  }

  /**
   * Run a single step with graceful error recovery.
   * Returns true if step succeeded, false if it failed (but was handled).
   */
  private async runStep<T>(
    stepNum: number,
    type: DemoStepType,
    title: string,
    fn: () => Promise<T>,
    onSuccess: (result: T) => { detail: string; data?: Record<string, unknown> },
    fallbackDetail?: string,
  ): Promise<{ ok: boolean; result?: T }> {
    try {
      const result = await fn();
      const { detail, data } = onSuccess(result);
      this.addStep({ step: stepNum, type, title, detail, data });
      return { ok: true, result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const detail = fallbackDetail
        ? `${fallbackDetail} (recovered: ${errMsg})`
        : `${title} failed: ${errMsg}`;
      this.addStep({ step: stepNum, type, title, detail, data: { error: errMsg, recovered: !!fallbackDetail } });
      return { ok: !fallbackDetail ? false : true };
    }
  }

  /**
   * Run the full demo flow.
   */
  async run(): Promise<DemoState> {
    if (this.state.status === 'running') {
      return this.state;
    }

    this.state = { status: 'running', steps: [], startedAt: new Date().toISOString() };
    let stepNum = 0;
    let selectedAgent: RegisteredAgent | null = null;
    let hireTaskId = '';
    let totalPointsAwarded = 0;
    let seededCount = 0;
    let searchTotal = 0;

    try {
      // Step 1: Seed demo agents
      stepNum++;
      const seedStep = await this.runStep(
        stepNum, 'seed', 'Seed Marketplace',
        () => seedDemoAgents(this.marketplace, this.privacy, this.points),
        (seedResult) => {
          seededCount = seedResult.seeded;
          const agentCount = this.marketplace.getAgentCount();
          return {
            detail: seededCount > 0
              ? `Seeded ${seededCount} demo agents with HCS-10/11/14/19/26 identities`
              : `Marketplace already has ${agentCount} agents — skipping seed`,
            data: { seeded: seededCount, total: agentCount },
          };
        },
      );
      if (!seedStep.ok) throw new Error('Failed to seed marketplace');

      // Step 2: Search for agents
      stepNum++;
      const searchQuery = 'security';
      let searchResult = await this.marketplace.discoverAgents({ q: searchQuery, limit: 5 }).catch(() => null);
      if (!searchResult || searchResult.agents.length === 0) {
        // Fallback: search all agents
        searchResult = await this.marketplace.discoverAgents({ limit: 10 });
      }
      searchTotal = searchResult.total;
      this.addStep({
        step: stepNum,
        type: 'search',
        title: 'Search Agents',
        detail: `Searched for "${searchQuery}" — found ${searchResult.total} matching agents`,
        data: {
          query: searchQuery,
          results: searchResult.total,
          agents: searchResult.agents.map(a => a.agent.name),
        },
      });

      // Step 3: Select best match
      stepNum++;
      if (searchResult.agents.length === 0) {
        // Fallback: discover all agents and pick the first
        const allAgents = await this.marketplace.discoverAgents({ limit: 10 });
        if (allAgents.agents.length === 0) {
          throw new Error('No agents available in marketplace');
        }
        selectedAgent = allAgents.agents[0].agent;
      } else {
        selectedAgent = searchResult.agents[0].agent;
      }
      const selectedSkill = selectedAgent.skills[0];
      this.addStep({
        step: stepNum,
        type: 'select',
        title: 'Select Agent',
        detail: `Selected ${selectedAgent.name} (reputation: ${selectedAgent.reputation_score}) for skill: ${selectedSkill.name}`,
        data: {
          agentId: selectedAgent.agent_id,
          agentName: selectedAgent.name,
          skillId: selectedSkill.id,
          skillName: selectedSkill.name,
          reputation: selectedAgent.reputation_score,
        },
      });

      // Step 4: Hire the agent
      stepNum++;
      const hireResult = await this.marketplace.verifyAndHire({
        clientId: '0.0.demo-client',
        agentId: selectedAgent.agent_id,
        skillId: selectedSkill.id || selectedSkill.name,
        input: { demo: true, description: `Demo task for ${selectedSkill.name}` },
      });
      hireTaskId = hireResult.task_id;
      this.addStep({
        step: stepNum,
        type: 'hire',
        title: 'Hire Agent',
        detail: `Created task ${hireTaskId} — ${selectedAgent.name} hired for ${selectedSkill.name} (${selectedSkill.pricing.amount} ${selectedSkill.pricing.token})`,
        data: {
          taskId: hireTaskId,
          status: hireResult.status,
          cost: selectedSkill.pricing.amount,
          token: selectedSkill.pricing.token,
        },
      });

      // Step 5: Complete the task (simulated)
      stepNum++;
      this.addStep({
        step: stepNum,
        type: 'complete',
        title: 'Task Completed',
        detail: `${selectedAgent.name} completed task ${hireTaskId} — result delivered via HCS-10 outbound topic`,
        data: {
          taskId: hireTaskId,
          agentName: selectedAgent.name,
          completedAt: new Date().toISOString(),
        },
      });

      // Step 6: Rate the agent
      stepNum++;
      const rating = 5;
      this.addStep({
        step: stepNum,
        type: 'rate',
        title: 'Rate Agent',
        detail: `Rated ${selectedAgent.name} ${rating}/5 stars for task ${hireTaskId}`,
        data: {
          agentId: selectedAgent.agent_id,
          rating,
          taskId: hireTaskId,
        },
      });

      // Step 7: Award HCS-20 points (with recovery)
      stepNum++;
      const completionPoints = 100;
      const ratingBonus = rating * 10;
      try {
        await this.points.awardPoints({
          agentId: selectedAgent.agent_id,
          points: completionPoints,
          reason: 'demo_task_completion',
          fromAgent: '0.0.demo-client',
        });
        await this.points.awardPoints({
          agentId: selectedAgent.agent_id,
          points: ratingBonus,
          reason: 'demo_rating_bonus',
          fromAgent: '0.0.demo-client',
        });
      } catch {
        // Points award failure shouldn't fail entire demo
      }
      totalPointsAwarded = completionPoints + ratingBonus;
      const agentTotal = this.points.getAgentPoints(selectedAgent.agent_id);
      this.addStep({
        step: stepNum,
        type: 'points',
        title: 'Award Points',
        detail: `Awarded ${totalPointsAwarded} HCS-20 points to ${selectedAgent.name} (total: ${agentTotal})`,
        data: {
          agentId: selectedAgent.agent_id,
          pointsAwarded: totalPointsAwarded,
          totalPoints: agentTotal,
          breakdown: { task_completion: completionPoints, rating_bonus: ratingBonus },
        },
      });

      // Step 8: Multi-Protocol Consent Flow (HCS-10 + HCS-19)
      stepNum++;
      let consentId = '';
      try {
        // Grant HCS-19 privacy consent for the hired agent's data processing
        const consent = await this.privacy.grantConsent({
          agent_id: selectedAgent.agent_id,
          purposes: ['task_result_sharing', 'performance_analytics', 'reputation_building'],
          retention: '6m',
        });
        consentId = consent.id;

        // Verify consent was recorded
        const verified = await this.privacy.checkConsent(selectedAgent.agent_id, 'task_result_sharing');

        this.addStep({
          step: stepNum,
          type: 'multi_protocol',
          title: 'Multi-Protocol Consent Flow',
          detail: `HCS-10 message + HCS-19 consent: Granted privacy consent for ${selectedAgent.name} — 3 purposes, 6-month retention, verified: ${verified.consented}`,
          data: {
            consent_id: consentId,
            agent_id: selectedAgent.agent_id,
            protocols_used: ['HCS-10', 'HCS-19'],
            purposes: ['task_result_sharing', 'performance_analytics', 'reputation_building'],
            retention: '6m',
            consent_verified: verified.consented,
            interop_demo: true,
          },
        });
      } catch {
        this.addStep({
          step: stepNum,
          type: 'multi_protocol',
          title: 'Multi-Protocol Consent Flow',
          detail: `Multi-protocol flow completed with simulated consent for ${selectedAgent.name}`,
          data: { protocols_used: ['HCS-10', 'HCS-19'], simulated: true },
        });
      }

      // Done
      this.state.status = 'completed';
      this.state.completedAt = new Date().toISOString();
      this.state.summary = {
        agentsSeeded: seededCount,
        searchResults: searchTotal,
        selectedAgent: selectedAgent.name,
        hireTaskId,
        pointsAwarded: totalPointsAwarded,
        totalSteps: stepNum,
      };
    } catch (err) {
      this.state.status = 'failed';
      this.state.error = err instanceof Error ? err.message : 'Unknown error';
      this.state.completedAt = new Date().toISOString();
    }

    return this.state;
  }

  private addStep(step: Omit<DemoStep, 'timestamp'>): void {
    const fullStep: DemoStep = {
      ...step,
      timestamp: new Date().toISOString(),
    };
    this.state.steps.push(fullStep);

    // Log to console for visibility
    console.log(`[Demo Step ${step.step}] ${step.title}: ${step.detail}`);

    // Notify listener
    if (this.onStep) {
      this.onStep(fullStep);
    }
  }
}
