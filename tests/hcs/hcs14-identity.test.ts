import { HCS14IdentityManager } from '../../src/hcs/hcs14-identity';

describe('HCS14IdentityManager', () => {
  let manager: HCS14IdentityManager;

  beforeEach(() => {
    manager = new HCS14IdentityManager({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
    });
  });

  test('should create a DID document with correct format', async () => {
    const doc = await manager.createDID('0.0.7854018', 'https://marketplace.opspawn.com');
    expect(doc.id).toBe('did:hedera:testnet:0.0.7854018');
    expect(doc.agent_id).toBe('0.0.7854018');
    expect(doc.public_key).toContain('#key-1');
    expect(doc.authentication).toHaveLength(1);
    expect(doc.service_endpoints).toHaveLength(1);
    expect(doc.service_endpoints[0].type).toBe('AgentMarketplace');
  });

  test('should build DID string from account ID', () => {
    const did = manager.buildDID('0.0.1234567');
    expect(did).toBe('did:hedera:testnet:0.0.1234567');
  });

  test('should verify non-existent DID returns invalid', async () => {
    const result = await manager.verifyDID('did:hedera:testnet:0.0.999999');
    expect(result.valid).toBe(false);
    expect(result.document).toBeUndefined();
  });
});
