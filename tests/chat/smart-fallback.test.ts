/**
 * Tests for the smart rule-based chat fallback system (Sprint 47).
 *
 * Verifies that common user questions get genuinely useful responses
 * even without an LLM API key configured.
 */

import { getSmartFallbackResponse } from '../../src/chat/chat-server';

describe('Smart Chat Fallback', () => {
  describe('intent detection', () => {
    it('detects "what agents are available" as list_agents', () => {
      const result = getSmartFallbackResponse('What agents are available?');
      expect(result.intent).toBe('list_agents');
    });

    it('detects "list all agents" as list_agents', () => {
      const result = getSmartFallbackResponse('list all agents');
      expect(result.intent).toBe('list_agents');
    });

    it('detects "show available agents" as list_agents', () => {
      const result = getSmartFallbackResponse('show available agents');
      expect(result.intent).toBe('list_agents');
    });

    it('detects "which agents exist" as list_agents', () => {
      const result = getSmartFallbackResponse('which agents exist?');
      expect(result.intent).toBe('list_agents');
    });

    it('detects "what is this marketplace" as about_marketplace', () => {
      const result = getSmartFallbackResponse('What is this marketplace?');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "describe the platform" as about_marketplace', () => {
      const result = getSmartFallbackResponse('Describe the platform');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "about this service" as about_marketplace', () => {
      const result = getSmartFallbackResponse('Tell me about this service');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "hello" as about_marketplace (greeting)', () => {
      const result = getSmartFallbackResponse('hello');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "hi" as about_marketplace (greeting)', () => {
      const result = getSmartFallbackResponse('hi');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "help" as about_marketplace', () => {
      const result = getSmartFallbackResponse('help');
      expect(result.intent).toBe('about_marketplace');
    });

    it('detects "how do I hire an agent" as hire_guide', () => {
      const result = getSmartFallbackResponse('How do I hire an agent?');
      expect(result.intent).toBe('hire_guide');
    });

    it('detects "steps to hire agent" as hire_guide', () => {
      const result = getSmartFallbackResponse('steps to hire an agent');
      expect(result.intent).toBe('hire_guide');
    });

    it('detects "can I use an agent" as hire_guide', () => {
      const result = getSmartFallbackResponse('Can I hire an agent for data analysis?');
      expect(result.intent).toBe('hire_guide');
    });

    it('detects "process to engage agent" as hire_guide', () => {
      const result = getSmartFallbackResponse('What is the process to engage an agent?');
      expect(result.intent).toBe('hire_guide');
    });

    it('detects "show trust scores" as trust_scores', () => {
      const result = getSmartFallbackResponse('Show me trust scores');
      expect(result.intent).toBe('trust_scores');
    });

    it('detects "get reputation ratings" as trust_scores', () => {
      const result = getSmartFallbackResponse('Get reputation ratings');
      expect(result.intent).toBe('trust_scores');
    });

    it('detects "display trust dashboard" as trust_scores', () => {
      const result = getSmartFallbackResponse('Display the trust score dashboard');
      expect(result.intent).toBe('trust_scores');
    });

    it('detects "what score does agent have" as trust_scores', () => {
      const result = getSmartFallbackResponse('What trust score does the agent have?');
      expect(result.intent).toBe('trust_scores');
    });

    it('detects "what standards do you support" as standards', () => {
      const result = getSmartFallbackResponse('What standards do you support?');
      expect(result.intent).toBe('standards');
    });

    it('detects "which HCS protocols" as standards', () => {
      const result = getSmartFallbackResponse('Which HCS protocols are implemented?');
      expect(result.intent).toBe('standards');
    });

    it('detects "list specifications" as standards', () => {
      const result = getSmartFallbackResponse('List the specifications you use');
      expect(result.intent).toBe('standards');
    });

    it('detects "check reachability" as reachability', () => {
      const result = getSmartFallbackResponse('Check protocol reachability');
      expect(result.intent).toBe('reachability');
    });

    it('detects "test endpoints" as reachability', () => {
      const result = getSmartFallbackResponse('Test API endpoints');
      expect(result.intent).toBe('reachability');
    });

    it('detects "verify connectivity" as reachability', () => {
      const result = getSmartFallbackResponse('Verify the connectivity status');
      expect(result.intent).toBe('reachability');
    });

    it('detects "how to reach the agent" as reachability', () => {
      const result = getSmartFallbackResponse('How do I reach the agent via protocol?');
      expect(result.intent).toBe('reachability');
    });

    it('detects "register new agent" as register_guide', () => {
      const result = getSmartFallbackResponse('Register a new agent');
      expect(result.intent).toBe('register_guide');
    });

    it('detects "sign up agent" as register_guide', () => {
      const result = getSmartFallbackResponse('Sign up a new agent');
      expect(result.intent).toBe('register_guide');
    });

    it('detects "create agent profile" as register_guide', () => {
      const result = getSmartFallbackResponse('Create an agent profile');
      expect(result.intent).toBe('register_guide');
    });

    it('falls back to general for unrecognized input', () => {
      const result = getSmartFallbackResponse('random gibberish xyz');
      expect(result.intent).toBe('general');
    });

    it('falls back to general for empty-ish input', () => {
      const result = getSmartFallbackResponse('...');
      expect(result.intent).toBe('general');
    });
  });

  describe('response content quality', () => {
    it('list_agents response mentions /api/agents endpoint', () => {
      const result = getSmartFallbackResponse('What agents are available?');
      expect(result.content).toContain('/api/agents');
    });

    it('list_agents response mentions marketplace', () => {
      const result = getSmartFallbackResponse('What agents are available?');
      expect(result.content).toContain('Marketplace');
    });

    it('list_agents sets queryEndpoint', () => {
      const result = getSmartFallbackResponse('What agents are available?');
      expect(result.queryEndpoint).toContain('/api/agents');
    });

    it('about_marketplace response describes the platform', () => {
      const result = getSmartFallbackResponse('What is this marketplace?');
      expect(result.content).toContain('Hedera Agent Marketplace');
      expect(result.content).toContain('Hedera Hashgraph');
    });

    it('about_marketplace mentions key features', () => {
      const result = getSmartFallbackResponse('What is this marketplace?');
      expect(result.content).toContain('Agent Registration');
      expect(result.content).toContain('Agent Discovery');
      expect(result.content).toContain('HCS-10');
    });

    it('about_marketplace mentions multi-protocol support', () => {
      const result = getSmartFallbackResponse('What is this marketplace?');
      expect(result.content).toContain('A2A');
      expect(result.content).toContain('MCP');
    });

    it('hire_guide explains the hiring flow step-by-step', () => {
      const result = getSmartFallbackResponse('How do I hire an agent?');
      expect(result.content).toContain('Step 1');
      expect(result.content).toContain('Step 2');
      expect(result.content).toContain('hire');
    });

    it('hire_guide mentions the hire API endpoint', () => {
      const result = getSmartFallbackResponse('How do I hire an agent?');
      expect(result.content).toContain('/api/marketplace/hire');
    });

    it('hire_guide mentions reputation points', () => {
      const result = getSmartFallbackResponse('How do I hire an agent?');
      expect(result.content).toContain('HCS-20');
    });

    it('trust_scores explains trust levels', () => {
      const result = getSmartFallbackResponse('Show me trust scores');
      expect(result.content).toContain('Trust Scores');
      expect(result.content).toContain('New');
      expect(result.content).toContain('Elite');
    });

    it('trust_scores mentions scoring factors', () => {
      const result = getSmartFallbackResponse('Show me trust scores');
      expect(result.content).toContain('completion');
    });

    it('trust_scores sets queryEndpoint', () => {
      const result = getSmartFallbackResponse('Show me trust scores');
      expect(result.queryEndpoint).toContain('/api/analytics/charts');
    });

    it('standards lists all 10 HCS standards', () => {
      const result = getSmartFallbackResponse('What standards do you support?');
      expect(result.content).toContain('HCS-1');
      expect(result.content).toContain('HCS-2');
      expect(result.content).toContain('HCS-3');
      expect(result.content).toContain('HCS-5');
      expect(result.content).toContain('HCS-10');
      expect(result.content).toContain('HCS-11');
      expect(result.content).toContain('HCS-14');
      expect(result.content).toContain('HCS-19');
      expect(result.content).toContain('HCS-20');
      expect(result.content).toContain('HCS-26');
    });

    it('standards mentions additional protocols', () => {
      const result = getSmartFallbackResponse('What standards do you support?');
      expect(result.content).toContain('A2A');
      expect(result.content).toContain('MCP');
      expect(result.content).toContain('ERC-8004');
    });

    it('reachability mentions three protocols', () => {
      const result = getSmartFallbackResponse('Check reachability');
      expect(result.content).toContain('HCS-10');
      expect(result.content).toContain('A2A');
      expect(result.content).toContain('MCP');
    });

    it('reachability mentions agent.json endpoint', () => {
      const result = getSmartFallbackResponse('Check reachability');
      expect(result.content).toContain('agent.json');
    });

    it('reachability sets queryEndpoint', () => {
      const result = getSmartFallbackResponse('Check reachability');
      expect(result.queryEndpoint).toContain('/api/reachability/test');
    });

    it('register_guide explains registration flow', () => {
      const result = getSmartFallbackResponse('How do I register an agent?');
      expect(result.content).toContain('register');
      expect(result.content).toContain('/api/marketplace/register');
    });

    it('register_guide mentions KMS option', () => {
      const result = getSmartFallbackResponse('How do I register an agent?');
      expect(result.content).toContain('KMS');
    });

    it('general fallback provides helpful suggestions', () => {
      const result = getSmartFallbackResponse('asdfghjkl');
      expect(result.content).toContain('Hedera Agent Marketplace');
      expect(result.content).toContain('Try asking');
    });

    it('general fallback includes quick links', () => {
      const result = getSmartFallbackResponse('xyz');
      expect(result.content).toContain('/chat');
      expect(result.content).toContain('/health');
    });
  });

  describe('baseUrl option', () => {
    it('uses custom baseUrl for queryEndpoint', () => {
      const result = getSmartFallbackResponse('What agents are available?', {
        baseUrl: 'https://hedera.opspawn.com',
      });
      expect(result.queryEndpoint).toBe('https://hedera.opspawn.com/api/agents');
    });

    it('defaults to empty baseUrl', () => {
      const result = getSmartFallbackResponse('What agents are available?');
      expect(result.queryEndpoint).toBe('/api/agents');
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase input', () => {
      const result = getSmartFallbackResponse('WHAT AGENTS ARE AVAILABLE?');
      expect(result.intent).toBe('list_agents');
    });

    it('handles mixed case input', () => {
      const result = getSmartFallbackResponse('Show Me Trust Scores');
      expect(result.intent).toBe('trust_scores');
    });

    it('handles lowercase input', () => {
      const result = getSmartFallbackResponse('what standards do you support');
      expect(result.intent).toBe('standards');
    });
  });
});
