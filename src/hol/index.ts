/**
 * HOL (Hashgraph Online) Integration Module
 *
 * Exports Registry Broker registration, search, vector search, skills,
 * HCS-10 connection handling, and ERC-8004 on-chain feedback.
 */

export { RegistryBroker } from './registry-broker';
export type {
  RegistryBrokerConfig,
  RegistrationProfile,
  RegistrationResult,
  RegistryStatus,
  AgentSearchQuery,
  AgentSearchResult,
  BrokerAgentEntry,
  VectorSearchQuery,
  VectorSearchResult,
  BrokerSkillEntry,
  SkillsListResult,
  ChatRelaySession,
  ChatRelayMessage,
  ChatRelayResponse,
} from './registry-broker';

export { ConnectionHandler } from './connection-handler';
export type { ConnectionHandlerConfig, ConnectionRequest, ActiveConnection, ConnectionMessage, InboundLogEntry } from './connection-handler';

export { AgentFeedbackManager } from './agent-feedback';
export type {
  AgentFeedback,
  FeedbackSubmission,
  AgentFeedbackSummary,
  FeedbackQuery,
} from './agent-feedback';

export { RegistryAuth } from './registry-auth';
export type {
  LiveRegistrationConfig,
  LiveRegistrationResult,
  LiveVerificationResult,
} from './registry-auth';

export { ERC8004IdentityManager } from './erc8004-identity';
export type {
  ERC8004Identity,
  DualIdentityProfile,
  ERC8004LinkConfig,
  ERC8004TrustBoost,
  LinkResult,
} from './erc8004-identity';

export { HOLRegistryClient, HOLApiError } from './hol-registry-client';
export type {
  HOLSearchParams,
  HOLAgent,
  HOLSearchResult,
  HOLStats,
  HOLRegistry,
  HOLProtocol,
  HOLRegistrationPayload,
  HOLRegistrationQuote,
  HOLRegistrationResult,
  HOLChatSession,
  HOLChatMessage,
  HOLChatResponse,
  HOLSkill,
  HOLClientConfig,
  HOLChatHistory,
  HOLSessionMeta,
  HOLRegistrationStatus,
  HOLCreditBalance,
  HOLVectorSearchOptions,
  HOLVectorSearchResult,
  HOLFeedbackEntry,
  HOLAgentFeedbackResult,
} from './hol-registry-client';

export { HOLAutoRegister } from './hol-auto-register';
export type {
  HOLRegistrationRecord,
  AutoRegistrationResult,
} from './hol-auto-register';
