/**
 * HCS-19: Privacy Compliance Standard — Complete Type System
 *
 * Defines all interfaces, enums, and type guards for the HCS-19 privacy
 * compliance protocol on Hedera Consensus Service.
 *
 * Aligned with ISO/IEC TS 27560:2023 and supports GDPR, CCPA, and DDP frameworks.
 */

// ============================================================
// ENUMS
// ============================================================

/** HCS-19 Topic Types (memo field enum) */
export enum HCS19TopicType {
  ConsentManagement = 0,
  DataProcessing = 1,
  PrivacyRights = 2,
  ComplianceAudit = 3,
}

/** Consent lifecycle status */
export enum ConsentStatus {
  Active = 'active',
  Withdrawn = 'withdrawn',
  Expired = 'expired',
}

/** Lawful basis for processing (maps to GDPR Article 6) */
export enum ProcessingBasis {
  Consent = 'consent',
  Contract = 'contract',
  LegalObligation = 'legal_obligation',
  VitalInterest = 'vital_interest',
  PublicTask = 'public_task',
  LegitimateInterest = 'legitimate_interest',
}

/** Privacy rights request types */
export enum RightsType {
  Access = 'access',                     // GDPR Art 15
  Rectification = 'rectification',       // GDPR Art 16
  Erasure = 'erasure',                   // GDPR Art 17
  RestrictProcessing = 'restrict_processing', // GDPR Art 18
  DataPortability = 'data_portability',  // GDPR Art 20
  Object = 'object',                     // GDPR Art 21
  DoNotSell = 'do_not_sell',            // CCPA
}

/** Audit type classification */
export enum AuditType {
  Internal = 'internal',
  External = 'external',
  Regulatory = 'regulatory',
}

/** Audit result assessment */
export enum AuditResult {
  Compliant = 'compliant',
  NonCompliant = 'non_compliant',
  PartiallyCompliant = 'partially_compliant',
  NeedsReview = 'needs_review',
}

/** Supported regulatory frameworks */
export enum RegulatoryFramework {
  GDPR = 'gdpr',
  CCPA = 'ccpa',
  DDP = 'ddp',
}

/** Consent operations (for HCS messages) */
export enum ConsentOperation {
  ConsentGranted = 'consent_granted',
  ConsentWithdrawn = 'consent_withdrawn',
  ConsentUpdated = 'consent_updated',
  ConsentVerified = 'consent_verified',
}

/** Data processing operations */
export enum ProcessingOperation {
  ProcessingStarted = 'processing_started',
  ProcessingCompleted = 'processing_completed',
  DataShared = 'data_shared',
  DataDeleted = 'data_deleted',
}

/** Privacy rights operations */
export enum RightsOperation {
  RightsRequest = 'rights_request',
  RightsFulfilled = 'rights_fulfilled',
  AccessProvided = 'access_provided',
  RectificationCompleted = 'rectification_completed',
  ErasureCompleted = 'erasure_completed',
}

/** Audit operations */
export enum AuditOperation {
  ComplianceCheck = 'compliance_check',
  ViolationDetected = 'violation_detected',
  AuditInitiated = 'audit_initiated',
  AuditCompleted = 'audit_completed',
  RetentionCheck = 'retention_check',
}

/** All HCS-19 operations (union type) */
export type HCS19Operation =
  | ConsentOperation
  | ProcessingOperation
  | RightsOperation
  | AuditOperation;

// ============================================================
// CORE RECORD INTERFACES
// ============================================================

/**
 * User Consent Record — 13 required fields per spec.
 * Aligned with ISO/IEC TS 27560:2023.
 */
export interface UserConsentRecord {
  // --- 13 REQUIRED fields ---
  consent_id: string;
  user_id: string;
  agent_id: string;
  jurisdiction: string;
  legal_basis: ProcessingBasis;
  purposes: string[];
  data_types: string[];
  consent_method: string;
  consent_timestamp: string;
  retention_period: string;
  withdrawal_method: string;
  status: ConsentStatus;
  notice_reference: string;

  // --- Optional fields ---
  expiry_date?: string;
  granular_permissions?: {
    analytics: boolean;
    marketing: boolean;
    personalization: boolean;
  };

  // --- Regulatory overlay ---
  gdpr?: GDPRFields;
  ccpa?: CCPAFields;
  ddp?: DDPFields;

  // --- Revocation metadata ---
  revocation_reason?: string;
  revocation_timestamp?: string;

  // --- HCS metadata (populated after on-chain submission) ---
  topic_id?: string;
  sequence_number?: number;
}

/**
 * Data Processing Activity Record — all required fields per spec.
 */
export interface DataProcessingRecord {
  // --- REQUIRED fields ---
  processing_id: string;
  user_id: string;
  agent_id: string;
  purpose: string;
  legal_basis: ProcessingBasis;
  data_types: string[];
  processing_method: string;
  duration: string;
  security_measures: string[];
  start_timestamp: string;
  end_timestamp: string;
  compliance_status: string;

  // --- Optional fields ---
  third_parties?: string[];
  consent_id?: string;

  // --- HCS metadata ---
  topic_id?: string;
  sequence_number?: number;
}

/**
 * Privacy Rights Request Record — all required fields per spec.
 */
export interface PrivacyRightsRequest {
  // --- REQUIRED fields ---
  request_id: string;
  user_id: string;
  agent_id: string;
  request_type: RightsType;
  jurisdiction: string;
  legal_basis: string;
  request_timestamp: string;
  verification_method: string;
  fulfillment_method: string;
  expected_completion: string;
  response_method: string;

  // --- Optional fields ---
  actual_completion?: string;
  compliance_notes?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'denied';

  // --- HCS metadata ---
  topic_id?: string;
  sequence_number?: number;
}

/**
 * Compliance Audit Record — all required fields per spec.
 */
export interface ComplianceAuditRecord {
  // --- REQUIRED fields ---
  audit_id: string;
  agent_id: string;
  audit_type: AuditType;
  auditor_id: string;
  audit_scope: string[];
  audit_period: {
    start_date: string;
    end_date: string;
  };
  findings: string[];
  compliance_score: number;
  violations: string[];
  recommendations: string[];
  follow_up_required: boolean;
  audit_timestamp: string;

  // --- Optional fields ---
  follow_up_date?: string;
  result?: AuditResult;

  // --- HCS metadata ---
  topic_id?: string;
  sequence_number?: number;
}

// ============================================================
// REGULATORY FRAMEWORK FIELDS
// ============================================================

/** GDPR-specific fields (attached to consent/processing records) */
export interface GDPRFields {
  gdpr_lawful_basis: string;
  data_controller: string;
  dpo_contact: string;
  retention_justification: string;
  automated_decision_making: boolean;

  // Conditional
  special_category_basis?: string;
  transfer_mechanism?: string;

  // Optional
  data_processor?: string;
  profiling_activities?: string[];
}

/** CCPA-specific fields */
export interface CCPAFields {
  business_purpose: string;
  commercial_purpose: string;
  sale_opt_out: boolean;
  categories_disclosed: string[];
  third_party_recipients: string[];
  retention_justification: string;
  consumer_rights_provided: string[];

  // Conditional
  categories_sold?: string[];
}

/** DDP (Digital Data Protection) fields */
export interface DDPFields {
  collection_method: string;
  notification_provided: boolean;
  purpose_limitation: boolean;
  data_minimization: boolean;
  accuracy_measures: string[];
  storage_limitation: string;
  security_measures: string[];
  accountability_measures: string[];
}

// ============================================================
// HCS MESSAGE FORMAT
// ============================================================

/** Base HCS-19 message envelope (all messages include these) */
export interface HCS19Message {
  p: 'hcs-19';
  op: HCS19Operation;
  operator_id: string;
  timestamp: string;
  m: string;
}

/** Consent message (extends base with consent-specific fields) */
export interface ConsentMessage extends HCS19Message {
  op: ConsentOperation;
  consent_id: string;
  user_id: string;
  purposes?: string[];
  legal_basis?: string;
  jurisdiction?: string;
  consent_method?: string;
  data_types?: string[];
  retention_period?: string;
  withdrawal_method?: string;
  notice_reference?: string;
  status?: ConsentStatus;
  gdpr_lawful_basis?: string;
}

/** Data processing message */
export interface ProcessingMessage extends HCS19Message {
  op: ProcessingOperation;
  processing_id: string;
  user_id?: string;
  purpose?: string;
  legal_basis?: string;
  data_types?: string[];
  processing_method?: string;
  compliance_status?: string;
  third_parties?: string[];
}

/** Privacy rights message */
export interface RightsMessage extends HCS19Message {
  op: RightsOperation;
  request_id: string;
  user_id?: string;
  request_type?: RightsType;
  jurisdiction?: string;
  legal_basis?: string;
  verification_method?: string;
  fulfillment_method?: string;
}

/** Audit message */
export interface AuditMessage extends HCS19Message {
  op: AuditOperation;
  audit_id: string;
  audit_type?: AuditType;
  auditor_id?: string;
  compliance_score?: number;
  violations?: string[];
  findings?: string[];
}

/** Retention check message */
export interface RetentionMessage extends HCS19Message {
  op: AuditOperation.RetentionCheck;
  records_reviewed: number;
  records_archived: number;
  records_deleted: number;
  retention_policies_applied: string[];
  compliance_status: string;
  next_review_date: string;
}

// ============================================================
// HCS TOPIC SETUP TYPES
// ============================================================

/** Topic memo structure for topic creation */
export interface HCS19TopicMemo {
  protocol: 'hcs-19';
  version: 0;
  ttl: number;
  topic_type: HCS19TopicType;
  agent_account_id: string;
  jurisdiction: string;
}

/** Created topic set (all 4 topics for an agent) */
export interface HCS19TopicSet {
  consent_topic_id: string;
  processing_topic_id: string;
  rights_topic_id: string;
  audit_topic_id: string;
  agent_id: string;
  jurisdiction: string;
  created_at: string;
}

// ============================================================
// HCS-11 PROFILE INTEGRATION
// ============================================================

/** Privacy compliance block for HCS-11 agent profiles */
export interface PrivacyComplianceProfile {
  standards: RegulatoryFramework[];
  jurisdictions: string[];
  consent_topic_id: string;
  processing_topic_id: string;
  rights_topic_id: string;
  audit_topic_id: string;
  dpo_contact: string;
  privacy_policy_url: string;
  retention_policy: string;
}

// ============================================================
// CONFIG & HELPER TYPES
// ============================================================

export interface HCS19Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  defaultJurisdiction?: string;
  defaultTtl?: number;
}

/** Consent receipt (returned to user after consent operation) */
export interface ConsentReceipt {
  receipt_id: string;
  consent_id: string;
  operation: ConsentOperation;
  transaction_id?: string;
  topic_id: string;
  sequence_number?: number;
  timestamp: string;
  human_readable: string;
}

/** Request to grant consent (input to ConsentManager.grantConsent) */
export interface GrantConsentRequest {
  user_id: string;
  purposes: string[];
  data_types: string[];
  jurisdiction: string;
  legal_basis: ProcessingBasis;
  consent_method: string;
  retention_period: string;
  withdrawal_method: string;
  notice_reference: string;
  granular_permissions?: {
    analytics: boolean;
    marketing: boolean;
    personalization: boolean;
  };
  gdpr?: GDPRFields;
  ccpa?: CCPAFields;
  ddp?: DDPFields;
}

/** Filters for querying consent records */
export interface ConsentQueryFilters {
  purpose?: string;
  status?: ConsentStatus;
  jurisdiction?: string;
  legal_basis?: ProcessingBasis;
  data_type?: string;
  active_only?: boolean;
}

// ============================================================
// DATA PROCESSING REGISTRY TYPES
// ============================================================

/** Processing activity status */
export enum ProcessingActivityStatus {
  Active = 'active',
  Completed = 'completed',
  Suspended = 'suspended',
  DataDeleted = 'data_deleted',
}

/** Input for registering a new processing activity */
export interface RegisterProcessingActivityRequest {
  controller_id: string;
  processor_id?: string;
  user_id: string;
  purpose: string;
  legal_basis: ProcessingBasis;
  data_categories: string[];
  processing_method: string;
  retention_period: string;
  security_measures: string[];
  consent_id?: string;
}

/** Data sharing record — tracks when data is shared with third parties */
export interface DataSharingRecord {
  sharing_id: string;
  processing_id: string;
  recipient: string;
  purpose: string;
  safeguards: string[];
  data_categories: string[];
  timestamp: string;
}

/** Deletion record — tracks data deletion events */
export interface DeletionRecord {
  deletion_id: string;
  processing_id: string;
  reason: string;
  verified_by: string;
  data_categories: string[];
  timestamp: string;
}

/** Filters for querying processing activities */
export interface ProcessingActivityFilters {
  controller_id?: string;
  processor_id?: string;
  status?: ProcessingActivityStatus;
  data_category?: string;
  legal_basis?: ProcessingBasis;
  user_id?: string;
}
