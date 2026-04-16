#!/usr/bin/env node
/**
 * Deep Research Agent - CLI
 * 
 * Usage:
 *   npm start "What causes aurora borealis?"
 *   npm start "History of QWERTY" -- --depth=deep --time=15m -v
 */

import 'dotenv/config';
import { ResearchAgent } from './index.js';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';

const options = {
  depth: { type: 'string', short: 'd', default: 'medium' },
  time: { type: 'string', short: 't', default: '5m' },
  output: { type: 'string', short: 'o' },
  verbose: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false }
};

function parseTime(timeStr) {
  const match = timeStr.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 300; // default 5 min
  
  const value = parseInt(match[1]);
  const unit = match[2] || 's';
  
  switch (unit) {
    case 'h': return value * 3600;
    case 'm': return value * 60;
    default: return value;
  }
}

function getMaxSources(depth) {
  switch (depth) {
    case 'shallow': return 4;
    case 'deep': return 15;
    default: return 8;
  }
}

function showHelp() {
  console.log(`
🕳️🐇 Deep Research Agent

Usage:
  npm start "<query>" [-- options]

Options:
  -d, --depth     Research depth: shallow, medium, deep (default: medium)
  -t, --time      Time budget: e.g., 5m, 10m, 1h (default: 5m)
  -o, --output    Output file path (default: stdout)
  -v, --verbose   Show progress (default: false)
  -h, --help      Show this help

Examples:
  npm start "What causes aurora borealis?"
  npm start "History of the QWERTY keyboard" -- --depth=deep --time=15m
  npm start "Climate change solutions" -- -d medium -t 10m -o research.md -v

Depth levels:
  shallow   Quick overview, 3-5 sources, ~2 min
  medium    Balanced depth, 5-10 sources, ~5 min
  deep      Thorough research, 10-20 sources, ~15 min
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const query = positionals.join(' ');
  
  if (!query) {
    console.error('❌ Error: No research query provided');
    console.error('   Usage: npm start "your question here"');
    console.error('   Run with --help for more options');
    process.exit(1);
  }

  console.log(`🕳️ Entering the rabbit hole: "${query}"...`);
  console.log();

  const timeBudget = parseTime(values.time);
  const maxSources = getMaxSources(values.depth);

  try {
    const agent = new ResearchAgent({
      depth: values.depth,
      timeBudget,
      maxSources,
      parallelReads: 1,      // Serial reads — GPU can only handle one LLM call at a time
      searchDelayMs: 1500,
      minConfidence: 0.6,
      verbose: values.verbose
    });

    const result = await agent.research(query);
    const session = result.session;

    // Calculate stats
    const readSources = (session.sources || []).filter(s => s.read);
    const allFindings = readSources.flatMap(s => s.findings || []);
    const timeElapsed = session.endTime 
      ? ((session.endTime - session.startTime) / 1000).toFixed(1)
      : '?';

    if (values.output) {
      await writeFile(values.output, result.markdown);
      console.log(`\n📄 Report saved to: ${values.output}`);
    } else {
      console.log('\n' + result.markdown);
    }

    // Summary stats
    console.log(`\n---`);
    console.log(`📊 Sources: ${readSources.length} | Findings: ${allFindings.length} | Time: ${timeElapsed}s`);
    
    // Save JSON output
    console.log(`💾 Session saved: output/${session.id}.json`);
    
  } catch (error) {
    console.error(`\n❌ Research failed: ${error.message}`);
    if (values.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
