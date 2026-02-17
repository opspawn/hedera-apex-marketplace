import { DemoFlow, DemoState, DemoStep } from '../../src/demo/flow';
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

describe('DemoFlow', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = flow.getState();
      expect(state.status).toBe('idle');
      expect(state.steps).toEqual([]);
    });
  });

  describe('run', () => {
    it('should complete the full demo flow', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.status).toBe('completed');
      expect(state.steps.length).toBe(7);
      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeDefined();
      expect(state.summary).toBeDefined();
    });

    it('should produce steps in correct order', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const types = state.steps.map(s => s.type);
      expect(types).toEqual(['seed', 'search', 'select', 'hire', 'complete', 'rate', 'points']);
    });

    it('should seed 8 demo agents', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const seedStep = state.steps.find(s => s.type === 'seed');
      expect(seedStep).toBeDefined();
      expect(seedStep!.data?.seeded).toBe(8);
    });

    it('should search and find agents', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const searchStep = state.steps.find(s => s.type === 'search');
      expect(searchStep).toBeDefined();
      expect((searchStep!.data?.results as number)).toBeGreaterThan(0);
    });

    it('should select an agent', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const selectStep = state.steps.find(s => s.type === 'select');
      expect(selectStep).toBeDefined();
      expect(selectStep!.data?.agentName).toBeDefined();
      expect(selectStep!.data?.skillName).toBeDefined();
    });

    it('should hire the selected agent', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const hireStep = state.steps.find(s => s.type === 'hire');
      expect(hireStep).toBeDefined();
      expect(hireStep!.data?.taskId).toBeDefined();
    });

    it('should award HCS-20 points', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const pointsStep = state.steps.find(s => s.type === 'points');
      expect(pointsStep).toBeDefined();
      expect(pointsStep!.data?.pointsAwarded).toBe(150); // 100 completion + 50 rating bonus
    });

    it('should have a complete summary', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      expect(state.summary).toBeDefined();
      expect(state.summary!.agentsSeeded).toBe(8);
      expect(state.summary!.selectedAgent).toBeDefined();
      expect(state.summary!.hireTaskId).toBeDefined();
      expect(state.summary!.pointsAwarded).toBe(150);
      expect(state.summary!.totalSteps).toBe(7);
    });

    it('should call onStep callback for each step', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const steps: DemoStep[] = [];
      const flow = new DemoFlow(marketplace, hcs19, hcs20, (step) => steps.push(step));
      await flow.run();

      expect(steps.length).toBe(7);
      expect(steps[0].type).toBe('seed');
      expect(steps[6].type).toBe('points');
    });

    it('should not run if already running', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);

      // Start first run
      const promise = flow.run();
      // Try to run again immediately — should return current state
      const state2 = await flow.run();
      expect(state2.status).toBe('running');

      await promise;
    });

    it('should skip seeding on second run', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);

      // First run seeds
      const state1 = await flow.run();
      expect(state1.summary!.agentsSeeded).toBe(8);

      // Second run: create new DemoFlow instance with same marketplace
      const flow2 = new DemoFlow(marketplace, hcs19, hcs20);
      const state2 = await flow2.run();
      expect(state2.status).toBe('completed');
      // Seed step should show 0 seeded (already seeded)
      const seedStep = state2.steps.find(s => s.type === 'seed');
      expect(seedStep!.data?.seeded).toBe(0);
    });

    it('should include timestamps on all steps', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      for (const step of state.steps) {
        expect(step.timestamp).toBeDefined();
        expect(new Date(step.timestamp).getTime()).toBeGreaterThan(0);
      }
    });

    it('should include step numbers starting from 1', async () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state = await flow.run();

      const stepNumbers = state.steps.map(s => s.step);
      expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      const { marketplace, hcs19, hcs20 } = createDeps();
      const flow = new DemoFlow(marketplace, hcs19, hcs20);
      const state1 = flow.getState();
      const state2 = flow.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different object references
    });
  });
});
