import React, { useState, useEffect } from 'react';
import { SAMPLE_DATASETS, SampleDatasetDefinition } from './data/sampleDatasets';
import { parseCsvText } from './utils/csvParser';
import { prepareDataset } from './services/dataPreparation';
import { splitDataset } from './services/dataSplitter';
import { benchmarkAllModels } from './services/evaluation';
import {
  ColumnMapping,
  ColumnMetadata,
  DataPrepConfig,
  DataSplit,
  ModelBenchmarkResult,
  PreparedDataset,
  RawRow,
  UserRecommendationResult,
} from './types/recsys';
import { Header, ActiveTab } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { DataPrepView } from './components/DataPrepView';
import { RankingView } from './components/RankingView';
import { EvaluationView } from './components/EvaluationView';
import { BiasCoverageView } from './components/BiasCoverageView';
import { DatasetUploadModal } from './components/DatasetUploadModal';
import { ExportModal } from './components/ExportModal';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [currentDatasetDef, setCurrentDatasetDef] = useState<SampleDatasetDefinition | null>(SAMPLE_DATASETS[0]);

  // Raw parsed data
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [columnMetadata, setColumnMetadata] = useState<ColumnMetadata[]>([]);

  // Mapping & Prep Config
  const [mapping, setMapping] = useState<ColumnMapping>(SAMPLE_DATASETS[0].defaultMapping);
  const [prepConfig, setPrepConfig] = useState<DataPrepConfig>({
    missingValueHandling: 'drop_row',
    defaultInteractionValue: 3.5,
    duplicateHandling: 'keep_latest',
    positiveThresholdRule: 'explicit_threshold',
    positiveThresholdValue: 4.0,
    minUserInteractions: 3,
    minItemInteractions: 2,
  });

  // Prepared Artifacts
  const [dataset, setDataset] = useState<PreparedDataset | null>(null);
  const [split, setSplit] = useState<DataSplit | null>(null);
  const [benchmarks, setBenchmarks] = useState<ModelBenchmarkResult[]>([]);
  const [lastRecommendation, setLastRecommendation] = useState<UserRecommendationResult | null>(null);

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Load and initialize a dataset definition
  const initializeDataset = (sampleDef: SampleDatasetDefinition) => {
    setCurrentDatasetDef(sampleDef);
    setMapping(sampleDef.defaultMapping);
    setPrepConfig({
      ...prepConfig,
      ...sampleDef.defaultPrepConfig,
    });

    const parsed = parseCsvText(sampleDef.csvData);
    setRawRows(parsed.data);
    setColumns(parsed.columns);
    setColumnMetadata(parsed.columnMetadata);

    const prepResult = prepareDataset(parsed.data, sampleDef.defaultMapping, {
      ...prepConfig,
      ...sampleDef.defaultPrepConfig,
    });

    if (prepResult.dataset) {
      setDataset(prepResult.dataset);

      // Create initial non-leaking split
      const initialSplit = splitDataset(prepResult.dataset.interactions, {
        method: 'temporal_holdout',
        trainRatio: 0.7,
        valRatio: 0.0,
        testRatio: 0.3,
        randomSeed: 42,
      });
      setSplit(initialSplit);

      // Run initial multi-model benchmark
      const initialBenchmarks = benchmarkAllModels(initialSplit, prepResult.dataset.items, {
        kValues: [3, 5, 10, 20],
        selectedK: 5,
        positiveThresholdOnly: true,
      });
      setBenchmarks(initialBenchmarks);
    }
  };

  // Mount effect: load initial dataset
  useEffect(() => {
    initializeDataset(SAMPLE_DATASETS[0]);
  }, []);

  // Handler for custom uploaded dataset
  const handleCustomDatasetLoaded = (data: {
    rawRows: RawRow[];
    columns: string[];
    datasetName: string;
    rawText: string;
  }) => {
    setCurrentDatasetDef(null);
    setRawRows(data.rawRows);
    setColumns(data.columns);

    const parsed = parseCsvText(data.rawText);
    setColumnMetadata(parsed.columnMetadata);

    // Heuristically detect column mappings
    const inferredUserCol = data.columns.find(c => /user|cust|member|reader|student|uid|client/i.test(c)) || data.columns[0] || '';
    const inferredItemCol = data.columns.find(c => /item|prod|movie|sku|article|course|book|track|id/i.test(c) && c !== inferredUserCol) || data.columns[1] || '';
    const inferredRatingCol = data.columns.find(c => /rating|score|val|weight|event|count|clap|view/i.test(c));
    const inferredTimeCol = data.columns.find(c => /time|date|timestamp|created|epoch/i.test(c));
    const inferredTitleCol = data.columns.find(c => /name|title|label/i.test(c));
    const inferredCategoryCol = data.columns.find(c => /cat|genre|topic|group|type/i.test(c));
    const inferredSegmentCol = data.columns.find(c => /segment|cohort|role|tier|level/i.test(c));

    const newMapping: ColumnMapping = {
      userIdCol: inferredUserCol,
      itemIdCol: inferredItemCol,
      interactionCol: inferredRatingCol,
      timestampCol: inferredTimeCol,
      itemNameCol: inferredTitleCol,
      itemCategoryCol: inferredCategoryCol,
      userSegmentCol: inferredSegmentCol,
    };

    setMapping(newMapping);

    const prepResult = prepareDataset(data.rawRows, newMapping, prepConfig);
    if (prepResult.dataset) {
      setDataset(prepResult.dataset);

      const initialSplit = splitDataset(prepResult.dataset.interactions, {
        method: inferredTimeCol ? 'temporal_holdout' : 'user_stratified',
        trainRatio: 0.75,
        valRatio: 0.0,
        testRatio: 0.25,
        randomSeed: 42,
      });
      setSplit(initialSplit);

      const initialBenchmarks = benchmarkAllModels(initialSplit, prepResult.dataset.items, {
        kValues: [3, 5, 10, 20],
        selectedK: 5,
        positiveThresholdOnly: true,
      });
      setBenchmarks(initialBenchmarks);
    }

    setActiveTab('dataprep');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar & Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentDatasetDef={currentDatasetDef}
        onSelectSampleDataset={initializeDataset}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        dataset={dataset}
        split={split}
        benchmarks={benchmarks}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewView
            dataset={dataset}
            currentDatasetDef={currentDatasetDef}
            split={split}
            benchmarks={benchmarks}
            onNavigate={setActiveTab}
            onOpenUploadModal={() => setIsUploadModalOpen(true)}
          />
        )}

        {activeTab === 'dataprep' && (
          <DataPrepView
            rawRows={rawRows}
            columns={columns}
            columnMetadata={columnMetadata}
            mapping={mapping}
            setMapping={setMapping}
            prepConfig={prepConfig}
            setPrepConfig={setPrepConfig}
            dataset={dataset}
            setDataset={(ds) => {
              setDataset(ds);
              const newSplit = splitDataset(ds.interactions, {
                method: mapping.timestampCol ? 'temporal_holdout' : 'user_stratified',
                trainRatio: 0.75,
                valRatio: 0.0,
                testRatio: 0.25,
                randomSeed: 42,
              });
              setSplit(newSplit);
              const newBenchmarks = benchmarkAllModels(newSplit, ds.items, {
                kValues: [3, 5, 10, 20],
                selectedK: 5,
                positiveThresholdOnly: true,
              });
              setBenchmarks(newBenchmarks);
            }}
            onNavigateRanking={() => setActiveTab('ranking')}
          />
        )}

        {activeTab === 'ranking' && dataset && (
          <RankingView
            dataset={dataset}
            onRecommendationGenerated={setLastRecommendation}
          />
        )}

        {activeTab === 'evaluation' && dataset && split && (
          <EvaluationView
            dataset={dataset}
            split={split}
            setSplit={setSplit}
            benchmarks={benchmarks}
            setBenchmarks={setBenchmarks}
          />
        )}

        {activeTab === 'bias' && dataset && split && (
          <BiasCoverageView
            dataset={dataset}
            split={split}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            RecoSpace Recommender Engine & Analytics Studio &bull; Deterministic &bull; Zero Data Leakage
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Built with React 19, TypeScript & Tailwind CSS</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <DatasetUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onDatasetLoaded={handleCustomDatasetLoaded}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        dataset={dataset}
        split={split}
        benchmarks={benchmarks}
        lastRecommendation={lastRecommendation}
      />
    </div>
  );
};
