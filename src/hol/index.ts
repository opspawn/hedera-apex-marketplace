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
