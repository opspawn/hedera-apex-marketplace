import { HCS11ProfileManager } from '../../src/hcs/hcs11-profile';
import { RegisteredAgent } from '../../src/types';

describe('HCS11ProfileManager', () => {
  let manager: HCS11ProfileManager;
  const mockAgent: RegisteredAgent = {
    agent_id: '0.0.7854018',
    name: 'Screenshot Agent',
    description: 'Takes browser screenshots',
    skills: [{
      id: 'screenshot-url',
      name: 'Screenshot URL',
      input_schema: { type: 'object', properties: { url: { type: 'string' } } },
      output_schema: { type: 'object', properties: { image_url: { type: 'string' } } },
      pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' },
    }],
    endpoint: 'https://screenshot.opspawn.com',
    protocols: ['a2a-v0.3', 'x402-v2', 'mcp'],
    payment_address: '0.0.7854018',
    inbound_topic: '0.0.7854276',
    outbound_topic: '0.0.7854275',
    profile_topic: '0.0.7854282',
    reputation_score: 85,
    status: 'online',
    registered_at: '2026-02-17T10:00:00Z',
  };

  beforeEach(() => {
    manager = new HCS11ProfileManager({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
    });
  });

  test('should create a valid HCS-11 profile', async () => {
    const profile = await manager.createProfile(mockAgent);
    expect(profile.type).toBe('hcs-11-profile');
    expect(profile.version).toBe('1.0');
    expect(profile.agent_id).toBe('0.0.7854018');
    expect(profile.display_name).toBe('Screenshot Agent');
    expect(profile.skills).toHaveLength(1);
    expect(profile.topics?.inbound).toBe('0.0.7854276');
  });

  test('should infer capabilities from protocols', async () => {
    const profile = await manager.createProfile(mockAgent);
    expect(profile.capabilities).toContain('A2A_INTEGRATION');
    expect(profile.capabilities).toContain('PAYMENT_PROTOCOL');
    expect(profile.capabilities).toContain('MCP_COMPATIBLE');
    expect(profile.capabilities).toContain('API_INTEGRATION');
  });

  test('should validate a valid profile', () => {
    const profile = {
      type: 'hcs-11-profile' as const,
      version: '1.0',
      agent_id: '0.0.7854018',
      display_name: 'Test Agent',
      bio: 'A test agent',
      capabilities: [],
      skills: [{ id: 'test', name: 'Test', input_schema: {}, output_schema: {}, pricing: { amount: 1, token: 'HBAR', unit: 'per_call' as const } }],
      protocols: [],
    };
    const result = manager.validateProfile(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject profile missing required fields', () => {
    const profile = {
      type: 'wrong-type' as any,
      version: '',
      agent_id: '',
      display_name: '',
      bio: '',
      capabilities: [],
      skills: [],
      protocols: [],
    };
    const result = manager.validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
