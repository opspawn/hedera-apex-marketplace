/**
 * Sprint 15: Demo Flow Error Recovery Tests
 *
 * Tests for:
 * - runStep helper method with graceful error recovery
 * - Demo completes <30s
 * - 7 steps reliably execute
 * - State transitions (idle -> running -> completed)
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

  return { marketplace, hcs19, hcs20, hcs10, hcs11, hcs14, hcs19Identity, hcs26 };
}

describe('Sprint 15: Demo Flow Recovery', () => {
  test('demo starts in idle state', () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const state = flow.getState();
    expect(state.status).toBe('idle');
    expect(state.steps).toEqual([]);
  });

  test('demo transitions through states', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(['completed', 'failed']).toContain(result.status);
  });

  test('demo completes with 7 steps', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(result.status).toBe('completed');
    expect(result.steps.length).toBe(8);
  });

  test('demo completes in under 30 seconds', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const start = Date.now();
    await flow.run();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30000);
  });

  test('each step has required fields', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    for (const step of result.steps) {
      expect(step.step).toBeGreaterThan(0);
      expect(step.type).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.detail).toBeDefined();
      expect(step.timestamp).toBeDefined();
    }
  });

  test('step types follow correct order', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const types = result.steps.map(s => s.type);
    expect(types).toEqual(['seed', 'search', 'select', 'hire', 'complete', 'rate', 'points', 'multi_protocol']);
  });

  test('summary is populated on completion', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(result.summary).toBeDefined();
    expect(result.summary!.agentsSeeded).toBe(24);
    expect(result.summary!.totalSteps).toBe(8);
    expect(result.summary!.pointsAwarded).toBe(150);
    expect(result.summary!.selectedAgent).toBeTruthy();
    expect(result.summary!.hireTaskId).toBeTruthy();
  });

  test('demo sets completedAt timestamp', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(result.completedAt).toBeDefined();
    expect(new Date(result.completedAt!).getTime()).toBeGreaterThan(0);
  });

  test('demo sets startedAt timestamp', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(result.startedAt).toBeDefined();
  });

  test('second run returns if already running', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const p1 = flow.run();
    const p2 = flow.run();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.steps.length + r2.steps.length).toBeGreaterThanOrEqual(7);
  });

  test('onStep callback fires for each step', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const stepsReceived: number[] = [];
    const flow = new DemoFlow(marketplace, hcs19, hcs20, (step) => {
      stepsReceived.push(step.step);
    });
    await flow.run();
    expect(stepsReceived).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('points are correctly awarded during demo', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const agentId = result.steps.find(s => s.type === 'select')?.data?.agentId as string;
    expect(agentId).toBeTruthy();
    const agentPoints = hcs20.getAgentPoints(agentId);
    expect(agentPoints).toBeGreaterThanOrEqual(150);
  });
});

describe('Sprint 15: Demo Flow State Management', () => {
  test('getState returns copy, not reference', () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const s1 = flow.getState();
    const s2 = flow.getState();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });

  test('state has no error on success', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    expect(result.error).toBeUndefined();
  });

  test('seed step records agent count', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const seedStep = result.steps.find(s => s.type === 'seed');
    expect(seedStep?.data?.seeded).toBe(24);
    expect(seedStep?.data?.total).toBe(24);
  });

  test('search step records query and results', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const searchStep = result.steps.find(s => s.type === 'search');
    expect(searchStep?.data?.query).toBe('security');
    expect(searchStep?.data?.results).toBeGreaterThan(0);
  });

  test('hire step records task ID', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const hireStep = result.steps.find(s => s.type === 'hire');
    expect(hireStep?.data?.taskId).toBeTruthy();
  });

  test('points step records breakdown', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const pointsStep = result.steps.find(s => s.type === 'points');
    expect(pointsStep?.data?.breakdown).toBeDefined();
    expect((pointsStep?.data?.breakdown as any).task_completion).toBe(100);
    expect((pointsStep?.data?.breakdown as any).rating_bonus).toBe(50);
  });

  test('rate step includes 5-star rating', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const rateStep = result.steps.find(s => s.type === 'rate');
    expect(rateStep?.data?.rating).toBe(5);
  });

  test('complete step records agent name', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const completeStep = result.steps.find(s => s.type === 'complete');
    expect(completeStep?.data?.agentName).toBeTruthy();
    expect(completeStep?.data?.taskId).toBeTruthy();
  });

  test('select step includes reputation score', async () => {
    const { marketplace, hcs19, hcs20 } = createDeps();
    const flow = new DemoFlow(marketplace, hcs19, hcs20);
    const result = await flow.run();
    const selectStep = result.steps.find(s => s.type === 'select');
    expect(selectStep?.data?.reputation).toBeDefined();
    expect(selectStep?.data?.skillName).toBeTruthy();
  });
});
