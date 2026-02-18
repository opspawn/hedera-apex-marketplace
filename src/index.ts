/**
 * Hedera Agent Marketplace — Main entry point.
 *
 * Initializes HCS modules, marketplace services, HOL Registry Broker,
 * HCS-10 connection handler, and Express server.
 * Seeds demo agents on startup for a live demo experience.
 */

import express from 'express';
import cors from 'cors';
import { loadConfig } from './config';
import { HCS10Client } from './hcs/hcs10-client';
import { HCS11ProfileManager } from './hcs/hcs11-profile';
import { HCS14IdentityManager } from './hcs/hcs14-identity';
import { HCS19PrivacyManager } from './hcs/hcs19-privacy';
import { HCS26SkillRegistry } from './hcs/hcs26';
import { HCS19AgentIdentity } from './hcs/hcs19';
import { HCS20PointsTracker } from './hcs-20/hcs20-points';
import { AgentRegistry } from './marketplace/agent-registry';
import { MarketplaceService } from './marketplace/marketplace-service';
import { createRouter } from './api/routes';
import { createDashboardRouter } from './dashboard';
import { seedDemoAgents } from './seed';
import { DemoFlow } from './demo/flow';
import { TestnetIntegration } from './hedera/testnet-integration';
import { RegistryBroker } from './hol/registry-broker';
import { ConnectionHandler } from './hol/connection-handler';
import { RegistryAuth } from './hol/registry-auth';
import { createChatRouter } from './chat';
import { TrustScoreTracker } from './marketplace/trust-score';
import { AnalyticsTracker } from './marketplace/analytics';
import { ERC8004IdentityManager } from './hol/erc8004-identity';
import { HOLRegistryClient } from './hol/hol-registry-client';
import { HOLAutoRegister } from './hol/hol-auto-register';
import { KMSAgentRegistrationManager } from './hedera/kms-agent-registration';
import { createMockKMSClient } from './hedera/mock-kms-client';

const START_TIME = Date.now();

export function createApp() {
  const config = loadConfig();

  // Initialize testnet integration (uses real HCS when credentials available)
  const testnetIntegration = new TestnetIntegration({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const testnetStatus = testnetIntegration.getStatus();
  console.log(`Testnet integration: ${testnetStatus.mode} mode (${testnetStatus.network})`);

  // Initialize HCS modules (with testnet integration when available)
  const hcs10 = new HCS10Client({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
    registryTopicId: config.topics.registry,
  }, testnetIntegration);

  const hcs11 = new HCS11ProfileManager({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const hcs14 = new HCS14IdentityManager({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const hcs19 = new HCS19PrivacyManager({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const hcs26 = new HCS26SkillRegistry({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const hcs19Identity = new HCS19AgentIdentity({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  const hcs20 = new HCS20PointsTracker({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  // Initialize marketplace
  const registry = new AgentRegistry(hcs10, hcs11, hcs14);
  const marketplace = new MarketplaceService(hcs10, hcs11, hcs14, hcs19Identity, hcs26);

  // Initialize trust score tracker and analytics
  const trustTracker = new TrustScoreTracker();
  const analyticsTracker = new AnalyticsTracker();

  // Initialize demo flow
  const demoFlow = new DemoFlow(marketplace, hcs19, hcs20);

  // Initialize HOL Registry Broker
  const registryBroker = new RegistryBroker({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  // Initialize HCS-10 Connection Handler
  const connectionHandler = new ConnectionHandler({
    inboundTopicId: config.topics.inbound,
    outboundTopicId: config.topics.outbound,
    accountId: config.hedera.accountId,
  }, hcs10);

  // Initialize live registry auth
  const registryAuth = new RegistryAuth({
    accountId: config.hedera.accountId,
    privateKey: config.hedera.privateKey,
    network: config.hedera.network,
  });

  // Initialize ERC-8004 dual identity manager
  const erc8004Manager = new ERC8004IdentityManager();

  // Initialize KMS agent registration (uses mock KMS client for demo)
  const mockKmsClient = createMockKMSClient();
  const kmsRegistrationManager = new KMSAgentRegistrationManager(mockKmsClient, 'us-east-1');

  // Initialize HOL Registry Client (direct REST API)
  const holClient = new HOLRegistryClient({
    apiKey: process.env.HOL_API_KEY,
  });

  // Initialize HOL Auto-Registration
  const holAutoRegister = new HOLAutoRegister(holClient, process.env.STAGING_URL || 'https://hedera.opspawn.com');

  // Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Mount routes
  app.use(createRouter(registry, hcs19, hcs26, marketplace, hcs20, START_TIME, demoFlow, registryBroker, connectionHandler, registryAuth, testnetIntegration, trustTracker, analyticsTracker, erc8004Manager, kmsRegistrationManager, holClient, holAutoRegister));
  app.use(createChatRouter({
    chatAgentConfig: {
      registryBroker,
      connectionHandler,
    },
  }));
  app.use(createDashboardRouter());

  return { app, config, registry, marketplace, hcs10, hcs11, hcs14, hcs19, hcs19Identity, hcs26, hcs20, demoFlow, testnetIntegration, registryBroker, connectionHandler, registryAuth, trustTracker, analyticsTracker, erc8004Manager, kmsRegistrationManager, holClient, holAutoRegister };
}

/**
 * Seed demo agents and start the server.
 */
async function main() {
  const { app, config, marketplace, hcs19, hcs20, connectionHandler, holAutoRegister } = createApp();

  // Seed demo agents
  const seedResult = await seedDemoAgents(marketplace, hcs19, hcs20);
  if (seedResult.seeded > 0) {
    console.log(`Seeded ${seedResult.seeded} demo agents`);
    for (const a of seedResult.agents) {
      console.log(`  ${a.name} (${a.agent_id}) — reputation: ${a.reputation}, points: ${a.points}`);
    }
  }

  // Auto-register agents in HOL Registry Broker (background, non-blocking)
  if (holAutoRegister && marketplace) {
    const agents = marketplace.getAllAgents();
    if (agents.length > 0) {
      holAutoRegister.autoRegisterAll(agents).then(result => {
        console.log(`HOL auto-registration: ${result.registered} registered, ${result.skipped} skipped, ${result.failed} failed`);
      }).catch(err => {
        console.log(`HOL auto-registration skipped: ${err instanceof Error ? err.message : 'connection error'}`);
      });
    }
  }

  // Start HCS-10 connection listener
  connectionHandler.start();
  console.log(`HCS-10 connection listener started (inbound topic: ${config.topics.inbound})`);

  app.listen(config.server.port, config.server.host, () => {
    console.log(`Hedera Agent Marketplace running at http://${config.server.host}:${config.server.port}`);
    console.log(`Network: ${config.hedera.network}`);
    console.log(`Account: ${config.hedera.accountId}`);
    console.log(`Registry: ${config.topics.registry}`);
    console.log(`Standards: HCS-10, HCS-11, HCS-14, HCS-19, HCS-20, HCS-26`);
    console.log(`HOL Registry Broker: https://hol.org/registry/api/v1`);
  });
}

// Start server if run directly
if (require.main === module) {
  main().catch(console.error);
}
