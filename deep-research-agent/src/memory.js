/**
 * Memory - Persists research sessions and findings
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export class Memory {
  constructor(options = {}) {
    this.config = options;
    this.outputDir = options.outputDir || './output';
    this.dataDir = options.dataDir || './data';
  }

  /**
   * Create a new research session
   */
  createSession(query, config) {
    return {
      id: this.generateId(),
      query,
      config,
      state: 'pending',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      
      // Research state
      perspectives: [],
      sources: [],
      leads: [],
      findings: [],
      synthesis: null,
      
      // Metrics
      iterations: 0,
      confidence: 0,
      timeElapsed: 0
    };
  }

  /**
   * Save a research session to disk
   */
  async saveSession(session) {
    await this.ensureDir(this.outputDir);
    
    const filename = `${session.id}.json`;
    const filepath = join(this.outputDir, filename);
    
    await writeFile(filepath, JSON.stringify(session, null, 2));
    
    if (this.config.verbose) {
      console.log(`💾 Session saved: ${filepath}`);
    }
    
    return filepath;
  }

  /**
   * Load a research session from disk
   */
  async loadSession(sessionId) {
    const filepath = join(this.outputDir, `${sessionId}.json`);
    const content = await readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * List all saved sessions
   */
  async listSessions() {
    // TODO: Implement session listing
    return [];
  }

  /**
   * Generate unique session ID
   */
  generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `research_${timestamp}_${random}`;
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dir) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}
