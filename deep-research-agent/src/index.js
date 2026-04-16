/**
 * Deep Research Agent
 * 
 * Main entry point for programmatic use.
 */

import { Orchestrator } from './orchestrator.js';
import { Searcher } from './searcher.js';
import { Reader } from './reader.js';
import { Synthesizer } from './synthesizer.js';
import { Memory } from './memory.js';
import { Reporter } from './reporter.js';
import { warmupLLM } from './llm.js';

export class ResearchAgent {
  constructor(options = {}) {
    this.config = {
      depth: options.depth || 'medium',        // shallow, medium, deep
      timeBudget: options.timeBudget || 300,   // seconds (default 5 min)
      maxSources: options.maxSources || 15,
      minConfidence: options.minConfidence || 0.6,
      verbose: options.verbose || false,
      ...options
    };
    
    this.searcher = new Searcher(this.config);
    this.reader = new Reader(this.config);
    this.synthesizer = new Synthesizer(this.config);
    this.memory = new Memory(this.config);
    this.reporter = new Reporter(this.config);
    this.orchestrator = new Orchestrator({
      ...this.config,
      searcher: this.searcher,
      reader: this.reader,
      synthesizer: this.synthesizer,
      memory: this.memory
    });
  }

  /**
   * Research a topic
   * @param {string} query - The research question or topic
   * @param {object} options - Override default options for this query
   * @returns {Promise<ResearchResult>} - Structured research findings
   */
  async research(query, options = {}) {
    const config = { ...this.config, ...options };
    
    if (config.verbose) {
      console.log(`🔍 Starting research: "${query}"`);
      console.log(`   Depth: ${config.depth}, Time budget: ${config.timeBudget}s`);
    }

    // Warm up LLM (loads model into VRAM before the timed pipeline starts)
    await warmupLLM();

    // Create research session
    const session = this.memory.createSession(query, config);
    
    try {
      // Run the research loop
      const result = await this.orchestrator.run(session);
      
      // Generate final report
      const report = await this.reporter.generate(result);
      
      // Save session
      await this.memory.saveSession(session);
      
      return report;
    } catch (error) {
      session.state = 'error';
      session.error = error.message;
      await this.memory.saveSession(session);
      throw error;
    }
  }
}

// Convenience function for quick research
export async function research(query, options = {}) {
  const agent = new ResearchAgent(options);
  return agent.research(query);
}

export { Orchestrator, Searcher, Reader, Synthesizer, Memory, Reporter };

// New quality/anti-hallucination modules
export { groundClaims } from './grounding.js';
export { clusterClaims, scoreCorroboration, findContradictions } from './corroboration.js';
export { computeClaimConfidence, computeSessionConfidence, confidenceLabel } from './confidence.js';
export { searchArxiv, searchPubmed, searchWikipedia, searchSemanticScholar, searchAcademic } from './academic.js';
