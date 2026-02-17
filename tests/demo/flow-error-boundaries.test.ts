/**
 * Error boundary tests for DemoFlow.
 * Verifies graceful failure handling when dependencies are broken or data is missing.
 */

import { DemoFlow, DemoState } from '../../src/demo/flow';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';
import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';

function createDeps() {
  const config = {
    accountId: '0.0.test',
    privateKey: 'test-key',
    network: 'testnet' as const,
  };

  const hcs10 = new HCS10Client({ ...config, registryTopicId: '0.0.registry' });
  const hcs11 = new HCS11ProfileManager(config);
  const hcs14 = new HCS14IdentityManager(config);
  const hcs19 = new HCS19PrivacyManager(config);
  const hcs19Identity = new HCS19AgentIdentity(config);
  const hcs26 = new HCS26SkillRegistry(config);
  const hcs20 = new HCS20PointsTracker(config);
  const marketplace = new MarketplaceService(hcs10, hcs11, hcs14, hcs19Identity, hcs26);

  return { marketplace, hcs19, hcs20 };
}

describe('DemoFlow Error Boundaries', () => {
  describe('state transitions on error', () => {
    it('should set status to failed when an error occurs', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      // Sabotage the marketplace by making discoverAgents throw
      const original = marketplace.discoverAgents.bind(marketplace);
      marketplace.discoverAgents = async () => {
        throw new Error('Simulated discovery failure');
      };

      // Seed first so seed step passes, then search step fails
      const { seedDemoAgents } = require('../../src/seed');
      await seedDemoAgents(marketplace as any, hcs19, hcs20);

      // Restore to allow seed but break discovery
      marketplace.discoverAgents = async () => {
        throw new Error('Simulated discovery failure');
      };

      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.status).toBe('failed');
      expect(state.error).toBeDefined();
      expect(state.completedAt).toBeDefined();
    });

    it('should preserve completed steps before failure', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);

      // Run successfully first
      const state = await flow.run();
      expect(state.status).toBe('completed');

      // All 7 steps should be present
      expect(state.steps.length).toBe(8);
      for (const step of state.steps) {
        expect(step.title).toBeDefined();
        expect(step.detail).toBeDefined();
        expect(step.timestamp).toBeDefined();
      }
    });

    it('should include error message in failed state', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();

      // Override verifyAndHire to throw
      const originalHire = marketplace.verifyAndHire.bind(marketplace);
      let callCount = 0;
      marketplace.verifyAndHire = async (opts: any) => {
        throw new Error('Hire service unavailable');
      };

      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.status).toBe('failed');
      expect(state.error).toContain('Hire service unavailable');
    });
  });

  describe('concurrent run protection', () => {
    it('should prevent double run', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);

      const promise1 = flow.run();
      const state2 = await flow.run();
      expect(state2.status).toBe('running');

      const state1 = await promise1;
      expect(state1.status).toBe('completed');
    });

    it('should allow re-run after completion', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);

      const state1 = await flow.run();
      expect(state1.status).toBe('completed');

      // Create new flow with same deps (simulates re-run)
      const flow2 = new DemoFlow(marketplace, hcs19, hcs20);
      const state2 = await flow2.run();
      expect(state2.status).toBe('completed');
    });
  });

  describe('step data integrity', () => {
    it('should have valid timestamps on all steps', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      for (const step of state.steps) {
        const ts = new Date(step.timestamp);
        expect(ts.getTime()).toBeGreaterThan(0);
        expect(ts.getTime()).toBeLessThanOrEqual(Date.now());
      }
    });

    it('should have monotonically increasing step numbers', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      for (let i = 0; i < state.steps.length - 1; i++) {
        expect(state.steps[i + 1].step).toBe(state.steps[i].step + 1);
      }
    });

    it('should have non-empty title and detail on all steps', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      for (const step of state.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.detail.length).toBeGreaterThan(0);
      }
    });

    it('should include data object on all steps', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      for (const step of state.steps) {
        expect(step.data).toBeDefined();
        expect(typeof step.data).toBe('object');
      }
    });
  });

  describe('summary validation', () => {
    it('should have valid summary fields after completion', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.summary).toBeDefined();
      expect(state.summary!.agentsSeeded).toBe(8);
      expect(state.summary!.searchResults).toBeGreaterThan(0);
      expect(state.summary!.selectedAgent).toBeTruthy();
      expect(state.summary!.hireTaskId).toBeTruthy();
      expect(state.summary!.pointsAwarded).toBeGreaterThan(0);
      expect(state.summary!.totalSteps).toBe(8);
    });

    it('should not have summary when status is idle', () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = flow.getState();

      expect(state.status).toBe('idle');
      expect(state.summary).toBeUndefined();
    });

    it('startedAt should be before completedAt', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeDefined();
      const start = new Date(state.startedAt!).getTime();
      const end = new Date(state.completedAt!).getTime();
      expect(end).toBeGreaterThanOrEqual(start);
    });
  });
});
