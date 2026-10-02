import React from 'react';
import {
  Users,
  Package,
  Activity,
  Layers,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  BarChart3,
  Percent,
} from 'lucide-react';
import { PreparedDataset, DataSplit, ModelBenchmarkResult } from '../types/recsys';
import { SampleDatasetDefinition } from '../data/sampleDatasets';
import { MetricCard, Badge } from './common/UIComponents';
import { DistributionBar } from './common/Charts';
import { ActiveTab } from './Header';

interface OverviewViewProps {
  dataset: PreparedDataset | null;
  currentDatasetDef: SampleDatasetDefinition | null;
  split: DataSplit | null;
  benchmarks: ModelBenchmarkResult[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenUploadModal: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  dataset,
  currentDatasetDef,
  split,
  benchmarks,
  onNavigate,
  onOpenUploadModal,
}) => {
  if (!dataset) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-2xl mx-auto my-12">
        <Activity className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Dataset Loaded</h3>
        <p className="text-sm text-slate-400 mb-6">
          Please select one of the built-in sample datasets or upload a custom CSV/TSV interaction file to get started.
        </p>
        <button
          onClick={onOpenUploadModal}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
        >
          Load Data Now <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const summary = dataset.summary;
  const startDateStr = summary.minTimestamp ? new Date(summary.minTimestamp).toLocaleDateString() : 'N/A';
  const endDateStr = summary.maxTimestamp ? new Date(summary.maxTimestamp).toLocaleDateString() : 'N/A';
  const dateRangeStr = summary.minTimestamp ? `${startDateStr} → ${endDateStr}` : 'Timestamps not mapped';

  // Category distribution calculation
  const categoryCounts = new Map<string, number>();
  for (const item of dataset.items.values()) {
    const cat = item.category || 'Uncategorized';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  const colors = [
    'bg-indigo-500',
    'bg-cyan-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-rose-500',
  ];

  const catSegments = Array.from(categoryCounts.entries())
    .map(([cat, count], idx) => ({
      label: cat,
      count,
      pct: Number(((count / dataset.items.size) * 100).toFixed(1)),
      color: colors[idx % colors.length],
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner Hero */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <Badge variant="primary" size="md">
              {currentDatasetDef?.domain || 'Custom Domain'}
            </Badge>
            <Badge variant="success" size="md">
              <CheckCircle2 className="w-3.5 h-3.5" /> Data Cleaned & Prepared
            </Badge>
            {split?.leakageCheckPassed && (
              <Badge variant="neutral" size="md">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Non-Leaking Split ({split.config.method})
              </Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
            {currentDatasetDef?.name || 'Custom Interaction Dataset'}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {currentDatasetDef?.description ||
              'Prepared interaction matrix ready for personalized ranking, multi-model evaluation, and popularity bias analysis.'}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('ranking')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition shadow-md shadow-indigo-600/25"
            >
              <Sparkles className="w-4 h-4" /> Generate Recommendations
            </button>
            <button
              onClick={() => onNavigate('evaluation')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition border border-slate-700/80"
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" /> Run Benchmark Evaluation
            </button>
            <button
              onClick={() => onNavigate('dataprep')}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-2 transition border border-slate-800"
            >
              <SlidersHorizontal className="w-4 h-4 text-slate-400" /> Adjust Data Prep
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
      </div>

      {/* High-Level Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Total Users"
          value={summary.totalUsers}
          subtitle={`Avg ${summary.avgInteractionsPerUser} items/user`}
          icon={<Users className="w-4 h-4" />}
          tooltip="Unique user identifiers in the prepared dataset"
        />
        <MetricCard
          title="Catalog Items"
          value={summary.totalItems}
          subtitle={`Avg ${summary.avgInteractionsPerItem} ratings/item`}
          icon={<Package className="w-4 h-4" />}
          tooltip="Unique items in catalog"
        />
        <MetricCard
          title="Interactions"
          value={summary.totalInteractions}
          subtitle={`${summary.totalPositiveInteractions} marked positive`}
          badge={`${((summary.totalPositiveInteractions / (summary.totalInteractions || 1)) * 100).toFixed(0)}% Pos`}
          badgeVariant="success"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          title="Matrix Sparsity"
          value={`${summary.sparsityPct}%`}
          subtitle="Observed interaction density"
          icon={<Percent className="w-4 h-4" />}
          tooltip="Percentage of unobserved user-item pairs in full |U| x |I| matrix"
        />
        <MetricCard
          title="Categories"
          value={summary.categories.length || 1}
          subtitle={`${summary.userSegments.length} user cohorts`}
          icon={<Layers className="w-4 h-4" />}
        />
        <MetricCard
          title="Date Span"
          value={summary.minTimestamp ? '90 Days' : 'Static'}
          subtitle={dateRangeStr}
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      {/* Pipeline Stepper & Progress */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-white">Recommendation System Pipeline Status</h3>
            <p className="text-xs text-slate-400">
              End-to-end workflow from raw data ingestion to fair recommendation delivery.
            </p>
          </div>
          <Badge variant="primary" size="md">
            Production Ready Pipeline
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Step 1 */}
          <div
            onClick={() => onNavigate('dataprep')}
            className="cursor-pointer bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 1</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition mb-1">
              Data Ingestion & Mapping
            </h4>
            <p className="text-xs text-slate-400">
              {dataset.rawRowCount} raw records parsed, verified types & missing values.
            </p>
          </div>

          {/* Step 2 */}
          <div
            onClick={() => onNavigate('dataprep')}
            className="cursor-pointer bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 2</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition mb-1">
              Cleansing & K-Core
            </h4>
            <p className="text-xs text-slate-400">
              Deduplicated & filtered ({dataset.keptRowCount} interactions retained).
            </p>
          </div>

          {/* Step 3 */}
          <div
            onClick={() => onNavigate('evaluation')}
            className="cursor-pointer bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 3</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition mb-1">
              Data Splitting
            </h4>
            <p className="text-xs text-slate-400">
              {split?.config.method.replace('_', ' ')} (Train: {split?.train.length}, Test: {split?.test.length}).
            </p>
          </div>

          {/* Step 4 */}
          <div
            onClick={() => onNavigate('ranking')}
            className="cursor-pointer bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 4</span>
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition mb-1">
              Ranking & Signals
            </h4>
            <p className="text-xs text-slate-400">
              Popularity, Item-CF, User-CF, Latent SVD & Content models ready.
            </p>
          </div>

          {/* Step 5 */}
          <div
            onClick={() => onNavigate('bias')}
            className="cursor-pointer bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Step 5</span>
              <BarChart3 className="w-4 h-4 text-amber-400" />
            </div>
            <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition mb-1">
              Bias & Mitigation
            </h4>
            <p className="text-xs text-slate-400">
              Popularity discount penalty & category diversity reranking simulator.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Catalog Structure & Domain Assumptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Catalog Category Distribution */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> Catalog Category Breakdown
            </h3>
            <span className="text-xs text-slate-400">{summary.categories.length} Categories</span>
          </div>

          <DistributionBar segments={catSegments.slice(0, 6)} />

          <div className="mt-6 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Item Metadata Highlights
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 block">Most Popular Item:</span>
                <span className="text-white font-medium truncate block">
                  {Array.from(dataset.items.values()).sort((a, b) => b.popularityCount - a.popularityCount)[0]?.name || 'N/A'}
                </span>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 block">Average Item Rating:</span>
                <span className="text-white font-medium">
                  {(
                    Array.from(dataset.items.values()).reduce((sum, i) => sum + i.avgRating, 0) /
                    (dataset.items.size || 1)
                  ).toFixed(2)} / 5.0
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Domain Assumptions & Semantics Documentation */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" /> Domain Semantics & Assumptions
            </h3>
            <Badge variant="outline" size="sm">
              Documented Specs
            </Badge>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="font-semibold text-indigo-300 block mb-0.5">User Definition:</span>
              <span>
                Each unique user ID represents an individual entity. User history encompasses all chronological interactions after deduplication.
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="font-semibold text-indigo-300 block mb-0.5">Item & Feedback Definition:</span>
              <span>
                Items correspond to catalog SKUs/titles. Positive interactions are defined via explicit threshold (rating ≥ 4.0 or purchase event), used for ground-truth recall and precision calculation.
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="font-semibold text-indigo-300 block mb-0.5">Temporal Split Principle:</span>
              <span>
                Data is partitioned chronologically (temporal holdout) without leakage: the test set contains future interactions relative to training data.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
