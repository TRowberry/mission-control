'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TestRun {
  id: string;
  timestamp: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  deployCommit?: string;
  deployBranch?: string;
  triggeredBy?: {
    displayName: string;
    avatar?: string;
  };
  suites?: any;
}

interface Stats {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  lastRun: string | null;
}

export default function QADashboard() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/qa/results?limit=50');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRuns(data.runs || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Failed to load QA data:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp: string) {
    return new Date(timestamp).toLocaleString();
  }

  function formatDuration(ms: number) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-8">QA Dashboard</h1>
          <div className="text-zinc-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">🧪 QA Dashboard</h1>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
          >
            ← Back to Settings
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="text-zinc-400 text-sm">Total Runs</div>
              <div className="text-2xl font-bold">{stats.totalRuns}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="text-zinc-400 text-sm">Pass Rate</div>
              <div className="text-2xl font-bold text-green-400">{stats.passRate}%</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="text-zinc-400 text-sm">Passed</div>
              <div className="text-2xl font-bold text-green-400">{stats.passedRuns}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="text-zinc-400 text-sm">Failed</div>
              <div className="text-2xl font-bold text-red-400">{stats.failedRuns}</div>
            </div>
          </div>
        )}

        {/* Test Runs List */}
        <div className="bg-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700">
            <h2 className="font-semibold">Recent Test Runs</h2>
          </div>
          
          {runs.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              No test runs yet. Run QA tests with <code className="bg-zinc-700 px-2 py-1 rounded">./deploy-with-qa.sh</code>
            </div>
          ) : (
            <div className="divide-y divide-zinc-700">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="p-4 hover:bg-zinc-700/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${run.passed ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div>
                        <div className="font-medium">
                          {run.passed ? '✅ Passed' : '❌ Failed'}
                          <span className="text-zinc-400 ml-2">
                            {run.passedTests}/{run.totalTests} tests
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          {formatDate(run.timestamp)}
                          {run.triggeredBy && ` • by ${run.triggeredBy.displayName}`}
                          {run.deployCommit && ` • ${run.deployCommit.slice(0, 7)}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-zinc-400">
                      {selectedRun?.id === run.id ? '▲' : '▼'}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedRun?.id === run.id && run.suites && (
                    <div className="mt-4 pl-6 space-y-3">
                      {Object.entries(run.suites).map(([suiteName, suite]: [string, any]) => (
                        <div key={suiteName} className="bg-zinc-900 rounded-lg p-3">
                          <div className="font-medium capitalize mb-2">
                            {suiteName} Tests
                            {suite.summary && (
                              <span className="text-zinc-400 ml-2 text-sm">
                                ({suite.summary.passed}/{suite.summary.total})
                              </span>
                            )}
                          </div>
                          {suite.error ? (
                            <div className="text-red-400 text-sm">{suite.error}</div>
                          ) : suite.tests ? (
                            <div className="space-y-1">
                              {suite.tests.map((test: any, i: number) => (
                                <div key={i} className="text-sm flex items-center gap-2">
                                  {test.passed ? (
                                    <span className="text-green-400">✓</span>
                                  ) : (
                                    <span className="text-red-400">✗</span>
                                  )}
                                  <span className={test.passed ? 'text-zinc-300' : 'text-red-300'}>
                                    {test.name}
                                  </span>
                                  {test.duration && (
                                    <span className="text-zinc-500">
                                      ({formatDuration(test.duration)})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-zinc-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Usage</h3>
          <div className="text-sm text-zinc-400 space-y-1">
            <p><code className="bg-zinc-700 px-2 py-0.5 rounded">./deploy-with-qa.sh</code> - Deploy and run QA tests</p>
            <p><code className="bg-zinc-700 px-2 py-0.5 rounded">./deploy-with-qa.sh --skip-qa</code> - Deploy without QA</p>
            <p><code className="bg-zinc-700 px-2 py-0.5 rounded">./deploy-with-qa.sh --block-on-fail</code> - Block deploy if QA fails</p>
          </div>
        </div>
      </div>
    </div>
  );
}
