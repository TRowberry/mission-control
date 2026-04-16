/**
 * Searcher - Finds relevant sources on the web
 * 
 * Supports:
 * - Brave Search API (primary)
 * - Mock mode for testing
 */

export class Searcher {
  constructor(options = {}) {
    this.config = options;
    this.braveApiKey = options.braveApiKey || process.env.BRAVE_API_KEY;
    this.verbose = options.verbose || false;
    this.lastSearchTime = 0;
    this.searchDelayMs = options.searchDelayMs || 1500; // 1.5s between searches
  }

  /**
   * Wait to avoid rate limiting
   */
  async waitForRateLimit() {
    const elapsed = Date.now() - this.lastSearchTime;
    if (elapsed < this.searchDelayMs) {
      const waitMs = this.searchDelayMs - elapsed;
      if (this.verbose) {
        console.log(`   ⏳ Rate limit: waiting ${waitMs}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    this.lastSearchTime = Date.now();
  }

  /**
   * Search for sources on a query
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<SearchResult[]>} - Array of results
   */
  async search(query, options = {}) {
    const count = options.count || this.getCountForDepth();
    
    if (!this.braveApiKey) {
      console.log('   ⚠️ No BRAVE_API_KEY - using mock results');
      return this.mockSearch(query, count);
    }

    // Rate limiting to avoid 429s
    await this.waitForRateLimit();

    try {
      const results = await this.braveSearch(query, count);
      
      if (this.verbose) {
        console.log(`   🔍 Found ${results.length} results for: "${query}"`);
      }
      
      return results.map(r => ({
        url: r.url,
        title: r.title,
        snippet: r.description,
        type: this.classifySource(r.url)
      }));
    } catch (error) {
      console.log(`   ❌ Search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Call Brave Search API
   */
  async braveSearch(query, count = 10) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 20)); // Brave max is 20
    url.searchParams.set('text_decorations', 'false');
    url.searchParams.set('safesearch', 'moderate');

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.braveApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.web?.results || [];
  }

  /**
   * Mock search for testing without API key
   */
  mockSearch(query, count) {
    console.log(`   [Mock] Searching: "${query}" (${count} results)`);
    // Return empty - will prompt user to add API key
    return [];
  }

  /**
   * Get result count based on depth setting
   */
  getCountForDepth() {
    switch (this.config.depth) {
      case 'shallow': return 5;
      case 'deep': return 15;
      default: return 10; // medium
    }
  }

  /**
   * Deduplicate results across multiple searches
   */
  deduplicate(results) {
    const seen = new Set();
    return results.filter(r => {
      const key = this.normalizeUrl(r.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Normalize URL for deduplication
   */
  normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove tracking params
      ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'].forEach(p => {
        u.searchParams.delete(p);
      });
      return u.toString().toLowerCase().replace(/\/$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Classify source type from URL
   */
  classifySource(url) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      if (domain.endsWith('.edu')) return 'academic';
      if (domain.endsWith('.gov')) return 'government';
      if (domain.includes('wikipedia')) return 'wiki';
      if (domain.includes('arxiv')) return 'preprint';
      if (domain.includes('reddit.com')) return 'forum';
      if (domain.includes('stackexchange') || domain.includes('stackoverflow')) return 'forum';
      if (domain.includes('medium.com')) return 'blog';
      if (domain.includes('substack.com')) return 'blog';
      if (['bbc.com', 'cnn.com', 'nytimes.com', 'reuters.com', 'apnews.com', 'npr.org'].some(n => domain.includes(n))) return 'news';
      
      return 'web';
    } catch {
      return 'web';
    }
  }
}
