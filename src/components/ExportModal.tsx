import React, { useState } from 'react';
import { Download, Check, FileJson, FileSpreadsheet, Copy } from 'lucide-react';
import { Modal } from './common/UIComponents';
import { DataSplit, ModelBenchmarkResult, PreparedDataset, UserRecommendationResult } from '../types/recsys';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: PreparedDataset | null;
  split: DataSplit | null;
  benchmarks: ModelBenchmarkResult[];
  lastRecommendation: UserRecommendationResult | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dataset,
  split,
  benchmarks,
  lastRecommendation,
}) => {
  const [copied, setCopied] = useState(false);

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPreparedDatasetCsv = () => {
    if (!dataset) return;
    const headers = ['user_id', 'item_id', 'value', 'is_positive', 'timestamp', 'item_name', 'category', 'user_segment'];
    const rows = dataset.interactions.map(i => [
      `"${i.userId}"`,
      `"${i.itemId}"`,
      i.value,
      i.isPositive ? 1 : 0,
      i.timestamp ? `"${new Date(i.timestamp).toISOString()}"` : '""',
      `"${i.itemName?.replace(/"/g, '""') || ''}"`,
      `"${i.itemCategory?.replace(/"/g, '""') || ''}"`,
      `"${i.userSegment?.replace(/"/g, '""') || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile('recospace_prepared_dataset.csv', csvContent, 'text/csv');
  };

  const exportBenchmarkJson = () => {
    const report = {
      exportTimestamp: new Date().toISOString(),
      datasetSummary: dataset?.summary,
      splitConfig: split?.config,
      splitStats: {
        trainInteractions: split?.train.length,
        valInteractions: split?.validation.length,
        testInteractions: split?.test.length,
        coldUsersInTest: split?.coldUsersInTest,
        coldItemsInTest: split?.coldItemsInTest,
        leakageCheckPassed: split?.leakageCheckPassed,
      },
      benchmarks: benchmarks.map(b => ({
        algorithm: b.algorithm,
        name: b.name,
        metrics: b.metrics,
        metricsByK: b.metricsByK,
      })),
      lastRecommendation,
    };

    downloadFile('recospace_evaluation_benchmark.json', JSON.stringify(report, null, 2), 'application/json');
  };

  const exportBenchmarkCsv = () => {
    if (benchmarks.length === 0) return;
    const headers = [
      'algorithm',
      'name',
      'k',
      'precision_at_k',
      'recall_at_k',
      'ndcg_at_k',
      'mrr_at_k',
      'catalog_coverage_pct',
      'user_coverage_pct',
      'gini_index',
      'novelty_score',
      'evaluated_users',
    ];

    const rows = benchmarks.map(b => [
      `"${b.algorithm}"`,
      `"${b.name}"`,
      b.metrics.k,
      b.metrics.precisionAtK,
      b.metrics.recallAtK,
      b.metrics.ndcgAtK,
      b.metrics.mrrAtK,
      b.metrics.catalogCoveragePct,
      b.metrics.userCoveragePct,
      b.metrics.giniIndex,
      b.metrics.noveltyScore,
      b.metrics.evaluatedUserCount,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile('recospace_benchmark_results.csv', csvContent, 'text/csv');
  };

  const copyReproducibilityManifest = () => {
    const manifest = {
      platform: 'RecoSpace Engine',
      reproducibilitySeed: split?.config.randomSeed || 42,
      splitMethod: split?.config.method,
      trainRatio: split?.config.trainRatio,
      testRatio: split?.config.testRatio,
      datasetStats: dataset?.summary,
      generatedAt: new Date().toISOString(),
    };

    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Data, Models & Benchmarks" maxWidth="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          Download clean dataset artifacts, full evaluation metrics, and reproducible experiment metadata.
        </p>

        <div className="space-y-3">
          {/* Item 1: Prepared Dataset CSV */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Prepared Dataset (CSV)
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {dataset?.interactions.length || 0} cleaned & deduplicated interactions
              </div>
            </div>
            <button
              onClick={exportPreparedDatasetCsv}
              disabled={!dataset}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>

          {/* Item 2: Evaluation Benchmark JSON */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-400" /> Full Evaluation Benchmark Report
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Precision@K, Recall@K, NDCG@K, MRR, Gini index, Coverage & splits
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportBenchmarkCsv}
                disabled={benchmarks.length === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportBenchmarkJson}
                disabled={benchmarks.length === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          </div>

          {/* Item 3: Reproducibility Manifest */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-amber-400" /> Experiment Reproducibility Manifest
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Seeded PRNG, hyperparameter config, and split timestamps
              </div>
            </div>
            <button
              onClick={copyReproducibilityManifest}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
