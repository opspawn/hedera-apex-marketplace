/**
 * Core types for the Hedera Agent Marketplace.
 */

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  pricing: SkillPricing;
}

export interface SkillPricing {
  amount: number;
  token: string;
  token_id?: string;
  unit: 'per_call' | 'per_minute' | 'per_token';
  fee_topic?: string;
}

export interface AgentRegistration {
  name: string;
  description: string;
  skills: AgentSkill[];
  endpoint: string;
  protocols: string[];
  payment_address: string;
}

export interface RegisteredAgent extends AgentRegistration {
  agent_id: string;
  inbound_topic: string;
  outbound_topic: string;
  profile_topic: string;
  reputation_score: number;
  status: 'online' | 'offline' | 'suspended';
  registered_at: string;
}

export interface AgentProfile {
  type: 'hcs-11-profile';
  version: string;
  agent_id: string;
  display_name: string;
  bio: string;
  capabilities: string[];
  skills: AgentSkill[];
  protocols: string[];
  social?: Record<string, string>;
  payment?: {
    address: string;
    accepted_tokens: string[];
  };
  topics?: {
    inbound: string;
    outbound: string;
    profile: string;
  };
}

export interface PrivacyConsent {
  id: string;
  agent_id: string;
  purposes: string[];
  retention: string;
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  topic_id?: string;
  sequence_number?: number;
}

export interface ConsentRequest {
  agent_id: string;
  purposes: string[];
  retention: string;
}

export interface DIDDocument {
  id: string;
  agent_id: string;
  public_key: string;
  authentication: string[];
  service_endpoints: ServiceEndpoint[];
  created_at: string;
  updated_at: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  endpoint: string;
}

export interface PaymentSettlement {
  type: 'payment_settlement';
  version: string;
  payer: string;
  payee: string;
  skill_id: string;
  amount: number;
  token_id?: string;
  fee_type: string;
  task_id: string;
  status: 'pending' | 'settled' | 'failed';
  timestamp: string;
}

export interface HireRequest {
  skill_id: string;
  input: Record<string, unknown>;
  payer_account?: string;
}

export interface HireResult {
  task_id: string;
  agent_id: string;
  skill_id: string;
  status: 'completed' | 'pending' | 'failed';
  output?: Record<string, unknown>;
  settlement?: PaymentSettlement;
}

export interface ReputationEntry {
  agent_id: string;
  points: number;
  reason: string;
  from_agent?: string;
  timestamp: string;
  topic_id?: string;
  sequence_number?: number;
}

export interface SearchQuery {
  q?: string;
  category?: string;
  tags?: string[];
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  agents: RegisteredAgent[];
  total: number;
  registry_topic: string;
}

export interface MarketplaceConfig {
  hedera: {
    accountId: string;
    privateKey: string;
    network: 'testnet' | 'mainnet';
  };
  topics: {
    registry: string;
    inbound: string;
    outbound: string;
    profile: string;
  };
  server: {
    port: number;
    host: string;
  };
}

export interface ApiError {
  error: string;
  message: string;
}

// HCS-19: Agent Identity

export interface AgentIdentityProfile {
  name: string;
  description: string;
  capabilities: string[];
  did?: string;
  endpoint?: string;
  protocols?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentIdentity {
  identity_topic_id: string;
  agent_id: string;
  profile: AgentIdentityProfile;
  did: string;
  status: 'active' | 'revoked' | 'suspended';
  registered_at: string;
  updated_at: string;
  sequence_number?: number;
}

export interface IdentityClaim {
  id: string;
  issuer: string;
  subject: string;
  claim_type: string;
  claims: Record<string, unknown>;
  proof: string;
  issued_at: string;
  expires_at?: string;
  revoked?: boolean;
}

export interface SelectiveDisclosureRequest {
  requester: string;
  subject: string;
  requested_claims: string[];
  purpose: string;
  nonce: string;
}

export interface SelectiveDisclosureResponse {
  subject: string;
  disclosed_claims: Record<string, unknown>;
  proof: string;
  nonce: string;
  timestamp: string;
}

export interface IdentityResolutionResult {
  found: boolean;
  identity?: AgentIdentity;
  claims?: IdentityClaim[];
}

export interface IdentityVerificationResult {
  valid: boolean;
  identity?: AgentIdentity;
  errors?: string[];
}

// HCS-26: Decentralized Agent Skills Registry

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  skills: SkillDefinition[];
  pricing?: SkillPricing;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  tags?: string[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  category: string;
  tags: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export interface PublishedSkill {
  topic_id: string;
  manifest: SkillManifest;
  published_at: string;
  publisher: string;
  status: 'published' | 'pending' | 'failed';
}

export interface SkillDiscoveryResult {
  skills: PublishedSkill[];
  total: number;
  query: string;
}
