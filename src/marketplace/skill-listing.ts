/**
 * Skill Listing — Manages skill catalog across registered agents.
 *
 * Provides category-based browsing, tag filtering, and pricing lookup.
 */

import { AgentSkill, RegisteredAgent } from '../types';

export interface SkillListingEntry {
  skill: AgentSkill;
  agent_id: string;
  agent_name: string;
  agent_status: string;
  reputation_score: number;
}

export class SkillListing {
  /**
   * Extract all skills from registered agents into a flat listing.
   */
  static fromAgents(agents: RegisteredAgent[]): SkillListingEntry[] {
    const entries: SkillListingEntry[] = [];
    for (const agent of agents) {
      for (const skill of agent.skills) {
        entries.push({
          skill,
          agent_id: agent.agent_id,
          agent_name: agent.name,
          agent_status: agent.status,
          reputation_score: agent.reputation_score,
        });
      }
    }
    return entries;
  }

  /**
   * Filter skills by category.
   */
  static filterByCategory(entries: SkillListingEntry[], category: string): SkillListingEntry[] {
    return entries.filter((e) => e.skill.category?.toLowerCase() === category.toLowerCase());
  }

  /**
   * Filter skills by tags.
   */
  static filterByTags(entries: SkillListingEntry[], tags: string[]): SkillListingEntry[] {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    return entries.filter((e) => (e.skill.tags || []).some((t) => tagSet.has(t.toLowerCase())));
  }

  /**
   * Search skills by name or description.
   */
  static search(entries: SkillListingEntry[], query: string): SkillListingEntry[] {
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.skill.name.toLowerCase().includes(q) ||
        (e.skill.description || '').toLowerCase().includes(q) ||
        (e.skill.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  /**
   * Sort skills by agent reputation (highest first).
   */
  static sortByReputation(entries: SkillListingEntry[]): SkillListingEntry[] {
    return [...entries].sort((a, b) => b.reputation_score - a.reputation_score);
  }

  /**
   * Get unique categories from all skills.
   */
  static getCategories(entries: SkillListingEntry[]): string[] {
    const cats = new Set<string>();
    for (const entry of entries) {
      if (entry.skill.category) cats.add(entry.skill.category);
    }
    return Array.from(cats).sort();
  }
}
