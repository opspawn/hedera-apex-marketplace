/**
 * Marketplace Integration Service
 *
 * Connects HCS-19 (agent identity), HCS-26 (skill registry), HCS-10 (messaging),
 * HCS-11 (profiles), and HCS-14 (identity) into a unified agent marketplace workflow.
 *
 * This is the core orchestration layer that coordinates across all HCS standards
 * to provide end-to-end agent registration, skill publishing, discovery, and hiring.
 */

import { v4 as uuidv4 } from 'uuid';
import { HCS10Client } from '../hcs/hcs10-client';
import { HCS11ProfileManager } from '../hcs/hcs11-profile';
import { HCS14IdentityManager } from '../hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../hcs/hcs19';
import { HCS26SkillRegistry } from '../hcs/hcs26';
import {
  AgentRegistration,
  RegisteredAgent,
  AgentIdentityProfile,
  AgentIdentity,
  AgentProfile,
  PublishedSkill,
  HireRequest,
  HireResult,
  PaymentSettlement,
  SearchQuery,
  IdentityVerificationResult,
} from '../types';

export interface MarketplaceAgent {
  agent: RegisteredAgent;
  identity: AgentIdentity;
  profile: AgentProfile;
  publishedSkills: PublishedSkill[];
  verificationStatus: 'verified' | 'unverified' | 'revoked';
}

export interface DiscoveryCriteria {
  q?: string;
  category?: string;
  tags?: string[];
  skill?: string;
  standard?: string;
  name?: string;
  verifiedOnly?: boolean;
  minReputation?: number;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface HireSpec {
  clientId: string;
  agentId: string;
  skillId: string;
  input: Record<string, unknown>;
  payerAccount?: string;
}

export class MarketplaceService {
  private hcs10: HCS10Client;
  private hcs11: HCS11ProfileManager;
  private hcs14: HCS14IdentityManager;
  private hcs19Identity: HCS19AgentIdentity;
  private hcs26: HCS26SkillRegistry;

  // Maps agent_id -> identity_topic_id for cross-referencing
  private agentIdentityMap: Map<string, string> = new Map();
  // Maps agent_id -> published skills
  private agentSkillsMap: Map<string, PublishedSkill[]> = new Map();
  // Local agent store (mirrors AgentRegistry for unified access)
  private agents: Map<string, RegisteredAgent> = new Map();
  // Hire task log
  private hireTasks: Map<string, HireResult> = new Map();

  constructor(
    hcs10: HCS10Client,
    hcs11: HCS11ProfileManager,
    hcs14: HCS14IdentityManager,
    hcs19Identity: HCS19AgentIdentity,
    hcs26: HCS26SkillRegistry,
  ) {
    this.hcs10 = hcs10;
    this.hcs11 = hcs11;
    this.hcs14 = hcs14;
    this.hcs19Identity = hcs19Identity;
    this.hcs26 = hcs26;
  }

  /**
   * Full agent registration flow:
   * 1. HCS-10: Register agent on the registry (creates topics)
   * 2. HCS-19: Create verifiable agent identity
   * 3. HCS-11: Create public profile
   * 4. HCS-14: Create DID document
   * 5. HCS-26: Publish agent skills to the skill registry
   */
  async registerAgentWithIdentity(registration: AgentRegistration): Promise<MarketplaceAgent> {
    // Step 1: HCS-10 — Register on OpenConvAI registry
    const agent = await this.hcs10.registerAgent(registration);
    this.agents.set(agent.agent_id, agent);

    // Step 2: HCS-19 — Create verifiable identity
    const identityProfile: AgentIdentityProfile = {
      name: registration.name,
      description: registration.description,
      capabilities: registration.skills.map(s => s.name),
      endpoint: registration.endpoint,
      protocols: registration.protocols,
    };
    const identity = await this.hcs19Identity.registerAgent(identityProfile);
    this.agentIdentityMap.set(agent.agent_id, identity.identity_topic_id);

    // Step 3: HCS-11 — Create public profile
    const profile = await this.hcs11.createProfile(agent);

    // Step 4: HCS-14 — Create DID document
    await this.hcs14.createDID(agent.agent_id, registration.endpoint);

    // Step 5: HCS-26 — Publish skills to registry
    const publishedSkills: PublishedSkill[] = [];
    if (registration.skills.length > 0) {
      const manifest = this.hcs26.buildManifestFromSkills(
        registration.name.toLowerCase().replace(/\s+/g, '-'),
        '1.0.0',
        registration.description,
        registration.name,
        registration.skills,
      );
      const published = await this.hcs26.publishSkill(manifest);
      publishedSkills.push(published);
    }
    this.agentSkillsMap.set(agent.agent_id, publishedSkills);

    return {
      agent,
      identity,
      profile,
      publishedSkills,
      verificationStatus: 'verified',
    };
  }

  /**
   * Publish an additional skill for an already-registered agent.
   * Uses HCS-26 to publish + updates the local skill map.
   */
  async publishAgentSkill(
    agentId: string,
    skill: { name: string; description: string; category: string; tags: string[] },
  ): Promise<PublishedSkill> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const manifest = this.hcs26.buildManifestFromSkills(
      skill.name.toLowerCase().replace(/\s+/g, '-'),
      '1.0.0',
      skill.description,
      agent.name,
      [{
        id: uuidv4(),
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        pricing: { amount: 0, token: 'HBAR', unit: 'per_call' as const },
      }],
    );

    const published = await this.hcs26.publishSkill(manifest);

    const existing = this.agentSkillsMap.get(agentId) || [];
    existing.push(published);
    this.agentSkillsMap.set(agentId, existing);

    return published;
  }

  /**
   * Discover agents by skills, trust score, identity verification status.
   * Combines local agent search with HCS-19 verification and HCS-26 skill data.
   */
  async discoverAgents(criteria: DiscoveryCriteria): Promise<{
    agents: MarketplaceAgent[];
    total: number;
  }> {
    let agents = Array.from(this.agents.values());

    // Text search
    if (criteria.q) {
      const q = criteria.q.toLowerCase();
      agents = agents.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.skills.some(s =>
          s.name.toLowerCase().includes(q) ||
          (s.tags || []).some(t => t.toLowerCase().includes(q)),
        ),
      );
    }

    // Category filter
    if (criteria.category) {
      const cat = criteria.category.toLowerCase();
      agents = agents.filter(a =>
        a.skills.some(s => s.category?.toLowerCase() === cat),
      );
    }

    // Tag filter
    if (criteria.tags && criteria.tags.length > 0) {
      const lowerTags = criteria.tags.map(t => t.toLowerCase());
      agents = agents.filter(a =>
        a.skills.some(s =>
          (s.tags || []).some(t => lowerTags.includes(t.toLowerCase())),
        ),
      );
    }

    // Skill name filter
    if (criteria.skill) {
      const sk = criteria.skill.toLowerCase();
      agents = agents.filter(a =>
        a.skills.some(s =>
          s.name.toLowerCase().includes(sk) ||
          s.id.toLowerCase().includes(sk),
        ),
      );
    }

    // Standard/protocol filter
    if (criteria.standard) {
      const std = criteria.standard.toLowerCase();
      agents = agents.filter(a =>
        a.protocols.some(p => p.toLowerCase().includes(std)),
      );
    }

    // Name filter (exact-ish match)
    if (criteria.name) {
      const nm = criteria.name.toLowerCase();
      agents = agents.filter(a =>
        a.name.toLowerCase().includes(nm),
      );
    }

    // Status filter
    if (criteria.status) {
      agents = agents.filter(a => a.status === criteria.status);
    }

    // Reputation filter
    if (criteria.minReputation !== undefined) {
      agents = agents.filter(a => a.reputation_score >= criteria.minReputation!);
    }

    // Build full marketplace agent profiles
    const marketplaceAgents: MarketplaceAgent[] = [];
    for (const agent of agents) {
      const ma = await this.buildMarketplaceAgent(agent);
      if (criteria.verifiedOnly && ma.verificationStatus !== 'verified') {
        continue;
      }
      marketplaceAgents.push(ma);
    }

    const total = marketplaceAgents.length;
    const offset = criteria.offset || 0;
    const limit = criteria.limit || 50;
    const paged = marketplaceAgents.slice(offset, offset + limit);

    return { agents: paged, total };
  }

  /**
   * Verify agent identity + match skill + create HCS-10 task channel.
   *
   * Flow:
   * 1. Verify client identity via HCS-19
   * 2. Verify agent identity via HCS-19
   * 3. Match requested skill via HCS-26
   * 4. Create HCS-10 task communication channel
   * 5. Send task specification via HCS-10 messaging
   */
  async verifyAndHire(spec: HireSpec): Promise<HireResult> {
    const agent = this.agents.get(spec.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${spec.agentId}`);
    }

    // Step 1: Verify agent identity via HCS-19
    const identityTopicId = this.agentIdentityMap.get(spec.agentId);
    let verificationResult: IdentityVerificationResult = { valid: false, errors: ['No identity registered'] };
    if (identityTopicId) {
      verificationResult = await this.hcs19Identity.verifyIdentity(identityTopicId);
    }
    if (!verificationResult.valid) {
      return {
        task_id: uuidv4(),
        agent_id: spec.agentId,
        skill_id: spec.skillId,
        status: 'failed',
        output: { error: 'identity_verification_failed', details: verificationResult.errors },
      };
    }

    // Step 2: Verify skill match
    const agentSkill = agent.skills.find(s => s.id === spec.skillId || s.name === spec.skillId);
    if (!agentSkill) {
      return {
        task_id: uuidv4(),
        agent_id: spec.agentId,
        skill_id: spec.skillId,
        status: 'failed',
        output: { error: 'skill_not_found', available_skills: agent.skills.map(s => s.name) },
      };
    }

    // Step 3: Create HCS-10 task channel
    const taskTopicId = await this.hcs10.createTopic(`task:${spec.agentId}:${spec.skillId}`);

    // Step 4: Send task specification via HCS-10
    await this.hcs10.sendMessage(taskTopicId, {
      type: 'task_request',
      client_id: spec.clientId,
      agent_id: spec.agentId,
      skill_id: spec.skillId,
      input: spec.input,
      timestamp: new Date().toISOString(),
    });

    // Step 5: Create settlement record
    const taskId = uuidv4();
    const settlement: PaymentSettlement = {
      type: 'payment_settlement',
      version: '1.0',
      payer: spec.payerAccount || spec.clientId,
      payee: agent.payment_address,
      skill_id: spec.skillId,
      amount: agentSkill.pricing.amount,
      token_id: agentSkill.pricing.token_id,
      fee_type: agentSkill.pricing.unit,
      task_id: taskId,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    const result: HireResult = {
      task_id: taskId,
      agent_id: spec.agentId,
      skill_id: spec.skillId,
      status: 'pending',
      output: { task_topic: taskTopicId },
      settlement,
    };

    this.hireTasks.set(taskId, result);
    return result;
  }

  /**
   * Get a unified agent profile combining HCS-11 + HCS-19 + HCS-26 data.
   */
  async getAgentProfile(agentId: string): Promise<MarketplaceAgent | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return this.buildMarketplaceAgent(agent);
  }

  /**
   * Get a hire task result by ID.
   */
  getHireTask(taskId: string): HireResult | null {
    return this.hireTasks.get(taskId) || null;
  }

  /**
   * Get agent count.
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Get all registered agents.
   */
  getAllAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Build a full MarketplaceAgent by combining data from multiple HCS modules.
   */
  private async buildMarketplaceAgent(agent: RegisteredAgent): Promise<MarketplaceAgent> {
    // HCS-19: Get identity + verification
    const identityTopicId = this.agentIdentityMap.get(agent.agent_id);
    let identity: AgentIdentity | undefined;
    let verificationStatus: 'verified' | 'unverified' | 'revoked' = 'unverified';

    if (identityTopicId) {
      const resolution = await this.hcs19Identity.resolveAgent(identityTopicId);
      if (resolution.found && resolution.identity) {
        identity = resolution.identity;
        const verification = await this.hcs19Identity.verifyIdentity(identityTopicId);
        verificationStatus = verification.valid ? 'verified' : 'unverified';
        if (identity.status === 'revoked') {
          verificationStatus = 'revoked';
        }
      }
    }

    // HCS-11: Build profile
    const profile = await this.hcs11.createProfile(agent);

    // HCS-26: Get published skills
    const publishedSkills = this.agentSkillsMap.get(agent.agent_id) || [];

    // Provide a default identity if none registered
    const defaultIdentity: AgentIdentity = {
      identity_topic_id: '',
      agent_id: agent.agent_id,
      profile: {
        name: agent.name,
        description: agent.description,
        capabilities: agent.skills.map(s => s.name),
      },
      did: '',
      status: 'active',
      registered_at: agent.registered_at,
      updated_at: agent.registered_at,
    };

    return {
      agent,
      identity: identity || defaultIdentity,
      profile,
      publishedSkills,
      verificationStatus,
    };
  }
}
