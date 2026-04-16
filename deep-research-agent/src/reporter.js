/**
 * Reporter - Generates the final research report
 *
 * Updated to show:
 * - Corroboration counts per finding [N sources agree]
 * - Grounding indicators per finding
 * - Computed confidence breakdown
 * - "Conflicting Information" section when contradictions exist
 * - Academic source badges [arXiv], [PubMed], [Wikipedia]
 */

import { confidenceLabel } from './confidence.js';

const SOURCE_BADGES = {
  arxiv: '[arXiv]',
  pubmed: '[PubMed]',
  wikipedia: '[Wikipedia]',
  semanticscholar: '[Semantic Scholar]'
};

export class Reporter {
  constructor(options = {}) {
    this.config = options;
  }

  /**
   * Generate a research report from a completed session
   * @param {ResearchSession} session
   * @returns {Promise<Report>}
   */
  async generate(session) {
    const markdown = this.formatMarkdown(session);

    return {
      markdown,
      session,
      sourceCount: session.sources.filter(s => s.read).length,
      timeElapsed: session.timeElapsed,
      confidence: confidenceLabel(session.confidence)
    };
  }

  /**
   * Format session as Markdown report
   */
  formatMarkdown(session) {
    const lines = [];

    // Header
    lines.push(`# Research Brief: ${session.query}`);
    lines.push('');
    lines.push(`*Researched ${new Date(session.completedAt).toLocaleString()}*`);

    // Computed confidence with breakdown
    lines.push(this.formatConfidenceLine(session));
    lines.push('');

    // Key Findings — show corroboration + grounding
    lines.push('## Key Findings');
    lines.push('');
    const allFindings = session.sources
      .filter(s => s.read && s.findings?.length > 0)
      .flatMap(s => s.findings.map(f => ({ ...f, sourceUrl: s.url, sourceTitle: s.title })));

    if (allFindings.length > 0) {
      for (const finding of allFindings) {
        const claim = typeof finding === 'string' ? finding : finding.claim;
        if (!claim) continue;

        // Corroboration annotation
        const corrobNote = this.corroborationNote(finding, session.clusters || []);
        // Grounding annotation
        const groundNote = this.groundingNote(finding);

        lines.push(`- ${claim}${corrobNote}${groundNote}`);
        if (finding.sourceUrl) {
          lines.push(`  - *Source: ${finding.sourceUrl}*`);
        }
      }
    } else if (session.synthesis?.keyFindings?.length > 0) {
      for (const finding of session.synthesis.keyFindings) {
        const claim = typeof finding === 'string' ? finding : finding.claim || finding;
        if (claim && claim !== 'undefined') {
          lines.push(`- ${claim}`);
        }
      }
    } else {
      lines.push('*No findings extracted yet*');
    }
    lines.push('');

    // Conflicting Information
    if (session.contradictions && session.contradictions.length > 0) {
      lines.push('## ⚠️ Conflicting Information');
      lines.push('');
      lines.push('The following claims from different sources appear to conflict:');
      lines.push('');
      for (const c of session.contradictions) {
        lines.push(`**${c.topic || 'Conflict'}**`);
        lines.push(`- Claim A: ${c.claim1}`);
        if (c.sources1?.length > 0 && c.sources1[0]) {
          lines.push(`  - *(${c.sources1[0]})*`);
        }
        lines.push(`- Claim B: ${c.claim2}`);
        if (c.sources2?.length > 0 && c.sources2[0]) {
          lines.push(`  - *(${c.sources2[0]})*`);
        }
        if (c.detail) lines.push(`  - *Detail: ${c.detail}*`);
        lines.push('');
      }
    }

    // Consensus
    if (session.synthesis?.consensus?.length > 0) {
      lines.push('## Consensus');
      lines.push('');
      lines.push('These points are supported by multiple sources:');
      lines.push('');
      for (const point of session.synthesis.consensus) {
        lines.push(`- ${point}`);
      }
      lines.push('');
    }

    // Debates / Contradictions
    if (session.synthesis?.debates?.length > 0) {
      lines.push('## Areas of Debate');
      lines.push('');
      for (const debate of session.synthesis.debates) {
        lines.push(`- ${debate}`);
      }
      lines.push('');
    }

    // Sources
    lines.push('## Sources');
    lines.push('');
    const readSources = session.sources.filter(s => s.read);
    if (readSources.length > 0) {
      for (const source of readSources) {
        const credLabel = this.credibilityLabel(source.credibility);
        const badge = this.sourceBadge(source);
        lines.push(`- ${badge}[${source.title}](${source.url}) (${credLabel})`);
      }
    } else {
      lines.push('*No sources read yet*');
    }
    lines.push('');

    // Unexplored
    if (session.synthesis?.gaps?.unexplored?.length > 0) {
      lines.push('## Unexplored Threads');
      lines.push('');
      lines.push('These topics came up but were not fully researched:');
      lines.push('');
      for (const topic of session.synthesis.gaps.unexplored) {
        lines.push(`- ${topic}`);
      }
      lines.push('');
    }

    // Metadata
    lines.push('---');
    lines.push('');
    lines.push('## Research Metadata');
    lines.push('');
    lines.push(`- **Query:** ${session.query}`);
    lines.push(`- **Depth:** ${session.config.depth}`);
    lines.push(`- **Time Budget:** ${session.config.timeBudget}s`);
    lines.push(`- **Time Used:** ${session.timeElapsed}s`);
    lines.push(`- **Sources Found:** ${session.sources.length}`);
    lines.push(`- **Sources Read:** ${readSources.length}`);
    lines.push(`- **Confidence:** ${this.formatConfidenceLine(session, true)}`);
    if (session.clusters?.length > 0) {
      const multiSource = session.clusters.filter(cl => cl.uniqueDomainCount > 1).length;
      lines.push(`- **Corroborated Claim Clusters:** ${multiSource} / ${session.clusters.length}`);
    }
    if (session.contradictions?.length > 0) {
      lines.push(`- **Contradictions Detected:** ${session.contradictions.length}`);
    }
    lines.push(`- **Session ID:** ${session.id}`);

    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Build a full confidence breakdown line.
   * @param {object} session
   * @param {boolean} [inline] - true for the metadata section (no markdown italic)
   */
  formatConfidenceLine(session, inline = false) {
    const score = session.confidence || 0;
    const label = confidenceLabel(score);

    // Collect component averages if available
    const readSources = (session.sources || []).filter(s => s.read);
    const allFindings = readSources.flatMap(s => s.findings || []);

    let groundingAvg = null;
    if (allFindings.some(f => typeof f.groundingScore === 'number')) {
      const gs = allFindings.filter(f => typeof f.groundingScore === 'number');
      groundingAvg = gs.reduce((s, f) => s + f.groundingScore, 0) / gs.length;
    }

    let corrobAvg = null;
    const clusters = session.clusters || [];
    if (clusters.length > 0) {
      corrobAvg = clusters.reduce((s, cl) => s + (cl.corroborationScore || 0), 0) / clusters.length;
    }

    let credAvg = null;
    if (readSources.length > 0) {
      credAvg = readSources.reduce((s, src) => s + (src.credibility || 0.5), 0) / readSources.length;
    }

    const breakdownParts = [];
    if (groundingAvg !== null) breakdownParts.push(`grounding: ${groundingAvg.toFixed(2)}`);
    if (corrobAvg !== null)    breakdownParts.push(`corroboration: ${corrobAvg.toFixed(2)}`);
    if (credAvg !== null)      breakdownParts.push(`source quality: ${credAvg.toFixed(2)}`);

    const breakdown = breakdownParts.length > 0
      ? ` (${breakdownParts.join(', ')})`
      : '';

    const text = `Confidence: ${score.toFixed(2)} — ${label}${breakdown}`;
    return inline ? text : `*${text}*`;
  }

  /**
   * Annotate a finding with its corroboration count from clusters.
   */
  corroborationNote(finding, clusters) {
    if (!clusters || clusters.length === 0) return '';
    const cluster = clusters.find(cl =>
      cl.claims.some(c => c.claim === finding.claim)
    );
    if (!cluster || cluster.uniqueDomainCount <= 1) return '';
    return ` **[${cluster.uniqueDomainCount} sources agree]**`;
  }

  /**
   * Annotate a finding with its grounding score.
   */
  groundingNote(finding) {
    if (typeof finding.groundingScore !== 'number') return '';
    const pct = Math.round(finding.groundingScore * 100);
    const icon = finding.grounded === true ? '✓' : finding.grounded === 'weak' ? '~' : '?';
    return ` *(grounded ${icon} ${pct}%)*`;
  }

  /**
   * Return an academic source badge prefix if applicable.
   */
  sourceBadge(source) {
    const badge = SOURCE_BADGES[source.source];
    return badge ? `${badge} ` : '';
  }

  /**
   * Format confidence as human-readable label
   */
  formatConfidence(confidence) {
    return confidenceLabel(confidence || 0);
  }

  /**
   * Get credibility label for a source
   */
  credibilityLabel(credibility) {
    if (credibility >= 0.8) return '⭐ high credibility';
    if (credibility >= 0.6) return 'medium credibility';
    if (credibility >= 0.4) return 'low credibility';
    return '⚠️ unverified';
  }
}
