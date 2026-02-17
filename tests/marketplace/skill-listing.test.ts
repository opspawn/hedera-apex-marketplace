import { SkillListing } from '../../src/marketplace/skill-listing';
import { RegisteredAgent } from '../../src/types';

describe('SkillListing', () => {
  const agents: RegisteredAgent[] = [
    {
      agent_id: '0.0.1',
      name: 'Screenshot Agent',
      description: 'Takes screenshots',
      skills: [
        { id: 'screenshot', name: 'Screenshot URL', category: 'tools', tags: ['screenshot', 'browser'], input_schema: {}, output_schema: {}, pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' } },
      ],
      endpoint: 'https://test.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.999',
      inbound_topic: '0.0.1',
      outbound_topic: '0.0.2',
      profile_topic: '0.0.3',
      reputation_score: 90,
      status: 'online',
      registered_at: '2026-01-01T00:00:00Z',
    },
    {
      agent_id: '0.0.2',
      name: 'Code Agent',
      description: 'Reviews code',
      skills: [
        { id: 'review', name: 'Code Review', category: 'ai', tags: ['code', 'review'], input_schema: {}, output_schema: {}, pricing: { amount: 200, token: 'OPSPAWN', unit: 'per_call' } },
        { id: 'fix', name: 'Bug Fix', category: 'ai', tags: ['code', 'fix'], input_schema: {}, output_schema: {}, pricing: { amount: 500, token: 'OPSPAWN', unit: 'per_call' } },
      ],
      endpoint: 'https://test2.com',
      protocols: ['a2a-v0.3'],
      payment_address: '0.0.888',
      inbound_topic: '0.0.4',
      outbound_topic: '0.0.5',
      profile_topic: '0.0.6',
      reputation_score: 75,
      status: 'online',
      registered_at: '2026-01-02T00:00:00Z',
    },
  ];

  test('should extract skills from agents', () => {
    const entries = SkillListing.fromAgents(agents);
    expect(entries).toHaveLength(3);
  });

  test('should filter by category', () => {
    const entries = SkillListing.fromAgents(agents);
    const tools = SkillListing.filterByCategory(entries, 'tools');
    expect(tools).toHaveLength(1);
    expect(tools[0].skill.name).toBe('Screenshot URL');
  });

  test('should filter by tags', () => {
    const entries = SkillListing.fromAgents(agents);
    const codeSkills = SkillListing.filterByTags(entries, ['code']);
    expect(codeSkills).toHaveLength(2);
  });

  test('should search skills by name', () => {
    const entries = SkillListing.fromAgents(agents);
    const found = SkillListing.search(entries, 'screenshot');
    expect(found).toHaveLength(1);
  });

  test('should sort by reputation', () => {
    const entries = SkillListing.fromAgents(agents);
    const sorted = SkillListing.sortByReputation(entries);
    expect(sorted[0].reputation_score).toBeGreaterThanOrEqual(sorted[sorted.length - 1].reputation_score);
  });

  test('should get unique categories', () => {
    const entries = SkillListing.fromAgents(agents);
    const categories = SkillListing.getCategories(entries);
    expect(categories).toEqual(['ai', 'tools']);
  });
});
