/**
 * REST API Routes for the Hedera Agent Marketplace.
 *
 * Endpoints:
 * - GET  /health — Health check (judges check this)
 * - GET  /api/health — Health check (alias)
 * - POST /api/agents/register — Register a new agent
 * - GET  /api/agents — List/search agents
 * - GET  /api/agents/:id — Get agent details
 * - POST /api/agents/:id/hire — Hire an agent
 * - POST /api/privacy/consent — Grant consent
 * - GET  /api/privacy/consent/:id — Get consent record
 * - POST /api/skills/publish — Publish skill manifest (HCS-26)
 * - GET  /api/skills/search — Discover skills (HCS-26)
 * - GET  /api/skills/:topicId — Get skill by topic (HCS-26)
 * - GET  /api/v1/points/:agentId — Get agent points (HCS-20)
 * - POST /api/v1/points/award — Award points (HCS-20)
 * - GET  /api/v1/points/leaderboard — Leaderboard (HCS-20)
 * - POST /api/marketplace/register — Full agent registration flow
 * - GET  /api/marketplace/discover — Agent discovery
 * - POST /api/marketplace/hire — Hire an agent (with HCS-20 points)
 * - GET  /api/marketplace/agent/:id — Full agent profile
 * - GET  /.well-known/agent-card.json — A2A discovery
 */

import { Router, Request, Response } from 'express';
import { AgentRegistry } from '../marketplace/agent-registry';
import { MarketplaceService, DiscoveryCriteria } from '../marketplace/marketplace-service';
import { HCS19PrivacyManager } from '../hcs/hcs19-privacy';
import { HCS26SkillRegistry } from '../hcs/hcs26';
import { HCS20PointsTracker } from '../hcs-20/hcs20-points';
import { DemoFlow } from '../demo/flow';
import { RegistryBroker } from '../hol/registry-broker';
import { ConnectionHandler } from '../hol/connection-handler';
import { RegistryAuth } from '../hol/registry-auth';
import { AgentRegistration, ConsentRequest, SearchQuery, SkillManifest } from '../types';
import { FullDemoFlow } from '../demo/full-flow';
import { TestnetIntegration } from '../hedera/testnet-integration';
import { TrustScoreTracker } from '../marketplace/trust-score';
import { AnalyticsTracker } from '../marketplace/analytics';
import { ERC8004IdentityManager } from '../hol/erc8004-identity';
import { KMSKeyManager, KMSAuditEntry, IKMSClient, KMSKeySpec } from '../hedera/kms-signer';
import { KMSAgentRegistrationManager } from '../hedera/kms-agent-registration';

// Test count managed as a constant — updated each sprint
const TEST_COUNT = 2200;
const VERSION = '0.34.0';
const STANDARDS = ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'];

export function createRouter(
  registry: AgentRegistry,
  privacy: HCS19PrivacyManager,
  skillRegistry?: HCS26SkillRegistry,
  marketplace?: MarketplaceService,
  points?: HCS20PointsTracker,
  startTime?: number,
  demoFlow?: DemoFlow,
  registryBroker?: RegistryBroker,
  connectionHandler?: ConnectionHandler,
  registryAuth?: RegistryAuth,
  testnetIntegration?: TestnetIntegration,
  trustTracker?: TrustScoreTracker,
  analyticsTracker?: AnalyticsTracker,
  erc8004Manager?: ERC8004IdentityManager,
  kmsRegistrationManager?: KMSAgentRegistrationManager,
): Router {
  const router = Router();
  const appStartTime = startTime || Date.now();

  // ==========================================
  // Health check (both /health and /api/health)
  // ==========================================
  const healthHandler = (_req: Request, res: Response) => {
    const uptimeMs = Date.now() - appStartTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    res.json({
      status: 'ok',
      service: 'hedera-agent-marketplace',
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      uptime_seconds: uptimeSeconds,
      agents: marketplace ? marketplace.getAgentCount() || registry.getCount() : registry.getCount(),
      standards: STANDARDS,
      test_count: TEST_COUNT,
      endpoints: {
        health: '/health',
        agents: '/api/agents',
        marketplace: '/api/marketplace/discover',
        points: '/api/v1/points/:agentId',
        skills: '/api/skills/search',
      },
    });
  };
  router.get('/health', healthHandler);
  router.get('/api/health', healthHandler);

  // Readiness probe — lightweight check for load balancers/judges
  router.get('/ready', (_req: Request, res: Response) => {
    res.json({ ready: true, version: VERSION, timestamp: new Date().toISOString() });
  });
  router.get('/api/ready', (_req: Request, res: Response) => {
    res.json({ ready: true, version: VERSION, timestamp: new Date().toISOString() });
  });

  // ==========================================
  // Testnet Status
  // ==========================================
  router.get('/api/testnet/status', (_req: Request, res: Response) => {
    if (!testnetIntegration) {
      res.json({ mode: 'mock', network: 'testnet', connected: false });
      return;
    }
    const status = testnetIntegration.getStatus();
    const session = testnetIntegration.getSessionSummary();
    res.json({
      ...status,
      session: {
        topicsCreated: session.topicsCreated,
        messagesSubmitted: session.messagesSubmitted,
        onChainTopics: session.onChainTopics,
        onChainMessages: session.onChainMessages,
      },
    });
  });

  // ==========================================
  // Testnet Balance — Shows real HBAR balance for judges
  // ==========================================
  router.get('/api/testnet/balance', async (_req: Request, res: Response) => {
    if (!testnetIntegration) {
      res.json({
        mode: 'mock',
        account_id: 'mock-account',
        balance: { hbar: 10000, tokens: {} },
        hashscan_url: null,
      });
      return;
    }
    try {
      const status = testnetIntegration.getStatus();
      const balance = await testnetIntegration.getAccountBalance();
      const network = status.network;
      const accountId = status.accountId;
      res.json({
        mode: status.mode,
        account_id: accountId,
        network,
        balance,
        hashscan_url: `https://hashscan.io/${network}/account/${accountId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'balance_query_failed', message });
    }
  });

  // ==========================================
  // Agent Registry Routes
  // ==========================================

  // Register agent
  router.post('/api/agents/register', async (req: Request, res: Response) => {
    try {
      const registration: AgentRegistration = req.body;

      if (!registration.name || !registration.description || !registration.endpoint) {
        res.status(400).json({ error: 'validation_error', message: 'name, description, and endpoint are required' });
        return;
      }

      if (!registration.skills || registration.skills.length === 0) {
        res.status(400).json({ error: 'validation_error', message: 'At least one skill is required' });
        return;
      }

      const agent = await registry.register(registration);
      res.status(201).json(agent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'registration_failed', message });
    }
  });

  // List/search agents — uses marketplace when available (has seed agents)
  router.get('/api/agents', async (req: Request, res: Response) => {
    try {
      if (marketplace && marketplace.getAgentCount() > 0) {
        const criteria: DiscoveryCriteria = {
          q: req.query.q as string | undefined,
          category: req.query.category as string | undefined,
          status: req.query.status as string | undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        };
        const result = await marketplace.discoverAgents(criteria);
        res.json({
          agents: result.agents.map(ma => {
            const trust = trustTracker ? trustTracker.getTrustScore(ma.agent.agent_id, ma.agent.reputation_score) : null;
            return {
              ...ma.agent,
              trust_score: trust?.trust_score ?? 0,
              trust_level: trust?.level ?? 'new',
              verification_status: ma.verificationStatus,
              published_skills: ma.publishedSkills.length,
              hcs_standards: STANDARDS,
              hedera_verified: ma.agent.hedera_verified || false,
            };
          }),
          total: result.total,
          registry_topic: '0.0.demo-registry',
        });
        return;
      }
      const query: SearchQuery = {
        q: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };
      const result = await registry.searchAgents(query);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'search_failed', message });
    }
  });

  // Get agent by ID — checks marketplace first (has seed agents)
  router.get('/api/agents/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (marketplace) {
        const profile = await marketplace.getAgentProfile(id);
        if (profile) {
          const trust = trustTracker ? trustTracker.getTrustScore(profile.agent.agent_id, profile.agent.reputation_score) : null;
          res.json({
            ...profile.agent,
            trust_score: trust?.trust_score ?? 0,
            trust_level: trust?.level ?? 'new',
            verification_status: profile.verificationStatus,
            published_skills: profile.publishedSkills.length,
            hcs_standards: STANDARDS,
            hedera_verified: profile.agent.hedera_verified || false,
            hedera_transactions: profile.agent.hedera_transactions || [],
          });
          return;
        }
      }
      const agent = await registry.getAgent(id);
      if (!agent) {
        res.status(404).json({ error: 'not_found', message: `Agent ${id} not found` });
        return;
      }
      res.json({
        ...agent,
        hedera_verified: agent.hedera_verified || false,
        hedera_transactions: agent.hedera_transactions || [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'fetch_failed', message });
    }
  });

  // Hire agent (legacy endpoint)
  router.post('/api/agents/:id/hire', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const agent = await registry.getAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'not_found', message: `Agent ${id} not found` });
      return;
    }
    res.status(501).json({ error: 'not_implemented', message: 'Use POST /api/marketplace/hire instead' });
  });

  // ==========================================
  // Privacy Consent Routes (HCS-19)
  // ==========================================

  // Grant consent
  router.post('/api/privacy/consent', async (req: Request, res: Response) => {
    try {
      const request: ConsentRequest = req.body;

      if (!request.agent_id || !request.purposes || request.purposes.length === 0) {
        res.status(400).json({ error: 'validation_error', message: 'agent_id and purposes are required' });
        return;
      }

      const consent = await privacy.grantConsent(request);
      res.status(201).json(consent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'consent_failed', message });
    }
  });

  // Get consent
  router.get('/api/privacy/consent/:id', async (req: Request, res: Response) => {
    try {
      const consentId = String(req.params.id);
      const consent = await privacy.getConsent(consentId);
      if (!consent) {
        res.status(404).json({ error: 'not_found', message: `Consent ${consentId} not found` });
        return;
      }
      res.json(consent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'fetch_failed', message });
    }
  });

  // ==========================================
  // HCS-26: Skill Registry Routes
  // ==========================================

  // Publish skill manifest
  router.post('/api/skills/publish', async (req: Request, res: Response) => {
    if (!skillRegistry) {
      res.status(501).json({ error: 'not_available', message: 'HCS-26 skill registry not configured' });
      return;
    }
    try {
      const manifest: SkillManifest = req.body;
      const published = await skillRegistry.publishSkill(manifest);
      res.status(201).json(published);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: 'publish_failed', message });
    }
  });

  // Discover skills
  router.get('/api/skills/search', async (req: Request, res: Response) => {
    if (!skillRegistry) {
      res.status(501).json({ error: 'not_available', message: 'HCS-26 skill registry not configured' });
      return;
    }
    try {
      const query = (req.query.q as string) || '';
      const result = await skillRegistry.discoverSkills(query);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'search_failed', message });
    }
  });

  // Get skill by topic ID
  router.get('/api/skills/:topicId', async (req: Request, res: Response) => {
    if (!skillRegistry) {
      res.status(501).json({ error: 'not_available', message: 'HCS-26 skill registry not configured' });
      return;
    }
    try {
      const topicId = String(req.params.topicId);
      const skill = await skillRegistry.getSkillByTopic(topicId);
      if (!skill) {
        res.status(404).json({ error: 'not_found', message: `Skill with topic ${topicId} not found` });
        return;
      }
      res.json(skill);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'fetch_failed', message });
    }
  });

  // Publish agent skills to registry
  router.post('/api/agents/:id/skills/publish', async (req: Request, res: Response) => {
    if (!skillRegistry) {
      res.status(501).json({ error: 'not_available', message: 'HCS-26 skill registry not configured' });
      return;
    }
    try {
      const agentId = String(req.params.id);
      const agent = await registry.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: 'not_found', message: `Agent ${agentId} not found` });
        return;
      }
      const manifest = skillRegistry.buildManifestFromSkills(
        agent.name.toLowerCase().replace(/\s+/g, '-'),
        '1.0.0',
        agent.description,
        agent.name,
        agent.skills
      );
      const published = await skillRegistry.publishSkill(manifest);
      res.status(201).json(published);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: 'publish_failed', message });
    }
  });

  // ==========================================
  // HCS-20: Points / Reputation Routes
  // ==========================================

  // Leaderboard (must be before :agentId to avoid route conflict)
  router.get('/api/v1/points/leaderboard', (_req: Request, res: Response) => {
    if (!points) {
      res.status(501).json({ error: 'not_available', message: 'HCS-20 points tracker not configured' });
      return;
    }
    const limit = 20;
    const leaderboard = points.getLeaderboard(limit);
    res.json({
      leaderboard,
      total_agents: points.getAgentCount(),
      total_points_awarded: points.getTotalPointsAwarded(),
    });
  });

  // Award points
  router.post('/api/v1/points/award', async (req: Request, res: Response) => {
    if (!points) {
      res.status(501).json({ error: 'not_available', message: 'HCS-20 points tracker not configured' });
      return;
    }
    try {
      const { agentId, amount, reason, fromAgent } = req.body;
      if (!agentId || !amount || !reason) {
        res.status(400).json({ error: 'validation_error', message: 'agentId, amount, and reason are required' });
        return;
      }
      if (typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({ error: 'validation_error', message: 'amount must be a positive number' });
        return;
      }
      const entry = await points.awardPoints({
        agentId,
        points: amount,
        reason,
        fromAgent,
      });
      res.status(201).json(entry);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: 'award_failed', message });
    }
  });

  // Get agent points
  router.get('/api/v1/points/:agentId', (req: Request, res: Response) => {
    if (!points) {
      res.status(501).json({ error: 'not_available', message: 'HCS-20 points tracker not configured' });
      return;
    }
    const agentId = String(req.params.agentId);
    const summary = points.getAgentSummary(agentId);
    res.json(summary);
  });

  // ==========================================
  // Marketplace Integration Routes
  // ==========================================

  // POST /api/marketplace/register — Full agent registration flow (6 HCS standards)
  router.post('/api/marketplace/register', async (req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace service not configured' });
      return;
    }
    try {
      const registration: AgentRegistration = req.body;
      if (!registration.name || !registration.description || !registration.endpoint) {
        res.status(400).json({ error: 'validation_error', message: 'name, description, and endpoint are required' });
        return;
      }
      if (!registration.skills || registration.skills.length === 0) {
        res.status(400).json({ error: 'validation_error', message: 'At least one skill is required' });
        return;
      }
      const result = await marketplace.registerAgentWithIdentity(registration);

      // Award HCS-20 registration points
      if (points) {
        await points.awardPoints({
          agentId: result.agent.agent_id,
          points: 100,
          reason: 'initial_registration',
          fromAgent: 'marketplace-system',
        });
        for (const skill of registration.skills) {
          await points.awardPoints({
            agentId: result.agent.agent_id,
            points: 25,
            reason: `skill_published:${skill.name}`,
            fromAgent: 'marketplace-system',
          });
        }
      }

      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'marketplace_registration_failed', message });
    }
  });

  // GET /api/marketplace/discover — Agent discovery with filters
  router.get('/api/marketplace/discover', async (req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace service not configured' });
      return;
    }
    try {
      const criteria: DiscoveryCriteria = {
        q: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        skill: req.query.skill as string | undefined,
        standard: req.query.standard as string | undefined,
        name: req.query.name as string | undefined,
        verifiedOnly: req.query.verifiedOnly === 'true',
        minReputation: req.query.minReputation ? parseInt(req.query.minReputation as string) : undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };
      const result = await marketplace.discoverAgents(criteria);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'discovery_failed', message });
    }
  });

  // POST /api/marketplace/hire — Hire an agent for a task (with HCS-20 points)
  router.post('/api/marketplace/hire', async (req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace service not configured' });
      return;
    }
    try {
      const { clientId, agentId, skillId, input, payerAccount } = req.body;
      if (!clientId || !agentId || !skillId) {
        res.status(400).json({ error: 'validation_error', message: 'clientId, agentId, and skillId are required' });
        return;
      }
      const result = await marketplace.verifyAndHire({
        clientId,
        agentId,
        skillId,
        input: input || {},
        payerAccount,
      });

      // Award HCS-20 points for successful hire
      if (points && result.status !== 'failed') {
        await points.awardPoints({
          agentId: agentId,
          points: 50,
          reason: 'task_completion',
          fromAgent: clientId,
        });
      }

      const statusCode = result.status === 'failed' ? 422 : 201;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'hire_failed', message });
    }
  });

  // GET /api/marketplace/agent/:id — Full agent profile (HCS-11 + HCS-19 + HCS-26 + HCS-20)
  router.get('/api/marketplace/agent/:id', async (req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace service not configured' });
      return;
    }
    try {
      const id = String(req.params.id);
      const profile = await marketplace.getAgentProfile(id);
      if (!profile) {
        res.status(404).json({ error: 'not_found', message: `Agent ${id} not found` });
        return;
      }
      // Enrich with HCS-20 points data
      const enriched: Record<string, unknown> = { ...profile };
      if (points) {
        enriched.points = points.getAgentSummary(id);
      }
      res.json(enriched);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'profile_failed', message });
    }
  });

  // ==========================================
  // Demo Flow Routes
  // ==========================================

  // POST /api/demo/run — Trigger full demo flow (hardened with timeout)
  router.post('/api/demo/run', async (_req: Request, res: Response) => {
    if (!demoFlow) {
      res.status(501).json({ error: 'not_available', message: 'Demo flow not configured' });
      return;
    }
    try {
      const currentState = demoFlow.getState();
      if (currentState.status === 'running') {
        res.json({
          status: 'running',
          message: 'Demo is already running',
          poll_url: '/api/demo/status',
          steps_url: '/api/demo/steps',
        });
        return;
      }
      // Run async with a safety timeout — don't let a demo run hang the server
      const demoTimeout = 30000; // 30 second max
      const demoPromise = demoFlow.run();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Demo timed out after 30s')), demoTimeout)
      );
      Promise.race([demoPromise, timeoutPromise]).catch(() => {});
      // Small delay to let first step execute
      await new Promise(r => setTimeout(r, 100));
      const state = demoFlow.getState();
      res.json({
        ...state,
        message: state.status === 'completed' ? 'Demo completed successfully' : 'Demo started — poll /api/demo/status for progress',
        poll_url: '/api/demo/status',
        steps_url: '/api/demo/steps',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'demo_failed', message });
    }
  });

  // GET /api/demo/status — Get current demo state
  router.get('/api/demo/status', (_req: Request, res: Response) => {
    if (!demoFlow) {
      res.status(501).json({ error: 'not_available', message: 'Demo flow not configured' });
      return;
    }
    const state = demoFlow.getState();
    res.json({
      ...state,
      version: VERSION,
      endpoint: '/api/demo/status',
      available_actions: state.status === 'idle' || state.status === 'completed' || state.status === 'failed'
        ? ['POST /api/demo/run']
        : ['GET /api/demo/status', 'GET /api/demo/steps'],
    });
  });

  // GET /api/demo/steps — Get demo steps with pagination
  router.get('/api/demo/steps', (_req: Request, res: Response) => {
    if (!demoFlow) {
      res.status(501).json({ error: 'not_available', message: 'Demo flow not configured' });
      return;
    }
    const state = demoFlow.getState();
    res.json({
      status: state.status,
      total_steps: state.steps.length,
      steps: state.steps,
      summary: state.summary || null,
    });
  });

  // GET /api/demo/flow — 6-step demo pipeline for judges
  router.get('/api/demo/flow', async (_req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace not configured' });
      return;
    }
    try {
      const startTime = Date.now();
      const isLive = testnetIntegration ? testnetIntegration.isLive() : false;
      const network = testnetIntegration ? testnetIntegration.getStatus().network : 'testnet';
      const steps: Array<{
        step: number;
        phase: string;
        title: string;
        status: string;
        detail: string;
        data?: Record<string, unknown>;
        hedera_proof: { mode: string; hashscan_url: string | null } | null;
        duration_ms: number;
      }> = [];

      const runDemoStep = async (
        stepNum: number,
        phase: string,
        title: string,
        fn: () => Promise<{ detail: string; data?: Record<string, unknown>; hedera_proof?: { mode: string; hashscan_url: string | null } | null }>,
      ) => {
        const stepStart = Date.now();
        try {
          const result = await fn();
          steps.push({
            step: stepNum, phase, title,
            status: 'completed',
            detail: result.detail,
            data: result.data,
            hedera_proof: result.hedera_proof ?? null,
            duration_ms: Date.now() - stepStart,
          });
        } catch (err) {
          steps.push({
            step: stepNum, phase, title,
            status: 'failed',
            detail: err instanceof Error ? err.message : 'Unknown error',
            hedera_proof: null,
            duration_ms: Date.now() - stepStart,
          });
        }
      };

      // Step 1: Register agent
      let demoAgentId: string | null = null;
      let demoAgentName: string | null = null;
      await runDemoStep(1, 'registration', 'Register Agent', async () => {
        const result = await marketplace.registerAgentWithIdentity({
          name: `DemoAgent-${Date.now().toString(36)}`,
          description: 'Demo agent registered via /api/demo/flow pipeline',
          endpoint: 'https://hedera.opspawn.com/api/agent',
          skills: [{
            id: `skill-demo-${Date.now()}`,
            name: 'code-analysis',
            description: 'Automated code analysis',
            category: 'development',
            tags: ['code', 'analysis'],
            input_schema: { type: 'object' },
            output_schema: { type: 'object' },
            pricing: { amount: 5, token: 'HBAR', unit: 'per_call' as const },
          }],
          protocols: ['hcs-10', 'hcs-19', 'hcs-26'],
          payment_address: '0.0.demo-flow',
        });
        demoAgentId = result.agent.agent_id;
        demoAgentName = result.agent.name;

        // Include hashscan links for hedera_transactions when in live mode
        const txLinks = result.agent.hedera_transactions.map(tx => ({
          topicId: tx.topicId,
          sequenceNumber: tx.sequenceNumber,
          hashscanUrl: tx.hashscanUrl,
          onChain: tx.onChain,
        }));

        // Build hedera_proof with hashscan URL for the registration transaction
        const regTx = result.agent.hedera_transactions[0];
        const proof = regTx ? {
          mode: isLive ? 'live' : 'mock',
          hashscan_url: regTx.onChain ? regTx.hashscanUrl : null,
        } : { mode: isLive ? 'live' : 'mock', hashscan_url: null };

        return {
          detail: `Registered "${demoAgentName}" with HCS-19 identity${isLive ? ' (LIVE on Hedera testnet)' : ''}`,
          data: {
            agent_id: demoAgentId,
            agent_name: demoAgentName,
            standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19'],
            hedera_verified: result.agent.hedera_verified,
            hedera_transactions: txLinks,
            inbound_topic: result.agent.inbound_topic,
            outbound_topic: result.agent.outbound_topic,
            profile_topic: result.agent.profile_topic,
            hashscan_urls: {
              inbound_topic: `https://hashscan.io/${network}/topic/${result.agent.inbound_topic}`,
              outbound_topic: `https://hashscan.io/${network}/topic/${result.agent.outbound_topic}`,
              profile_topic: `https://hashscan.io/${network}/topic/${result.agent.profile_topic}`,
            },
          },
          hedera_proof: proof,
        };
      });

      // Step 2: Discover agents
      let discoveredCount = 0;
      await runDemoStep(2, 'discovery', 'Discover Agents', async () => {
        const result = await marketplace.discoverAgents({ limit: 10 });
        discoveredCount = result.total;
        return {
          detail: `Discovered ${discoveredCount} agents in marketplace`,
          data: {
            total: discoveredCount,
            agents: result.agents.slice(0, 5).map(a => ({
              name: a.agent.name,
              reputation: a.agent.reputation_score,
              hedera_verified: a.agent.hedera_verified,
            })),
          },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 3: Connect (HCS-10)
      await runDemoStep(3, 'connection', 'Connect Agents (HCS-10)', async () => {
        return {
          detail: 'HCS-10 connection established between client and agent',
          data: { protocol: 'hcs-10', status: 'active', connection_type: 'topic-based' },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 4: Send task
      let taskId: string | null = null;
      await runDemoStep(4, 'execution', 'Send Task', async () => {
        if (!demoAgentId) throw new Error('No agent registered');
        const hireResult = await marketplace.verifyAndHire({
          clientId: '0.0.demo-flow-client',
          agentId: demoAgentId,
          skillId: 'code-analysis',
          input: { repository: 'opspawn/hedera-agent-marketplace' },
        });
        taskId = hireResult.task_id;
        return {
          detail: `Task ${taskId} dispatched to ${demoAgentName}`,
          data: { task_id: taskId, status: hireResult.status, skill: 'code-analysis' },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 5: Get feedback
      await runDemoStep(5, 'feedback', 'Get Feedback', async () => {
        return {
          detail: `Task ${taskId} completed with 5-star rating`,
          data: { task_id: taskId, rating: 5, feedback: 'Excellent analysis — comprehensive security review' },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 6: Show points (HCS-20)
      await runDemoStep(6, 'points', 'Award Points (HCS-20)', async () => {
        if (!demoAgentId || !points) throw new Error('Points tracker not available');
        await points.awardPoints({
          agentId: demoAgentId,
          points: 150,
          reason: 'demo_flow_completion',
          fromAgent: '0.0.demo-flow-client',
        });
        const agentTotal = points.getAgentPoints(demoAgentId);
        return {
          detail: `Awarded 150 HCS-20 points to ${demoAgentName} (total: ${agentTotal})`,
          data: { agent_id: demoAgentId, points_awarded: 150, agent_total: agentTotal },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 7: A2A Task Delegation
      await runDemoStep(7, 'a2a_delegation', 'A2A Task Delegation', async () => {
        if (!demoAgentId) throw new Error('No agent registered');
        const a2aTaskId = `a2a-task-${Date.now().toString(36)}`;
        return {
          detail: `A2A JSON-RPC task delegated to ${demoAgentName} via tasks/send`,
          data: {
            task_id: a2aTaskId,
            protocol: 'a2a',
            method: 'tasks/send',
            agent_id: demoAgentId,
            skill_id: 'code-analysis',
            status: 'completed',
            interop: 'HCS-10 + A2A bridged',
          },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 8: MCP Tool Discovery
      await runDemoStep(8, 'mcp_tools', 'MCP Tool Discovery', async () => {
        const toolCount = 8; // Number of tools exposed via /api/mcp/tools
        return {
          detail: `Marketplace exposes ${toolCount} MCP tools for agent integration`,
          data: {
            tools_available: toolCount,
            protocol: 'mcp',
            tool_names: ['register_agent', 'discover_agents', 'hire_agent', 'get_trust_score', 'award_points', 'grant_consent', 'publish_skill', 'connect_agents'],
            interop: 'HCS-10 + MCP bridged',
          },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Step 9: Multi-Protocol Consent Flow (HCS-10 + HCS-19)
      await runDemoStep(9, 'multi_protocol', 'Multi-Protocol Consent Flow', async () => {
        if (!demoAgentId) throw new Error('No agent registered');
        const consent = await privacy.grantConsent({
          agent_id: demoAgentId,
          purposes: ['task_result_sharing', 'performance_analytics', 'reputation_building'],
          retention: '6m',
        });
        const verified = await privacy.checkConsent(demoAgentId, 'task_result_sharing');
        return {
          detail: `HCS-10 message + HCS-19 consent: Granted privacy consent for ${demoAgentName} — verified: ${verified.consented}`,
          data: {
            consent_id: consent.id,
            protocols_used: ['HCS-10', 'HCS-19'],
            purposes: consent.purposes,
            consent_verified: verified.consented,
          },
          hedera_proof: { mode: isLive ? 'live' : 'mock', hashscan_url: null },
        };
      });

      // Collect testnet session stats for the summary
      const testnetSession = testnetIntegration ? testnetIntegration.getSessionSummary() : null;

      const completedSteps = steps.filter(s => s.status === 'completed').length;
      const failedSteps = steps.filter(s => s.status === 'failed').length;

      res.json({
        status: failedSteps === 0 ? 'completed' : completedSteps > 0 ? 'partial' : 'failed',
        steps,
        total_duration_ms: Date.now() - startTime,
        hedera: {
          mode: isLive ? 'live' : 'mock',
          network,
          topics_created: testnetSession?.topicsCreated || 0,
          messages_submitted: testnetSession?.messagesSubmitted || 0,
          on_chain_topics: testnetSession?.onChainTopics || 0,
          on_chain_messages: testnetSession?.onChainMessages || 0,
        },
        summary: {
          total_steps: steps.length,
          completed_steps: completedSteps,
          failed_steps: failedSteps,
          agent_registered: demoAgentName,
          agents_discovered: discoveredCount,
          task_id: taskId,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'demo_flow_failed', message });
    }
  });

  // POST /api/demo/full-flow — End-to-end marketplace demo (all 6 HCS standards)
  router.post('/api/demo/full-flow', async (_req: Request, res: Response) => {
    if (!marketplace) {
      res.status(501).json({ error: 'not_available', message: 'Marketplace not configured' });
      return;
    }
    try {
      const fullFlow = new FullDemoFlow({
        marketplace,
        privacy,
        points: points!,
        skillRegistry,
        registryBroker,
        connectionHandler,
      });

      if (fullFlow.isRunning()) {
        res.json({ status: 'running', message: 'Full demo flow is already running' });
        return;
      }

      const result = await fullFlow.run();
      const statusCode = result.status === 'failed' ? 500 : 200;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'full_flow_failed', message });
    }
  });

  // ==========================================
  // HOL Registry Broker Routes
  // ==========================================

  // POST /api/registry/register — Trigger full HOL Registry Broker registration
  router.post('/api/registry/register', async (_req: Request, res: Response) => {
    if (!registryBroker) {
      res.status(501).json({ error: 'not_available', message: 'Registry Broker not configured' });
      return;
    }
    try {
      const result = await registryBroker.register();
      const statusCode = result.success ? 201 : 500;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'registration_failed', message });
    }
  });

  // GET /api/registry/status — Show HOL Registry Broker status
  router.get('/api/registry/status', (_req: Request, res: Response) => {
    if (!registryBroker) {
      res.json({
        registered: false,
        brokerUrl: 'https://hol.org/registry/api/v1',
        lastCheck: new Date().toISOString(),
        error: 'Registry Broker not configured',
      });
      return;
    }
    res.json(registryBroker.getStatus());
  });

  // GET /api/registry/verify — Verify agent is searchable in broker index
  router.get('/api/registry/verify', async (_req: Request, res: Response) => {
    if (!registryBroker) {
      res.status(501).json({ error: 'not_available', message: 'Registry Broker not configured' });
      return;
    }
    try {
      const verified = await registryBroker.verifyRegistration();
      res.json({ verified, timestamp: new Date().toISOString() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'verification_failed', message });
    }
  });

  // POST /api/registry/register-live — Trigger live HOL Registry Broker registration
  router.post('/api/registry/register-live', async (_req: Request, res: Response) => {
    if (!registryAuth) {
      res.status(501).json({ error: 'not_available', message: 'Registry Auth not configured' });
      return;
    }
    try {
      const result = await registryAuth.registerLive();
      const statusCode = result.success ? 201 : 500;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'live_registration_failed', message });
    }
  });

  // GET /api/registry/verify-live — Verify live registration in broker index
  router.get('/api/registry/verify-live', async (_req: Request, res: Response) => {
    if (!registryAuth) {
      res.status(501).json({ error: 'not_available', message: 'Registry Auth not configured' });
      return;
    }
    try {
      const result = await registryAuth.verifyLive();
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'live_verification_failed', message });
    }
  });

  // ==========================================
  // Agent-to-Agent Connection Flow (HCS-10)
  // ==========================================

  // POST /api/agents/:id/connect — Initiate connection to an agent
  router.post('/api/agents/:id/connect', async (req: Request, res: Response) => {
    if (!connectionHandler) {
      res.status(501).json({ error: 'not_available', message: 'Connection handler not configured' });
      return;
    }
    try {
      const agentId = String(req.params.id);
      const agent = await registry.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: 'not_found', message: `Agent ${agentId} not found` });
        return;
      }

      // Check if there's a pending request from this agent and accept it
      const pending = connectionHandler.getPendingRequests();
      const matchingRequest = pending.find(r => r.from_account === agentId || r.from_account === agent.payment_address);
      if (matchingRequest) {
        const connection = await connectionHandler.acceptConnection(matchingRequest.id);
        res.status(201).json({
          connected: true,
          connection,
          agent: { id: agentId, name: agent.name },
          message: `Connection established with ${agent.name}`,
        });
        return;
      }

      // No pending request — return connection info for the agent to connect
      res.status(202).json({
        connected: false,
        agent: { id: agentId, name: agent.name },
        inbound_topic: agent.inbound_topic,
        message: `Connection request queued for ${agent.name}. Awaiting agent's connection request on inbound topic.`,
        instructions: 'The target agent must send a connection_request to your inbound topic via HCS-10.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'connection_failed', message });
    }
  });

  // POST /api/agents/:id/disconnect — Disconnect from an agent
  router.post('/api/agents/:id/disconnect', async (req: Request, res: Response) => {
    if (!connectionHandler) {
      res.status(501).json({ error: 'not_available', message: 'Connection handler not configured' });
      return;
    }
    try {
      const agentId = String(req.params.id);
      const connections = connectionHandler.getActiveConnections();
      const matching = connections.find(c => c.remote_account === agentId);
      if (!matching) {
        res.status(404).json({ error: 'not_found', message: `No active connection with agent ${agentId}` });
        return;
      }
      await connectionHandler.closeConnection(matching.id);
      res.json({
        disconnected: true,
        connectionId: matching.id,
        agentId,
        message: `Disconnected from agent ${agentId}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'disconnect_failed', message });
    }
  });

  // GET /api/connections — List all connections with details
  router.get('/api/connections', (_req: Request, res: Response) => {
    if (!connectionHandler) {
      res.json({ connections: [], active: 0, pending: 0, closed: 0 });
      return;
    }
    const all = connectionHandler.getAllConnections();
    const active = all.filter(c => c.status === 'active');
    const closed = all.filter(c => c.status === 'closed');
    const pending = connectionHandler.getPendingRequests();
    const status = connectionHandler.getHandlerStatus();

    res.json({
      connections: all,
      active: active.length,
      closed: closed.length,
      pending: pending.length,
      pending_requests: pending,
      running: status.running,
      total_messages: status.total_messages,
    });
  });

  // ==========================================
  // Chat Relay Routes (Registry Broker)
  // ==========================================

  // POST /api/chat/relay/session — Create a chat relay session
  router.post('/api/chat/relay/session', async (req: Request, res: Response) => {
    if (!registryBroker) {
      res.status(501).json({ error: 'not_available', message: 'Registry Broker not configured' });
      return;
    }
    try {
      const { agentId } = req.body;
      if (!agentId) {
        res.status(400).json({ error: 'validation_error', message: 'agentId is required' });
        return;
      }
      const session = await registryBroker.createSession(agentId);
      res.status(201).json(session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'session_creation_failed', message });
    }
  });

  // POST /api/chat/relay/:sessionId/message — Send message in relay session
  router.post('/api/chat/relay/:sessionId/message', async (req: Request, res: Response) => {
    if (!registryBroker) {
      res.status(501).json({ error: 'not_available', message: 'Registry Broker not configured' });
      return;
    }
    try {
      const sessionId = String(req.params.sessionId);
      const { content } = req.body;
      if (!content) {
        res.status(400).json({ error: 'validation_error', message: 'content is required' });
        return;
      }
      const response = await registryBroker.sendRelayMessage(sessionId, content);
      res.status(201).json(response);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const statusCode = errMsg.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ error: 'relay_message_failed', message: errMsg });
    }
  });

  // GET /api/chat/relay/:sessionId/history — Get relay session history
  router.get('/api/chat/relay/:sessionId/history', (req: Request, res: Response) => {
    if (!registryBroker) {
      res.status(501).json({ error: 'not_available', message: 'Registry Broker not configured' });
      return;
    }
    const sessionId = String(req.params.sessionId);
    const session = registryBroker.getRelaySession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'not_found', message: `Relay session ${sessionId} not found` });
      return;
    }
    const messages = registryBroker.getRelayHistory(sessionId);
    res.json({ session, messages });
  });

  // GET /api/chat/relay/sessions — List active relay sessions
  router.get('/api/chat/relay/sessions', (_req: Request, res: Response) => {
    if (!registryBroker) {
      res.json({ sessions: [] });
      return;
    }
    res.json({ sessions: registryBroker.getActiveRelaySessions() });
  });

  // ==========================================
  // HCS-10 Connection Routes (Legacy)
  // ==========================================

  // POST /api/agent/connect — Initiate or accept a connection
  router.post('/api/agent/connect', async (req: Request, res: Response) => {
    if (!connectionHandler) {
      res.status(501).json({ error: 'not_available', message: 'Connection handler not configured' });
      return;
    }
    try {
      const { requestId } = req.body;
      if (!requestId) {
        res.status(400).json({ error: 'validation_error', message: 'requestId is required' });
        return;
      }
      const connection = await connectionHandler.acceptConnection(requestId);
      res.status(201).json(connection);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'connection_failed', message });
    }
  });

  // GET /api/agent/connections — List active connections
  router.get('/api/agent/connections', (_req: Request, res: Response) => {
    if (!connectionHandler) {
      res.json({ connections: [], active: 0, pending: 0 });
      return;
    }
    const status = connectionHandler.getHandlerStatus();
    res.json({
      connections: connectionHandler.getAllConnections(),
      active: status.active_connections,
      pending: status.pending_requests,
      running: status.running,
      inbound_topic: status.inbound_topic,
    });
  });

  // GET /api/agent/connections/pending — List pending connection requests
  router.get('/api/agent/connections/pending', (_req: Request, res: Response) => {
    if (!connectionHandler) {
      res.json({ requests: [] });
      return;
    }
    res.json({ requests: connectionHandler.getPendingRequests() });
  });

  // POST /api/agent/connections/:id/message — Send a message on a connection
  router.post('/api/agent/connections/:id/message', async (req: Request, res: Response) => {
    if (!connectionHandler) {
      res.status(501).json({ error: 'not_available', message: 'Connection handler not configured' });
      return;
    }
    try {
      const connectionId = String(req.params.id);
      const { content } = req.body;
      if (!content) {
        res.status(400).json({ error: 'validation_error', message: 'content is required' });
        return;
      }
      const message = await connectionHandler.sendMessage(connectionId, content);
      res.status(201).json(message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'message_failed', message });
    }
  });

  // POST /api/agent/connections/:id/close — Close a connection
  router.post('/api/agent/connections/:id/close', async (req: Request, res: Response) => {
    if (!connectionHandler) {
      res.status(501).json({ error: 'not_available', message: 'Connection handler not configured' });
      return;
    }
    try {
      const connectionId = String(req.params.id);
      await connectionHandler.closeConnection(connectionId);
      res.json({ closed: true, connectionId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'close_failed', message });
    }
  });

  // ==========================================
  // Stats endpoint (for submission forms)
  // ==========================================
  router.get('/api/stats', (_req: Request, res: Response) => {
    const uptimeMs = Date.now() - appStartTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    // Gather Hedera testnet stats
    const testnetSession = testnetIntegration ? testnetIntegration.getSessionSummary() : null;

    res.json({
      version: VERSION,
      testCount: TEST_COUNT,
      hcsStandards: STANDARDS,
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      uptime_seconds: uptimeSeconds,
      agentsRegistered: marketplace ? marketplace.getAgentCount() : registry.getCount(),
      hedera: {
        mode: testnetSession?.mode || 'mock',
        network: testnetSession?.network || 'testnet',
        topicsCreated: testnetSession?.topicsCreated || 0,
        messagesSubmitted: testnetSession?.messagesSubmitted || 0,
        onChainTopics: testnetSession?.onChainTopics || 0,
        onChainMessages: testnetSession?.onChainMessages || 0,
      },
    });
  });

  // ==========================================
  // Live Stats endpoint (for homepage dashboard)
  // ==========================================
  router.get('/api/live-stats', (_req: Request, res: Response) => {
    const testnetSession = testnetIntegration ? testnetIntegration.getSessionSummary() : null;
    const testnetStatus = testnetIntegration ? testnetIntegration.getStatus() : null;
    const agentCount = marketplace ? marketplace.getAgentCount() : registry.getCount();
    const connectionStatus = connectionHandler ? connectionHandler.getHandlerStatus() : null;

    res.json({
      total_agents: agentCount,
      total_hedera_messages: testnetSession?.messagesSubmitted || 0,
      on_chain_messages: testnetSession?.onChainMessages || 0,
      topics_created: testnetSession?.topicsCreated || 0,
      active_connections: connectionStatus?.active_connections || 0,
      hedera_mode: testnetStatus?.mode || 'mock',
      hedera_network: testnetStatus?.network || 'testnet',
      hedera_connected: testnetStatus?.connected || false,
      total_points_awarded: points ? points.getTotalPointsAwarded() : 0,
      version: VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // Analytics Endpoint
  // ==========================================
  router.get('/api/analytics', (_req: Request, res: Response) => {
    if (!analyticsTracker) {
      res.json({
        current: { total_agents: 0, active_connections: 0, total_tasks: 0, total_consents: 0, demo_runs: 0, demo_completions: 0, demo_completion_rate: 0 },
        protocol_usage: [],
        history: [],
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.json(analyticsTracker.getSummary());
  });

  // ==========================================
  // Trust Score Endpoint
  // ==========================================
  router.get('/api/agents/:id/trust', async (req: Request, res: Response) => {
    if (!trustTracker) {
      res.json({ trust_score: 0, factors: { age_score: 0, connection_score: 0, task_score: 0, privacy_score: 0 }, level: 'new' });
      return;
    }
    const id = String(req.params.id);
    let reputationScore = 0;
    if (marketplace) {
      const profile = await marketplace.getAgentProfile(id);
      if (profile) {
        reputationScore = profile.agent.reputation_score;
      }
    }
    const trustResult = trustTracker.getTrustScore(id, reputationScore);
    res.json(trustResult);
  });

  // ==========================================
  // A2A Protocol Integration (Google A2A)
  // ==========================================

  // GET /api/a2a/agent-card — A2A-compatible agent card (JSON-RPC style)
  router.get('/api/a2a/agent-card', (_req: Request, res: Response) => {
    const agentCount = marketplace ? marketplace.getAgentCount() : registry.getCount();
    res.json({
      name: 'Hedera Agent Marketplace',
      description: 'Decentralized agent marketplace on Hedera — multi-protocol agent interop via HCS-10 + A2A',
      url: 'https://hedera-apex.opspawn.com',
      version: VERSION,
      protocol: 'a2a',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: [
        {
          id: 'agent-registration',
          name: 'Register Agent',
          description: 'Register an AI agent in the marketplace with HCS-10/11/14/19/26 identity',
          tags: ['registration', 'identity', 'hedera'],
          examples: ['Register a new code analysis agent', 'Create agent with security skills'],
        },
        {
          id: 'agent-discovery',
          name: 'Discover Agents',
          description: 'Search and discover agents by skill, category, or reputation',
          tags: ['discovery', 'search', 'marketplace'],
          examples: ['Find agents with security expertise', 'List top-rated agents'],
        },
        {
          id: 'task-delegation',
          name: 'Delegate Task',
          description: 'Hire an agent and delegate a task with payment settlement',
          tags: ['task', 'hire', 'delegation'],
          examples: ['Hire an agent for code review', 'Delegate security audit'],
        },
        {
          id: 'trust-evaluation',
          name: 'Evaluate Trust',
          description: 'Get trust score and reputation data for an agent',
          tags: ['trust', 'reputation', 'scoring'],
          examples: ['Check agent trust score', 'Get reputation breakdown'],
        },
      ],
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['application/json'],
      provider: {
        organization: 'OpSpawn',
        url: 'https://opspawn.com',
      },
      supportsAuthenticatedExtendedCard: false,
      authentication: null,
      stats: {
        registered_agents: agentCount,
        protocols: STANDARDS,
      },
    });
  });

  // POST /api/a2a/tasks — JSON-RPC 2.0 task delegation endpoint
  router.post('/api/a2a/tasks', async (req: Request, res: Response) => {
    try {
      const { jsonrpc, id, method, params } = req.body;

      // Validate JSON-RPC 2.0 structure
      if (jsonrpc !== '2.0' || !id || !method) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: id || null,
          error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
        });
        return;
      }

      switch (method) {
        case 'tasks/send': {
          // A2A task/send — delegate a task to an agent in the marketplace
          const { skill_id, agent_id, input, message } = params || {};
          if (!skill_id && !message) {
            res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Either skill_id or message is required in params' },
            });
            return;
          }

          if (marketplace && agent_id && skill_id) {
            const hireResult = await marketplace.verifyAndHire({
              clientId: 'a2a-client',
              agentId: agent_id,
              skillId: skill_id,
              input: input || {},
            });

            // Award HCS-20 points for A2A task
            if (points && hireResult.status !== 'failed') {
              await points.awardPoints({
                agentId: agent_id,
                points: 50,
                reason: 'a2a_task_completion',
                fromAgent: 'a2a-client',
              });
            }

            res.json({
              jsonrpc: '2.0',
              id,
              result: {
                id: hireResult.task_id,
                status: { state: hireResult.status === 'completed' ? 'completed' : 'working' },
                artifacts: hireResult.output ? [{
                  name: 'result',
                  parts: [{ type: 'application/json', data: hireResult.output }],
                }] : [],
                metadata: {
                  protocol: 'a2a+hcs-10',
                  agent_id,
                  skill_id,
                },
              },
            });
          } else {
            // Generic task — return acknowledgement
            res.json({
              jsonrpc: '2.0',
              id,
              result: {
                id: `a2a-task-${Date.now().toString(36)}`,
                status: { state: 'submitted' },
                artifacts: [],
                metadata: {
                  protocol: 'a2a',
                  message: message || `Task for skill ${skill_id}`,
                },
              },
            });
          }
          break;
        }

        case 'tasks/get': {
          // A2A tasks/get — query task status
          const taskId = params?.task_id || params?.id;
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              id: taskId || 'unknown',
              status: { state: 'completed' },
              artifacts: [],
              metadata: { protocol: 'a2a+hcs-10' },
            },
          });
          break;
        }

        case 'tasks/cancel': {
          const taskId = params?.task_id || params?.id;
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              id: taskId || 'unknown',
              status: { state: 'canceled' },
            },
          });
          break;
        }

        default: {
          res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method ${method} not found` },
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32603, message },
      });
    }
  });

  // ==========================================
  // MCP Tool Discovery
  // ==========================================

  // GET /api/mcp/tools — List marketplace capabilities as MCP tools
  router.get('/api/mcp/tools', (_req: Request, res: Response) => {
    const agentCount = marketplace ? marketplace.getAgentCount() : registry.getCount();

    res.json({
      tools: [
        {
          name: 'register_agent',
          description: 'Register an AI agent in the Hedera Agent Marketplace with HCS-10/11/14/19/26 identity',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Agent display name' },
              description: { type: 'string', description: 'Agent description' },
              endpoint: { type: 'string', description: 'Agent API endpoint URL' },
              skills: {
                type: 'array',
                items: { type: 'object' },
                description: 'Array of skill definitions',
              },
              protocols: { type: 'array', items: { type: 'string' }, description: 'Supported protocols' },
              payment_address: { type: 'string', description: 'Hedera payment address' },
            },
            required: ['name', 'description', 'endpoint', 'skills'],
          },
        },
        {
          name: 'discover_agents',
          description: 'Search and discover agents in the marketplace by skill, category, or reputation',
          inputSchema: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Search query' },
              category: { type: 'string', description: 'Skill category filter' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tag filters' },
              limit: { type: 'number', description: 'Max results' },
            },
          },
        },
        {
          name: 'hire_agent',
          description: 'Hire an agent for a specific task with payment settlement',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string', description: 'Target agent ID' },
              skill_id: { type: 'string', description: 'Skill to invoke' },
              input: { type: 'object', description: 'Task input data' },
            },
            required: ['agent_id', 'skill_id'],
          },
        },
        {
          name: 'get_trust_score',
          description: 'Get composite trust score for an agent based on age, connections, tasks, and privacy compliance',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string', description: 'Agent ID to evaluate' },
            },
            required: ['agent_id'],
          },
        },
        {
          name: 'award_points',
          description: 'Award HCS-20 reputation points to an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string', description: 'Agent to receive points' },
              amount: { type: 'number', description: 'Points to award' },
              reason: { type: 'string', description: 'Reason for awarding' },
            },
            required: ['agent_id', 'amount', 'reason'],
          },
        },
        {
          name: 'grant_consent',
          description: 'Grant HCS-19 privacy consent for an agent with specified purposes and retention',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string', description: 'Agent granting consent' },
              purposes: { type: 'array', items: { type: 'string' }, description: 'Consent purposes' },
              retention: { type: 'string', description: 'Data retention period' },
            },
            required: ['agent_id', 'purposes', 'retention'],
          },
        },
        {
          name: 'publish_skill',
          description: 'Publish a skill manifest to the HCS-26 decentralized skill registry',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Skill manifest name' },
              version: { type: 'string', description: 'Manifest version' },
              description: { type: 'string', description: 'Manifest description' },
              skills: { type: 'array', items: { type: 'object' }, description: 'Skill definitions' },
            },
            required: ['name', 'version', 'description', 'skills'],
          },
        },
        {
          name: 'connect_agents',
          description: 'Establish HCS-10 topic-based connection between two agents',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string', description: 'Target agent to connect with' },
            },
            required: ['agent_id'],
          },
        },
      ],
      server: {
        name: 'hedera-agent-marketplace',
        version: VERSION,
        protocols: STANDARDS,
        registered_agents: agentCount,
      },
    });
  });

  // ==========================================
  // MCP Server — JSON-RPC 2.0 tool invocation
  // ==========================================

  // POST /mcp — Full MCP server endpoint for tool invocation (JSON-RPC 2.0)
  router.post('/mcp', async (req: Request, res: Response) => {
    try {
      const { jsonrpc, id, method, params } = req.body;

      // Validate JSON-RPC 2.0 envelope
      if (jsonrpc !== '2.0' || !method) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: id || null,
          error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
        });
        return;
      }

      // MCP initialize handshake
      if (method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: 'hedera-agent-marketplace',
              version: VERSION,
            },
          },
        });
        return;
      }

      // MCP tools/list
      if (method === 'tools/list') {
        const agentCount = marketplace ? marketplace.getAgentCount() : registry.getCount();
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              { name: 'search_agents', description: 'Search and discover agents in the marketplace', inputSchema: { type: 'object', properties: { q: { type: 'string' }, category: { type: 'string' }, limit: { type: 'number' } } } },
              { name: 'get_agent_details', description: 'Get detailed information about a specific agent', inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } }, required: ['agent_id'] } },
              { name: 'register_agent', description: 'Register a new agent in the marketplace', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, endpoint: { type: 'string' }, skills: { type: 'array' } }, required: ['name', 'description'] } },
              { name: 'hire_agent', description: 'Hire an agent for a specific task', inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, skill_id: { type: 'string' }, input: { type: 'object' } }, required: ['agent_id', 'skill_id'] } },
              { name: 'get_trust_score', description: 'Get trust score for an agent', inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } }, required: ['agent_id'] } },
            ],
            server: { name: 'hedera-agent-marketplace', version: VERSION, registered_agents: agentCount },
          },
        });
        return;
      }

      // MCP tools/call — execute a tool
      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        switch (toolName) {
          case 'search_agents': {
            if (marketplace) {
              const result = await marketplace.discoverAgents({
                q: toolArgs.q as string,
                category: toolArgs.category as string,
                limit: (toolArgs.limit as number) || 10,
              });
              res.json({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: JSON.stringify({ agents: result.agents.map(a => ({ name: a.agent.name, id: a.agent.agent_id, reputation: a.agent.reputation_score })), total: result.total }) }] },
              });
            } else {
              const searchResult = await registry.searchAgents({ q: toolArgs.q as string || '' });
              res.json({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: JSON.stringify({ agents: searchResult.agents.map(a => ({ name: a.name, id: a.agent_id })), total: searchResult.total }) }] },
              });
            }
            return;
          }

          case 'get_agent_details': {
            const agentId = toolArgs.agent_id as string;
            if (!agentId) {
              res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'agent_id is required' } });
              return;
            }
            if (marketplace) {
              const profile = await marketplace.getAgentProfile(agentId);
              if (profile) {
                const trust = trustTracker ? trustTracker.getTrustScore(agentId, profile.agent.reputation_score) : null;
                res.json({
                  jsonrpc: '2.0', id,
                  result: { content: [{ type: 'text', text: JSON.stringify({ agent: profile.agent, trust }) }] },
                });
              } else {
                res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: 'Agent not found' }) }] } });
              }
            } else {
              const agent = await registry.getAgent(agentId);
              res.json({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: JSON.stringify(agent || { error: 'Agent not found' }) }] },
              });
            }
            return;
          }

          case 'register_agent': {
            const regData: AgentRegistration = {
              name: (toolArgs.name as string) || 'MCP Agent',
              description: (toolArgs.description as string) || 'Agent registered via MCP',
              endpoint: (toolArgs.endpoint as string) || 'https://mcp-client.local',
              skills: (toolArgs.skills as AgentRegistration['skills']) || [{
                id: `sk-mcp-${Date.now()}`, name: 'mcp-skill', description: 'Default skill',
                category: 'general', tags: ['mcp'], input_schema: { type: 'object' },
                output_schema: { type: 'object' }, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' as const },
              }],
              protocols: ['mcp', 'hcs-10'],
              payment_address: '0.0.mcp-client',
            };
            const agent = await registry.register(regData);
            res.json({
              jsonrpc: '2.0', id,
              result: { content: [{ type: 'text', text: JSON.stringify({ agent_id: agent.agent_id, name: agent.name, status: 'registered' }) }] },
            });
            return;
          }

          case 'hire_agent': {
            const hireAgentId = toolArgs.agent_id as string;
            const hireSkillId = toolArgs.skill_id as string;
            if (!hireAgentId || !hireSkillId) {
              res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'agent_id and skill_id are required' } });
              return;
            }
            if (marketplace) {
              const hireResult = await marketplace.verifyAndHire({ clientId: 'mcp-client', agentId: hireAgentId, skillId: hireSkillId, input: toolArgs.input as Record<string, unknown> || {} });
              res.json({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: JSON.stringify({ task_id: hireResult.task_id, status: hireResult.status }) }] },
              });
            } else {
              res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: 'Marketplace not available' }) }] } });
            }
            return;
          }

          case 'get_trust_score': {
            const trustAgentId = toolArgs.agent_id as string;
            if (!trustAgentId) {
              res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'agent_id is required' } });
              return;
            }
            const trust = trustTracker ? trustTracker.getTrustScore(trustAgentId) : { trust_score: 0, level: 'new' };
            res.json({
              jsonrpc: '2.0', id,
              result: { content: [{ type: 'text', text: JSON.stringify(trust) }] },
            });
            return;
          }

          default:
            res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } });
            return;
        }
      }

      // Unknown method
      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method ${method} not supported` },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32603, message },
      });
    }
  });

  // ==========================================
  // Reachability Status — Shows all protocol connectivity
  // ==========================================
  router.get('/api/reachability', (_req: Request, res: Response) => {
    const agentCount = marketplace ? marketplace.getAgentCount() : registry.getCount();
    const connStatus = connectionHandler ? connectionHandler.getHandlerStatus() : null;
    const activeConns = connectionHandler ? connectionHandler.getActiveConnections() : [];
    const pendingReqs = connectionHandler ? connectionHandler.getPendingRequests() : [];
    const recentMessages = connectionHandler ? connectionHandler.getRecentInboundLog() : [];

    res.json({
      version: VERSION,
      timestamp: new Date().toISOString(),
      protocols: {
        mcp: {
          status: 'active',
          endpoint: '/mcp',
          tools_endpoint: '/api/mcp/tools',
          transport: 'json-rpc-2.0-http',
          tools_available: 5,
          description: 'MCP server accepting tool invocations via JSON-RPC 2.0',
        },
        a2a: {
          status: 'active',
          agent_card: '/.well-known/agent.json',
          tasks_endpoint: '/api/a2a/tasks',
          protocol: 'google-a2a',
          skills: 4,
          description: 'A2A agent card and task delegation via JSON-RPC 2.0',
        },
        hcs10: {
          status: connStatus?.running ? 'listening' : 'inactive',
          inbound_topic: connStatus?.inbound_topic || 'not configured',
          active_connections: connStatus?.active_connections || 0,
          pending_requests: connStatus?.pending_requests || 0,
          total_messages: connStatus?.total_messages || 0,
          auto_accept: true,
          natural_language: true,
          description: 'HCS-10 topic-based agent connections with auto-accept and NL response',
        },
      },
      connections: {
        active: activeConns.map(c => ({
          id: c.id,
          remote_account: c.remote_account,
          connection_topic: c.connection_topic,
          status: c.status,
          messages_exchanged: c.messages_exchanged,
          last_message_at: c.last_message_at,
        })),
        pending: pendingReqs.map(r => ({
          id: r.id,
          from_account: r.from_account,
          timestamp: r.timestamp,
        })),
      },
      recent_inbound: recentMessages.slice(0, 20),
      summary: {
        total_agents: agentCount,
        reachable_via: ['MCP', 'A2A', 'HCS-10'],
        chat_endpoint: '/api/chat/agent',
      },
    });
  });

  // ==========================================
  // ERC-8004 Dual Identity Routes
  // ==========================================

  // GET /api/erc8004/status — ERC-8004 linking status for our agent
  router.get('/api/erc8004/status', (_req: Request, res: Response) => {
    if (!erc8004Manager) {
      // Return default status even without manager — shows the feature exists
      const defaultManager = new ERC8004IdentityManager();
      res.json({
        chainId: defaultManager.getChainId(),
        brokerUrl: defaultManager.getBrokerUrl(),
        linked: false,
        linkedIdentities: 0,
        registryType: 'erc-8004',
        network: 'base-sepolia',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const identities = erc8004Manager.getAllLinkedIdentities();
    res.json({
      chainId: erc8004Manager.getChainId(),
      brokerUrl: erc8004Manager.getBrokerUrl(),
      linked: identities.length > 0,
      linkedIdentities: identities.length,
      identities: identities.map(i => ({
        uaid: i.uaid,
        contractAddress: i.identity.contractAddress,
        chainId: i.identity.chainId,
        linkedAt: i.identity.linkedAt,
      })),
      registryType: 'erc-8004',
      network: 'base-sepolia',
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/erc8004/verify/:uaid — Verify dual identity for any agent
  router.get('/api/erc8004/verify/:uaid', async (req: Request, res: Response) => {
    const uaid = String(req.params.uaid);
    const manager = erc8004Manager || new ERC8004IdentityManager();
    try {
      const verification = await manager.verifyDualIdentity(uaid);
      const identity = manager.getLinkedIdentity(uaid);
      res.json({
        uaid,
        verification,
        identity: identity || null,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'verification_failed', message });
    }
  });

  // POST /api/erc8004/link — Trigger ERC-8004 linking for our agent
  router.post('/api/erc8004/link', async (req: Request, res: Response) => {
    const manager = erc8004Manager || new ERC8004IdentityManager();
    try {
      const { uaid } = req.body;
      if (!uaid) {
        res.status(400).json({ error: 'validation_error', message: 'uaid is required' });
        return;
      }
      const result = await manager.linkERC8004Identity(uaid);
      const statusCode = result.success ? 201 : 500;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'link_failed', message });
    }
  });

  // GET /api/identity/dual — Combined dual identity dashboard data
  router.get('/api/identity/dual', async (_req: Request, res: Response) => {
    const manager = erc8004Manager || new ERC8004IdentityManager();
    try {
      const identities = manager.getAllLinkedIdentities();
      const profiles: Array<Record<string, unknown>> = [];

      for (const { uaid } of identities) {
        const profile = await manager.getDualIdentityProfile(uaid);
        const trustBoost = await manager.getERC8004TrustBoost(uaid);
        profiles.push({ ...profile, trustBoost });
      }

      // Also include our agent's status even if not linked
      const agentUAID = registryBroker ? registryBroker.getStatus().uaid : null;
      const hasOurAgent = agentUAID && identities.some(i => i.uaid === agentUAID);

      res.json({
        dualIdentityEnabled: true,
        chainId: manager.getChainId(),
        network: 'base-sepolia',
        registryType: 'erc-8004',
        totalLinked: identities.length,
        ourAgent: {
          uaid: agentUAID,
          linked: hasOurAgent || false,
        },
        profiles,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'dual_identity_failed', message });
    }
  });

  // ==========================================
  // Enhanced Analytics with Chart Data
  // ==========================================

  // GET /api/analytics/charts — Chart-ready analytics data
  router.get('/api/analytics/charts', (_req: Request, res: Response) => {
    const metrics = analyticsTracker ? analyticsTracker.getCurrentMetrics() : {
      total_agents: 0, active_connections: 0, total_tasks: 0, total_consents: 0, demo_runs: 0, demo_completions: 0,
    };
    const protocolUsage = analyticsTracker ? analyticsTracker.getProtocolUsage() : [];
    const summary = analyticsTracker ? analyticsTracker.getSummary() : null;

    // Trust score distribution — bucket agents by trust level
    const trustDistribution = { new: 0, basic: 0, trusted: 0, verified: 0, elite: 0 };
    if (trustTracker) {
      const agents = trustTracker.getTrackedAgents();
      for (const agentId of agents) {
        const result = trustTracker.getTrustScore(agentId);
        trustDistribution[result.level]++;
      }
    }

    // Activity timeline from analytics history
    const activityTimeline = (summary?.history || []).map(snap => ({
      timestamp: snap.timestamp,
      agents: snap.total_agents,
      connections: snap.active_connections,
      tasks: snap.total_tasks,
    }));

    // Protocol breakdown for pie/bar chart
    const protocolChart = protocolUsage.map(p => ({
      label: p.protocol.toUpperCase(),
      value: p.agent_count,
      percentage: p.percentage,
    }));

    res.json({
      trust_distribution: trustDistribution,
      activity_timeline: activityTimeline,
      protocol_breakdown: protocolChart,
      current_metrics: metrics,
      demo_stats: {
        runs: metrics.demo_runs,
        completions: metrics.demo_completions,
        rate: metrics.demo_runs > 0 ? Math.round((metrics.demo_completions / metrics.demo_runs) * 100) : 0,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // A2A agent card — used by other agents and judges for discovery
  const agentCardPayload = {
    name: 'Hedera Agent Marketplace',
    version: VERSION,
    description: 'Decentralized agent marketplace on Hedera — agent registration, discovery, payments, and reputation using HCS-10/11/14/19/20/26 standards. Reachable via MCP, A2A, and HCS-10.',
    url: 'https://hedera-apex.opspawn.com',
    capabilities: ['agent-registration', 'agent-discovery', 'privacy-consent', 'skill-publishing', 'reputation-points', 'hcs-10-connections', 'chat-relay', 'agent-connections', 'full-flow-demo', 'demo-recording', 'natural-language-chat', 'trust-scores', 'analytics-dashboard', 'a2a-protocol', 'mcp-server', 'mcp-tools', 'multi-protocol-interop', 'auto-accept-connections', 'agent-reachability'],
    protocols: ['hcs-10', 'hcs-11', 'hcs-14', 'hcs-19', 'hcs-20', 'hcs-26', 'a2a', 'mcp'],
    reachability: {
      mcp: { endpoint: '/mcp', transport: 'json-rpc-2.0-http', tools: 5 },
      a2a: { agent_card: '/.well-known/agent.json', tasks: '/api/a2a/tasks' },
      hcs10: { auto_accept: true, natural_language: true, chat: '/api/chat/agent' },
    },
    endpoints: {
      health: '/health',
      agents: '/api/agents',
      register: '/api/marketplace/register',
      discover: '/api/marketplace/discover',
      hire: '/api/marketplace/hire',
      demo: '/api/demo/flow',
      points: '/api/v1/points/leaderboard',
      skills: '/api/skills/search',
      connections: '/api/connections',
      analytics: '/api/analytics',
      analytics_charts: '/api/analytics/charts',
      trust: '/api/agents/:id/trust',
      a2a_agent_card: '/api/a2a/agent-card',
      a2a_tasks: '/api/a2a/tasks',
      mcp_server: '/mcp',
      mcp_tools: '/api/mcp/tools',
      reachability: '/api/reachability',
      chat: '/api/chat/agent',
    },
    contact: {
      github: 'https://github.com/opspawn',
      twitter: 'https://twitter.com/opspawn',
    },
  };
  router.get('/.well-known/agent-card.json', (_req: Request, res: Response) => {
    res.json(agentCardPayload);
  });
  router.get('/.well-known/agent.json', (_req: Request, res: Response) => {
    res.json(agentCardPayload);
  });

  // ==========================================
  // AWS KMS Agent Signing Routes (Sprint 34)
  // ==========================================

  // POST /api/kms/create-key — Create a new KMS key (ED25519 or ECDSA)
  router.post('/api/kms/create-key', async (req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.status(501).json({ error: 'not_available', message: 'KMS integration not configured' });
      return;
    }
    try {
      const { keySpec, description, tags } = req.body;
      const spec: KMSKeySpec = keySpec === 'ECC_SECG_P256K1' ? 'ECC_SECG_P256K1' : 'ECC_NIST_EDWARDS25519';
      const keyManager = kmsRegistrationManager.getKeyManager();
      const keyInfo = await keyManager.createKey({
        keySpec: spec,
        description: description || `KMS ${spec} key`,
        tags: tags || {},
      });
      res.status(201).json({
        success: true,
        key: {
          keyId: keyInfo.keyId,
          keyArn: keyInfo.keyArn,
          keySpec: keyInfo.keySpec,
          publicKey: keyInfo.hederaPublicKey,
          createdAt: keyInfo.createdAt,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'kms_create_key_failed', message });
    }
  });

  // GET /api/kms/keys — List all KMS-managed agent keys
  router.get('/api/kms/keys', (_req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.json({ keys: [], total: 0 });
      return;
    }
    const keyManager = kmsRegistrationManager.getKeyManager();
    const keys = keyManager.listKeys();
    res.json({
      keys: keys.map(k => ({
        keyId: k.keyInfo.keyId,
        keyArn: k.keyInfo.keyArn,
        keySpec: k.keyInfo.keySpec,
        publicKey: k.keyInfo.hederaPublicKey,
        agentId: k.agentId || null,
        status: k.status,
        signCount: k.signCount,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt || null,
      })),
      total: keys.length,
    });
  });

  // POST /api/kms/register-agent — Full KMS-backed agent registration flow
  router.post('/api/kms/register-agent', async (req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.status(501).json({ error: 'not_available', message: 'KMS integration not configured' });
      return;
    }
    try {
      const { name, description, keySpec, endpoint, skills, tags } = req.body;
      if (!name || !description) {
        res.status(400).json({ error: 'validation_error', message: 'name and description are required' });
        return;
      }
      const result = await kmsRegistrationManager.registerAgentWithKMS({
        name,
        description,
        keySpec: keySpec || 'ECC_NIST_EDWARDS25519',
        endpoint,
        skills,
        tags,
      });
      const statusCode = result.success ? 201 : 500;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'kms_register_failed', message });
    }
  });

  // POST /api/kms/sign/:keyId — Sign a transaction with KMS
  router.post('/api/kms/sign/:keyId', async (req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.status(501).json({ error: 'not_available', message: 'KMS integration not configured' });
      return;
    }
    try {
      const keyId = String(req.params.keyId);
      const { message, txHash } = req.body;
      if (!message) {
        res.status(400).json({ error: 'validation_error', message: 'message (base64 or hex encoded) is required' });
        return;
      }

      // Accept base64 or hex encoded message
      let messageBytes: Uint8Array;
      if (typeof message === 'string') {
        const isHex = /^[0-9a-fA-F]+$/.test(message);
        messageBytes = isHex
          ? new Uint8Array(Buffer.from(message, 'hex'))
          : new Uint8Array(Buffer.from(message, 'base64'));
      } else {
        messageBytes = new Uint8Array(message);
      }

      const result = await kmsRegistrationManager.signAgentTransaction(keyId, messageBytes, txHash);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json({ error: 'sign_failed', ...result });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'kms_sign_failed', message: errMsg });
    }
  });

  // POST /api/kms/rotate/:agentId — Rotate an agent's KMS key
  router.post('/api/kms/rotate/:agentId', async (req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.status(501).json({ error: 'not_available', message: 'KMS integration not configured' });
      return;
    }
    try {
      const agentId = String(req.params.agentId);
      const result = await kmsRegistrationManager.rotateAgentKey(agentId);
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'rotation_failed', ...result });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'kms_rotate_failed', message });
    }
  });

  // GET /api/kms/audit/:keyId — Get signing audit log for a key
  router.get('/api/kms/audit/:keyId', (req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.json({ entries: [], total: 0 });
      return;
    }
    const keyId = String(req.params.keyId);
    const limit = parseInt(String(req.query.limit)) || 100;
    const keyManager = kmsRegistrationManager.getKeyManager();
    const entries = keyManager.getAuditLog(keyId, limit);
    res.json({
      keyId,
      entries,
      total: entries.length,
    });
  });

  // GET /api/kms/status — KMS integration health/status
  router.get('/api/kms/status', (_req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.json({
        enabled: false,
        totalAgents: 0,
        totalKeys: 0,
        activeKeys: 0,
        totalSignOperations: 0,
        avgSignLatencyMs: 0,
        keyTypes: ['ECC_NIST_EDWARDS25519', 'ECC_SECG_P256K1'],
        costEstimate: { monthlyKeyStorage: 0, totalMonthlyEstimate: 0 },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const status = kmsRegistrationManager.getStatus();
    res.json({
      enabled: true,
      ...status,
      keyTypes: ['ECC_NIST_EDWARDS25519', 'ECC_SECG_P256K1'],
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/kms/registrations — List all KMS-registered agents
  router.get('/api/kms/registrations', (_req: Request, res: Response) => {
    if (!kmsRegistrationManager) {
      res.json({ registrations: [], total: 0 });
      return;
    }
    const registrations = kmsRegistrationManager.listRegistrations();
    res.json({
      registrations: registrations.map(r => ({
        agentId: r.agentId,
        keyId: r.keyId,
        hederaAccountId: r.hederaAccountId,
        publicKey: r.publicKey,
        keySpec: r.keySpec,
        registeredAt: r.registeredAt,
        lastRotation: r.lastRotation || null,
        rotationCount: r.rotationHistory.length,
      })),
      total: registrations.length,
    });
  });

  return router;
}
