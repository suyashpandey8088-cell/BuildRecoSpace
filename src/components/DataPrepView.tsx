import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Table,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  ShieldAlert,
  ArrowRight,
  Filter,
} from 'lucide-react';
import {
  ColumnMapping,
  ColumnMetadata,
  DataPrepConfig,
  PreparedDataset,
  RawRow,
} from '../types/recsys';
import { prepareDataset, validateMapping } from '../services/dataPreparation';
import { AlertBanner, Badge, MetricCard } from './common/UIComponents';

interface DataPrepViewProps {
  rawRows: RawRow[];
  columns: string[];
  columnMetadata: ColumnMetadata[];
  mapping: ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
  prepConfig: DataPrepConfig;
  setPrepConfig: React.Dispatch<React.SetStateAction<DataPrepConfig>>;
  dataset: PreparedDataset | null;
  setDataset: (ds: PreparedDataset) => void;
  onNavigateRanking: () => void;
}

export const DataPrepView: React.FC<DataPrepViewProps> = ({
  rawRows,
  columns,
  columnMetadata,
  mapping,
  setMapping,
  prepConfig,
  setPrepConfig,
  dataset,
  setDataset,
  onNavigateRanking,
}) => {
  const [activeTab, setActiveTab] = useState<'mapping' | 'preview' | 'audit'>('mapping');
  const [prepError, setPrepError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Validate mapping
  const validationIssues = validateMapping(mapping, columns);
  const hasErrors = validationIssues.some(i => i.severity === 'error');

  const handleRunPreparation = () => {
    if (hasErrors) {
      setPrepError('Please resolve mapping errors before preparing the dataset.');
      return;
    }

    setIsProcessing(true);
    setPrepError(null);

    setTimeout(() => {
      const result = prepareDataset(rawRows, mapping, prepConfig);
      setIsProcessing(false);

      if (result.error) {
        setPrepError(result.error);
      } else if (result.dataset) {
        setDataset(result.dataset);
      }
    }, 150);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" /> Data Preparation & Column Mapping
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Map source fields, configure deduplication and k-core filtering, and inspect data cleaning ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunPreparation}
            disabled={hasErrors || isProcessing}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition shadow-lg shadow-indigo-600/25"
          >
            {isProcessing ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Re-run Data Preparation
          </button>

          {dataset && (
            <button
              onClick={onNavigateRanking}
              className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
            >
              Continue to Rankings <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Validation Alert Banners */}
      {validationIssues.length > 0 && (
        <div className="space-y-2">
          {validationIssues.map((issue, idx) => (
            <AlertBanner
              key={idx}
              type={issue.severity === 'error' ? 'error' : 'warning'}
              title={issue.severity === 'error' ? 'Required Mapping Missing' : 'Configuration Notice'}
              message={issue.message}
            />
          ))}
        </div>
      )}

      {prepError && (
        <AlertBanner
          type="error"
          title="Data Preparation Failed"
          message={prepError}
        />
      )}

      {/* High-Level Cleaning Stats */}
      {dataset && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            title="Raw Source Records"
            value={dataset.rawRowCount}
            subtitle="Rows parsed from input"
            icon={<Table className="w-4 h-4" />}
          />
          <MetricCard
            title="Kept Interactions"
            value={dataset.keptRowCount}
            subtitle={`${((dataset.keptRowCount / (dataset.rawRowCount || 1)) * 100).toFixed(1)}% retention rate`}
            badge="Valid"
            badgeVariant="success"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          />
          <MetricCard
            title="Dropped Rows"
            value={dataset.droppedRowCount}
            subtitle="Missing IDs or filtered out"
            badge={dataset.droppedRowCount > 0 ? `${dataset.droppedRowCount} dropped` : '0 Clean'}
            badgeVariant={dataset.droppedRowCount > 0 ? 'warning' : 'success'}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <MetricCard
            title="Matrix Sparsity"
            value={`${dataset.summary.sparsityPct}%`}
            subtitle={`${dataset.summary.totalUsers} users × ${dataset.summary.totalItems} items`}
            icon={<Filter className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Tabs: Column Mapping vs Raw Data Preview vs Audit Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-800 px-6 pt-4 gap-4">
          <button
            onClick={() => setActiveTab('mapping')}
            className={`pb-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'mapping'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Schema & Column Mapping
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'preview'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Source Data Preview ({columns.length} columns)
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'audit'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Preparation Audit Ledger ({dataset?.auditLog.length || 0} stages)
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: COLUMN MAPPING & CLEANING RULES */}
          {activeTab === 'mapping' && (
            <div className="space-y-8">
              {/* Mapping Form */}
              <div>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Table className="w-4 h-4 text-indigo-400" /> Column Mapping Schema
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* User ID Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      User ID Column <span className="text-rose-400">*Required</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">Unique entity receiving recommendations</p>
                    <select
                      value={mapping.userIdCol}
                      onChange={(e) => setMapping({ ...mapping, userIdCol: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Select Column --</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Item ID Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Item ID Column <span className="text-rose-400">*Required</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">Unique catalog item or product SKU</p>
                    <select
                      value={mapping.itemIdCol}
                      onChange={(e) => setMapping({ ...mapping, itemIdCol: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Select Column --</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Interaction Rating / Weight Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Interaction / Rating Column <span className="text-slate-500">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">Numeric rating (1-5) or event weight</p>
                    <select
                      value={mapping.interactionCol || ''}
                      onChange={(e) => setMapping({ ...mapping, interactionCol: e.target.value || undefined })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">(None - Implicit weight = 1.0)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Timestamp Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Timestamp Column <span className="text-slate-500">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">Enables temporal non-leaking splits</p>
                    <select
                      value={mapping.timestampCol || ''}
                      onChange={(e) => setMapping({ ...mapping, timestampCol: e.target.value || undefined })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">(None - Random user split)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Item Title Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Item Name / Title <span className="text-slate-500">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">Display name for items in UI</p>
                    <select
                      value={mapping.itemNameCol || ''}
                      onChange={(e) => setMapping({ ...mapping, itemNameCol: e.target.value || undefined })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">(None - Use Item ID)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Item Category Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Item Category / Genre <span className="text-slate-500">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">For Content-based & diversity analysis</p>
                    <select
                      value={mapping.itemCategoryCol || ''}
                      onChange={(e) => setMapping({ ...mapping, itemCategoryCol: e.target.value || undefined })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">(None)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* User Segment Col */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      User Cohort / Segment <span className="text-slate-500">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">For demographic fairness analysis</p>
                    <select
                      value={mapping.userSegmentCol || ''}
                      onChange={(e) => setMapping({ ...mapping, userSegmentCol: e.target.value || undefined })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">(None)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Cleansing & Filtering Configuration */}
              <div className="pt-6 border-t border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-400" /> Data Cleansing & Activity Thresholds
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Missing Value Handling */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Missing Interaction Value
                    </label>
                    <select
                      value={prepConfig.missingValueHandling}
                      onChange={(e) =>
                        setPrepConfig({
                          ...prepConfig,
                          missingValueHandling: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="drop_row">Drop row if interaction missing</option>
                      <option value="fill_default">Fill with default value</option>
                    </select>

                    {prepConfig.missingValueHandling === 'fill_default' && (
                      <div className="mt-3">
                        <label className="block text-[11px] text-slate-400 mb-1">Default Value:</label>
                        <input
                          type="number"
                          step="0.5"
                          value={prepConfig.defaultInteractionValue}
                          onChange={(e) =>
                            setPrepConfig({
                              ...prepConfig,
                              defaultInteractionValue: parseFloat(e.target.value) || 1,
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                        />
                      </div>
                    )}
                  </div>

                  {/* Duplicate Handling */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Duplicate Interaction Strategy
                    </label>
                    <select
                      value={prepConfig.duplicateHandling}
                      onChange={(e) =>
                        setPrepConfig({
                          ...prepConfig,
                          duplicateHandling: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="keep_latest">Keep Latest Interaction</option>
                      <option value="keep_earliest">Keep Earliest Interaction</option>
                      <option value="average">Average Multiple Ratings</option>
                      <option value="sum">Sum Interaction Weights</option>
                      <option value="keep_max">Keep Maximum Value</option>
                    </select>
                  </div>

                  {/* Positive Interaction Threshold */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Positive Ground Truth Rule
                    </label>
                    <select
                      value={prepConfig.positiveThresholdRule}
                      onChange={(e) =>
                        setPrepConfig({
                          ...prepConfig,
                          positiveThresholdRule: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="explicit_threshold">Explicit Rating Threshold (≥ Value)</option>
                      <option value="implicit_positive">All Present Interactions Positive</option>
                      <option value="all_interactions">Strict Positive Value (&gt; 0)</option>
                    </select>

                    {prepConfig.positiveThresholdRule === 'explicit_threshold' && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Min Rating:</span>
                        <input
                          type="number"
                          step="0.5"
                          value={prepConfig.positiveThresholdValue}
                          onChange={(e) =>
                            setPrepConfig({
                              ...prepConfig,
                              positiveThresholdValue: parseFloat(e.target.value) || 1,
                            })
                          }
                          className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                        />
                      </div>
                    )}
                  </div>

                  {/* K-Core User Filter */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-200">
                        Min User Activity (k-core)
                      </label>
                      <span className="text-xs font-bold text-indigo-400">
                        ≥ {prepConfig.minUserInteractions} ratings
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={prepConfig.minUserInteractions}
                      onChange={(e) =>
                        setPrepConfig({
                          ...prepConfig,
                          minUserInteractions: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Filters out users with fewer interactions
                    </p>
                  </div>

                  {/* K-Core Item Filter */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-200">
                        Min Item Activity (k-core)
                      </label>
                      <span className="text-xs font-bold text-indigo-400">
                        ≥ {prepConfig.minItemInteractions} interactions
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={prepConfig.minItemInteractions}
                      onChange={(e) =>
                        setPrepConfig({
                          ...prepConfig,
                          minItemInteractions: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Filters out items with fewer interactions
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SOURCE DATA PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Detected Source Columns</h3>
                  <p className="text-xs text-slate-400">
                    Inspected {rawRows.length} total rows from source data
                  </p>
                </div>
                <Badge variant="primary">
                  {columns.length} Columns
                </Badge>
              </div>

              {/* Column Metadata Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {columnMetadata.map((col, idx) => (
                  <div key={idx} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white font-mono">{col.name}</span>
                      <Badge variant="neutral" size="sm">
                        {col.detectedType}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mt-2">
                      <span>Unique: <strong className="text-slate-200">{col.uniqueCount}</strong></span>
                      <span>Nulls: <strong className={col.nullCount > 0 ? 'text-rose-400' : 'text-emerald-400'}>{col.nullCount}</strong></span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      Samples: {col.sampleValues.slice(0, 3).join(', ')}
                    </div>
                  </div>
                ))}
              </div>

              {/* First 10 Raw Rows Table */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  First 10 Records Preview
                </h4>
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-slate-500 font-mono">#</th>
                        {columns.map(c => (
                          <th key={c} className="px-3 py-2 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {rawRows.slice(0, 10).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-950/50">
                          <td className="px-3 py-2 text-slate-500">{rIdx + 1}</td>
                          {columns.map(c => (
                            <td key={c} className="px-3 py-2 truncate max-w-[200px]">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Data Cleansing Ledger & Audit Trail</h3>
                  <p className="text-xs text-slate-400">
                    Chronological transformation log recording every row kept, dropped, or imputed.
                  </p>
                </div>
                <Badge variant="success">
                  {dataset?.auditLog.length || 0} Stages Logged
                </Badge>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Pipeline Stage</th>
                      <th className="px-4 py-2.5">Action & Reason</th>
                      <th className="px-4 py-2.5 text-right">Rows Affected</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dataset?.auditLog.map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-950/50">
                        <td className="px-4 py-2.5 font-semibold text-white">{log.stage}</td>
                        <td className="px-4 py-2.5 text-slate-300">{log.reason}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium">
                          {log.rowsAffected}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant={
                              log.severity === 'error'
                                ? 'danger'
                                : log.severity === 'warning'
                                ? 'warning'
                                : 'success'
                            }
                            size="sm"
                          >
                            {log.severity.toUpperCase()}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
