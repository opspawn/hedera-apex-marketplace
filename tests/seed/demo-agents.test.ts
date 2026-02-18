import { DEMO_AGENTS } from '../../src/seed/demo-agents';

describe('Demo Agents Seed Data', () => {
  it('should have 24 demo agents', () => {
    expect(DEMO_AGENTS.length).toBe(24);
  });

  it('each agent should have required fields', () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.name).toBeDefined();
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.description).toBeDefined();
      expect(agent.description.length).toBeGreaterThan(0);
      expect(agent.endpoint).toBeDefined();
      expect(agent.endpoint).toMatch(/^https:\/\//);
      expect(agent.skills.length).toBeGreaterThanOrEqual(1);
      expect(agent.protocols.length).toBeGreaterThanOrEqual(1);
      expect(agent.payment_address).toBeDefined();
    }
  });

  it('each agent should have a reputation score between 0 and 100', () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.reputation).toBeGreaterThanOrEqual(0);
      expect(agent.reputation).toBeLessThanOrEqual(100);
    }
  });

  it('agents with privacy consent should have consent purposes', () => {
    for (const agent of DEMO_AGENTS) {
      if (agent.hasPrivacyConsent) {
        expect(agent.consentPurposes).toBeDefined();
        expect(agent.consentPurposes!.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have unique agent names', () => {
    const names = DEMO_AGENTS.map(a => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should cover diverse categories', () => {
    const categories = new Set<string>();
    for (const agent of DEMO_AGENTS) {
      for (const skill of agent.skills) {
        if (skill.category) categories.add(skill.category);
      }
    }
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  it('all skills should have pricing information', () => {
    for (const agent of DEMO_AGENTS) {
      for (const skill of agent.skills) {
        expect(skill.pricing).toBeDefined();
        expect(skill.pricing.token).toBe('HBAR');
        expect(skill.pricing.unit).toMatch(/^per_(call|minute|token)$/);
      }
    }
  });

  it('all skills should have input and output schemas', () => {
    for (const agent of DEMO_AGENTS) {
      for (const skill of agent.skills) {
        expect(skill.input_schema).toBeDefined();
        expect(skill.output_schema).toBeDefined();
      }
    }
  });

  it('should have agents with and without privacy consent', () => {
    const withConsent = DEMO_AGENTS.filter(a => a.hasPrivacyConsent);
    const withoutConsent = DEMO_AGENTS.filter(a => !a.hasPrivacyConsent);
    expect(withConsent.length).toBeGreaterThan(0);
    expect(withoutConsent.length).toBeGreaterThan(0);
  });

  it('all agents should include hcs-10 protocol', () => {
    for (const agent of DEMO_AGENTS) {
      expect(agent.protocols).toContain('hcs-10');
    }
  });
});
