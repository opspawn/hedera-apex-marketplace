/**
 * HCS-19: Privacy Compliance Manager Classes (Barrel Export)
 *
 * Re-exports ConsentManager, DataProcessingRegistry, PrivacyRightsHandler,
 * ComplianceAuditor, and utility functions from their individual modules.
 */

export { ConsentManager } from './hcs19-consent';
export { DataProcessingRegistry } from './hcs19-processing';
export { PrivacyRightsHandler } from './hcs19-rights';
export { ComplianceAuditor } from './hcs19-audit';

// ============================================================
// Regulatory Framework Mappers
// ============================================================

import {
  RegulatoryFramework,
  RightsType,
} from './hcs19-types';

/** Given a jurisdiction code, return which regulatory framework applies */
export function frameworkForJurisdiction(jurisdiction: string): RegulatoryFramework {
  if (jurisdiction === 'EU' || jurisdiction.startsWith('EU-')) return RegulatoryFramework.GDPR;
  if (jurisdiction === 'US-CA') return RegulatoryFramework.CCPA;
  if (jurisdiction === 'IN') return RegulatoryFramework.DDP;
  return RegulatoryFramework.DDP; // Default baseline
}

/** Return compliance deadline in days for a rights request */
export function complianceDeadlineDays(
  framework: RegulatoryFramework,
  _rightType: RightsType,
): number {
  switch (framework) {
    case RegulatoryFramework.GDPR:
      return 30;
    case RegulatoryFramework.CCPA:
      return 45;
    case RegulatoryFramework.DDP:
      return 30;
    default:
      return 30;
  }
}

/** Map RightsType to GDPR article */
export function gdprArticleForRight(right: RightsType): string {
  switch (right) {
    case RightsType.Access:
      return 'GDPR Article 15';
    case RightsType.Rectification:
      return 'GDPR Article 16';
    case RightsType.Erasure:
      return 'GDPR Article 17';
    case RightsType.RestrictProcessing:
      return 'GDPR Article 18';
    case RightsType.DataPortability:
      return 'GDPR Article 20';
    case RightsType.Object:
      return 'GDPR Article 21';
    default:
      return 'GDPR';
  }
}

/** Map RightsType to CCPA section */
export function ccpaSectionForRight(right: RightsType): string {
  switch (right) {
    case RightsType.Access:
      return 'CCPA §1798.100';
    case RightsType.Erasure:
      return 'CCPA §1798.105';
    case RightsType.DoNotSell:
      return 'CCPA §1798.120';
    default:
      return 'CCPA';
  }
}
