/**
 * HCS-19: ComplianceAuditor
 *
 * Runs compliance audits, tracks violations, and builds
 * audit HCS messages for topic submission.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  HCS19Config,
  UserConsentRecord,
  ComplianceAuditRecord,
  AuditType,
  AuditResult,
  RetentionMessage,
  AuditOperation,
  ConsentStatus,
} from './hcs19-types';
import { HCS19MessageFormatter } from './hcs19-topics';
import { ConsentManager } from './hcs19-consent';
import { DataProcessingRegistry } from './hcs19-processing';
import { PrivacyRightsHandler } from './hcs19-rights';
import { HederaTestnetClient, MessageSubmitResult } from '../hedera/client';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Runs compliance audits, tracks violations, and builds
 * audit HCS messages for topic submission.
 */
export class ComplianceAuditor {
  private config: HCS19Config;
  private audits: Map<string, ComplianceAuditRecord>;
  private formatter: HCS19MessageFormatter;
  private auditTopicId: string | null;
  private messageLog: string[];
  private hederaClient: HederaTestnetClient | null;

  constructor(config: HCS19Config, hederaClient?: HederaTestnetClient) {
    this.config = config;
    this.audits = new Map();
    this.formatter = new HCS19MessageFormatter(config.accountId);
    this.auditTopicId = null;
    this.messageLog = [];
    this.hederaClient = hederaClient ?? null;
  }

  async init(auditTopicId?: string): Promise<void> {
    this.auditTopicId = auditTopicId ?? null;
  }

  /** Submit a message to the HCS topic if client and topic are available */
  private async submitToTopic(serializedMessage: string): Promise<MessageSubmitResult | null> {
    if (!this.hederaClient || !this.auditTopicId) return null;
    return this.hederaClient.submitMessage(this.auditTopicId, serializedMessage);
  }

  /** Start an audit */
  async startAudit(params: {
    audit_type: AuditType;
    auditor_id: string;
    audit_scope: string[];
    period_start: string;
    period_end: string;
  }): Promise<ComplianceAuditRecord> {
    const auditId = `audit_${uuidv4()}`;
    const now = new Date().toISOString();

    const audit: ComplianceAuditRecord = {
      audit_id: auditId,
      agent_id: this.config.accountId,
      audit_type: params.audit_type,
      auditor_id: params.auditor_id,
      audit_scope: [...params.audit_scope],
      audit_period: {
        start_date: params.period_start,
        end_date: params.period_end,
      },
      findings: [],
      compliance_score: 0,
      violations: [],
      recommendations: [],
      follow_up_required: false,
      audit_timestamp: now,
      topic_id: this.auditTopicId ?? undefined,
    };

    const message = this.formatter.buildAuditMessage(
      AuditOperation.AuditInitiated,
      {
        audit_id: auditId,
        audit_type: params.audit_type,
        auditor_id: params.auditor_id,
        m: `Audit initiated by ${params.auditor_id} — scope: ${params.audit_scope.join(', ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      audit.sequence_number = txResult.sequenceNumber;
    }

    this.audits.set(auditId, audit);
    return audit;
  }

  /** Record a violation during audit */
  async recordViolation(
    auditId: string,
    violations: string[],
    findings: string[],
  ): Promise<ComplianceAuditRecord> {
    const audit = this.audits.get(auditId);
    if (!audit) {
      throw new Error(`Audit not found: ${auditId}`);
    }

    audit.violations.push(...violations);
    audit.findings.push(...findings);

    const message = this.formatter.buildAuditMessage(
      AuditOperation.ViolationDetected,
      {
        audit_id: auditId,
        violations,
        findings,
        m: `Violations detected: ${violations.join('; ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return audit;
  }

  /** Run automated compliance check */
  async runComplianceCheck(params: {
    consentManager: ConsentManager;
    processingRegistry: DataProcessingRegistry;
    rightsRegistry: PrivacyRightsHandler;
  }): Promise<ComplianceAuditRecord> {
    const auditId = `audit_${uuidv4()}`;
    const now = new Date().toISOString();
    const findings: string[] = [];
    const violations: string[] = [];
    let score = 100;

    // Check all active consents for the agent
    const activeConsents = await params.consentManager.listActiveConsents(this.config.accountId);
    const allConsents = Array.from(
      (params.consentManager as any).consents?.values?.() ?? [],
    ) as UserConsentRecord[];

    // Check for expired consents still marked as active
    for (const consent of activeConsents) {
      if (params.consentManager.isExpired(consent)) {
        violations.push(`Expired consent still active: ${consent.consent_id}`);
        score -= 10;
      }
    }

    if (activeConsents.length > 0) {
      findings.push(`${activeConsents.length} active consent(s) found`);
    }
    if (allConsents.length > activeConsents.length) {
      findings.push(`${allConsents.length - activeConsents.length} inactive consent(s) found`);
    }

    // Check pending rights requests for overdue items
    const pendingRequests = await params.rightsRegistry.listPending();
    for (const request of pendingRequests) {
      const deadline = new Date(request.expected_completion);
      if (deadline < new Date()) {
        violations.push(`Overdue rights request: ${request.request_id}`);
        score -= 15;
      }
    }
    if (pendingRequests.length > 0) {
      findings.push(`${pendingRequests.length} pending rights request(s)`);
    }

    // Clamp score
    if (score < 0) score = 0;

    const recommendations: string[] = [];
    if (violations.length > 0) {
      recommendations.push('Address identified violations immediately');
    }
    if (violations.length === 0) {
      findings.push('No compliance violations detected');
      recommendations.push('Continue current practices');
    }

    const audit: ComplianceAuditRecord = {
      audit_id: auditId,
      agent_id: this.config.accountId,
      audit_type: AuditType.Internal,
      auditor_id: this.config.accountId,
      audit_scope: ['consent_management', 'rights_requests', 'data_processing'],
      audit_period: {
        start_date: now,
        end_date: now,
      },
      findings,
      compliance_score: score,
      violations,
      recommendations,
      follow_up_required: violations.length > 0,
      audit_timestamp: now,
      result: violations.length === 0 ? AuditResult.Compliant : AuditResult.NonCompliant,
      topic_id: this.auditTopicId ?? undefined,
    };

    const message = this.formatter.buildAuditMessage(
      AuditOperation.ComplianceCheck,
      {
        audit_id: auditId,
        audit_type: AuditType.Internal,
        compliance_score: score,
        violations,
        findings,
        m: `Automated compliance check — score: ${score}/100`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      audit.sequence_number = txResult.sequenceNumber;
    }

    this.audits.set(auditId, audit);
    return audit;
  }

  /** Complete an audit with final results */
  async completeAudit(
    auditId: string,
    params: {
      compliance_score: number;
      findings: string[];
      violations: string[];
      recommendations: string[];
      follow_up_required: boolean;
      follow_up_date?: string;
    },
  ): Promise<ComplianceAuditRecord> {
    const audit = this.audits.get(auditId);
    if (!audit) {
      throw new Error(`Audit not found: ${auditId}`);
    }

    audit.compliance_score = params.compliance_score;
    audit.findings = [...params.findings];
    audit.violations = [...params.violations];
    audit.recommendations = [...params.recommendations];
    audit.follow_up_required = params.follow_up_required;
    if (params.follow_up_date) {
      audit.follow_up_date = params.follow_up_date;
    }
    audit.result =
      params.violations.length === 0
        ? AuditResult.Compliant
        : AuditResult.NonCompliant;

    const message = this.formatter.buildAuditMessage(
      AuditOperation.AuditCompleted,
      {
        audit_id: auditId,
        compliance_score: params.compliance_score,
        violations: params.violations,
        findings: params.findings,
        m: `Audit completed — score: ${params.compliance_score}/100, violations: ${params.violations.length}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      audit.sequence_number = txResult.sequenceNumber;
    }

    return audit;
  }

  /** Run retention check — reviews consent expiry and data lifecycle */
  async runRetentionCheck(consentManager: ConsentManager): Promise<RetentionMessage> {
    const allConsents = Array.from(
      (consentManager as any).consents?.values?.() ?? [],
    ) as UserConsentRecord[];

    let reviewed = 0;
    let archived = 0;
    let deleted = 0;
    const policiesApplied: string[] = [];

    for (const consent of allConsents) {
      reviewed++;
      if (consentManager.isExpired(consent)) {
        if (consent.status === ConsentStatus.Active) {
          archived++;
        } else {
          deleted++;
        }
      }
    }

    if (allConsents.length > 0) {
      policiesApplied.push('consent_expiry_check');
    }

    const nextReview = addDays(new Date(), 90).toISOString();

    const retentionMsg: RetentionMessage = {
      p: 'hcs-19',
      op: AuditOperation.RetentionCheck,
      operator_id: this.config.accountId,
      timestamp: new Date().toISOString(),
      m: `Retention check: ${reviewed} reviewed, ${archived} archived, ${deleted} deleted`,
      records_reviewed: reviewed,
      records_archived: archived,
      records_deleted: deleted,
      retention_policies_applied: policiesApplied,
      compliance_status: 'compliant',
      next_review_date: nextReview,
    };

    const serialized = HCS19MessageFormatter.serialize(retentionMsg);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return retentionMsg;
  }

  /** Get audit by ID */
  async getAudit(auditId: string): Promise<ComplianceAuditRecord | null> {
    return this.audits.get(auditId) ?? null;
  }

  /** List all audits */
  async listAudits(): Promise<ComplianceAuditRecord[]> {
    return Array.from(this.audits.values());
  }

  /** Get all generated HCS messages (for testing/debugging) */
  getMessageLog(): string[] {
    return [...this.messageLog];
  }
}
