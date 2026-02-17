/**
 * Search Engine — Full-text search across agents and skills.
 *
 * Sprint 1: Basic substring matching
 * Sprint 3: Relevance scoring, category facets, tag boosting
 */

import { RegisteredAgent, SearchQuery, SearchResult } from '../types';

export interface SearchScoreResult {
  agent: RegisteredAgent;
  score: number;
  matchedFields: string[];
}

export class SearchEngine {
  /**
   * Score and rank agents against a search query.
   *
   * TODO [Sprint 3]: Implement TF-IDF or BM25 relevance scoring
   */
  static search(agents: RegisteredAgent[], query: SearchQuery): SearchResult {
    let scored: SearchScoreResult[] = agents.map((agent) => ({
      agent,
      score: SearchEngine.scoreAgent(agent, query),
      matchedFields: SearchEngine.getMatchedFields(agent, query),
    }));

    // Filter out zero-score results when there's a query
    if (query.q) {
      scored = scored.filter((s) => s.score > 0);
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const total = scored.length;
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    const paged = scored.slice(offset, offset + limit);

    return {
      agents: paged.map((s) => s.agent),
      total,
      registry_topic: '',
    };
  }

  private static scoreAgent(agent: RegisteredAgent, query: SearchQuery): number {
    if (!query.q) return 1;

    const q = query.q.toLowerCase();
    let score = 0;

    // Name match (highest weight)
    if (agent.name.toLowerCase().includes(q)) score += 10;

    // Description match
    if (agent.description.toLowerCase().includes(q)) score += 5;

    // Skill name match
    for (const skill of agent.skills) {
      if (skill.name.toLowerCase().includes(q)) score += 8;
      if ((skill.description || '').toLowerCase().includes(q)) score += 3;
      if ((skill.tags || []).some((t) => t.toLowerCase().includes(q))) score += 4;
    }

    // Category filter
    if (query.category) {
      const hasCategory = agent.skills.some(
        (s) => s.category?.toLowerCase() === query.category!.toLowerCase()
      );
      if (!hasCategory) score = 0;
    }

    // Reputation boost
    score += agent.reputation_score / 100;

    return score;
  }

  private static getMatchedFields(agent: RegisteredAgent, query: SearchQuery): string[] {
    if (!query.q) return [];

    const q = query.q.toLowerCase();
    const fields: string[] = [];

    if (agent.name.toLowerCase().includes(q)) fields.push('name');
    if (agent.description.toLowerCase().includes(q)) fields.push('description');
    for (const skill of agent.skills) {
      if (skill.name.toLowerCase().includes(q)) fields.push(`skill:${skill.id}`);
    }

    return fields;
  }
}
