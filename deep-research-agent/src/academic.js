/**
 * Academic Sources - Free academic API integrations
 *
 * arXiv, PubMed, Wikipedia, Semantic Scholar.
 * All functions handle errors gracefully and return [] on failure.
 */

// Keywords that suggest an academic / scientific query
const ACADEMIC_KEYWORDS = [
  // sciences
  'study', 'research', 'trial', 'experiment', 'analysis', 'evidence',
  'efficacy', 'mechanism', 'gene', 'protein', 'cell', 'virus', 'bacteria',
  'drug', 'therapy', 'treatment', 'disease', 'cancer', 'vaccine', 'clinical',
  'physics', 'chemistry', 'biology', 'medicine', 'neuroscience', 'psychology',
  'algorithm', 'model', 'neural', 'machine learning', 'deep learning', 'ai',
  'climate', 'co2', 'carbon', 'emission', 'ecosystem', 'species', 'evolution',
  'quantum', 'relativity', 'cosmology', 'astronomy', 'genome', 'crispr',
  // social sciences
  'economics', 'sociology', 'anthropology', 'epidemiology', 'statistics',
  // generic research language
  'meta-analysis', 'systematic review', 'randomized', 'placebo', 'hypothesis'
];

/**
 * Check whether a query looks academic/scientific.
 * Wikipedia is always fetched; arXiv/PubMed only for academic queries.
 */
export function isAcademicQuery(query) {
  const lower = query.toLowerCase();
  return ACADEMIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Generic fetch with timeout (10 s) and User-Agent header
 */
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, application/xml, text/xml, */*',
        'User-Agent': 'DeepResearchAgent/1.0 (https://github.com/deep-research-agent)'
      },
      ...options
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ─── arXiv ──────────────────────────────────────────────────────────────────

/**
 * Parse arXiv Atom XML without external dependencies
 * Returns an array of entry objects with title, authors, summary, link, published
 */
function parseArxivAtom(xml) {
  const entries = [];
  // Split on <entry> blocks
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];

  for (const block of entryBlocks) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const summary = (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || '';
    const published = (block.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '';

    // Get the HTML link (rel="alternate")
    const linkMatch = block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/) ||
                      block.match(/<link[^>]+href="([^"]+)"[^>]+rel="alternate"/);
    const link = linkMatch ? linkMatch[1] : '';

    // Author names
    const authorBlocks = block.match(/<author[\s\S]*?<\/author>/g) || [];
    const authors = authorBlocks.map(a => {
      return ((a.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '').trim();
    }).filter(Boolean);

    if (title && link) {
      entries.push({
        title: title.trim().replace(/\s+/g, ' '),
        authors,
        summary: summary.trim().replace(/\s+/g, ' ').slice(0, 400),
        link: link.trim(),
        published: published.trim()
      });
    }
  }
  return entries;
}

/**
 * Search arXiv for academic papers.
 * @param {string} query
 * @param {number} [maxResults=5]
 * @returns {Promise<Array<{url, title, description, source, credibility}>>}
 */
export async function searchArxiv(query, maxResults = 5) {
  try {
    const encodedQuery = encodeURIComponent(query.replace(/\s+/g, '+'));
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=${maxResults}`;

    const res = await apiFetch(url);
    const xml = await res.text();
    const entries = parseArxivAtom(xml);

    return entries.map(e => ({
      url: e.link,
      title: e.title,
      description: `${e.authors.slice(0, 3).join(', ')}${e.authors.length > 3 ? ' et al.' : ''} (${e.published.slice(0, 4)}). ${e.summary}`,
      source: 'arxiv',
      credibility: 0.85
    }));
  } catch (e) {
    console.log(`   ⚠️ arXiv search failed: ${e.message}`);
    return [];
  }
}

// ─── PubMed ─────────────────────────────────────────────────────────────────

/**
 * Search PubMed for biomedical literature.
 * Two-step: esearch for IDs, then esummary for metadata.
 * @param {string} query
 * @param {number} [maxResults=5]
 * @returns {Promise<Array<{url, title, description, source, credibility}>>}
 */
export async function searchPubmed(query, maxResults = 5) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmax=${maxResults}&retmode=json`;

    const searchRes = await apiFetch(searchUrl);
    const searchData = await searchRes.json();
    const ids = searchData?.esearchresult?.idlist;
    if (!ids || ids.length === 0) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await apiFetch(summaryUrl);
    const summaryData = await summaryRes.json();

    const results = [];
    for (const id of ids) {
      const doc = summaryData?.result?.[id];
      if (!doc) continue;

      const title = doc.title || '';
      const authors = (doc.authors || []).slice(0, 3).map(a => a.name).join(', ');
      const year = doc.pubdate ? doc.pubdate.slice(0, 4) : '';
      const source = doc.source || '';

      results.push({
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        title,
        description: `${authors}${year ? ` (${year})` : ''}. ${source}.`,
        source: 'pubmed',
        credibility: 0.9
      });
    }

    return results;
  } catch (e) {
    console.log(`   ⚠️ PubMed search failed: ${e.message}`);
    return [];
  }
}

// ─── Wikipedia ──────────────────────────────────────────────────────────────

/**
 * Search Wikipedia for summary articles.
 * @param {string} query
 * @param {number} [maxResults=3]
 * @returns {Promise<Array<{url, title, description, source, credibility}>>}
 */
export async function searchWikipedia(query, maxResults = 3) {
  try {
    const results = [];

    // 1. Try direct page summary (works best for well-known topics)
    try {
      const directUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const res = await apiFetch(directUrl);
      const data = await res.json();
      if (data.extract && data.title) {
        results.push({
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
          title: data.title,
          description: data.extract.slice(0, 400),
          source: 'wikipedia',
          credibility: 0.65
        });
      }
    } catch {
      // direct lookup failed — fall through to search API
    }

    // 2. Fallback to search API to find related articles
    if (results.length < maxResults) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}&origin=*`;
      const searchRes = await apiFetch(searchUrl);
      const searchData = await searchRes.json();
      const hits = searchData?.query?.search || [];

      for (const hit of hits) {
        if (results.some(r => r.title === hit.title)) continue;
        const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`;
        // Strip HTML tags from snippet
        const snippet = (hit.snippet || '').replace(/<[^>]+>/g, '').slice(0, 300);
        results.push({
          url: pageUrl,
          title: hit.title,
          description: snippet,
          source: 'wikipedia',
          credibility: 0.65
        });
        if (results.length >= maxResults) break;
      }
    }

    return results;
  } catch (e) {
    console.log(`   ⚠️ Wikipedia search failed: ${e.message}`);
    return [];
  }
}

// ─── Semantic Scholar ────────────────────────────────────────────────────────

/**
 * Log-scale credibility boost from citation count.
 * 0 citations → 0.0 bonus, ~1000+ citations → up to 0.3 bonus (capped)
 */
function citationBoost(count) {
  if (!count || count <= 0) return 0;
  return Math.min(Math.log10(count + 1) / 4, 0.3);
}

/**
 * Search Semantic Scholar for academic papers.
 * @param {string} query
 * @param {number} [maxResults=5]
 * @returns {Promise<Array<{url, title, description, source, credibility}>>}
 */
export async function searchSemanticScholar(query, maxResults = 5) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=${maxResults}&fields=title,abstract,url,year,citationCount,authors`;

    const res = await apiFetch(url);
    const data = await res.json();
    const papers = data?.data || [];

    return papers.map(p => {
      const authors = (p.authors || []).slice(0, 3).map(a => a.name).join(', ');
      const year = p.year ? ` (${p.year})` : '';
      const citations = p.citationCount || 0;
      const credibility = Math.min(0.65 + citationBoost(citations), 0.95);
      const abstract = (p.abstract || '').slice(0, 350);
      const paperUrl = p.url || `https://www.semanticscholar.org/`;

      return {
        url: paperUrl,
        title: p.title || '',
        description: `${authors}${year}. Citations: ${citations}. ${abstract}`,
        source: 'semanticscholar',
        credibility
      };
    }).filter(p => p.title && p.url);
  } catch (e) {
    console.log(`   ⚠️ Semantic Scholar search failed: ${e.message}`);
    return [];
  }
}

/**
 * Run all relevant academic searches for a query.
 * Wikipedia is always included; arXiv, PubMed, Semantic Scholar only for
 * academic/scientific queries.
 *
 * @param {string} query
 * @param {object} [options]
 * @param {boolean} [options.forceAcademic] - Always query all academic sources
 * @returns {Promise<Array>}
 */
export async function searchAcademic(query, options = {}) {
  const academic = options.forceAcademic || isAcademicQuery(query);

  const searches = [
    searchWikipedia(query, 2)
  ];

  if (academic) {
    searches.push(searchArxiv(query, 3));
    searches.push(searchPubmed(query, 3));
    searches.push(searchSemanticScholar(query, 3));
  }

  const settled = await Promise.allSettled(searches);
  const results = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return results;
}
