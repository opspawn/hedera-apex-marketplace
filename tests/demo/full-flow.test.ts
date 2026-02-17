import { FullDemoFlow, FullFlowStep, FullFlowResult } from '../../src/demo/full-flow';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';
import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';

function createDeps() {
  const config = {
    accountId: '0.0.test-full-flow',
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
  const registryBroker = new RegistryBroker(config);
  const connectionHandler = new ConnectionHandler({
    inboundTopicId: '0.0.inbound',
    outboundTopicId: '0.0.outbound',
    accountId: config.accountId,
  }, hcs10);

  return { marketplace, hcs19, hcs20, hcs26, registryBroker, connectionHandler };
}

describe('FullDemoFlow', () => {
  describe('initial state', () => {
    it('should not be running initially', () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });
      expect(flow.isRunning()).toBe(false);
      expect(flow.getSteps()).toEqual([]);
    });
  });

  describe('run', () => {
    it('should complete the full 6-step flow', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
        skillRegistry: deps.hcs26,
        registryBroker: deps.registryBroker,
        connectionHandler: deps.connectionHandler,
      });

      const result = await flow.run();

      expect(result.status).toBe('completed');
      expect(result.steps.length).toBe(6);
      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.started_at).toBeDefined();
      expect(result.completed_at).toBeDefined();
    });

    it('should produce steps in correct phase order', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const phases = result.steps.map(s => s.phase);
      expect(phases).toEqual([
        'registration',
        'skills',
        'discovery',
        'connection',
        'execution',
        'feedback',
      ]);
    });

    it('should include step numbers 1-6', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const stepNums = result.steps.map(s => s.step);
      expect(stepNums).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should produce a valid summary', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const summary = result.summary;

      expect(summary.total_steps).toBe(6);
      expect(summary.completed_steps).toBeGreaterThanOrEqual(5);
      expect(summary.agent_registered).toBeTruthy();
      expect(summary.skills_published).toBeGreaterThanOrEqual(1);
      expect(summary.agents_discovered).toBeGreaterThanOrEqual(0);
      expect(summary.connection_established).toBe(true);
      expect(summary.chat_relayed).toBe(true);
      expect(summary.feedback_submitted).toBe(true);
    });

    it('should not be running after completion', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      await flow.run();
      expect(flow.isRunning()).toBe(false);
    });

    it('should record timing for each step', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      for (const step of result.steps) {
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include data objects for completed steps', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      for (const step of result.steps) {
        if (step.status === 'completed') {
          expect(step.data).toBeDefined();
          expect(typeof step.data).toBe('object');
        }
      }
    });

    it('should throw if run is called while already running', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      // Start the flow
      const promise1 = flow.run();

      // Attempting to run again should throw
      await expect(flow.run()).rejects.toThrow('already running');

      // Wait for original to complete
      await promise1;
    });
  });

  describe('step callback', () => {
    it('should call onStepUpdate for each step', async () => {
      const deps = createDeps();
      const updates: FullFlowStep[] = [];

      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      }, (step) => updates.push({ ...step }));

      await flow.run();

      // Each step fires twice: once running, once completed/failed
      expect(updates.length).toBeGreaterThanOrEqual(12); // 6 steps * 2 updates each
    });

    it('should report running status before completion', async () => {
      const deps = createDeps();
      const firstUpdates: FullFlowStep[] = [];

      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      }, (step) => {
        if (step.status === 'running') {
          firstUpdates.push({ ...step });
        }
      });

      await flow.run();

      // At least 6 running updates
      expect(firstUpdates.length).toBeGreaterThanOrEqual(6);
      for (const u of firstUpdates) {
        expect(u.status).toBe('running');
      }
    });
  });

  describe('registration step', () => {
    it('should register agent with HCS-19 identity', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const regStep = result.steps.find(s => s.phase === 'registration');

      expect(regStep).toBeDefined();
      expect(regStep!.status).toBe('completed');
      expect(regStep!.data?.agent_id).toBeDefined();
      expect(regStep!.data?.agent_name).toBeDefined();
      expect(regStep!.detail).toContain('HCS-19');
    });
  });

  describe('skills step', () => {
    it('should publish skills to HCS-26', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
        skillRegistry: deps.hcs26,
      });

      const result = await flow.run();
      const skillStep = result.steps.find(s => s.phase === 'skills');

      expect(skillStep).toBeDefined();
      expect(skillStep!.status).toBe('completed');
      expect(skillStep!.data?.count).toBeGreaterThanOrEqual(1);
    });

    it('should work without skill registry (fallback)', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
        // No skillRegistry
      });

      const result = await flow.run();
      const skillStep = result.steps.find(s => s.phase === 'skills');

      expect(skillStep).toBeDefined();
      expect(skillStep!.status).toBe('completed');
      expect(skillStep!.data?.registry).toBe('marketplace-internal');
    });
  });

  describe('discovery step', () => {
    it('should discover agents in marketplace', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const discStep = result.steps.find(s => s.phase === 'discovery');

      expect(discStep).toBeDefined();
      expect(discStep!.status).toBe('completed');
      expect(discStep!.data?.local_agents).toBeDefined();
    });
  });

  describe('connection step', () => {
    it('should handle connection with handler', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
        connectionHandler: deps.connectionHandler,
      });

      const result = await flow.run();
      const connStep = result.steps.find(s => s.phase === 'connection');

      expect(connStep).toBeDefined();
      expect(connStep!.status).toBe('completed');
      expect(connStep!.data?.protocol).toBe('hcs-10');
    });

    it('should work without connection handler (simulated)', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
        // No connectionHandler
      });

      const result = await flow.run();
      const connStep = result.steps.find(s => s.phase === 'connection');

      expect(connStep).toBeDefined();
      expect(connStep!.status).toBe('completed');
      expect(connStep!.data?.connection_type).toBe('simulated');
    });
  });

  describe('execution step', () => {
    it('should complete chat relay execution', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const execStep = result.steps.find(s => s.phase === 'execution');

      expect(execStep).toBeDefined();
      expect(execStep!.status).toBe('completed');
    });
  });

  describe('feedback step', () => {
    it('should award HCS-20 points', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      const fbStep = result.steps.find(s => s.phase === 'feedback');

      expect(fbStep).toBeDefined();
      expect(fbStep!.status).toBe('completed');
      expect(fbStep!.data?.points_awarded).toBe(175); // 100 + 50 + 25
      expect(fbStep!.data?.rating).toBe(5);
      expect(fbStep!.data?.agent_total_points).toBeGreaterThanOrEqual(175);
    });
  });

  describe('getSteps', () => {
    it('should return copy of steps array', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      await flow.run();
      const steps1 = flow.getSteps();
      const steps2 = flow.getSteps();

      expect(steps1).toEqual(steps2);
      expect(steps1).not.toBe(steps2); // Different array instances
    });
  });

  describe('result status', () => {
    it('should report completed when all steps pass', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      expect(result.status).toBe('completed');
      expect(result.summary.failed_steps).toBe(0);
    });
  });

  describe('total duration', () => {
    it('should track total execution time', async () => {
      const deps = createDeps();
      const flow = new FullDemoFlow({
        marketplace: deps.marketplace,
        privacy: deps.hcs19,
        points: deps.hcs20,
      });

      const result = await flow.run();
      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.total_duration_ms).toBeLessThan(30000); // Should be fast in test
    });
  });
});
