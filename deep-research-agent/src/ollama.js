/**
 * Ollama - Local LLM wrapper for research tasks
 * Uses DeepSeek-R1 or other models running on GPU server
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://10.0.0.118:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
const DEFAULT_TIMEOUT = 120000; // 2 minutes — sufficient for 8B model
// think:false disables the reasoning trace, so response tokens only.
const DEFAULT_MAX_TOKENS = 600;

/**
 * Call Ollama API with timeout.
 * Uses /api/chat (works with all modern models including gemma4).
 * Falls back to /api/generate for legacy compatibility.
 */
async function generate(prompt, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false, // Disable reasoning trace — cuts latency from ~90s to ~15s per call
        options: {
          temperature: options.temperature || 0.3,
          num_predict: options.maxTokens || DEFAULT_MAX_TOKENS
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // /api/chat returns message.content; /api/generate returns response
    return data.message?.content ?? data.response ?? '';
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error(`Ollama timeout after ${timeoutMs/1000}s`);
    }
    throw e;
  }
}

/**
 * Attempt to repair malformed JSON from LLM
 */
function repairJSON(text) {
  let fixed = text;
  
  // Remove any text before first { or [
  fixed = fixed.replace(/^[^{\[]*/, '');
  // Remove any text after last } or ]
  fixed = fixed.replace(/[^}\]]*$/, '');
  
  // Fix trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  
  // Fix missing commas between objects/strings
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
  fixed = fixed.replace(/}\s*\n\s*{/g, '},\n{');
  fixed = fixed.replace(/]\s*\n\s*\[/g, '],\n[');
  
  // Fix unescaped newlines in strings (common LLM mistake)
  fixed = fixed.replace(/"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
    return `"${p1}\\n${p2}"`;
  });
  
  // Fix unquoted keys (less common but happens)
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // Fix single quotes to double quotes (but not inside strings)
  fixed = fixed.replace(/'/g, '"');
  
  // Fix missing closing brackets by counting
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;
  
  // Add missing closing brackets
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
  
  // Remove extra closing brackets from start
  for (let i = 0; i < closeBraces - openBraces; i++) {
    fixed = fixed.replace(/^[^{]*}/, '');
  }
  
  // Fix "confidence": high -> "confidence": "high"
  fixed = fixed.replace(/"confidence"\s*:\s*(high|medium|low)/gi, '"confidence": "$1"');
  
  // Fix "priority": high -> "priority": "high"  
  fixed = fixed.replace(/"priority"\s*:\s*(high|medium|low)/gi, '"priority": "$1"');
  
  return fixed;
}

/**
 * Parse JSON from LLM response (handles markdown code blocks + repairs)
 */
function parseJSON(text) {
  // Try to find JSON in the response
  let jsonText = text;
  
  // Extract from code block if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  } else {
    // Try to find raw JSON object
    const objMatch = text.match(/(\{[\s\S]*\})/);
    if (objMatch) {
      jsonText = objMatch[1];
    }
  }
  
  // First try: parse as-is
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    // Second try: repair and parse
    try {
      const repaired = repairJSON(jsonText);
      return JSON.parse(repaired);
    } catch (e2) {
      // Third try: extract just the array if it's an array response
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const repaired = repairJSON(arrayMatch[0]);
          return JSON.parse(repaired);
        } catch (e3) {
          console.log('Failed to parse JSON:', e2.message);
        }
      } else {
        console.log('Failed to parse JSON:', e2.message);
      }
    }
  }
  return null;
}

/**
 * Parse a numbered list into findings array
 * Handles formats like:
 * 1. [HIGH] Claim text here
 * 2. [MEDIUM] Another claim
 */
function parseNumberedList(text) {
  const findings = [];
  // Match numbered items with optional confidence tags
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Match: "1. [HIGH] claim" or "1. claim" or "- claim" or "• claim"
    const match = line.match(/^[\d\-\•\*]+[\.\)]\s*(?:\[?(HIGH|MEDIUM|LOW)\]?\s*)?(.+)/i);
    if (match) {
      const confidence = (match[1] || 'medium').toLowerCase();
      const claim = match[2].trim();
      if (claim.length > 10) { // Skip too-short claims
        findings.push({ claim, confidence });
      }
    }
  }
  return findings;
}

/**
 * Extract key findings from page content (with retry)
 * Uses simple numbered list format for reliability
 */
export async function extractFindings(content, query, options = {}) {
  // Keep content short — gemma4 is a reasoning model that uses many tokens for
  // its thinking trace. Sending large content pushes total tokens over budget
  // and results in truncated/empty responses.
  const maxChars = options.maxChars || 1200;
  const truncatedContent = content.slice(0, maxChars);
  const maxRetries = options.retries || 2;
  
  // Simpler prompt - ask for numbered list, not JSON
  const prompt = `Extract 3-5 key facts from this source about: "${query}"

Source:
${truncatedContent}

List the most important factual claims as a numbered list.
Mark confidence: [HIGH] if clearly stated, [MEDIUM] if implied, [LOW] if uncertain.

Format each line as:
1. [HIGH] The factual claim here
2. [MEDIUM] Another fact

Only facts, no opinions. Be concise.`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await generate(prompt, { ...options, maxTokens: 600 });
      
      // First try: parse as numbered list (most reliable)
      let findings = parseNumberedList(response);
      if (findings.length > 0) {
        return findings;
      }
      
      // Fallback: try JSON parsing
      const parsed = parseJSON(response);
      if (parsed?.findings && parsed.findings.length > 0) {
        return parsed.findings;
      }
      
      // NOTE: We intentionally do NOT fall back to raw LLM sentences here.
      // Returning ungrounded sentences as facts causes hallucination propagation.
      // Return empty and let the caller handle the gap.
      if (attempt === maxRetries) {
        console.log('   ⚠️ extractFindings: all parsing attempts failed — returning []');
        return [];
      }

      if (attempt < maxRetries) {
        console.log(`   🔄 Retry ${attempt}/${maxRetries} (no findings parsed)`);
      }
    } catch (e) {
      if (attempt < maxRetries) {
        console.log(`   🔄 Retry ${attempt}/${maxRetries}: ${e.message}`);
      } else {
        console.log('extractFindings error:', e.message);
      }
    }
  }
  return [];
}

/**
 * Parse leads from numbered list
 */
function parseLeadsList(text) {
  const leads = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^[\d\-\•\*]+[\.\)]\s*(?:\[?(HIGH|MEDIUM|LOW)\]?\s*)?(.+)/i);
    if (match) {
      const priority = (match[1] || 'medium').toLowerCase();
      const topic = match[2].trim();
      if (topic.length > 5) {
        leads.push({ topic, priority, reason: 'Related topic from source' });
      }
    }
  }
  return leads;
}

/**
 * Extract leads (related topics worth following)
 */
export async function extractLeads(content, query, options = {}) {
  const maxChars = options.maxChars || 2000;
  const truncatedContent = content.slice(0, maxChars);
  
  // Simpler prompt - numbered list
  const prompt = `What 2-3 related topics from this source would help understand: "${query}"

Source (excerpt):
${truncatedContent.slice(0, 800)}

List topics that deserve follow-up research:
1. [HIGH] Topic name
2. [MEDIUM] Another topic

Just the topic names, marked by priority.`;

  try {
    const response = await generate(prompt, { ...options, maxTokens: 400 });
    
    // Try numbered list first
    let leads = parseLeadsList(response);
    if (leads.length > 0) return leads;
    
    // Fallback to JSON
    const parsed = parseJSON(response);
    return parsed?.leads || [];
  } catch (e) {
    console.log('extractLeads error:', e.message);
    return [];
  }
}

/**
 * Generate research perspectives/angles for a topic
 */
export async function generatePerspectives(query, options = {}) {
  const prompt = `You are a research assistant planning a comprehensive research approach.

Research question: "${query}"

Generate 4-6 different search angles/perspectives to research this topic comprehensively.
Each perspective should lead to different types of sources and information.

Think like a Wikipedia editor doing background research.

Respond with ONLY valid JSON:
{
  "perspectives": [
    {"angle": "short name", "query": "search query to use", "why": "what this will reveal"},
    {"angle": "another angle", "query": "search query", "why": "reason"}
  ]
}

Be strategic - cover different aspects (definition, history, mechanism, debate, recent developments, etc.)`;

  try {
    const response = await generate(prompt, { ...options, maxTokens: 800 });
    const parsed = parseJSON(response);
    return parsed?.perspectives || [];
  } catch (e) {
    console.log('generatePerspectives error:', e.message);
    return null; // Return null to trigger fallback
  }
}

/**
 * Parse synthesis from structured text response
 */
function parseSynthesisText(text) {
  const result = { summary: '', keyPoints: [], consensus: [], debates: [], gaps: [] };

  // Strip markdown bold markers for easier parsing
  const plain = text.replace(/\*\*/g, '');

  // Extract SUMMARY section
  const summaryMatch = plain.match(/SUMMARY[:\s]*\n?([\s\S]*?)(?=\n\s*(?:CONSENSUS|DEBATES?|GAPS?|KEY|##|\*\*|$))/i);
  if (summaryMatch) {
    result.summary = summaryMatch[1].replace(/^[#*\-\s]+/, '').trim().slice(0, 600);
  }
  if (!result.summary) {
    // Fallback: first substantial paragraph
    const firstPara = plain.split(/\n\n+/)[0];
    result.summary = firstPara.trim().slice(0, 500);
  }

  // Generic section extractor — handles both plain headers and markdown headers
  const sectionRegex = (keywords) =>
    new RegExp(
      `(?:${keywords})[:\\s]*\\n?([\\s\\S]*?)(?=\\n\\s*(?:SUMMARY|CONSENSUS|DEBATES?|GAPS?|KEY FINDINGS?|##|$))`,
      'i'
    );

  const sections = {
    consensus: sectionRegex('CONSENSUS|AGREEMENT|SOURCES? AGREE'),
    debates: sectionRegex('DEBATES?|DISAGREEMENTS?|CONTRADICT|UNCERTAINT'),
    gaps: sectionRegex('GAPS?|MISSING|UNEXPLORED|NEEDS? MORE'),
  };

  for (const [key, regex] of Object.entries(sections)) {
    const match = plain.match(regex);
    if (match) {
      const items = match[1]
        .split('\n')
        .map(l => l.replace(/^[\d\-\•\*\#]+[\.\):]?\s*/, '').trim())
        .filter(l => l.length > 8 && !/^[A-Z\s]+:$/.test(l)); // skip bare headers
      result[key] = items.slice(0, 6);
    }
  }

  return result;
}

/**
 * Synthesize findings into a coherent summary
 *
 * @param {Array} findings
 * @param {Array} sources
 * @param {string} query
 * @param {object} [options]
 * @param {object} [options.sourceExcerpts]  map of claim → source passage
 * @param {Array}  [options.clusters]        corroboration clusters
 * @param {Array}  [options.contradictions]  detected contradictions
 */
export async function synthesizeFindings(findings, sources, query, options = {}) {
  const { sourceExcerpts = {}, clusters = [], contradictions = [] } = options;

  // Cap at 10 findings and trim excerpts to keep prompt small enough for fast inference
  const findingsText = findings.slice(0, 10).map((f, i) => {
    const excerpt = sourceExcerpts[f.claim];
    const corrobInfo = (() => {
      const cluster = clusters.find(cl => cl.claims.some(c => c.claim === f.claim));
      if (cluster) return ` [${cluster.uniqueDomainCount || 1} src]`;
      return '';
    })();
    const groundInfo = typeof f.groundingScore === 'number'
      ? ` (${(f.groundingScore * 100).toFixed(0)}% grounded)`
      : '';
    let line = `${i + 1}. ${f.claim}${corrobInfo}${groundInfo}`;
    if (excerpt) line += ` — "${excerpt.slice(0, 100)}"`;
    return line;
  }).join('\n');

  const contradictionText = contradictions.length > 0
    ? '\nConflicting information detected:\n' +
      contradictions.map(c =>
        `- "${c.claim1}" vs "${c.claim2}"`
      ).join('\n')
    : '';

  // Simpler structured prompt
  const prompt = `Synthesize these research findings about: "${query}"

Findings (with source excerpts for verification):
${findingsText}
${contradictionText}

Verify claims against their excerpts. If a claim isn't supported by its excerpt, note the discrepancy.

Write a brief synthesis with these sections:

SUMMARY: (2-3 sentences answering the question)

CONSENSUS: (what sources agree on)
- point 1
- point 2

DEBATES: (disagreements or uncertainties)
- point 1

GAPS: (what needs more research)
- point 1`;

  try {
    const response = await generate(prompt, { ...options, maxTokens: 800, timeout: 240000 });
    
    // Parse structured text (prompt asks for SUMMARY/CONSENSUS/DEBATES format, not JSON)
    const textParsed = parseSynthesisText(response);
    if (textParsed.summary || textParsed.consensus.length) {
      return textParsed;
    }
    
    // Last resort: use raw response as summary
    return { 
      summary: response.slice(0, 500), 
      keyPoints: [], 
      consensus: [], 
      debates: [], 
      gaps: [] 
    };
  } catch (e) {
    console.log('synthesizeFindings error:', e.message);
    return { summary: '', keyPoints: [], consensus: [], debates: [], gaps: [] };
  }
}

/**
 * Check if Ollama is available
 */
export async function isAvailable() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Warm up the model — sends a minimal prompt to force the model into VRAM
 * before the real research starts, avoiding timeout on first extraction call.
 */
export async function warmup(model = DEFAULT_MODEL) {
  try {
    console.log(`   🔥 Warming up ${model}...`);
    const start = Date.now();
    await generate('Say "ready" in one word.', {
      model,
      maxTokens: 5,
      timeout: 300000
    });
    console.log(`   ✅ Model ready (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  Warmup failed: ${e.message}`);
    return false;
  }
}
