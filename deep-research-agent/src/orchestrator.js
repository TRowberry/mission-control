/**
 * Orchestrator - The brain of the research agent
 * 
 * Decides what to research next, when to dig deeper, and when to stop.
 */

import { generatePerspectives as llmGeneratePerspectives } from './llm.js';
import { clusterClaims, scoreCorroboration, findContradictions } from './corroboration.js';
import { computeSessionConfidence } from './confidence.js';
import { searchAcademic, isAcademicQuery } from './academic.js';

export class Orchestrator {
  constructor(options = {}) {
    this.config = options;
    this.searcher = options.searcher;
    this.reader = options.reader;
    this.synthesizer = options.synthesizer;
    this.memory = options.memory;
  }

  /**
   * Run the research loop
   * @param {ResearchSession} session - The active research session
   * @returns {Promise<ResearchSession>} - Updated session with findings
   */
  async run(session) {
    const startTime = Date.now();
    const deadline = startTime + (this.config.timeBudget * 1000);
    
    // Initialize session arrays
    session.state = 'running';
    session.sources = session.sources || [];
    session.leads = session.leads || [];
    session.findings = session.findings || [];
    session.iterations = 0;
    session.confidence = 0;
    
    // Phase 1: Generate initial perspectives/angles
    const perspectives = await this.generatePerspectives(session.query);
    session.perspectives = perspectives;
    
    if (this.config.verbose) {
      console.log(`📐 Generated ${perspectives.length} research angles`);
    }

    // Phase 2: Research loop
    while (this.shouldContinue(session, deadline)) {
      // Pick next action
      const action = await this.planNextAction(session);
      
      if (action.type === 'search') {
        await this.executeSearch(session, action);
      } else if (action.type === 'read') {
        await this.executeRead(session, action);
      } else if (action.type === 'read_batch') {
        await this.executeReadBatch(session, action);
      } else if (action.type === 'follow') {
        await this.executeFollow(session, action);
      } else if (action.type === 'stop') {
        break;
      }
      
      // Update session state
      session.iterations++;
      session.lastUpdate = Date.now();
    }

    // Phase 3: Cluster + corroborate + detect contradictions
    const readSources = session.sources.filter(s => s.read);
    const allFindings = readSources.flatMap(s =>
      (s.findings || []).map(f => ({
        ...f,
        sourceUrl: s.url,
        sourceTitle: s.title
      }))
    );

    if (allFindings.length > 0) {
      if (this.config.verbose) {
        console.log(`📊 Clustering ${allFindings.length} findings across sources...`);
      }
      const rawClusters = clusterClaims(allFindings);
      const scoredClusters = scoreCorroboration(rawClusters, readSources);
      session.clusters = scoredClusters;
      session.contradictions = findContradictions(scoredClusters);

      if (this.config.verbose && session.contradictions.length > 0) {
        console.log(`   ⚠️ Detected ${session.contradictions.length} contradiction(s)`);
      }
    } else {
      session.clusters = [];
      session.contradictions = [];
    }

    // Phase 4: Synthesize findings
    session.synthesis = await this.synthesizer.synthesize(session);
    session.state = 'complete';
    session.completedAt = Date.now();
    session.timeElapsed = Math.round((session.completedAt - startTime) / 1000);

    // Phase 5: Compute final session confidence
    session.confidence = computeSessionConfidence(session);

    return session;
  }

  /**
   * Generate research perspectives/angles for a topic
   * STORM-inspired: different perspectives lead to different questions
   */
  async generatePerspectives(query) {
    // Try LLM-generated perspectives first
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        if (this.config.verbose) {
          console.log(`🧠 Generating research angles with AI...`);
        }
        const perspectives = await llmGeneratePerspectives(query);
        if (perspectives.length > 0) {
          return perspectives;
        }
      } catch (e) {
        if (this.config.verbose) {
          console.log(`   ⚠️ LLM perspectives failed, using defaults`);
        }
      }
    }
    
    // Fallback to basic perspectives
    return [
      { angle: 'overview', query: `${query} overview explanation` },
      { angle: 'history', query: `${query} history origin` },
      { angle: 'mechanism', query: `${query} how it works mechanism` },
      { angle: 'controversy', query: `${query} debate controversy criticism` },
      { angle: 'recent', query: `${query} latest research 2024 2025` }
    ];
  }

  /**
   * Decide what to do next
   */
  async planNextAction(session) {
    // Simple heuristic for MVP:
    // 1. If we have perspectives not yet searched, search them
    // 2. If we have URLs not yet read, batch read them in parallel
    // 3. If we have leads not yet followed, follow them
    // 4. Otherwise, stop

    const unsearchedPerspectives = session.perspectives.filter(p => !p.searched);
    if (unsearchedPerspectives.length > 0) {
      return { type: 'search', perspective: unsearchedPerspectives[0] };
    }

    const unreadSources = session.sources.filter(s => !s.read);
    const readCount = session.sources.filter(s => s.read).length;
    const remainingSlots = this.config.maxSources - readCount;
    
    if (unreadSources.length > 0 && remainingSlots > 0) {
      // Batch read: take up to PARALLEL_READS sources at once
      const batchSize = Math.min(this.config.parallelReads || 2, unreadSources.length, remainingSlots);
      return { type: 'read_batch', sources: unreadSources.slice(0, batchSize) };
    }

    const unfollowedLeads = session.leads.filter(l => !l.followed && l.priority === 'high');
    if (unfollowedLeads.length > 0) {
      return { type: 'follow', lead: unfollowedLeads[0] };
    }

    return { type: 'stop', reason: 'no more actions' };
  }

  /**
   * Check if we should continue researching
   */
  shouldContinue(session, deadline) {
    // Time budget exceeded?
    if (Date.now() > deadline) {
      if (this.config.verbose) console.log('⏰ Time budget reached');
      return false;
    }

    // Max sources reached?
    if (session.sources.filter(s => s.read).length >= this.config.maxSources) {
      if (this.config.verbose) console.log('📚 Max sources reached');
      return false;
    }

    // Confidence threshold met?
    if (session.confidence >= this.config.minConfidence) {
      const readSources = session.sources.filter(s => s.read).length;
      if (readSources >= 5) { // minimum sources for confidence
        if (this.config.verbose) console.log('✅ Confidence threshold met');
        return false;
      }
    }

    return true;
  }

  async executeSearch(session, action) {
    if (this.config.verbose) {
      console.log(`🔍 Searching: ${action.perspective.angle}`);
    }

    const results = await this.searcher.search(action.perspective.query);

    // Supplement with academic sources.
    // Wikipedia is always included on the first search pass; arXiv/PubMed/SS
    // only for academic queries.  We limit academic sources to the first
    // perspective search to avoid hammering free APIs on every angle.
    let academicResults = [];
    if (!session._academicSearchDone) {
      session._academicSearchDone = true;
      try {
        if (this.config.verbose) {
          console.log(`📚 Fetching academic sources...`);
        }
        academicResults = await searchAcademic(session.query);
        if (this.config.verbose && academicResults.length > 0) {
          console.log(`   Found ${academicResults.length} academic results`);
        }
      } catch (e) {
        if (this.config.verbose) {
          console.log(`   ⚠️ Academic search error: ${e.message}`);
        }
      }
    }

    for (const result of [...results, ...academicResults]) {
      if (!result.url) continue;
      if (!session.sources.find(s => s.url === result.url)) {
        session.sources.push({
          id: `src_${session.sources.length + 1}`,
          url: result.url,
          title: result.title || result.url,
          snippet: result.snippet || result.description || '',
          perspective: action.perspective.angle,
          source: result.source || 'web',          // 'arxiv', 'pubmed', 'wikipedia', etc.
          credibility: result.credibility || null,  // pre-set credibility for academic sources
          read: false,
          findings: []
        });
      }
    }

    action.perspective.searched = true;
  }

  async executeRead(session, action) {
    if (this.config.verbose) {
      console.log(`📖 Reading: ${action.source.title}`);
    }

    const content = await this.reader.read(action.source.url, session.query);
    
    action.source.read = true;
    action.source.content = content.text;
    action.source.fullText = content.fullText || content.text;
    // Prefer credibility score from reader; fall back to pre-set (e.g. academic)
    action.source.credibility = content.credibility || action.source.credibility;
    action.source.findings = content.findings;
    action.source.leads = content.leads;
    // Propagate fetch errors (e.g. HTTP 403) so callers can distinguish blocked vs parsed
    if (content.error) action.source.error = content.error;

    // Add any new leads
    for (const lead of content.leads || []) {
      if (!session.leads.find(l => l.url === lead.url)) {
        session.leads.push({ ...lead, followed: false });
      }
    }

    // Update session confidence based on corroboration
    this.updateConfidence(session);
  }

  /**
   * Read multiple sources in parallel for speed
   */
  async executeReadBatch(session, action) {
    const sources = action.sources;
    
    if (this.config.verbose) {
      console.log(`📖 Reading ${sources.length} sources in parallel:`);
      sources.forEach(s => console.log(`   • ${s.title.slice(0, 50)}...`));
    }

    const startTime = Date.now();
    
    // Process all sources in parallel
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        try {
          const content = await this.reader.read(source.url, session.query);
          return { source, content, success: true };
        } catch (error) {
          return { source, error: error.message, success: false };
        }
      })
    );

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        const { source, content } = result.value;

        source.read = true;
        source.content = content.text;
        source.fullText = content.fullText || content.text;
        source.credibility = content.credibility || source.credibility;
        source.findings = content.findings;
        source.leads = content.leads;
        // Propagate fetch errors (e.g. HTTP 403) so callers can distinguish blocked vs parsed
        if (content.error) source.error = content.error;

        // Add any new leads
        for (const lead of content.leads || []) {
          if (!session.leads.find(l => l.url === lead.url)) {
            session.leads.push({ ...lead, followed: false });
          }
        }
      } else {
        // Mark as read but failed
        const source = result.status === 'fulfilled' ? result.value.source : action.sources[results.indexOf(result)];
        source.read = true;
        source.error = result.status === 'rejected' ? result.reason : result.value.error;
        if (this.config.verbose) {
          console.log(`   ⚠️ Failed: ${source.title.slice(0, 30)}...`);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (this.config.verbose) {
      console.log(`   ✅ Batch complete in ${elapsed}s`);
    }

    // Update session confidence
    this.updateConfidence(session);
  }

  async executeFollow(session, action) {
    if (this.config.verbose) {
      console.log(`🔗 Following lead: ${action.lead.topic}`);
    }

    // Add a new perspective based on the lead
    session.perspectives.push({
      angle: action.lead.topic,
      query: action.lead.query || action.lead.topic,
      searched: false,
      fromLead: true
    });

    action.lead.followed = true;
  }

  updateConfidence(session) {
    // Mid-loop confidence estimate (clusters not yet built, so use simpler heuristic)
    // The final confidence is computed by computeSessionConfidence after clustering.
    const readSources = session.sources.filter(s => s.read);
    if (readSources.length === 0) {
      session.confidence = 0;
      return;
    }
    const avgCredibility = readSources.reduce((sum, s) => sum + (s.credibility || 0.5), 0) / readSources.length;
    const sourceBonus = Math.min(readSources.length / 10, 0.3);
    session.confidence = Math.min(avgCredibility + sourceBonus, 1);
  }
}
