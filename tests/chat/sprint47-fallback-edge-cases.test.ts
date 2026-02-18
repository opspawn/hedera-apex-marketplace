/**
 * Sprint 47 — Smart Fallback Edge Cases.
 *
 * Tests edge cases and additional patterns for the
 * getSmartFallbackResponse function.
 */

import { getSmartFallbackResponse } from '../../src/chat/chat-server';

describe('Sprint 47: Smart Fallback — Intent Detection', () => {
  // Trust score queries
  it('detects "show trust scores" intent', () => {
    const r = getSmartFallbackResponse('Show me trust scores');
    expect(r.intent).toBe('trust_scores');
  });

  it('detects "get reputation" as trust_scores', () => {
    const r = getSmartFallbackResponse('What reputation scores do agents have?');
    expect(r.intent).toBe('trust_scores');
  });

  it('detects "view rating" as trust_scores', () => {
    const r = getSmartFallbackResponse('Show rating for each agent');
    expect(r.intent).toBe('trust_scores');
  });

  it('detects "display trust dashboard" as trust_scores', () => {
    const r = getSmartFallbackResponse('Display trust dashboard');
    expect(r.intent).toBe('trust_scores');
  });

  // Standards queries
  it('detects "what standards" as standards', () => {
    const r = getSmartFallbackResponse('What standards do you support?');
    expect(r.intent).toBe('standards');
  });

  it('detects "which HCS" as standards', () => {
    const r = getSmartFallbackResponse('Which HCS standards do you implement?');
    expect(r.intent).toBe('standards');
  });

  it('detects "list protocols" as standards', () => {
    const r = getSmartFallbackResponse('List all protocols you support');
    expect(r.intent).toBe('standards');
  });

  it('detects "what specs" as standards', () => {
    const r = getSmartFallbackResponse('What specs do you use?');
    expect(r.intent).toBe('standards');
  });

  // Hire guide queries
  it('detects "how to hire" as hire_guide', () => {
    const r = getSmartFallbackResponse('How do I hire an agent?');
    expect(r.intent).toBe('hire_guide');
  });

  it('detects "steps to book" as hire_guide', () => {
    const r = getSmartFallbackResponse('What are the steps to book an agent?');
    expect(r.intent).toBe('hire_guide');
  });

  it('detects "process to engage" as hire_guide', () => {
    const r = getSmartFallbackResponse('What is the process to engage an agent?');
    expect(r.intent).toBe('hire_guide');
  });

  it('detects "guide to use agent" as hire_guide', () => {
    const r = getSmartFallbackResponse('Guide me to use an agent');
    expect(r.intent).toBe('hire_guide');
  });

  // List agents queries
  it('detects "what agents" as list_agents', () => {
    const r = getSmartFallbackResponse('What agents are available?');
    expect(r.intent).toBe('list_agents');
  });

  it('detects "list agents" as list_agents', () => {
    const r = getSmartFallbackResponse('List all available agents');
    expect(r.intent).toBe('list_agents');
  });

  it('detects "show agents" as list_agents', () => {
    const r = getSmartFallbackResponse('Show me the agents');
    expect(r.intent).toBe('list_agents');
  });

  it('detects "which agents" as list_agents', () => {
    const r = getSmartFallbackResponse('Which agents are there?');
    expect(r.intent).toBe('list_agents');
  });

  // About marketplace queries
  it('detects "hello" as about_marketplace', () => {
    const r = getSmartFallbackResponse('hello');
    expect(r.intent).toBe('about_marketplace');
  });

  it('detects "hi" as about_marketplace', () => {
    const r = getSmartFallbackResponse('hi');
    expect(r.intent).toBe('about_marketplace');
  });

  it('detects "help" as about_marketplace', () => {
    const r = getSmartFallbackResponse('help');
    expect(r.intent).toBe('about_marketplace');
  });

  it('detects "what is this marketplace" as about_marketplace', () => {
    const r = getSmartFallbackResponse('What is this marketplace?');
    expect(r.intent).toBe('about_marketplace');
  });

  it('detects "describe the platform" as about_marketplace', () => {
    const r = getSmartFallbackResponse('Describe the platform');
    expect(r.intent).toBe('about_marketplace');
  });

  it('detects "explain this service" as about_marketplace', () => {
    const r = getSmartFallbackResponse('Explain this service');
    expect(r.intent).toBe('about_marketplace');
  });

  // Reachability queries
  it('detects "check reachability" as reachability', () => {
    const r = getSmartFallbackResponse('Check protocol reachability');
    expect(r.intent).toBe('reachability');
  });

  it('detects "verify connectivity" as reachability', () => {
    const r = getSmartFallbackResponse('Check connectivity status');
    expect(r.intent).toBe('reachability');
  });

  it('detects "test endpoints" as reachability', () => {
    const r = getSmartFallbackResponse('Test api endpoints available');
    expect(r.intent).toBe('reachability');
  });

  // Registration queries
  it('detects "register an agent" as register_guide', () => {
    const r = getSmartFallbackResponse('How do I register an agent?');
    expect(r.intent).toBe('register_guide');
  });

  it('detects "create an agent profile" as register_guide', () => {
    const r = getSmartFallbackResponse('Create an agent profile');
    expect(r.intent).toBe('register_guide');
  });

  it('detects "sign up agent" as register_guide', () => {
    const r = getSmartFallbackResponse('Sign up a new agent account');
    expect(r.intent).toBe('register_guide');
  });

  // General/fallback
  it('returns general for unrecognized input', () => {
    const r = getSmartFallbackResponse('Tell me a joke about AI');
    expect(r.intent).toBe('general');
  });

  it('returns general for random text', () => {
    const r = getSmartFallbackResponse('asdfghjkl');
    expect(r.intent).toBe('general');
  });
});

describe('Sprint 47: Smart Fallback — Content Quality', () => {
  it('trust_scores response has trust levels', () => {
    const r = getSmartFallbackResponse('Show trust scores');
    expect(r.content).toContain('New');
    expect(r.content).toContain('Basic');
    expect(r.content).toContain('Trusted');
    expect(r.content).toContain('Verified');
    expect(r.content).toContain('Elite');
  });

  it('trust_scores response has API endpoints', () => {
    const r = getSmartFallbackResponse('Show trust scores');
    expect(r.content).toContain('GET /api/agents/:id/trust');
    expect(r.content).toContain('GET /api/analytics/charts');
  });

  it('standards response lists all 10 standards', () => {
    const r = getSmartFallbackResponse('What standards do you support?');
    expect(r.content).toContain('HCS-1');
    expect(r.content).toContain('HCS-2');
    expect(r.content).toContain('HCS-3');
    expect(r.content).toContain('HCS-5');
    expect(r.content).toContain('HCS-10');
    expect(r.content).toContain('HCS-11');
    expect(r.content).toContain('HCS-14');
    expect(r.content).toContain('HCS-19');
    expect(r.content).toContain('HCS-20');
    expect(r.content).toContain('HCS-26');
  });

  it('standards response mentions A2A and MCP', () => {
    const r = getSmartFallbackResponse('What standards do you support?');
    expect(r.content).toContain('A2A');
    expect(r.content).toContain('MCP');
    expect(r.content).toContain('ERC-8004');
  });

  it('hire_guide response has 5 steps', () => {
    const r = getSmartFallbackResponse('How do I hire an agent?');
    expect(r.content).toContain('Step 1');
    expect(r.content).toContain('Step 2');
    expect(r.content).toContain('Step 3');
    expect(r.content).toContain('Step 4');
    expect(r.content).toContain('Step 5');
  });

  it('hire_guide response has API endpoints', () => {
    const r = getSmartFallbackResponse('How do I hire an agent?');
    expect(r.content).toContain('POST /api/marketplace/hire');
    expect(r.content).toContain('GET /api/marketplace/discover');
  });

  it('about_marketplace response describes core features', () => {
    const r = getSmartFallbackResponse('What is this marketplace?');
    expect(r.content).toContain('Agent Registration');
    expect(r.content).toContain('Agent Discovery');
    expect(r.content).toContain('Secure Communication');
    expect(r.content).toContain('Privacy Consent');
    expect(r.content).toContain('Reputation System');
    expect(r.content).toContain('Skill Publishing');
  });

  it('reachability response has all 3 protocols', () => {
    const r = getSmartFallbackResponse('Check reachability');
    expect(r.content).toContain('HCS-10');
    expect(r.content).toContain('A2A');
    expect(r.content).toContain('MCP');
  });

  it('reachability response has endpoints', () => {
    const r = getSmartFallbackResponse('Check reachability');
    expect(r.content).toContain('/.well-known/agent.json');
    expect(r.content).toContain('/mcp');
    expect(r.content).toContain('/api/connections');
  });

  it('register_guide response has KMS info', () => {
    const r = getSmartFallbackResponse('How do I register an agent?');
    expect(r.content).toContain('KMS');
    expect(r.content).toContain('/api/marketplace/register');
  });

  it('register_guide response has HOL info', () => {
    const r = getSmartFallbackResponse('How do I register an agent?');
    expect(r.content).toContain('HOL');
  });

  it('general response has suggestion links', () => {
    const r = getSmartFallbackResponse('something random');
    expect(r.content).toContain('Marketplace Dashboard');
    expect(r.content).toContain('Agent Chat');
    expect(r.content).toContain('API Health');
  });

  it('list_agents response has API endpoint', () => {
    const r = getSmartFallbackResponse('What agents are available?');
    expect(r.content).toContain('GET /api/agents');
  });

  it('list_agents response has queryEndpoint', () => {
    const r = getSmartFallbackResponse('What agents are available?');
    expect(r.queryEndpoint).toContain('/api/agents');
  });

  it('trust_scores response has queryEndpoint', () => {
    const r = getSmartFallbackResponse('Show trust scores');
    expect(r.queryEndpoint).toContain('/api/analytics/charts');
  });

  it('reachability response has queryEndpoint', () => {
    const r = getSmartFallbackResponse('Check reachability');
    expect(r.queryEndpoint).toContain('/api/reachability/test');
  });
});

describe('Sprint 47: Smart Fallback — baseUrl handling', () => {
  it('queryEndpoint respects baseUrl', () => {
    const r = getSmartFallbackResponse('Show trust scores', { baseUrl: 'https://hedera.opspawn.com' });
    expect(r.queryEndpoint).toBe('https://hedera.opspawn.com/api/analytics/charts');
  });

  it('queryEndpoint uses empty string if no baseUrl', () => {
    const r = getSmartFallbackResponse('What agents are available?');
    expect(r.queryEndpoint).toBe('/api/agents');
  });

  it('queryEndpoint uses baseUrl for reachability', () => {
    const r = getSmartFallbackResponse('Check reachability', { baseUrl: 'http://localhost:3000' });
    expect(r.queryEndpoint).toBe('http://localhost:3000/api/reachability/test');
  });
});

describe('Sprint 47: Smart Fallback — Case Insensitivity', () => {
  it('handles UPPERCASE input', () => {
    const r = getSmartFallbackResponse('WHAT AGENTS ARE AVAILABLE?');
    expect(r.intent).toBe('list_agents');
  });

  it('handles MiXeD case input', () => {
    const r = getSmartFallbackResponse('Show Me Trust Scores');
    expect(r.intent).toBe('trust_scores');
  });

  it('handles extra whitespace', () => {
    const r = getSmartFallbackResponse('  what  agents  are  available  ');
    expect(r.intent).toBe('list_agents');
  });
});
