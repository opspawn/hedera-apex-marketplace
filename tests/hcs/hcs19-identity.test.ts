import { HCS19AgentIdentity } from '../../src/hcs/hcs19';

describe('HCS19AgentIdentity', () => {
  let identity: HCS19AgentIdentity;

  const validProfile = {
    name: 'TestAgent',
    description: 'An autonomous agent for testing',
    capabilities: ['code-review', 'testing', 'deployment'],
    endpoint: 'https://agent.example.com',
    protocols: ['hcs-10', 'a2a'],
  };

  beforeEach(() => {
    identity = new HCS19AgentIdentity({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
    });
  });

  // --- Registration Tests ---

  describe('registerAgent', () => {
    test('should register an agent with correct fields', async () => {
      const agent = await identity.registerAgent(validProfile);

      expect(agent.identity_topic_id).toMatch(/^0\.0\.\d+$/);
      expect(agent.agent_id).toBe('0.0.7854018');
      expect(agent.profile.name).toBe('TestAgent');
      expect(agent.profile.description).toBe('An autonomous agent for testing');
      expect(agent.profile.capabilities).toEqual(['code-review', 'testing', 'deployment']);
      expect(agent.did).toMatch(/^did:hedera:testnet:/);
      expect(agent.status).toBe('active');
      expect(agent.registered_at).toBeDefined();
      expect(agent.updated_at).toBeDefined();
      expect(agent.sequence_number).toBe(1);
    });

    test('should generate unique topic IDs for multiple registrations', async () => {
      const agent1 = await identity.registerAgent(validProfile);
      const agent2 = await identity.registerAgent({ ...validProfile, name: 'Agent2' });

      expect(agent1.identity_topic_id).not.toBe(agent2.identity_topic_id);
      expect(agent1.did).not.toBe(agent2.did);
    });

    test('should use custom DID if provided', async () => {
      const customDID = 'did:hedera:testnet:custom-did-value';
      const agent = await identity.registerAgent({ ...validProfile, did: customDID });

      expect(agent.did).toBe(customDID);
      expect(agent.profile.did).toBe(customDID);
    });

    test('should reject registration without name', async () => {
      await expect(
        identity.registerAgent({ ...validProfile, name: '' })
      ).rejects.toThrow('Agent name is required');
    });

    test('should reject registration without description', async () => {
      await expect(
        identity.registerAgent({ ...validProfile, description: '' })
      ).rejects.toThrow('Agent description is required');
    });

    test('should reject registration without capabilities', async () => {
      await expect(
        identity.registerAgent({ ...validProfile, capabilities: [] })
      ).rejects.toThrow('At least one capability is required');
    });
  });

  // --- Resolution Tests ---

  describe('resolveAgent', () => {
    test('should resolve a registered agent by topic ID', async () => {
      const agent = await identity.registerAgent(validProfile);
      const result = await identity.resolveAgent(agent.identity_topic_id);

      expect(result.found).toBe(true);
      expect(result.identity).toBeDefined();
      expect(result.identity!.profile.name).toBe('TestAgent');
    });

    test('should return not found for non-existent topic', async () => {
      const result = await identity.resolveAgent('0.0.9999999');

      expect(result.found).toBe(false);
      expect(result.identity).toBeUndefined();
    });

    test('should resolve agent by DID', async () => {
      const agent = await identity.registerAgent(validProfile);
      const result = await identity.resolveByDID(agent.did);

      expect(result.found).toBe(true);
      expect(result.identity!.identity_topic_id).toBe(agent.identity_topic_id);
    });

    test('should return not found for unknown DID', async () => {
      const result = await identity.resolveByDID('did:hedera:testnet:unknown');
      expect(result.found).toBe(false);
    });

    test('should not resolve revoked identity', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.revokeIdentity(agent.identity_topic_id);

      const result = await identity.resolveAgent(agent.identity_topic_id);
      expect(result.found).toBe(false);
    });
  });

  // --- Verification Tests ---

  describe('verifyIdentity', () => {
    test('should verify active identity as valid', async () => {
      const agent = await identity.registerAgent(validProfile);
      const result = await identity.verifyIdentity(agent.identity_topic_id);

      expect(result.valid).toBe(true);
      expect(result.identity).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    test('should return invalid for non-existent identity', async () => {
      const result = await identity.verifyIdentity('0.0.9999999');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Identity not found');
    });

    test('should return invalid for revoked identity', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.revokeIdentity(agent.identity_topic_id);
      const result = await identity.verifyIdentity(agent.identity_topic_id);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Identity has been revoked');
    });
  });

  // --- Update Tests ---

  describe('updateProfile', () => {
    test('should update profile fields', async () => {
      const agent = await identity.registerAgent(validProfile);
      const updated = await identity.updateProfile(agent.identity_topic_id, {
        name: 'UpdatedAgent',
        capabilities: ['code-review', 'testing', 'deployment', 'monitoring'],
      });

      expect(updated.profile.name).toBe('UpdatedAgent');
      expect(updated.profile.capabilities).toHaveLength(4);
      expect(updated.profile.description).toBe('An autonomous agent for testing'); // unchanged
      expect(updated.sequence_number).toBe(2);
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(agent.registered_at).getTime()
      );
    });

    test('should throw when updating non-existent identity', async () => {
      await expect(
        identity.updateProfile('0.0.9999999', { name: 'X' })
      ).rejects.toThrow('Identity not found');
    });

    test('should throw when updating revoked identity', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.revokeIdentity(agent.identity_topic_id);

      await expect(
        identity.updateProfile(agent.identity_topic_id, { name: 'X' })
      ).rejects.toThrow('Cannot update revoked identity');
    });
  });

  // --- Revocation Tests ---

  describe('revokeIdentity', () => {
    test('should revoke an active identity', async () => {
      const agent = await identity.registerAgent(validProfile);
      const revoked = await identity.revokeIdentity(agent.identity_topic_id);

      expect(revoked.status).toBe('revoked');
      expect(revoked.sequence_number).toBe(2);
    });

    test('should throw when revoking non-existent identity', async () => {
      await expect(
        identity.revokeIdentity('0.0.9999999')
      ).rejects.toThrow('Identity not found');
    });

    test('should throw when revoking already revoked identity', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.revokeIdentity(agent.identity_topic_id);

      await expect(
        identity.revokeIdentity(agent.identity_topic_id)
      ).rejects.toThrow('Identity already revoked');
    });
  });

  // --- Claims Tests ---

  describe('claims', () => {
    test('should issue a claim on an agent', async () => {
      const agent = await identity.registerAgent(validProfile);
      const claim = await identity.issueClaim(
        agent.identity_topic_id,
        'skill_verification',
        { skill: 'code-review', level: 'expert' },
      );

      expect(claim.id).toBeDefined();
      expect(claim.issuer).toBe('0.0.7854018');
      expect(claim.subject).toBe(agent.identity_topic_id);
      expect(claim.claim_type).toBe('skill_verification');
      expect(claim.claims.skill).toBe('code-review');
      expect(claim.proof).toBeDefined();
      expect(claim.revoked).toBe(false);
    });

    test('should issue a claim with expiry', async () => {
      const agent = await identity.registerAgent(validProfile);
      const claim = await identity.issueClaim(
        agent.identity_topic_id,
        'certification',
        { cert: 'hedera-dev' },
        90,
      );

      expect(claim.expires_at).toBeDefined();
      expect(new Date(claim.expires_at!).getTime()).toBeGreaterThan(Date.now());
    });

    test('should get active claims only', async () => {
      const agent = await identity.registerAgent(validProfile);

      await identity.issueClaim(agent.identity_topic_id, 'type1', { a: 1 });
      const c2 = await identity.issueClaim(agent.identity_topic_id, 'type2', { b: 2 });
      await identity.issueClaim(agent.identity_topic_id, 'type3', { c: 3 });

      // Revoke one
      await identity.revokeClaim(agent.identity_topic_id, c2.id);

      const active = await identity.getClaims(agent.identity_topic_id);
      expect(active).toHaveLength(2);
      expect(active.find(c => c.claim_type === 'type2')).toBeUndefined();
    });

    test('should throw when issuing claim on non-existent identity', async () => {
      await expect(
        identity.issueClaim('0.0.9999999', 'test', {})
      ).rejects.toThrow('Subject identity not found');
    });

    test('should include claims in resolution result', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.issueClaim(agent.identity_topic_id, 'rep', { score: 95 });

      const result = await identity.resolveAgent(agent.identity_topic_id);
      expect(result.claims).toHaveLength(1);
      expect(result.claims![0].claim_type).toBe('rep');
    });
  });

  // --- Selective Disclosure Tests ---

  describe('handleDisclosureRequest', () => {
    test('should disclose only requested profile fields', async () => {
      const agent = await identity.registerAgent(validProfile);

      const response = await identity.handleDisclosureRequest({
        requester: '0.0.1111111',
        subject: agent.did,
        requested_claims: ['name', 'capabilities'],
        purpose: 'skill_matching',
        nonce: 'abc123',
      });

      expect(response.disclosed_claims.name).toBe('TestAgent');
      expect(response.disclosed_claims.capabilities).toEqual(['code-review', 'testing', 'deployment']);
      expect(response.disclosed_claims.description).toBeUndefined(); // not requested
      expect(response.nonce).toBe('abc123');
      expect(response.proof).toBeDefined();
    });

    test('should disclose claims by type', async () => {
      const agent = await identity.registerAgent(validProfile);
      await identity.issueClaim(agent.identity_topic_id, 'reputation', { score: 98 });

      const response = await identity.handleDisclosureRequest({
        requester: '0.0.1111111',
        subject: agent.did,
        requested_claims: ['reputation'],
        purpose: 'hiring',
        nonce: 'xyz789',
      });

      expect(response.disclosed_claims.reputation).toEqual({ score: 98 });
    });

    test('should throw for unknown subject DID', async () => {
      await expect(
        identity.handleDisclosureRequest({
          requester: '0.0.1111111',
          subject: 'did:hedera:testnet:unknown',
          requested_claims: ['name'],
          purpose: 'test',
          nonce: 'n1',
        })
      ).rejects.toThrow('Subject not found');
    });
  });

  // --- Utility Tests ---

  describe('utility methods', () => {
    test('should list all identities', async () => {
      await identity.registerAgent(validProfile);
      await identity.registerAgent({ ...validProfile, name: 'Agent2' });

      const list = await identity.listIdentities();
      expect(list).toHaveLength(2);
    });

    test('should return identity count', async () => {
      expect(identity.getIdentityCount()).toBe(0);
      await identity.registerAgent(validProfile);
      expect(identity.getIdentityCount()).toBe(1);
    });

    test('should return config', () => {
      const config = identity.getConfig();
      expect(config.accountId).toBe('0.0.7854018');
      expect(config.network).toBe('testnet');
    });
  });
});
