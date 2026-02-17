/**
 * HCS-26: Decentralized Agent Skills Registry
 *
 * Manages skill publishing, discovery, and retrieval via the HOL Registry Broker.
 * HCS-26 builds on HCS-1 (file storage) and HCS-2 (topic registries) to index
 * versioned agent skills on-chain.
 *
 * Integration with @hashgraphonline/standards-sdk:
 * - Type-level: uses HCS26ResolvedSkill, HCS26ClientConfig from official SDK
 * - Runtime: lazy-loads HCS26BaseClient for on-chain skill resolution
 * - Local publish/discover for marketplace operations
 * - On-chain resolve via resolveOnChainSkill() for production reads
 *
 * TODO [Sprint 2]: Wire publish to live Registry Broker API at https://broker.hol.org
 */

import type {
  HCS26BaseClient as HCS26BaseClientType,
  HCS26ClientConfig,
  HCS26ResolvedSkill,
} from '@hashgraphonline/standards-sdk';
import { SkillManifest, PublishedSkill, SkillDiscoveryResult, AgentSkill } from '../types';

// Re-export official SDK types for consumers
export type { HCS26ResolvedSkill, HCS26ClientConfig };

/**
 * Lazy-load the standards-sdk to avoid ESM-only transitive dependency issues
 * in CJS environments (e.g., Jest). The SDK is only loaded when on-chain
 * operations are actually invoked.
 */
async function loadSDK(): Promise<typeof import('@hashgraphonline/standards-sdk')> {
  return import('@hashgraphonline/standards-sdk');
}

export interface HCS26Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  brokerBaseUrl?: string;
}

const DEFAULT_BROKER_URL = 'https://broker.hol.org';

export class HCS26SkillRegistry {
  private config: HCS26Config;
  private brokerUrl: string;
  private publishedSkills: Map<string, PublishedSkill> = new Map();
  private onChainClient: HCS26BaseClientType | null = null;
  private sdkLoaded = false;

  constructor(config: HCS26Config) {
    this.config = config;
    this.brokerUrl = config.brokerBaseUrl || DEFAULT_BROKER_URL;
  }

  /**
   * Lazily initialize the on-chain client from the official SDK.
   */
  private async ensureOnChainClient(): Promise<HCS26BaseClientType | null> {
    if (this.sdkLoaded) return this.onChainClient;
    this.sdkLoaded = true;
    try {
      const sdk = await loadSDK();
      this.onChainClient = new sdk.HCS26BaseClient({
        network: this.config.network,
      });
    } catch {
      this.onChainClient = null;
    }
    return this.onChainClient;
  }

  /**
   * Publish a skill manifest to the HCS-26 registry via the Registry Broker.
   *
   * Flow (per HCS-26 spec):
   * 1. Validate manifest against HCS-26 schema
   * 2. Submit to Registry Broker for on-chain storage (HCS-1 chunking + HCS-2 indexing)
   * 3. Poll for completion
   * 4. Return published skill with topic_id
   *
   * TODO [Sprint 2]: Replace mock with real Registry Broker API calls:
   *   POST {brokerUrl}/api/skills/publish
   */
  async publishSkill(skillManifest: SkillManifest): Promise<PublishedSkill> {
    const validation = this.validateManifest(skillManifest);
    if (!validation.valid) {
      throw new Error(`Invalid skill manifest: ${validation.errors.join(', ')}`);
    }

    // Generate a deterministic topic ID from manifest name + version
    const topicId = `0.0.${this.hashManifestId(skillManifest.name, skillManifest.version)}`;

    const published: PublishedSkill = {
      topic_id: topicId,
      manifest: skillManifest,
      published_at: new Date().toISOString(),
      publisher: this.config.accountId,
      status: 'published',
    };

    this.publishedSkills.set(topicId, published);

    return published;
  }

  /**
   * Discover skills matching a query string.
   *
   * Searches published skills by name, description, category, and tags.
   *
   * TODO [Sprint 3]: Replace with Registry Broker search API:
   *   GET {brokerUrl}/api/skills/search?q={query}
   */
  async discoverSkills(query: string): Promise<SkillDiscoveryResult> {
    const q = query.toLowerCase();
    const matches: PublishedSkill[] = [];

    for (const published of this.publishedSkills.values()) {
      if (published.status !== 'published') continue;

      const manifest = published.manifest;
      const nameMatch = manifest.name.toLowerCase().includes(q);
      const descMatch = manifest.description.toLowerCase().includes(q);
      const tagMatch = (manifest.tags || []).some(t => t.toLowerCase().includes(q));
      const skillMatch = manifest.skills.some(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );

      if (nameMatch || descMatch || tagMatch || skillMatch) {
        matches.push(published);
      }
    }

    return {
      skills: matches,
      total: matches.length,
      query,
    };
  }

  /**
   * Retrieve a specific published skill by its HCS topic ID.
   *
   * TODO [Sprint 2]: Query mirror node for on-chain data:
   *   GET testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages?limit=1&order=desc
   */
  async getSkillByTopic(topicId: string): Promise<PublishedSkill | null> {
    return this.publishedSkills.get(topicId) || null;
  }

  /**
   * Build an HCS-26 compliant SkillManifest from marketplace AgentSkill entries.
   *
   * Converts the marketplace's internal AgentSkill format into the HCS-26 SKILL.json
   * manifest format expected by the Registry Broker.
   */
  buildManifestFromSkills(
    name: string,
    version: string,
    description: string,
    author: string,
    skills: AgentSkill[]
  ): SkillManifest {
    return {
      name,
      version,
      description,
      author,
      license: 'MIT',
      skills: skills.map(s => ({
        name: s.name,
        description: s.description || '',
        category: s.category || 'general',
        tags: s.tags || [],
        input_schema: s.input_schema,
        output_schema: s.output_schema,
      })),
      pricing: skills[0]?.pricing,
      tags: [...new Set(skills.flatMap(s => s.tags || []))],
    };
  }

  /**
   * Resolve a skill from on-chain HCS-26 registry via the official SDK.
   *
   * Uses HCS26BaseClient.resolveSkill() to fetch skill data from the Hedera
   * mirror node, including manifest, version history, and verification status.
   *
   * Returns null if the skill is not found or the on-chain client is unavailable.
   */
  async resolveOnChainSkill(
    directoryTopicId: string,
    skillUid: number
  ): Promise<HCS26ResolvedSkill | null> {
    const client = await this.ensureOnChainClient();
    if (!client) return null;
    return client.resolveSkill({ directoryTopicId, skillUid });
  }

  /**
   * Check if on-chain resolution is available (lazy — triggers SDK load).
   */
  async hasOnChainClient(): Promise<boolean> {
    const client = await this.ensureOnChainClient();
    return client !== null;
  }

  /**
   * Validate a skill manifest against HCS-26 requirements.
   *
   * Validates metadata fields (name, description, author, license), version
   * format (semver), and skill definitions. Compatible with the official
   * hcs26DiscoveryMetadataSchema from @hashgraphonline/standards-sdk.
   */
  validateManifest(manifest: SkillManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.name) errors.push('Missing name');
    if (!manifest.version) errors.push('Missing version');
    if (!manifest.description) errors.push('Missing description');
    if (!manifest.author) errors.push('Missing author');
    if (!manifest.license) errors.push('Missing license');
    if (!manifest.skills || manifest.skills.length === 0) {
      errors.push('Must have at least one skill definition');
    }

    if (manifest.skills) {
      for (let i = 0; i < manifest.skills.length; i++) {
        const skill = manifest.skills[i];
        if (!skill.name) errors.push(`skills[${i}]: missing name`);
        if (!skill.description) errors.push(`skills[${i}]: missing description`);
        if (!skill.category) errors.push(`skills[${i}]: missing category`);
      }
    }

    // Version format: semver
    if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      errors.push('Version must be in semver format (e.g., 1.0.0)');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate manifest metadata against the official SDK schema.
   * Requires async because the SDK is lazy-loaded.
   */
  async validateWithOfficialSchema(manifest: SkillManifest): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    try {
      const sdk = await loadSDK();
      const result = sdk.hcs26DiscoveryMetadataSchema.safeParse({
        name: manifest.name || undefined,
        description: manifest.description || undefined,
        author: manifest.author || undefined,
        license: manifest.license || undefined,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      }
    } catch {
      errors.push('Failed to load official SDK for validation');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * List all locally published skills.
   */
  async listPublishedSkills(): Promise<PublishedSkill[]> {
    return Array.from(this.publishedSkills.values());
  }

  /**
   * Get the broker URL for this registry instance.
   */
  getBrokerUrl(): string {
    return this.brokerUrl;
  }

  /**
   * Get the number of published skills.
   */
  getPublishedCount(): number {
    return this.publishedSkills.size;
  }

  /**
   * Generate a deterministic numeric hash from name + version for mock topic IDs.
   */
  private hashManifestId(name: string, version: string): number {
    const str = `${name}:${version}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF; // Keep positive
    }
    return hash || 1;
  }
}
