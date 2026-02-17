/**
 * API route tests for /api/demo/full-flow endpoint
 */
import express from 'express';
import { createRouter } from '../../src/api/routes';
import { AgentRegistry } from '../../src/marketplace/agent-registry';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS20PointsTracker } from '../../src/hcs-20/hcs20-points';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { DemoFlow } from '../../src/demo/flow';
import { RegistryBroker } from '../../src/hol/registry-broker';
import { ConnectionHandler } from '../../src/hol/connection-handler';

function createTestApp() {
  const config = {
    accountId: '0.0.api-test',
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
  const registry = new AgentRegistry(hcs10, hcs11, hcs14);
  const marketplace = new MarketplaceService(hcs10, hcs11, hcs14, hcs19Identity, hcs26);
  const demoFlow = new DemoFlow(marketplace, hcs19, hcs20);
  const registryBroker = new RegistryBroker(config);
  const connectionHandler = new ConnectionHandler({
    inboundTopicId: '0.0.inbound',
    outboundTopicId: '0.0.outbound',
    accountId: config.accountId,
  }, hcs10);

  const app = express();
  app.use(express.json());
  app.use(createRouter(
    registry, hcs19, hcs26, marketplace, hcs20, Date.now(),
    demoFlow, registryBroker, connectionHandler,
  ));

  return app;
}

async function request(app: express.Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('POST /api/demo/full-flow', () => {
  it('should return 200 with completed status', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  }, 30000);

  it('should return 6 steps', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.body.steps).toHaveLength(6);
  });

  it('should include summary with metrics', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total_steps).toBe(6);
    expect(res.body.summary.agent_registered).toBeTruthy();
  });

  it('should include total_duration_ms', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.body.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('should include started_at and completed_at timestamps', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    expect(res.body.started_at).toBeDefined();
    expect(res.body.completed_at).toBeDefined();
    expect(new Date(res.body.started_at).getTime()).toBeGreaterThan(0);
    expect(new Date(res.body.completed_at).getTime()).toBeGreaterThan(0);
  });

  it('each step should have phase, title, status, detail, duration_ms', async () => {
    const app = createTestApp();
    const res = await request(app, 'POST', '/api/demo/full-flow');

    for (const step of res.body.steps) {
      expect(step.phase).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.status).toBeDefined();
      expect(step.detail).toBeDefined();
      expect(typeof step.duration_ms).toBe('number');
    }
  });
});

describe('Version and test count updates', () => {
  it('health endpoint should report v0.22.0', async () => {
    const app = createTestApp();
    const res = await request(app, 'GET', '/health');

    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.26.0');
  });

  it('health endpoint should report test count >= 1450', async () => {
    const app = createTestApp();
    const res = await request(app, 'GET', '/health');

    expect(res.body.test_count).toBeGreaterThanOrEqual(1455);
  });

  it('stats endpoint should report v0.22.0', async () => {
    const app = createTestApp();
    const res = await request(app, 'GET', '/api/stats');

    expect(res.body.version).toBe('0.26.0');
  });
});
