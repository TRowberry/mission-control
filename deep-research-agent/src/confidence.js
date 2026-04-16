/**
 * Confidence - Objective, computed confidence scores
 *
 * Replaces LLM self-reported confidence labels with scores derived from:
 *  - Grounding  (is the claim actually in the source?)
 *  - Corroboration  (do multiple independent sources agree?)
 *  - Source credibility  (how trustworthy is the source?)
 */

/**
 * Compute a confidence score for a single claim.
 *
 * @param {number} groundingScore      0–1: textual support in source
 * @param {number} corroborationScore  0–1: independent source agreement
 * @param {number} sourceCredibility   0–1: source trustworthiness
 * @returns {number} 0–1 composite confidence score
 */
export function computeClaimConfidence(groundingScore, corroborationScore, sourceCredibility) {
  const g = typeof groundingScore === 'number' ? groundingScore : 0.5;
  const c = typeof corroborationScore === 'number' ? corroborationScore : 0.5;
  const s = typeof sourceCredibility === 'number' ? sourceCredibility : 0.5;

  return Math.round(((g * 0.4) + (c * 0.35) + (s * 0.25)) * 100) / 100;
}

/**
 * Compute an overall session confidence score.
 *
 * Factors:
 *  - Average claim confidence across all grounded findings
 *  - Source diversity (unique domains / total sources)
 *  - Corroboration coverage (fraction of findings backed by >1 source)
 *  - Contradiction penalty (each contradiction reduces score by 0.05)
 *
 * @param {object} session
 * @param {Array}  session.sources
 * @param {Array}  [session.clusters]      from clusterClaims + scoreCorroboration
 * @param {Array}  [session.contradictions]
 * @returns {number} 0–1
 */
export function computeSessionConfidence(session) {
  const readSources = (session.sources || []).filter(s => s.read || s.status === 'read');
  if (readSources.length === 0) return 0;

  // ── 1. Average claim confidence ──────────────────────────────────────────
  const allFindings = readSources.flatMap(s => s.findings || []);
  let avgClaimConf = 0.5;
  if (allFindings.length > 0) {
    const total = allFindings.reduce((sum, f) => {
      // Use computed confidence if available, else fall back to label
      if (typeof f.computedConfidence === 'number') return sum + f.computedConfidence;
      const labelMap = { high: 0.85, medium: 0.6, low: 0.35 };
      return sum + (labelMap[f.confidence] || 0.5);
    }, 0);
    avgClaimConf = total / allFindings.length;
  }

  // ── 2. Source diversity ──────────────────────────────────────────────────
  const uniqueDomains = new Set();
  for (const src of readSources) {
    try { uniqueDomains.add(new URL(src.url).hostname.toLowerCase()); } catch {}
  }
  const sourceDiversity = Math.min(uniqueDomains.size / Math.max(readSources.length, 1), 1);

  // ── 3. Corroboration coverage ────────────────────────────────────────────
  const clusters = session.clusters || [];
  let corroborationCoverage = 0;
  if (clusters.length > 0) {
    const multiSourceClusters = clusters.filter(cl => cl.uniqueDomainCount > 1);
    corroborationCoverage = multiSourceClusters.length / clusters.length;
  }

  // ── 4. Base score ────────────────────────────────────────────────────────
  let score =
    avgClaimConf       * 0.5 +
    sourceDiversity    * 0.25 +
    corroborationCoverage * 0.25;

  // ── 5. Contradiction penalty ─────────────────────────────────────────────
  const contradictions = session.contradictions || [];
  score -= contradictions.length * 0.05;

  // ── 6. Source count bonus (up to +0.15 for 10+ sources) ──────────────────
  const countBonus = Math.min(readSources.length / 10, 1) * 0.15;
  score += countBonus;

  return Math.max(0, Math.min(Math.round(score * 100) / 100, 1));
}

/**
 * Human-readable label for a 0–1 confidence value.
 * @param {number} score
 * @returns {string}
 */
export function confidenceLabel(score) {
  if (score >= 0.9) return 'Very High';
  if (score >= 0.75) return 'High';
  if (score >= 0.6) return 'Medium-High';
  if (score >= 0.4) return 'Medium';
  if (score >= 0.25) return 'Low';
  return 'Very Low';
}
