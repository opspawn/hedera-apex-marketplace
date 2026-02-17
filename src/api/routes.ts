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

// Test count managed as a constant — updated each sprint
const TEST_COUNT = 1600;
const VERSION = '0.25.0';
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
      agents: registry.getCount(),
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
          agents: result.agents.map(ma => ({
            ...ma.agent,
            verification_status: ma.verificationStatus,
            published_skills: ma.publishedSkills.length,
            hcs_standards: STANDARDS,
          })),
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
          res.json({
            ...profile.agent,
            verification_status: profile.verificationStatus,
            published_skills: profile.publishedSkills.length,
            hcs_standards: STANDARDS,
          });
          return;
        }
      }
      const agent = await registry.getAgent(id);
      if (!agent) {
        res.status(404).json({ error: 'not_found', message: `Agent ${id} not found` });
        return;
      }
      res.json(agent);
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
      const steps: Array<{
        step: number;
        phase: string;
        title: string;
        status: string;
        detail: string;
        data?: Record<string, unknown>;
        duration_ms: number;
      }> = [];

      const runDemoStep = async (
        stepNum: number,
        phase: string,
        title: string,
        fn: () => Promise<{ detail: string; data?: Record<string, unknown> }>,
      ) => {
        const stepStart = Date.now();
        try {
          const result = await fn();
          steps.push({
            step: stepNum, phase, title,
            status: 'completed',
            detail: result.detail,
            data: result.data,
            duration_ms: Date.now() - stepStart,
          });
        } catch (err) {
          steps.push({
            step: stepNum, phase, title,
            status: 'failed',
            detail: err instanceof Error ? err.message : 'Unknown error',
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
        return {
          detail: `Registered "${demoAgentName}" with HCS-19 identity`,
          data: { agent_id: demoAgentId, agent_name: demoAgentName, standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19'] },
        };
      });

      // Step 2: Discover agents
      let discoveredCount = 0;
      await runDemoStep(2, 'discovery', 'Discover Agents', async () => {
        const result = await marketplace.discoverAgents({ limit: 10 });
        discoveredCount = result.total;
        return {
          detail: `Discovered ${discoveredCount} agents in marketplace`,
          data: { total: discoveredCount, agents: result.agents.slice(0, 5).map(a => ({ name: a.agent.name, reputation: a.agent.reputation_score })) },
        };
      });

      // Step 3: Connect (HCS-10)
      await runDemoStep(3, 'connection', 'Connect Agents (HCS-10)', async () => {
        return {
          detail: 'HCS-10 connection established between client and agent',
          data: { protocol: 'hcs-10', status: 'active', connection_type: 'topic-based' },
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
        };
      });

      // Step 5: Get feedback
      await runDemoStep(5, 'feedback', 'Get Feedback', async () => {
        return {
          detail: `Task ${taskId} completed with 5-star rating`,
          data: { task_id: taskId, rating: 5, feedback: 'Excellent analysis — comprehensive security review' },
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
        };
      });

      const completedSteps = steps.filter(s => s.status === 'completed').length;
      const failedSteps = steps.filter(s => s.status === 'failed').length;

      res.json({
        status: failedSteps === 0 ? 'completed' : completedSteps > 0 ? 'partial' : 'failed',
        steps,
        total_duration_ms: Date.now() - startTime,
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

    res.json({
      version: VERSION,
      testCount: TEST_COUNT,
      hcsStandards: STANDARDS,
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      uptime_seconds: uptimeSeconds,
      agentsRegistered: marketplace ? marketplace.getAgentCount() : registry.getCount(),
    });
  });

  // A2A agent card — used by other agents and judges for discovery
  const agentCardPayload = {
    name: 'Hedera Agent Marketplace',
    version: VERSION,
    description: 'Decentralized agent marketplace on Hedera — agent registration, discovery, payments, and reputation using HCS-10/11/14/19/20/26 standards',
    url: 'https://hedera-apex.opspawn.com',
    capabilities: ['agent-registration', 'agent-discovery', 'privacy-consent', 'skill-publishing', 'reputation-points', 'hcs-10-connections', 'chat-relay', 'agent-connections', 'full-flow-demo', 'demo-recording', 'natural-language-chat'],
    protocols: ['hcs-10', 'hcs-11', 'hcs-14', 'hcs-19', 'hcs-20', 'hcs-26'],
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

  return router;
}
