import React from 'react';
import {
  Sparkles,
  Database,
  SlidersHorizontal,
  Layers,
  BarChart3,
  ShieldCheck,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { SAMPLE_DATASETS, SampleDatasetDefinition } from '../data/sampleDatasets';
import { PreparedDataset, DataSplit, ModelBenchmarkResult } from '../types/recsys';

export type ActiveTab = 'overview' | 'dataprep' | 'ranking' | 'evaluation' | 'bias';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentDatasetDef: SampleDatasetDefinition | null;
  onSelectSampleDataset: (dataset: SampleDatasetDefinition) => void;
  onOpenUploadModal: () => void;
  onOpenExportModal: () => void;
  dataset: PreparedDataset | null;
  split: DataSplit | null;
  benchmarks: ModelBenchmarkResult[];
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentDatasetDef,
  onSelectSampleDataset,
  onOpenUploadModal,
  onOpenExportModal,
  dataset,
  split,
  benchmarks,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: 'Overview', icon: <Database className="w-4 h-4" /> },
    { id: 'dataprep', label: 'Data Preparation', icon: <SlidersHorizontal className="w-4 h-4" />, badge: dataset ? `${dataset.keptRowCount} rows` : undefined },
    { id: 'ranking', label: 'Recommendation Ranking', icon: <Layers className="w-4 h-4" /> },
    { id: 'evaluation', label: 'Evaluation & Benchmark', icon: <BarChart3 className="w-4 h-4" />, badge: benchmarks.length > 0 ? `${benchmarks.length} models` : undefined },
    { id: 'bias', label: 'Bias & Coverage', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      {/* Top Banner Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Product Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-lg tracking-wider">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white tracking-tight">RecoSpace</span>
                <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Engine v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                End-to-End Recommendation Engine, Evaluation & Fairness Studio
              </p>
            </div>
          </div>

          {/* Dataset Switcher & Global Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sample dataset selector */}
            <div className="relative">
              <select
                value={currentDatasetDef?.id || 'custom'}
                onChange={(e) => {
                  const found = SAMPLE_DATASETS.find(d => d.id === e.target.value);
                  if (found) onSelectSampleDataset(found);
                }}
                className="bg-slate-950 border border-slate-700 hover:border-slate-600 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 appearance-none pr-8 cursor-pointer font-medium max-w-[180px] sm:max-w-[240px] truncate"
              >
                {SAMPLE_DATASETS.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    📦 {ds.name}
                  </option>
                ))}
                {!currentDatasetDef && <option value="custom">📄 Custom Loaded Dataset</option>}
              </select>
              <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-400 text-[10px]">
                ▼
              </div>
            </div>

            {/* Upload Custom Dataset */}
            <button
              onClick={onOpenUploadModal}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition border border-slate-700/60"
              title="Load custom CSV/TSV or JSON file"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Load Data</span>
            </button>

            {/* Export Benchmark Report */}
            <button
              onClick={onOpenExportModal}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition border border-slate-700/60"
              title="Export results, predictions and reproducible configuration"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/80">
        <div className="flex items-center justify-between overflow-x-auto py-1">
          <nav className="flex space-x-1 sm:space-x-2" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded-full border border-slate-700">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Pipeline Mini-Status Badges */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-400 pl-4 border-l border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${dataset ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className={dataset ? 'text-slate-300 font-medium' : 'text-slate-500'}>
                {dataset ? 'Data Prepared' : 'No Data'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${split?.leakageCheckPassed ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className={split?.leakageCheckPassed ? 'text-slate-300 font-medium' : 'text-slate-500'}>
                {split ? `${split.config.method.replace('_', ' ')}` : 'No Split'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
