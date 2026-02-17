import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';
import { HCS19AgentIdentity } from '../../src/hcs/hcs19';
import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { MarketplaceService } from '../../src/marketplace/marketplace-service';
import { AgentRegistration } from '../../src/types';

function createTestModules() {
  const hcs10 = new HCS10Client({
    accountId: '0.0.test',
    privateKey: 'test-key',
    network: 'testnet',
    registryTopicId: '0.0.registry',
  });
  const hcs11 = new HCS11ProfileManager({ accountId: '0.0.test', privateKey: 'test-key', network: 'testnet' });
  const hcs14 = new HCS14IdentityManager({ accountId: '0.0.test', privateKey: 'test-key', network: 'testnet' });
  const hcs19Identity = new HCS19AgentIdentity({ accountId: '0.0.test', privateKey: 'test-key', network: 'testnet' });
  const hcs26 = new HCS26SkillRegistry({ accountId: '0.0.test', privateKey: 'test-key', network: 'testnet' });
  return { hcs10, hcs11, hcs14, hcs19Identity, hcs26 };
}

function makeRegistration(overrides?: Partial<AgentRegistration>): AgentRegistration {
  return {
    name: 'Test Agent',
    description: 'A test marketplace agent',
    skills: [{
      id: 'code-review',
      name: 'Code Review',
      description: 'Reviews code for quality',
      category: 'development',
      tags: ['code', 'review', 'quality'],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      pricing: { amount: 50, token: 'HBAR', unit: 'per_call' },
    }],
    endpoint: 'https://agent.example.com',
    protocols: ['a2a-v0.3', 'hcs-10'],
    payment_address: '0.0.payment',
    ...overrides,
  };
}

describe('MarketplaceService', () => {
  let marketplace: MarketplaceService;
  let modules: ReturnType<typeof createTestModules>;

  beforeEach(() => {
    modules = createTestModules();
    marketplace = new MarketplaceService(
      modules.hcs10, modules.hcs11, modules.hcs14,
      modules.hcs19Identity, modules.hcs26,
    );
  });

  // ============================================
  // Registration Flow
  // ============================================

  describe('registerAgentWithIdentity', () => {
    test('registers agent with all 5 HCS standards', async () => {
      const result = await marketplace.registerAgentWithIdentity(makeRegistration());

      expect(result.agent).toBeDefined();
      expect(result.agent.agent_id).toBeDefined();
      expect(result.agent.name).toBe('Test Agent');
      expect(result.agent.status).toBe('online');
      expect(result.identity).toBeDefined();
      expect(result.identity.did).toMatch(/^did:hedera:/);
      expect(result.profile).toBeDefined();
      expect(result.profile.type).toBe('hcs-11-profile');
      expect(result.publishedSkills.length).toBe(1);
      expect(result.verificationStatus).toBe('verified');
    });

    test('creates HCS-19 verifiable identity with correct profile', async () => {
      const result = await marketplace.registerAgentWithIdentity(makeRegistration({
        name: 'Smart Agent',
        description: 'An intelligent agent',
      }));

      expect(result.identity.profile.name).toBe('Smart Agent');
      expect(result.identity.profile.description).toBe('An intelligent agent');
      expect(result.identity.status).toBe('active');
    });

    test('creates HCS-11 profile with skills and protocols', async () => {
      const result = await marketplace.registerAgentWithIdentity(makeRegistration());

      expect(result.profile.display_name).toBe('Test Agent');
      expect(result.profile.skills.length).toBe(1);
      expect(result.profile.protocols).toContain('a2a-v0.3');
    });

    test('publishes skills to HCS-26 registry', async () => {
      const result = await marketplace.registerAgentWithIdentity(makeRegistration());

      expect(result.publishedSkills.length).toBe(1);
      expect(result.publishedSkills[0].status).toBe('published');
      expect(result.publishedSkills[0].manifest.skills.length).toBe(1);
    });

    test('registers multiple agents independently', async () => {
      const agent1 = await marketplace.registerAgentWithIdentity(makeRegistration({ name: 'Agent One' }));
      const agent2 = await marketplace.registerAgentWithIdentity(makeRegistration({ name: 'Agent Two' }));

      expect(agent1.agent.agent_id).not.toBe(agent2.agent.agent_id);
      expect(agent1.identity.identity_topic_id).not.toBe(agent2.identity.identity_topic_id);
      expect(marketplace.getAgentCount()).toBe(2);
    });
  });

  // ============================================
  // Skill Publishing
  // ============================================

  describe('publishAgentSkill', () => {
    test('publishes additional skill for existing agent', async () => {
      const { agent } = await marketplace.registerAgentWithIdentity(makeRegistration());

      const published = await marketplace.publishAgentSkill(agent.agent_id, {
        name: 'Data Analysis',
        description: 'Analyzes datasets',
        category: 'analytics',
        tags: ['data', 'analysis'],
      });

      expect(published.status).toBe('published');
      expect(published.manifest.name).toBe('data-analysis');
    });

    test('throws for non-existent agent', async () => {
      await expect(
        marketplace.publishAgentSkill('0.0.nonexistent', {
          name: 'Test',
          description: 'test',
          category: 'test',
          tags: [],
        }),
      ).rejects.toThrow('Agent not found');
    });

    test('accumulates skills for agent profile', async () => {
      const { agent } = await marketplace.registerAgentWithIdentity(makeRegistration());

      await marketplace.publishAgentSkill(agent.agent_id, {
        name: 'Skill A', description: 'A', category: 'cat', tags: ['a'],
      });
      await marketplace.publishAgentSkill(agent.agent_id, {
        name: 'Skill B', description: 'B', category: 'cat', tags: ['b'],
      });

      const profile = await marketplace.getAgentProfile(agent.agent_id);
      expect(profile!.publishedSkills.length).toBe(3); // 1 from registration + 2 additional
    });
  });

  // ============================================
  // Discovery
  // ============================================

  describe('discoverAgents', () => {
    beforeEach(async () => {
      await marketplace.registerAgentWithIdentity(makeRegistration({
        name: 'Code Review Bot',
        description: 'Reviews code',
        skills: [{
          id: 'review', name: 'Code Review', description: 'Code review', category: 'development',
          tags: ['code'], input_schema: {}, output_schema: {},
          pricing: { amount: 10, token: 'HBAR', unit: 'per_call' },
        }],
      }));
      await marketplace.registerAgentWithIdentity(makeRegistration({
        name: 'Data Analyst',
        description: 'Analyzes data',
        skills: [{
          id: 'analysis', name: 'Data Analysis', description: 'Data analysis', category: 'analytics',
          tags: ['data', 'ml'], input_schema: {}, output_schema: {},
          pricing: { amount: 25, token: 'HBAR', unit: 'per_call' },
        }],
      }));
      await marketplace.registerAgentWithIdentity(makeRegistration({
        name: 'Security Scanner',
        description: 'Scans for vulnerabilities',
        skills: [{
          id: 'scan', name: 'Vulnerability Scan', description: 'Security scanning', category: 'security',
          tags: ['security', 'scan'], input_schema: {}, output_schema: {},
          pricing: { amount: 100, token: 'HBAR', unit: 'per_call' },
        }],
      }));
    });

    test('returns all agents when no criteria', async () => {
      const result = await marketplace.discoverAgents({});
      expect(result.total).toBe(3);
      expect(result.agents.length).toBe(3);
    });

    test('filters by text query', async () => {
      const result = await marketplace.discoverAgents({ q: 'data' });
      expect(result.total).toBe(1);
      expect(result.agents[0].agent.name).toBe('Data Analyst');
    });

    test('filters by category', async () => {
      const result = await marketplace.discoverAgents({ category: 'security' });
      expect(result.total).toBe(1);
      expect(result.agents[0].agent.name).toBe('Security Scanner');
    });

    test('filters by tags', async () => {
      const result = await marketplace.discoverAgents({ tags: ['ml'] });
      expect(result.total).toBe(1);
      expect(result.agents[0].agent.name).toBe('Data Analyst');
    });

    test('returns verified agents only', async () => {
      const result = await marketplace.discoverAgents({ verifiedOnly: true });
      expect(result.total).toBe(3); // All registered via marketplace are verified
      result.agents.forEach(a => expect(a.verificationStatus).toBe('verified'));
    });

    test('paginates results', async () => {
      const page1 = await marketplace.discoverAgents({ limit: 2, offset: 0 });
      expect(page1.agents.length).toBe(2);
      expect(page1.total).toBe(3);

      const page2 = await marketplace.discoverAgents({ limit: 2, offset: 2 });
      expect(page2.agents.length).toBe(1);
    });

    test('combines multiple filters', async () => {
      const result = await marketplace.discoverAgents({
        q: 'code',
        category: 'development',
      });
      expect(result.total).toBe(1);
      expect(result.agents[0].agent.name).toBe('Code Review Bot');
    });

    test('returns empty for non-matching criteria', async () => {
      const result = await marketplace.discoverAgents({ q: 'blockchain' });
      expect(result.total).toBe(0);
      expect(result.agents).toEqual([]);
    });

    test('each discovered agent includes full profile data', async () => {
      const result = await marketplace.discoverAgents({});
      const agent = result.agents[0];

      expect(agent.agent).toBeDefined();
      expect(agent.identity).toBeDefined();
      expect(agent.profile).toBeDefined();
      expect(agent.profile.type).toBe('hcs-11-profile');
      expect(agent.publishedSkills).toBeDefined();
      expect(agent.verificationStatus).toBeDefined();
    });
  });

  // ============================================
  // Hire Flow
  // ============================================

  describe('verifyAndHire', () => {
    let agentId: string;

    beforeEach(async () => {
      const result = await marketplace.registerAgentWithIdentity(makeRegistration());
      agentId = result.agent.agent_id;
    });

    test('successfully hires agent with valid skill', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'code-review',
        input: { repository: 'https://github.com/test/repo' },
      });

      expect(result.status).toBe('pending');
      expect(result.task_id).toBeDefined();
      expect(result.agent_id).toBe(agentId);
      expect(result.settlement).toBeDefined();
      expect(result.settlement!.amount).toBe(50);
      expect(result.settlement!.status).toBe('pending');
    });

    test('creates HCS-10 task communication channel', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'code-review',
        input: {},
      });

      expect(result.output).toBeDefined();
      expect((result.output as any).task_topic).toBeDefined();
    });

    test('fails for non-existent agent', async () => {
      await expect(
        marketplace.verifyAndHire({
          clientId: '0.0.client',
          agentId: '0.0.nonexistent',
          skillId: 'test',
          input: {},
        }),
      ).rejects.toThrow('Agent not found');
    });

    test('returns failed for non-existent skill', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'nonexistent-skill',
        input: {},
      });

      expect(result.status).toBe('failed');
      expect((result.output as any).error).toBe('skill_not_found');
    });

    test('matches skill by name when ID not found', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'Code Review',
        input: {},
      });

      expect(result.status).toBe('pending');
    });

    test('includes payment settlement with correct payer', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'code-review',
        input: {},
        payerAccount: '0.0.payer',
      });

      expect(result.settlement!.payer).toBe('0.0.payer');
      expect(result.settlement!.payee).toBe('0.0.payment');
    });

    test('hire task is retrievable by ID', async () => {
      const result = await marketplace.verifyAndHire({
        clientId: '0.0.client',
        agentId,
        skillId: 'code-review',
        input: {},
      });

      const retrieved = marketplace.getHireTask(result.task_id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.task_id).toBe(result.task_id);
    });
  });

  // ============================================
  // Agent Profile
  // ============================================

  describe('getAgentProfile', () => {
    test('returns unified profile for registered agent', async () => {
      const { agent } = await marketplace.registerAgentWithIdentity(makeRegistration());
      const profile = await marketplace.getAgentProfile(agent.agent_id);

      expect(profile).not.toBeNull();
      expect(profile!.agent.name).toBe('Test Agent');
      expect(profile!.identity.did).toMatch(/^did:hedera:/);
      expect(profile!.profile.type).toBe('hcs-11-profile');
      expect(profile!.publishedSkills.length).toBeGreaterThan(0);
      expect(profile!.verificationStatus).toBe('verified');
    });

    test('returns null for non-existent agent', async () => {
      const profile = await marketplace.getAgentProfile('0.0.nonexistent');
      expect(profile).toBeNull();
    });
  });
});
