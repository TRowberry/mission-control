/**
 * Grounding - Verify claims have actual textual support in source material
 *
 * Uses token-overlap (Jaccard similarity) on content words plus
 * key entity/number presence checks to score each claim 0.0-1.0.
 */

// Common English stop words to ignore in overlap scoring
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

/**
 * Tokenise text into lowercase content words (skip stop words and short tokens)
 * @param {string} text
 * @returns {Set<string>}
 */
function contentWords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Jaccard similarity between two word sets
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0.0 – 1.0
 */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  for (const w of setA) {
    if (setB.has(w)) intersect++;
  }
  const union = setA.size + setB.size - intersect;
  return intersect / union;
}

/**
 * Extract numbers from text (integers and decimals)
 * @param {string} text
 * @returns {string[]}
 */
function extractNumbers(text) {
  const matches = text.match(/\d+(?:[.,]\d+)*/g) || [];
  return matches.map(n => n.replace(/,/g, ''));
}

/**
 * Extract proper nouns (runs of Title-cased words, min 2 chars)
 * @param {string} text
 * @returns {string[]}
 */
function extractProperNouns(text) {
  const matches = text.match(/\b[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*/g) || [];
  return matches.map(n => n.toLowerCase());
}

/**
 * Score how well a single claim is grounded in source text
 * @param {string} claim
 * @param {string} sourceText
 * @returns {number} 0.0 – 1.0
 */
function scoreGrounding(claim, sourceText) {
  const claimWords = contentWords(claim);
  const sourceWords = contentWords(sourceText);

  // Base Jaccard similarity
  const wordScore = jaccard(claimWords, sourceWords);

  // Entity / number presence bonus
  const claimNumbers = extractNumbers(claim);
  const claimProper = extractProperNouns(claim);
  const sourceTextLower = sourceText.toLowerCase();

  let entityMatches = 0;
  let entityTotal = claimNumbers.length + claimProper.length;

  if (entityTotal > 0) {
    for (const num of claimNumbers) {
      if (sourceText.includes(num)) entityMatches++;
    }
    for (const noun of claimProper) {
      if (sourceTextLower.includes(noun)) entityMatches++;
    }
  }

  const entityScore = entityTotal > 0 ? entityMatches / entityTotal : 0.5;

  // Weighted blend: word overlap 60%, entity presence 40%
  return wordScore * 0.6 + entityScore * 0.4;
}

/**
 * Verify and filter claims against the source text they came from.
 *
 * @param {Array<{claim: string, confidence?: string, [key: string]: any}>} claims
 * @param {string} sourceText - Full text of the source page
 * @returns {Array} Filtered claims with `groundingScore` and `grounded` fields added
 */
export function groundClaims(claims, sourceText) {
  if (!Array.isArray(claims) || claims.length === 0) return [];
  if (!sourceText || sourceText.length < 50) {
    // Not enough source text to verify — return all with neutral score
    return claims.map(c => ({ ...c, groundingScore: 0.5, grounded: 'weak' }));
  }

  const results = [];

  for (const claim of claims) {
    const claimText = typeof claim === 'string' ? claim : (claim.claim || '');
    if (!claimText) continue;

    const score = scoreGrounding(claimText, sourceText);

    if (score < 0.25) {
      // Drop — no meaningful textual support
      continue;
    }

    const grounded = score >= 0.5 ? true : 'weak';
    results.push({ ...claim, groundingScore: Math.round(score * 100) / 100, grounded });
  }

  return results;
}
