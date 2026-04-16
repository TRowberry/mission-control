/**
 * Synthesizer - Connects findings across sources
 *
 * Now passes source excerpts and corroboration data to the LLM so it can
 * verify claims against original text and note discrepancies.
 */

import { synthesizeFindings as llmSynthesize } from './llm.js';

/**
 * Find the 400-character passage in sourceText most relevant to a claim.
 * Uses sliding window with word-overlap scoring.
 *
 * @param {string} claim
 * @param {string} sourceText
 * @param {number} [windowSize=400]
 * @returns {string}
 */
function findRelevantPassage(claim, sourceText, windowSize = 400) {
  if (!sourceText || sourceText.length <= windowSize) return (sourceText || '').slice(0, windowSize);

  const claimWords = new Set(
    claim.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  );

  let bestScore = -1;
  let bestStart = 0;
  const step = Math.max(50, Math.floor(windowSize / 4));

  for (let start = 0; start + windowSize <= sourceText.length; start += step) {
    const window = sourceText.slice(start, start + windowSize).toLowerCase();
    let hits = 0;
    for (const word of claimWords) {
      if (window.includes(word)) hits++;
    }
    if (hits > bestScore) {
      bestScore = hits;
      bestStart = start;
    }
  }

  return sourceText.slice(bestStart, bestStart + windowSize).trim();
}

export class Synthesizer {
  constructor(options = {}) {
    this.config = options;
  }

  /**
   * Synthesize findings from a research session.
   * @param {ResearchSession} session
   * @returns {Promise<Synthesis>}
   */
  async synthesize(session) {
    const readSources = session.sources.filter(s => s.read);
    const allFindings = readSources.flatMap(s =>
      (s.findings || []).map(f => ({ ...f, sourceUrl: s.url, sourceTitle: s.title }))
    );

    // Build sourceExcerpts: for each finding attach the most relevant passage.
    // Keep excerpts short (120 chars) — the LLM prompt gets large fast with many findings.
    const sourceExcerpts = {};
    for (const finding of allFindings) {
      const claimText = finding.claim || '';
      const src = readSources.find(s => s.url === finding.sourceUrl);
      const fullText = src?.fullText || src?.content || src?.text || '';
      if (claimText && fullText) {
        sourceExcerpts[claimText] = findRelevantPassage(claimText, fullText, 400).slice(0, 120);
      }
    }

    // Corroboration data from orchestrator
    const clusters = session.clusters || [];
    const contradictions = session.contradictions || [];

    let synthesis = null;
    if (allFindings.length > 0) {
      try {
        if (this.config.verbose) {
          console.log(`🧠 Synthesizing ${allFindings.length} findings with source excerpts...`);
        }
        synthesis = await llmSynthesize(
          allFindings,
          readSources,
          session.query,
          { sourceExcerpts, clusters, contradictions }
        );
      } catch (e) {
        if (this.config.verbose) {
          console.log(`   ⚠️ LLM synthesis failed: ${e.message}`);
        }
      }
    }

    return {
      summary: synthesis?.summary || '',
      keyFindings: synthesis?.keyPoints || allFindings.map(f => ({
        claim: f.claim,
        confidence: f.confidence,
        sources: [f.sourceUrl]
      })),
      consensus: synthesis?.consensus || [],
      debates: synthesis?.debates || [],
      gaps: await this.identifyGaps(session, synthesis?.gaps),
      narrative: await this.buildNarrative(session)
    };
  }

  /**
   * Group related findings together
   */
  async groupFindings(findings) {
    return findings.map(f => ({
      claim: f.claim,
      confidence: f.confidence,
      sources: [f.source?.url]
    }));
  }

  /**
   * Find areas of consensus (multiple sources agree)
   * Now handled via corroboration clusters passed to LLM
   */
  async findConsensus(findings) {
    return [];
  }

  /**
   * Find areas of debate (sources disagree)
   * Now handled via findContradictions in corroboration.js
   */
  async findDebates(findings) {
    return [];
  }

  /**
   * Identify gaps in research
   */
  async identifyGaps(session, llmGaps = []) {
    const unfollowedLeads = (session.leads || []).filter(l => l && !l.followed && l.topic);
    return {
      unanswered: llmGaps || [],
      unexplored: unfollowedLeads.map(l => l.topic).filter(Boolean)
    };
  }

  /**
   * Build a narrative structure for the findings
   */
  async buildNarrative(session) {
    return {
      sections: [
        { title: 'Overview', content: '' },
        { title: 'Key Findings', content: '' },
        { title: 'Details', content: '' },
        { title: 'Open Questions', content: '' }
      ]
    };
  }
}
