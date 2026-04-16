/**
 * LLM - Unified interface for local (Ollama) and cloud (Claude) models
 * Prefers local Ollama when available for cost savings
 */

import Anthropic from '@anthropic-ai/sdk';
import * as ollama from './ollama.js';

let client = null;
let useOllama = null; // Cache the check
let warmedUp = false;

export async function shouldUseOllama() {
  if (useOllama !== null) return useOllama;

  // Check if Ollama is available
  if (process.env.USE_OLLAMA !== 'false') {
    useOllama = await ollama.isAvailable();
    if (useOllama) {
      const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';
      console.log(`   🖥️  Using local Ollama (${model})`);
    }
  } else {
    useOllama = false;
  }
  return useOllama;
}

/**
 * Warm up the LLM before research starts — loads model into VRAM.
 * Only runs once per process; safe to call multiple times.
 */
export async function warmupLLM() {
  if (warmedUp) return;
  if (await shouldUseOllama()) {
    await ollama.warmup();
  }
  warmedUp = true;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Extract key findings from page content
 */
export async function extractFindings(content, query, options = {}) {
  // Try local Ollama first
  if (await shouldUseOllama()) {
    return ollama.extractFindings(content, query, options);
  }
  
  const client = getClient();
  
  // Truncate content to avoid token limits
  const maxChars = options.maxChars || 8000;
  const truncatedContent = content.slice(0, maxChars);
  
  const response = await client.messages.create({
    model: options.model || 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a research assistant extracting key findings from a source.

Research question: "${query}"

Source content:
---
${truncatedContent}
---

Extract 3-5 key factual claims from this source that are relevant to the research question.
For each finding, rate your confidence (high/medium/low) based on how clearly it's stated.

Respond in JSON format:
{
  "findings": [
    {"claim": "...", "confidence": "high|medium|low"},
    ...
  ]
}

Only include factual claims, not opinions. Be concise.`
    }]
  });

  try {
    const text = response.content[0].text;
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).findings || [];
    }
  } catch (e) {
    console.log('Failed to parse findings:', e.message);
  }
  
  return [];
}

/**
 * Extract leads (related topics worth following)
 */
export async function extractLeads(content, query, options = {}) {
  // Try local Ollama first
  if (await shouldUseOllama()) {
    return ollama.extractLeads(content, query, options);
  }
  
  const client = getClient();
  
  const maxChars = options.maxChars || 6000;
  const truncatedContent = content.slice(0, maxChars);
  
  const response = await client.messages.create({
    model: options.model || 'claude-3-5-haiku-20241022',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a research assistant identifying follow-up research leads.

Research question: "${query}"

Source content:
---
${truncatedContent}
---

Identify 2-3 related topics mentioned in this source that might be worth researching further.
Focus on topics that would deepen understanding of the main question.

Respond in JSON format:
{
  "leads": [
    {"topic": "...", "reason": "...", "priority": "high|medium|low"},
    ...
  ]
}

Be concise.`
    }]
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).leads || [];
    }
  } catch (e) {
    console.log('Failed to parse leads:', e.message);
  }
  
  return [];
}

/**
 * Generate research perspectives/angles for a topic
 */
export async function generatePerspectives(query, options = {}) {
  // Try local Ollama first
  if (await shouldUseOllama()) {
    const result = await ollama.generatePerspectives(query, options);
    if (result && result.length > 0) return result;
    // Fall through to Claude if Ollama fails
  }
  
  if (!process.env.ANTHROPIC_API_KEY) {
    return null; // Trigger fallback in orchestrator
  }
  
  const client = getClient();
  
  const response = await client.messages.create({
    model: options.model || 'claude-3-5-haiku-20241022',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a research assistant planning a comprehensive research approach.

Research question: "${query}"

Generate 4-6 different search angles/perspectives to research this topic comprehensively.
Each perspective should lead to different types of sources and information.

Think like a Wikipedia editor doing background research.

Respond in JSON format:
{
  "perspectives": [
    {"angle": "short name", "query": "search query to use", "why": "what this will reveal"},
    ...
  ]
}

Be strategic - cover different aspects (definition, history, mechanism, debate, recent developments, etc.)`
    }]
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).perspectives || [];
    }
  } catch (e) {
    console.log('Failed to parse perspectives:', e.message);
  }
  
  // Fallback to basic perspectives
  return [
    { angle: 'overview', query: `${query} overview explanation` },
    { angle: 'mechanism', query: `${query} how it works` },
    { angle: 'history', query: `${query} history origin` }
  ];
}

/**
 * Synthesize findings into a coherent summary
 *
 * @param {Array}  findings
 * @param {Array}  sources
 * @param {string} query
 * @param {object} [options]
 * @param {object} [options.sourceExcerpts]  map of claim → source passage
 * @param {Array}  [options.clusters]        corroboration clusters
 * @param {Array}  [options.contradictions]  detected contradictions
 */
export async function synthesizeFindings(findings, sources, query, options = {}) {
  const { sourceExcerpts = {}, clusters = [], contradictions = [] } = options;

  // Try local Ollama first
  if (await shouldUseOllama()) {
    return ollama.synthesizeFindings(findings, sources, query, options);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: '', keyPoints: [], consensus: [], debates: [], gaps: [] };
  }

  const client = getClient();

  const findingsText = findings.map((f, i) => {
    const excerpt = sourceExcerpts[f.claim];
    const cluster = clusters.find(cl => cl.claims.some(c => c.claim === f.claim));
    const corrobInfo = cluster ? ` [${cluster.uniqueDomainCount || 1} source(s) agree]` : '';
    const groundInfo = typeof f.groundingScore === 'number'
      ? ` (grounding: ${(f.groundingScore * 100).toFixed(0)}%)`
      : ` (confidence: ${f.confidence || 'medium'}, source: ${f.sourceUrl || 'unknown'})`;
    let line = `${i + 1}. ${f.claim}${corrobInfo}${groundInfo}`;
    if (excerpt) line += `\n   Excerpt: "${excerpt.slice(0, 200)}"`;
    return line;
  }).join('\n');

  const contradictionText = contradictions.length > 0
    ? '\nConflicting information detected:\n' +
      contradictions.map(c => `- "${c.claim1}" vs "${c.claim2}"`).join('\n')
    : '';

  const response = await client.messages.create({
    model: options.model || 'claude-3-5-haiku-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a research assistant synthesizing findings from multiple sources.

Research question: "${query}"

Findings (with source excerpts for verification):
${findingsText}
${contradictionText}

Verify claims against their source excerpts. If a claim isn't supported by its excerpt, note the discrepancy in DEBATES.

Synthesize into a coherent summary. Identify:
1. Key points of consensus (what multiple sources agree on)
2. Any contradictions or debates
3. Gaps in the research

Respond in JSON format:
{
  "summary": "2-3 sentence overall answer",
  "keyPoints": ["point 1", "point 2", ...],
  "consensus": ["things sources agree on"],
  "debates": ["any disagreements or uncertainties"],
  "gaps": ["topics that need more research"]
}

Be concise and factual.`
    }]
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log('Failed to parse synthesis:', e.message);
  }
  
  return { summary: '', keyPoints: [], consensus: [], debates: [], gaps: [] };
}
