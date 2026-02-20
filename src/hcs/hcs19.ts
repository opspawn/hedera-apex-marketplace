/**
 * HCS-19: Agent Identity on Hedera
 *
 * Manages agent identity registration, resolution, verification,
 * and selective disclosure via HCS topics. Each agent gets a dedicated
 * identity topic where profile data and verifiable claims are published.
 *
 * Privacy compliance: claim-based selective disclosure architecture
 * where agents only reveal what's needed for a given interaction.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentIdentity,
  AgentIdentityProfile,
  IdentityClaim,
  SelectiveDisclosureRequest,
  SelectiveDisclosureResponse,
  IdentityResolutionResult,
  IdentityVerificationResult,
} from '../types';
import { TestnetIntegration } from '../hedera/testnet-integration';

export interface HCS19IdentityConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
}

export class HCS19AgentIdentity {
  private config: HCS19IdentityConfig;
  private identities: Map<string, AgentIdentity> = new Map();
  private identitiesByDID: Map<string, string> = new Map(); // DID -> topicId
  private claims: Map<string, IdentityClaim[]> = new Map(); // topicId -> claims
  private counter: number = 0;
  private testnet: TestnetIntegration | null = null;

  constructor(config: HCS19IdentityConfig, testnet?: TestnetIntegration) {
    this.config = config;
    this.testnet = testnet || null;
  }

  /**
   * Attach a testnet integration layer for real HCS identity operations.
   */
  setTestnetIntegration(testnet: TestnetIntegration): void {
    this.testnet = testnet;
  }

  /**
   * Register a new agent identity on Hedera.
   *
   * When testnet integration is available:
   * - Creates a real HCS-19 identity topic on Hedera testnet
   * - Publishes the agent's DID document as the first message
   * Otherwise uses an in-memory mock topic ID.
   */
  async registerAgent(profile: AgentIdentityProfile): Promise<AgentIdentity> {
    if (!profile.name || profile.name.trim().length === 0) {
      throw new Error('Agent name is required');
    }
    if (!profile.description || profile.description.trim().length === 0) {
      throw new Error('Agent description is required');
    }
    if (!profile.capabilities || profile.capabilities.length === 0) {
      throw new Error('At least one capability is required');
    }

    let topicId: string;
    let onChain = false;

    if (this.testnet && this.testnet.isLive()) {
      try {
        const topicRecord = await this.testnet.createTopic(`hcs-19:identity:${profile.name}`);
        topicId = topicRecord.topicId;
        onChain = topicRecord.onChain;
      } catch (err) {
        console.warn(`HCS-19 identity topic creation failed for ${profile.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        this.counter++;
        topicId = `0.0.${7900000 + this.counter}`;
      }
    } else {
      this.counter++;
      topicId = `0.0.${7900000 + this.counter}`;
    }

    const did = profile.did || `did:hedera:${this.config.network}:${this.config.accountId}_${topicId}`;

    const identity: AgentIdentity = {
      identity_topic_id: topicId,
      agent_id: this.config.accountId,
      profile: {
        ...profile,
        did,
      },
      did,
      status: 'active',
      registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sequence_number: 1,
    };

    // Publish DID document to identity topic when on-chain
    if (onChain && this.testnet) {
      try {
        await this.testnet.submitMessage(topicId, {
          standard: 'hcs-19',
          version: '1.0',
          type: 'did-document',
          did,
          name: profile.name,
          description: profile.description,
          capabilities: profile.capabilities,
          endpoint: profile.endpoint,
          protocols: profile.protocols,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn(`HCS-19 DID document publish failed for ${profile.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    this.identities.set(topicId, identity);
    this.identitiesByDID.set(did, topicId);
    return identity;
  }

  /**
   * Resolve an agent identity by topic ID.
   *
   * TODO [Sprint 1]: Query mirror node for topic messages
   * - GET /api/v1/topics/{topicId}/messages
   * - Parse latest identity message
   */
  async resolveAgent(topicId: string): Promise<IdentityResolutionResult> {
    const identity = this.identities.get(topicId);
    if (!identity || identity.status === 'revoked') {
      return { found: false };
    }

    const identityClaims = this.claims.get(topicId) || [];
    const activeClaims = identityClaims.filter(c => !c.revoked && (!c.expires_at || new Date(c.expires_at) > new Date()));

    return {
      found: true,
      identity,
      claims: activeClaims,
    };
  }

  /**
   * Resolve an agent identity by DID.
   *
   * TODO [Sprint 1]: Implement DID resolution via mirror node
   */
  async resolveByDID(did: string): Promise<IdentityResolutionResult> {
    const topicId = this.identitiesByDID.get(did);
    if (!topicId) {
      return { found: false };
    }
    return this.resolveAgent(topicId);
  }

  /**
   * Verify an agent's identity.
   *
   * Checks that the identity exists, is active, and the DID is well-formed.
   *
   * TODO [Sprint 1]: Verify on-chain
   * - Check topic exists via mirror node
   * - Verify DID document signature
   * - Validate identity message sequence
   */
  async verifyIdentity(topicId: string): Promise<IdentityVerificationResult> {
    const identity = this.identities.get(topicId);
    const errors: string[] = [];

    if (!identity) {
      return { valid: false, errors: ['Identity not found'] };
    }

    if (identity.status === 'revoked') {
      errors.push('Identity has been revoked');
    }

    if (identity.status === 'suspended') {
      errors.push('Identity is suspended');
    }

    if (!identity.did || !identity.did.startsWith('did:hedera:')) {
      errors.push('Invalid DID format');
    }

    if (!identity.profile.name || identity.profile.name.trim().length === 0) {
      errors.push('Missing agent name in profile');
    }

    if (!identity.profile.capabilities || identity.profile.capabilities.length === 0) {
      errors.push('No capabilities declared');
    }

    return {
      valid: errors.length === 0,
      identity,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Update an agent's profile.
   *
   * Publishes a new profile message to the identity topic.
   * Latest message wins (same pattern as HCS-11).
   *
   * TODO [Sprint 1]: Submit update via TopicMessageSubmitTransaction
   */
  async updateProfile(topicId: string, updates: Partial<AgentIdentityProfile>): Promise<AgentIdentity> {
    const identity = this.identities.get(topicId);
    if (!identity) {
      throw new Error(`Identity not found: ${topicId}`);
    }
    if (identity.status === 'revoked') {
      throw new Error(`Cannot update revoked identity: ${topicId}`);
    }

    identity.profile = {
      ...identity.profile,
      ...updates,
    };
    identity.updated_at = new Date().toISOString();
    identity.sequence_number = (identity.sequence_number || 0) + 1;

    this.identities.set(topicId, identity);
    return identity;
  }

  /**
   * Revoke an agent identity.
   *
   * Publishes a revocation message to the identity topic.
   * Revoked identities cannot be updated or verified.
   *
   * TODO [Sprint 1]: Submit revocation via TopicMessageSubmitTransaction
   */
  async revokeIdentity(topicId: string): Promise<AgentIdentity> {
    const identity = this.identities.get(topicId);
    if (!identity) {
      throw new Error(`Identity not found: ${topicId}`);
    }
    if (identity.status === 'revoked') {
      throw new Error(`Identity already revoked: ${topicId}`);
    }

    identity.status = 'revoked';
    identity.updated_at = new Date().toISOString();
    identity.sequence_number = (identity.sequence_number || 0) + 1;

    this.identities.set(topicId, identity);
    return identity;
  }

  /**
   * Issue a verifiable claim about an agent.
   *
   * Claims follow a selective disclosure architecture:
   * - issuer: who is making the claim (account ID)
   * - subject: the identity topic of the agent being claimed about
   * - claims: key-value pairs of claim data
   * - proof: cryptographic proof (placeholder for now)
   *
   * TODO [Sprint 1]: Implement cryptographic proofs
   * - Sign claims with issuer's private key
   * - Store proof as JWS or similar
   */
  async issueClaim(
    subjectTopicId: string,
    claimType: string,
    claimData: Record<string, unknown>,
    expiresInDays?: number,
  ): Promise<IdentityClaim> {
    const identity = this.identities.get(subjectTopicId);
    if (!identity) {
      throw new Error(`Subject identity not found: ${subjectTopicId}`);
    }

    const claim: IdentityClaim = {
      id: uuidv4(),
      issuer: this.config.accountId,
      subject: subjectTopicId,
      claim_type: claimType,
      claims: claimData,
      proof: `proof:${this.config.accountId}:${Date.now()}`,
      issued_at: new Date().toISOString(),
      revoked: false,
    };

    if (expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + expiresInDays);
      claim.expires_at = expiry.toISOString();
    }

    const existing = this.claims.get(subjectTopicId) || [];
    existing.push(claim);
    this.claims.set(subjectTopicId, existing);

    return claim;
  }

  /**
   * Revoke a previously issued claim.
   */
  async revokeClaim(subjectTopicId: string, claimId: string): Promise<IdentityClaim> {
    const claimList = this.claims.get(subjectTopicId);
    if (!claimList) {
      throw new Error(`No claims found for: ${subjectTopicId}`);
    }

    const claim = claimList.find(c => c.id === claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    claim.revoked = true;
    return claim;
  }

  /**
   * Get all active claims for an agent.
   */
  async getClaims(topicId: string): Promise<IdentityClaim[]> {
    const claimList = this.claims.get(topicId) || [];
    return claimList.filter(c => !c.revoked && (!c.expires_at || new Date(c.expires_at) > new Date()));
  }

  /**
   * Handle a selective disclosure request.
   *
   * Only reveals the claims that the requester asked for and that exist.
   * This is the core privacy mechanism: agents control what they disclose.
   *
   * TODO [Sprint 1]: Implement cryptographic selective disclosure
   * - Generate ZKP or signed subset of claims
   * - Verify requester authorization
   */
  async handleDisclosureRequest(request: SelectiveDisclosureRequest): Promise<SelectiveDisclosureResponse> {
    const topicId = this.identitiesByDID.get(request.subject);
    if (!topicId) {
      throw new Error(`Subject not found: ${request.subject}`);
    }

    const identity = this.identities.get(topicId);
    if (!identity || identity.status !== 'active') {
      throw new Error(`Subject identity is not active`);
    }

    const allClaims = await this.getClaims(topicId);
    const disclosed: Record<string, unknown> = {};

    for (const requestedType of request.requested_claims) {
      // Check profile fields first
      if (requestedType === 'name') {
        disclosed.name = identity.profile.name;
      } else if (requestedType === 'description') {
        disclosed.description = identity.profile.description;
      } else if (requestedType === 'capabilities') {
        disclosed.capabilities = identity.profile.capabilities;
      } else if (requestedType === 'did') {
        disclosed.did = identity.did;
      } else if (requestedType === 'endpoint') {
        disclosed.endpoint = identity.profile.endpoint;
      } else {
        // Check claims
        const matchingClaim = allClaims.find(c => c.claim_type === requestedType);
        if (matchingClaim) {
          disclosed[requestedType] = matchingClaim.claims;
        }
      }
    }

    return {
      subject: request.subject,
      disclosed_claims: disclosed,
      proof: `disclosure:${this.config.accountId}:${request.nonce}`,
      nonce: request.nonce,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * List all registered identities.
   */
  async listIdentities(): Promise<AgentIdentity[]> {
    return Array.from(this.identities.values());
  }

  /**
   * Get the count of registered identities.
   */
  getIdentityCount(): number {
    return this.identities.size;
  }

  /**
   * Get the configuration.
   */
  getConfig(): HCS19IdentityConfig {
    return this.config;
  }
}
