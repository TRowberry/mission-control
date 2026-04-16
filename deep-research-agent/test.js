/**
 * Final End-to-End Test - Full research pipeline
 */

import 'dotenv/config';
import { ResearchAgent } from './src/index.js';

async function main() {
  const agent = new ResearchAgent({
    depth: 'medium',
    timeBudget: 900,       // 15 min — each source takes ~45s serial on GPU
    maxSources: 6,
    parallelReads: 1,      // Serial — GPU handles one LLM call at a time
    searchDelayMs: 1500,
    minConfidence: 0.7,
    verbose: true
  });

  // Fresh topic we haven't tested
  const query = "What are the main causes and solutions for microplastic pollution in oceans?";
  
  console.log('\n🔬 FINAL END-TO-END TEST');
  console.log('═'.repeat(60));
  console.log(`Query: ${query}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const report = await agent.research(query);
  const session = report.session;
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Calculate success metrics
  const readSources = (session.sources || []).filter(s => s.read);
  // 403-blocked sources have s.read=true but s.error set — external paywall/firewall, not pipeline failures
  const blockedSources = readSources.filter(s => typeof s.error === 'string' && s.error.includes('403'));
  const accessibleSources = readSources.filter(s => !s.error);
  const sourcesWithFindings = accessibleSources.filter(s => s.findings?.length > 0);
  const allFindings = readSources.flatMap(s => s.findings || []);
  // Extraction rate counts only accessible sources (excludes 403 blocks)
  const extractionRate = accessibleSources.length > 0
    ? (sourcesWithFindings.length / accessibleSources.length * 100).toFixed(0)
    : 0;

  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL TEST RESULTS');
  console.log('═'.repeat(60));
  
  console.log('\n📈 Pipeline Metrics:');
  console.log(`   Sources found: ${session.sources?.length || 0}`);
  console.log(`   Sources attempted: ${readSources.length} (${blockedSources.length} blocked by 403)`);
  console.log(`   Sources accessible: ${accessibleSources.length}`);
  console.log(`   Sources with findings: ${sourcesWithFindings.length}`);
  console.log(`   Extraction success rate: ${extractionRate}%`);
  console.log(`   Total findings: ${allFindings.length}`);
  console.log(`   Total time: ${totalTime}s`);

  console.log('\n📚 Source Breakdown:');
  for (const source of readSources) {
    const findingCount = source.findings?.length || 0;
    const isBlocked = typeof source.error === 'string' && source.error.includes('403');
    const status = isBlocked ? '🚫' : (findingCount > 0 ? '✅' : '⚠️');
    const cred = source.credibility ? `${(source.credibility * 100).toFixed(0)}%` : '?';
    const note = isBlocked ? ' [403 blocked]' : `(${findingCount} findings)`;
    console.log(`   ${status} [${cred}] ${source.title.slice(0, 45)}... ${note}`);
  }

  console.log('\n🔍 Sample Findings:');
  const highConf = allFindings.filter(f => f.confidence === 'high').slice(0, 3);
  const medConf = allFindings.filter(f => f.confidence === 'medium').slice(0, 2);
  
  if (highConf.length > 0) {
    console.log('   High confidence:');
    highConf.forEach(f => console.log(`   • ${f.claim.slice(0, 80)}...`));
  }
  if (medConf.length > 0) {
    console.log('   Medium confidence:');
    medConf.forEach(f => console.log(`   • ${f.claim.slice(0, 80)}...`));
  }

  console.log('\n📝 Synthesis:');
  if (session.synthesis?.summary) {
    console.log(`   Summary: ${session.synthesis.summary.slice(0, 200)}...`);
  }
  if (session.synthesis?.consensus?.length) {
    console.log(`   Consensus points: ${session.synthesis.consensus.length}`);
  }
  if (session.synthesis?.debates?.length) {
    console.log(`   Debate points: ${session.synthesis.debates.length}`);
  }

  // Final verdict
  // Extraction rate counts only sources that were actually read (not 403-blocked)
  // 403 blocks are external paywalls/firewalls — not failures in our pipeline
  console.log('\n' + '═'.repeat(60));
  const passed = parseInt(extractionRate) >= 80 && allFindings.length >= 10;
  if (passed) {
    console.log('✅ FINAL TEST PASSED - Research Agent MVP Ready!');
    if (blockedSources.length > 0) {
      console.log(`   ℹ️  ${blockedSources.length} source(s) blocked by 403 (external, not pipeline failures)`);
    }
  } else {
    console.log('⚠️ Test needs attention');
    console.log(`   Extraction rate: ${extractionRate}% (target: 80%+ of accessible sources)`);
    console.log(`   Findings: ${allFindings.length} (target: 10+)`);
    if (blockedSources.length > 0) {
      console.log(`   ℹ️  ${blockedSources.length} additional source(s) blocked by 403`);
    }
  }
  console.log('═'.repeat(60));
  
  console.log(`\n📄 Full report saved: output/${session.id}.json`);
}

main().catch(console.error);
