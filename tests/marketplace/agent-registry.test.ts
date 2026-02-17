import { AgentRegistry } from '../../src/marketplace/agent-registry';
import { HCS10Client } from '../../src/hcs/hcs10-client';
import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    const hcs10 = new HCS10Client({ accountId: '0.0.1', privateKey: 'k', network: 'testnet', registryTopicId: '0.0.7311321' });
    const hcs11 = new HCS11ProfileManager({ accountId: '0.0.1', privateKey: 'k', network: 'testnet' });
    const hcs14 = new HCS14IdentityManager({ accountId: '0.0.1', privateKey: 'k', network: 'testnet' });
    registry = new AgentRegistry(hcs10, hcs11, hcs14);
  });

  const makeRegistration = (name: string, skillName: string, category?: string) => ({
    name,
    description: `${name} description`,
    skills: [{
      id: skillName.toLowerCase().replace(/\s/g, '-'),
      name: skillName,
      category,
      tags: [skillName.toLowerCase()],
      input_schema: { type: 'object' },
      output_schema: { type: 'object' },
      pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' as const },
    }],
    endpoint: 'https://test.example.com',
    protocols: ['a2a-v0.3'],
    payment_address: '0.0.999',
  });

  test('should register an agent', async () => {
    const agent = await registry.register(makeRegistration('Test Agent', 'Test Skill'));
    expect(agent.agent_id).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(registry.getCount()).toBe(1);
  });

  test('should get agent by ID', async () => {
    const agent = await registry.register(makeRegistration('Lookup Agent', 'Lookup'));
    const found = await registry.getAgent(agent.agent_id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Lookup Agent');
  });

  test('should return null for non-existent agent', async () => {
    const found = await registry.getAgent('0.0.nonexistent');
    expect(found).toBeNull();
  });

  test('should search agents by query', async () => {
    await registry.register(makeRegistration('Screenshot Agent', 'Screenshot URL'));
    await registry.register(makeRegistration('Code Agent', 'Code Review'));

    const result = await registry.searchAgents({ q: 'screenshot' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('Screenshot Agent');
  });

  test('should search agents by category', async () => {
    await registry.register(makeRegistration('Tool Agent', 'Tool Skill', 'tools'));
    await registry.register(makeRegistration('AI Agent', 'AI Skill', 'ai'));

    const result = await registry.searchAgents({ category: 'tools' });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('Tool Agent');
  });

  test('should list all agents', async () => {
    await registry.register(makeRegistration('A1', 'S1'));
    await registry.register(makeRegistration('A2', 'S2'));
    const all = await registry.listAgents();
    expect(all).toHaveLength(2);
  });

  test('should update agent status', async () => {
    const agent = await registry.register(makeRegistration('Status Agent', 'Skill'));
    expect(agent.status).toBe('online');

    const updated = await registry.updateStatus(agent.agent_id, 'offline');
    expect(updated!.status).toBe('offline');
  });
});
