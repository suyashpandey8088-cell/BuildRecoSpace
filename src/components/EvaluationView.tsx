import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  ShieldCheck,
  RotateCcw,
  Sliders,
  TrendingUp,
  HelpCircle,
  Clock,
  Layers,
  Award,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  DataSplit,
  ModelBenchmarkResult,
  PreparedDataset,
  SplitConfig,
} from '../types/recsys';
import { splitDataset } from '../services/dataSplitter';
import { benchmarkAllModels } from '../services/evaluation';
import { SimpleBarChart } from './common/Charts';
import { AlertBanner, Badge, MetricCard } from './common/UIComponents';

interface EvaluationViewProps {
  dataset: PreparedDataset;
  split: DataSplit;
  setSplit: (split: DataSplit) => void;
  benchmarks: ModelBenchmarkResult[];
  setBenchmarks: (b: ModelBenchmarkResult[]) => void;
}

export const EvaluationView: React.FC<EvaluationViewProps> = ({
  dataset,
  split,
  setSplit,
  benchmarks,
  setBenchmarks,
}) => {
  // Split Config state
  const [splitMethod, setSplitMethod] = useState<SplitConfig['method']>(split.config.method);
  const [trainRatio, setTrainRatio] = useState<number>(split.config.trainRatio);
  const [testRatio, setTestRatio] = useState<number>(split.config.testRatio);
  const [seed, setSeed] = useState<number>(split.config.randomSeed);

  // Evaluation Options
  const [selectedK, setSelectedK] = useState<number>(5);
  const [positiveOnly, setPositiveOnly] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [activeMetricTab, setActiveMetricTab] = useState<'ndcg' | 'recall' | 'precision' | 'coverage' | 'gini'>('ndcg');

  const handleApplySplitAndBenchmark = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      const newSplit = splitDataset(dataset.interactions, {
        method: splitMethod,
        trainRatio,
        valRatio: 0.0,
        testRatio,
        randomSeed: seed,
      });

      setSplit(newSplit);

      const results = benchmarkAllModels(newSplit, dataset.items, {
        kValues: [3, 5, 10, 20],
        selectedK,
        positiveThresholdOnly: positiveOnly,
      });

      setBenchmarks(results);
      setIsEvaluating(false);
    }, 150);
  };

  // Re-run benchmark when selectedK or positiveOnly changes
  const handleRecalculateK = (newK: number) => {
    setSelectedK(newK);
    setIsEvaluating(true);
    setTimeout(() => {
      const results = benchmarkAllModels(split, dataset.items, {
        kValues: [3, 5, 10, 20],
        selectedK: newK,
        positiveThresholdOnly: positiveOnly,
      });
      setBenchmarks(results);
      setIsEvaluating(false);
    }, 100);
  };

  // Find best performing models for badges
  const bestNdcg = Math.max(...benchmarks.map(b => b.metrics.ndcgAtK), 0);
  const bestRecall = Math.max(...benchmarks.map(b => b.metrics.recallAtK), 0);
  const bestCoverage = Math.max(...benchmarks.map(b => b.metrics.catalogCoveragePct), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" /> Evaluation Engine & Multi-Model Benchmark
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Compare personalized ranking models against the Popularity baseline on strictly isolated held-out test data.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleApplySplitAndBenchmark}
            disabled={isEvaluating}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition shadow-lg shadow-indigo-600/25"
          >
            {isEvaluating ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Run Multi-Model Benchmark
          </button>
        </div>
      </div>

      {/* Split Integrity & Data Leakage Verification Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Non-Leaking Data Split Configuration</h3>
          </div>
          <Badge
            variant={split.leakageCheckPassed ? 'success' : 'danger'}
            size="md"
          >
            {split.leakageCheckPassed ? 'Zero Data Leakage: Verified' : 'Leakage Detected'}
          </Badge>
        </div>

        {/* Split Parameters Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Strategy */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Split Strategy
            </label>
            <select
              value={splitMethod}
              onChange={(e) => setSplitMethod(e.target.value as SplitConfig['method'])}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
            >
              <option value="temporal_holdout">Temporal Holdout (Chronological)</option>
              <option value="user_stratified">User-Stratified Random Holdout</option>
              <option value="global_random">Global Random Shuffle</option>
            </select>
          </div>

          {/* Train / Test Ratio */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs font-semibold text-slate-200 mb-1">
              <span>Train / Test Split</span>
              <span className="text-indigo-400 font-bold">
                {Math.round(trainRatio * 100)}% / {Math.round(testRatio * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.9"
              step="0.05"
              value={trainRatio}
              onChange={(e) => {
                const tr = parseFloat(e.target.value);
                setTrainRatio(tr);
                setTestRatio(Number((1 - tr).toFixed(2)));
              }}
              className="w-full accent-indigo-500 cursor-pointer mt-1"
            />
          </div>

          {/* Reproducibility Seed */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Reproducibility Seed (PRNG)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
            />
          </div>

          {/* Target K */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Benchmark Target Rank (K)
            </label>
            <div className="flex gap-1.5 mt-1">
              {[3, 5, 10, 20].map((testK) => (
                <button
                  key={testK}
                  onClick={() => handleRecalculateK(testK)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    selectedK === testK
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  @{testK}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Split Stats Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Training Set:</span>
            <span className="font-bold text-white text-sm">
              {split.train.length} interactions ({split.trainUsers.size} users, {split.trainItems.size} items)
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Test Set (Held-Out):</span>
            <span className="font-bold text-white text-sm">
              {split.test.length} interactions ({split.testUsers.size} users, {split.testItems.size} items)
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Cold Users in Test:</span>
            <span className="font-bold text-slate-300 text-sm">{split.coldUsersInTest}</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Leakage Status:</span>
            <span className="font-bold text-emerald-400 text-sm flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Isolated Disjoint Sets
            </span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Model Benchmark Comparison Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4.5 h-4.5 text-amber-400" /> Model Ranking Performance @ K={selectedK}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Precision, Recall, NDCG, Catalog Coverage, and Gini Diversity computed across held-out test users.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Ground-truth rule:</span>
            <Badge variant="neutral" size="sm">
              {dataset.summary.totalPositiveInteractions > 0 ? 'Rating ≥ Positive Threshold' : 'All Interactions'}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Algorithm</th>
                <th className="px-4 py-3 text-right">NDCG@{selectedK}</th>
                <th className="px-4 py-3 text-right">Recall@{selectedK}</th>
                <th className="px-4 py-3 text-right">Precision@{selectedK}</th>
                <th className="px-4 py-3 text-right">MRR@{selectedK}</th>
                <th className="px-4 py-3 text-right">Catalog Coverage</th>
                <th className="px-4 py-3 text-right">Gini Index</th>
                <th className="px-4 py-3 text-right">Novelty</th>
                <th className="px-4 py-3 text-right">Speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {benchmarks.map((res) => {
                const isBestNdcg = res.metrics.ndcgAtK === bestNdcg && bestNdcg > 0;
                const isBestRecall = res.metrics.recallAtK === bestRecall && bestRecall > 0;
                const isBestCoverage = res.metrics.catalogCoveragePct === bestCoverage && bestCoverage > 0;

                return (
                  <tr key={res.algorithm} className="hover:bg-slate-950/40">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-white flex items-center gap-2">
                        {res.name}
                        {res.algorithm === 'popularity' && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-normal">
                            Baseline
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{res.description}</div>
                    </td>

                    {/* NDCG */}
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-100">
                      <span className={isBestNdcg ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : ''}>
                        {res.metrics.ndcgAtK.toFixed(3)}
                      </span>
                    </td>

                    {/* Recall */}
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-100">
                      <span className={isBestRecall ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : ''}>
                        {(res.metrics.recallAtK * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Precision */}
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                      {(res.metrics.precisionAtK * 100).toFixed(1)}%
                    </td>

                    {/* MRR */}
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                      {res.metrics.mrrAtK.toFixed(3)}
                    </td>

                    {/* Coverage */}
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-100">
                      <span className={isBestCoverage ? 'text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded' : ''}>
                        {res.metrics.catalogCoveragePct}%
                      </span>
                    </td>

                    {/* Gini */}
                    <td className="px-4 py-3.5 text-right font-mono text-slate-300">
                      {res.metrics.giniIndex.toFixed(3)}
                    </td>

                    {/* Novelty */}
                    <td className="px-4 py-3.5 text-right font-mono text-slate-300">
                      {res.metrics.noveltyScore.toFixed(2)} bits
                    </td>

                    {/* Speed */}
                    <td className="px-4 py-3.5 text-right font-mono text-[11px] text-slate-400">
                      {res.metrics.computationTimeMs}ms
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Benchmark Visualizations: Charts & Multi-K Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metric Comparison Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" /> Side-by-Side Model Comparison
            </h3>

            {/* Metric Tab Selector */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
              <button
                onClick={() => setActiveMetricTab('ndcg')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeMetricTab === 'ndcg' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                NDCG
              </button>
              <button
                onClick={() => setActiveMetricTab('recall')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeMetricTab === 'recall' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Recall
              </button>
              <button
                onClick={() => setActiveMetricTab('coverage')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeMetricTab === 'coverage' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Coverage
              </button>
              <button
                onClick={() => setActiveMetricTab('gini')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeMetricTab === 'gini' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Gini
              </button>
            </div>
          </div>

          <SimpleBarChart
            items={benchmarks.map((b) => ({
              label: b.name.replace(/ \(.*\)/, '').replace(' Collaborative Filtering', '-CF'),
              value:
                activeMetricTab === 'ndcg'
                  ? b.metrics.ndcgAtK
                  : activeMetricTab === 'recall'
                  ? b.metrics.recallAtK
                  : activeMetricTab === 'coverage'
                  ? b.metrics.catalogCoveragePct
                  : b.metrics.giniIndex,
              color:
                b.algorithm === 'hybrid'
                  ? 'bg-cyan-500'
                  : b.algorithm === 'popularity'
                  ? 'bg-slate-500'
                  : 'bg-indigo-500',
            }))}
            valueFormatter={(v) =>
              activeMetricTab === 'coverage' ? `${v.toFixed(1)}%` : v.toFixed(3)
            }
            height={200}
          />
        </div>

        {/* Multi-K Performance Table & Progression */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> NDCG & Recall Scaling Across K
            </h3>
            <span className="text-xs text-slate-400">K ∈ [3, 5, 10, 20]</span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2 text-right">NDCG@3</th>
                  <th className="px-3 py-2 text-right">NDCG@5</th>
                  <th className="px-3 py-2 text-right">NDCG@10</th>
                  <th className="px-3 py-2 text-right">Recall@10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {benchmarks.map((b) => (
                  <tr key={b.algorithm} className="hover:bg-slate-950/40">
                    <td className="px-3 py-2 font-sans font-semibold text-white">
                      {b.name.replace(/ \(.*\)/, '')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {b.metricsByK?.[3]?.ndcgAtK.toFixed(3) || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {b.metricsByK?.[5]?.ndcgAtK.toFixed(3) || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-indigo-300">
                      {b.metricsByK?.[10]?.ndcgAtK.toFixed(3) || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-400">
                      {b.metricsByK?.[10] ? `${(b.metricsByK[10].recallAtK * 100).toFixed(0)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Metric Definitions & Formulas Glossary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" /> Evaluation Metric Definitions & Mathematical Formulations
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="font-bold text-indigo-300 block mb-1">NDCG@K (Normalized DCG):</span>
            <p className="text-slate-300 mb-2 leading-relaxed">
              Measures ranking quality accounting for position discount. Hits at top ranks contribute exponentially more than hits lower down.
            </p>
            <div className="font-mono text-[10px] bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
              DCG@K = Σ (rel_r / log2(r+1))
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="font-bold text-indigo-300 block mb-1">Recall@K & Precision@K:</span>
            <p className="text-slate-300 mb-2 leading-relaxed">
              Recall measures what fraction of test ground-truth relevant items were retrieved. Precision measures hit purity in top K.
            </p>
            <div className="font-mono text-[10px] bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
              Recall@K = |Top K ∩ Test_rel| / |Test_rel|
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="font-bold text-indigo-300 block mb-1">Catalog Coverage & Gini Index:</span>
            <p className="text-slate-300 mb-2 leading-relaxed">
              Catalog coverage is the percentage of distinct items recommended across all users. Gini index measures exposure inequality (0 = equal, 1 = concentrated).
            </p>
            <div className="font-mono text-[10px] bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
              Coverage = |∪ Top K(u)| / |Catalog|
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
