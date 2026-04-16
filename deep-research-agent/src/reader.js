/**
 * Reader - Extracts information from web pages
 * 
 * Uses fetch + Readability for content extraction.
 * Uses Claude for findings/leads extraction.
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { extractFindings, extractLeads } from './llm.js';
import { groundClaims } from './grounding.js';

export class Reader {
  constructor(options = {}) {
    this.config = options;
    this.verbose = options.verbose || false;
    this.maxContentLength = options.maxContentLength || 15000; // chars
  }

  /**
   * Read and extract information from a URL
   * @param {string} url - URL to read
   * @returns {Promise<ReadResult>} - Extracted content and metadata
   */
  async read(url, query = '') {
    if (this.verbose) {
      console.log(`   📖 Reading: ${url}`);
    }

    try {
      const html = await this.fetchPage(url);
      const content = this.extractContent(html, url);
      const credibility = this.scoreCredibility(url, content.text);
      // Store full text (used by synthesizer for source excerpts) as well as
      // the truncated version that goes to the LLM
      const fullText = content.text;
      const text = content.text.slice(0, this.maxContentLength);

      // Extract findings and leads using LLM (if we have content and a query)
      // llm.js handles Ollama vs Claude fallback automatically
      let findings = [];
      let leads = [];

      if (text.length > 200 && query) {
        try {
          if (this.verbose) {
            console.log(`   🧠 Extracting findings...`);
          }
          const rawFindings = await extractFindings(text, query);
          // Ground claims: verify each is actually supported by source text
          findings = groundClaims(rawFindings, fullText);
          if (this.verbose && rawFindings.length > findings.length) {
            console.log(`   🔎 Grounding: ${rawFindings.length} → ${findings.length} claims kept`);
          }
          leads = await extractLeads(text, query);
        } catch (llmError) {
          if (this.verbose) {
            console.log(`   ⚠️ LLM extraction failed: ${llmError.message}`);
          }
        }
      }

      // Also get link-based leads
      const linkLeads = this.extractLinks(html, url);
      leads = [...leads, ...linkLeads.slice(0, 5)];

      return {
        url,
        title: content.title,
        text,
        fullText,          // full unpruned text for synthesizer source excerpts
        byline: content.byline,
        excerpt: content.excerpt,
        credibility,
        findings,
        leads
      };
    } catch (error) {
      if (this.verbose) {
        console.log(`   ❌ Failed to read ${url}: ${error.message}`);
      }
      return {
        url,
        title: '',
        text: '',
        credibility: 0.3,
        findings: [],
        leads: [],
        error: error.message
      };
    }
  }

  /**
   * Fetch page HTML
   */
  async fetchPage(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DeepResearchAgent/1.0; +https://github.com/deep-research-agent)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extract readable content from HTML
   */
  extractContent(html, url) {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        return {
          title: article.title || '',
          text: article.textContent || '',
          byline: article.byline || '',
          excerpt: article.excerpt || ''
        };
      }
    } catch (e) {
      // Readability failed, try basic extraction
    }

    // Fallback: basic text extraction
    return this.basicExtract(html);
  }

  /**
   * Basic text extraction fallback
   */
  basicExtract(html) {
    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Remove scripts, styles, nav, footer
      ['script', 'style', 'nav', 'footer', 'header', 'aside'].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });

      const title = doc.querySelector('title')?.textContent || '';
      const text = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';

      return { title, text, byline: '', excerpt: text.slice(0, 200) };
    } catch {
      return { title: '', text: '', byline: '', excerpt: '' };
    }
  }

  /**
   * Extract links that might be worth following
   */
  extractLinks(html, baseUrl) {
    try {
      const dom = new JSDOM(html, { url: baseUrl });
      const doc = dom.window.document;
      const links = [];

      doc.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        const text = a.textContent?.trim();

        // Skip empty, same-page, or non-http links
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        if (!href.startsWith('http')) return;
        if (href === baseUrl) return;

        // Look for citation-like links
        const isCitation = /\[\d+\]|citation|source|reference|doi\.org|arxiv\.org/i.test(text + href);
        const isRelated = /related|see also|learn more|read more/i.test(text);

        if (isCitation || isRelated) {
          links.push({
            url: href,
            text: text?.slice(0, 100),
            priority: isCitation ? 'high' : 'medium',
            type: isCitation ? 'citation' : 'related'
          });
        }
      });

      return links.slice(0, 10); // Limit to 10 leads per page
    } catch {
      return [];
    }
  }

  /**
   * Score source credibility
   */
  scoreCredibility(url, content = '') {
    let score = 0.5; // baseline
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Domain signals
      if (domain.endsWith('.edu')) score += 0.15;
      if (domain.endsWith('.gov')) score += 0.15;
      if (domain.endsWith('.org')) score += 0.05;
      
      // Known reputable
      if (REPUTABLE_DOMAINS.some(r => domain.includes(r))) score += 0.2;
      
      // Known sketchy
      if (SKETCHY_DOMAINS.some(s => domain.includes(s))) score -= 0.3;
      
      // Wikipedia is useful but not primary source
      if (domain.includes('wikipedia')) score = 0.65;
      
      // Content signals
      if (content) {
        if (/\[\d+\]/.test(content)) score += 0.1; // Has citations
        if (/references|bibliography|sources/i.test(content)) score += 0.05;
        if (/peer.?review/i.test(content)) score += 0.1;
      }
      
    } catch {
      // URL parsing failed
    }
    
    return Math.max(0.1, Math.min(0.95, score)); // clamp
  }
}

// Domain lists
const REPUTABLE_DOMAINS = [
  'nature.com', 'science.org', 'sciencemag.org',
  'nih.gov', 'cdc.gov', 'who.int',
  'nasa.gov', 'noaa.gov',
  'sciencedirect.com', 'pubmed.gov', 'ncbi.nlm.nih.gov',
  'britannica.com',
  'stanford.edu', 'mit.edu', 'harvard.edu', 'berkeley.edu',
  'ox.ac.uk', 'cam.ac.uk',
  'reuters.com', 'apnews.com', 'bbc.com', 'npr.org'
];

const SKETCHY_DOMAINS = [
  'buzzfeed.com', 'dailymail.co.uk', 'infowars.com',
  'naturalnews.com', 'breitbart.com'
];
