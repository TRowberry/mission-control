/**
 * Corroboration - Cross-source claim clustering and contradiction detection
 *
 * Groups similar claims across sources, counts independent support,
 * and flags contradictory claims within clusters.
 */

// Reuse the same stop-word list and helpers as grounding.js (duplicated here
// to keep the module dependency-free and self-contained)
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'can', 'that', 'this', 'these', 'those', 'it', 'its', 'they',
  'them', 'their', 'there', 'then', 'than', 'so', 'if', 'as', 'not', 'no',
  'also', 'just', 'more', 'most', 'other', 'such', 'each', 'which', 'who',
  'when', 'where', 'how', 'what', 'all', 'both', 'very', 'only', 'after',
  'before', 'while', 'he', 'she', 'we', 'you', 'i', 'my', 'our', 'your',
  'his', 'her', 'any', 'some', 'been', 'said', 'new', 'well', 'over',
  'same', 'back', 'still', 'many', 'much', 'between', 'without'
]);

function contentWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  for (const w of setA) {
    if (setB.has(w)) intersect++;
  }
  return intersect / (setA.size + setB.size - intersect);
}

/**
 * Extract all numbers present in a string as normalised strings.
 */
function extractNumbers(text) {
  return (text.match(/\d+(?:[.,]\d+)*/g) || []).map(n => n.replace(/,/g, ''));
}

/**
 * Cluster similar claims from all findings.
 *
 * @param {Array<{claim: string, sourceUrl?: string, sourceTitle?: string, [key: string]: any}>} allFindings
 * @returns {Array<{claims: Array, representative: string}>}
 *   Each cluster has an array of the member claims and a "representative" (the
 *   first/longest claim text used to label the cluster).
 */
export function clusterClaims(allFindings) {
  if (!Array.isArray(allFindings) || allFindings.length === 0) return [];

  const clusters = [];
  const assigned = new Array(allFindings.length).fill(false);

  // Pre-compute word sets to avoid repeated tokenisation
  const wordSets = allFindings.map(f => contentWords(f.claim || ''));

  for (let i = 0; i < allFindings.length; i++) {
    if (assigned[i]) continue;

    const cluster = { claims: [allFindings[i]], representative: allFindings[i].claim || '' };
    assigned[i] = true;

    for (let j = i + 1; j < allFindings.length; j++) {
      if (assigned[j]) continue;
      const sim = jaccard(wordSets[i], wordSets[j]);
      if (sim > 0.3) {
        cluster.claims.push(allFindings[j]);
        assigned[j] = true;
        // Keep the longest claim as representative
        if ((allFindings[j].claim || '').length > cluster.representative.length) {
          cluster.representative = allFindings[j].claim;
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Score corroboration for each cluster.
 *
 * @param {Array<{claims: Array, representative: string}>} clusters
 * @param {Array<{url: string, credibility?: number}>} sources - All read sources
 * @returns {Array} clusters enriched with corroborationScore and supportingDomains
 */
export function scoreCorroboration(clusters, sources) {
  const totalSources = sources.length || 1;

  return clusters.map(cluster => {
    // Collect unique domains represented in the cluster
    const domains = new Set();
    let totalCredibility = 0;
    let credCount = 0;

    for (const claim of cluster.claims) {
      const url = claim.sourceUrl || '';
      if (url) {
        try {
          domains.add(new URL(url).hostname.toLowerCase());
        } catch {
          // ignore malformed URLs
        }
      }

      // Look up credibility from sources list
      const src = sources.find(s => s.url === url);
      if (src && typeof src.credibility === 'number') {
        totalCredibility += src.credibility;
        credCount++;
      }
    }

    const uniqueDomainCount = domains.size;
    const avgCredibility = credCount > 0 ? totalCredibility / credCount : 0.5;
    const corroborationScore =
      Math.min((uniqueDomainCount / totalSources) * avgCredibility, 1);

    return {
      ...cluster,
      uniqueDomainCount,
      avgCredibility: Math.round(avgCredibility * 100) / 100,
      corroborationScore: Math.round(corroborationScore * 100) / 100,
      supportingDomains: [...domains]
    };
  });
}

// Patterns that indicate negation
const NEGATION_PATTERNS = [
  /\bis not\b/i, /\bare not\b/i, /\bwas not\b/i, /\bwere not\b/i,
  /\bnever\b/i, /\bfalse\b/i, /\bincorrect\b/i, /\binaccurate\b/i,
  /\bcontrary\b/i, /\bopposite\b/i, /\bdoes not\b/i, /\bdo not\b/i,
  /\bdid not\b/i, /\bcannot\b/i, /\bcan't\b/i, /\bdoesn't\b/i,
  /\bisn't\b/i, /\baren't\b/i, /\bwasn't\b/i, /\bweren't\b/i,
  /\bno evidence\b/i, /\bunproven\b/i, /\bmisconception\b/i, /\bmyth\b/i
];

/**
 * Check whether text contains a negation pattern.
 */
function hasNegation(text) {
  return NEGATION_PATTERNS.some(p => p.test(text));
}

/**
 * Detect contradictions within clusters — claims that assert conflicting things.
 *
 * Strategy:
 *  1. If some claims in the cluster contain negation patterns and others don't,
 *     flag as a potential contradiction.
 *  2. If the same numeric entity appears with different values across claims in
 *     the cluster, flag as a numeric contradiction.
 *
 * @param {Array<{claims: Array, representative: string, [key: string]: any}>} clusters
 * @returns {Array<{topic: string, claim1: string, claim2: string, sources1: string[], sources2: string[], type: string}>}
 */
export function findContradictions(clusters) {
  const contradictions = [];

  for (const cluster of clusters) {
    if (cluster.claims.length < 2) continue;

    const affirmative = [];
    const negated = [];

    for (const c of cluster.claims) {
      const text = c.claim || '';
      if (hasNegation(text)) {
        negated.push(c);
      } else {
        affirmative.push(c);
      }
    }

    // Negation contradiction
    if (affirmative.length > 0 && negated.length > 0) {
      contradictions.push({
        topic: cluster.representative,
        claim1: affirmative[0].claim,
        claim2: negated[0].claim,
        sources1: [affirmative[0].sourceUrl || affirmative[0].sourceTitle || ''],
        sources2: [negated[0].sourceUrl || negated[0].sourceTitle || ''],
        type: 'negation'
      });
      continue; // one contradiction per cluster is enough
    }

    // Numeric contradiction: same entity (contextual word) with different numbers
    // Build a map of context-word → set of numbers seen
    const numericMap = new Map(); // contextKey → [{value, claim}]

    for (const c of cluster.claims) {
      const text = c.claim || '';
      const nums = extractNumbers(text);
      const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);

      for (const num of nums) {
        // Find the word immediately before/after the number as context key
        const numIdx = words.indexOf(num);
        const contextKey = [
          numIdx > 0 ? words[numIdx - 1] : '',
          numIdx < words.length - 1 ? words[numIdx + 1] : ''
        ].filter(Boolean).join('_');

        if (!contextKey) continue;
        if (!numericMap.has(contextKey)) numericMap.set(contextKey, []);
        numericMap.get(contextKey).push({ value: num, claim: c });
      }
    }

    for (const [key, entries] of numericMap) {
      const uniqueValues = new Set(entries.map(e => e.value));
      if (uniqueValues.size > 1) {
        const e1 = entries[0];
        const e2 = entries.find(e => e.value !== e1.value);
        if (e2) {
          contradictions.push({
            topic: cluster.representative,
            claim1: e1.claim.claim,
            claim2: e2.claim.claim,
            sources1: [e1.claim.sourceUrl || e1.claim.sourceTitle || ''],
            sources2: [e2.claim.sourceUrl || e2.claim.sourceTitle || ''],
            type: 'numeric',
            detail: `Different values for "${key}": ${e1.value} vs ${e2.value}`
          });
          break; // one per cluster
        }
      }
    }
  }

  return contradictions;
}
