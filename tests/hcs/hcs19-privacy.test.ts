import { HCS19PrivacyManager } from '../../src/hcs/hcs19-privacy';

describe('HCS19PrivacyManager', () => {
  let manager: HCS19PrivacyManager;

  beforeEach(() => {
    manager = new HCS19PrivacyManager({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
    });
  });

  test('should grant consent with correct fields', async () => {
    const consent = await manager.grantConsent({
      agent_id: '0.0.7854018',
      purposes: ['service_delivery', 'reputation_tracking'],
      retention: '30d',
    });

    expect(consent.id).toBeDefined();
    expect(consent.agent_id).toBe('0.0.7854018');
    expect(consent.purposes).toContain('service_delivery');
    expect(consent.purposes).toContain('reputation_tracking');
    expect(consent.retention).toBe('30d');
    expect(consent.granted_at).toBeDefined();
    expect(consent.expires_at).toBeDefined();
    expect(consent.revoked_at).toBeUndefined();
  });

  test('should check consent returns true for active consent', async () => {
    await manager.grantConsent({
      agent_id: '0.0.7854018',
      purposes: ['service_delivery'],
      retention: '30d',
    });

    const result = await manager.checkConsent('0.0.7854018', 'service_delivery');
    expect(result.consented).toBe(true);
    expect(result.consent).toBeDefined();
  });

  test('should check consent returns false for non-existent consent', async () => {
    const result = await manager.checkConsent('0.0.9999999', 'service_delivery');
    expect(result.consented).toBe(false);
  });

  test('should revoke consent', async () => {
    const consent = await manager.grantConsent({
      agent_id: '0.0.7854018',
      purposes: ['service_delivery'],
      retention: '30d',
    });

    const revoked = await manager.revokeConsent(consent.id);
    expect(revoked.revoked_at).toBeDefined();

    const check = await manager.checkConsent('0.0.7854018', 'service_delivery');
    expect(check.consented).toBe(false);
  });

  test('should throw on revoking non-existent consent', async () => {
    await expect(manager.revokeConsent('nonexistent')).rejects.toThrow('Consent not found');
  });

  test('should list consents for an agent', async () => {
    await manager.grantConsent({ agent_id: '0.0.111', purposes: ['p1'], retention: '30d' });
    await manager.grantConsent({ agent_id: '0.0.111', purposes: ['p2'], retention: '7d' });
    await manager.grantConsent({ agent_id: '0.0.222', purposes: ['p1'], retention: '30d' });

    const list = await manager.listConsents('0.0.111');
    expect(list).toHaveLength(2);
  });

  test('should calculate expiry for days, hours, and months', async () => {
    const dayConsent = await manager.grantConsent({ agent_id: '0.0.1', purposes: ['test'], retention: '30d' });
    expect(new Date(dayConsent.expires_at!).getTime()).toBeGreaterThan(Date.now());

    const hourConsent = await manager.grantConsent({ agent_id: '0.0.2', purposes: ['test'], retention: '24h' });
    expect(new Date(hourConsent.expires_at!).getTime()).toBeGreaterThan(Date.now());

    const monthConsent = await manager.grantConsent({ agent_id: '0.0.3', purposes: ['test'], retention: '6m' });
    expect(new Date(monthConsent.expires_at!).getTime()).toBeGreaterThan(Date.now());
  });
});
