import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  User,
  Sliders,
  Filter,
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  Shuffle,
  ShieldAlert,
  HelpCircle,
  Clock,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import {
  Interaction,
  ModelAlgorithm,
  ModelHyperparameters,
  PreparedDataset,
  RecommendationItem,
  UserRecommendationResult,
} from '../types/recsys';
import { PopularityRecommender } from '../models/popularity';
import { ItemBasedCFRecommender } from '../models/itemCollaborativeFiltering';
import { UserBasedCFRecommender } from '../models/userCollaborativeFiltering';
import { MatrixFactorizationRecommender } from '../models/matrixFactorization';
import { ContentBasedRecommender } from '../models/contentBased';
import { HybridRecommender } from '../models/hybridModel';
import { RecommenderModel } from '../models/recommenderBase';
import { Badge, Modal } from './common/UIComponents';

interface RankingViewProps {
  dataset: PreparedDataset;
  onRecommendationGenerated?: (result: UserRecommendationResult) => void;
}

export const RankingView: React.FC<RankingViewProps> = ({
  dataset,
  onRecommendationGenerated,
}) => {
  const userList = useMemo(() => Array.from(dataset.users.keys()).sort(), [dataset]);

  // State
  const [selectedUserId, setSelectedUserId] = useState<string>(userList[0] || 'USR_001');
  const [isColdStartSim, setIsColdStartSim] = useState<boolean>(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<ModelAlgorithm>('item_cf');
  const [k, setK] = useState<number>(10);
  const [filterConsumed, setFilterConsumed] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showHyperparams, setShowHyperparams] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [selectedExplanationItem, setSelectedExplanationItem] = useState<RecommendationItem | null>(null);

  // Hyperparameters
  const [hyperparams, setHyperparams] = useState<ModelHyperparameters>({
    similarityMetric: 'adjusted_cosine',
    topKNeighbors: 15,
    latentFactors: 8,
    learningRate: 0.015,
    regularization: 0.02,
    epochs: 25,
    cfWeight: 0.5,
    contentWeight: 0.3,
    popularityWeight: 0.2,
  });

  // Recommender instance cache
  const activeModel = useMemo<RecommenderModel>(() => {
    let model: RecommenderModel;
    switch (selectedAlgorithm) {
      case 'popularity':
        model = new PopularityRecommender({ rankingMetric: 'bayesian_avg' });
        break;
      case 'item_cf':
        model = new ItemBasedCFRecommender({
          similarityMetric: hyperparams.similarityMetric === 'pearson' ? 'adjusted_cosine' : (hyperparams.similarityMetric as any),
          topKNeighbors: hyperparams.topKNeighbors,
        });
        break;
      case 'user_cf':
        model = new UserBasedCFRecommender({
          similarityMetric: hyperparams.similarityMetric === 'jaccard' ? 'cosine' : (hyperparams.similarityMetric as any),
          topKNeighbors: hyperparams.topKNeighbors,
        });
        break;
      case 'matrix_factorization':
        model = new MatrixFactorizationRecommender({
          latentFactors: hyperparams.latentFactors,
          learningRate: hyperparams.learningRate,
          regularization: hyperparams.regularization,
          epochs: hyperparams.epochs,
        });
        break;
      case 'content_based':
        model = new ContentBasedRecommender();
        break;
      case 'hybrid':
        model = new HybridRecommender({
          cfWeight: hyperparams.cfWeight,
          contentWeight: hyperparams.contentWeight,
          popularityWeight: hyperparams.popularityWeight,
        });
        break;
      default:
        model = new PopularityRecommender();
    }

    model.train(dataset.interactions, dataset.items);
    return model;
  }, [selectedAlgorithm, hyperparams, dataset]);

  // Target User object
  const targetUser = isColdStartSim ? null : dataset.users.get(selectedUserId);
  const effectiveUserId = isColdStartSim ? 'NEW_COLD_USER_000' : selectedUserId;

  // Generate recommendations
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [execTime, setExecTime] = useState<number>(0);

  useEffect(() => {
    const start = performance.now();
    const recs = activeModel.recommend(effectiveUserId, k, filterConsumed);
    const duration = Math.round(performance.now() - start);

    setRecommendations(recs);
    setExecTime(duration);

    if (onRecommendationGenerated) {
      onRecommendationGenerated({
        userId: effectiveUserId,
        modelAlgorithm: selectedAlgorithm,
        algorithmName: activeModel.name,
        recommendations: recs,
        userHistoryCount: targetUser?.interactionCount || 0,
        executionTimeMs: duration,
        isColdStartUser: isColdStartSim,
        k,
        filterConsumed,
      });
    }
  }, [activeModel, effectiveUserId, k, filterConsumed, isColdStartSim, selectedAlgorithm]);

  const handleRandomUser = () => {
    setIsColdStartSim(false);
    const randomIdx = Math.floor(Math.random() * userList.length);
    setSelectedUserId(userList[randomIdx]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" /> Recommendation Studio
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Test ranking models, inspect personalized score signals, and explore explainability.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHyperparams(!showHyperparams)}
              className={`px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 transition border ${
                showHyperparams
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Hyperparameters</span>
              {showHyperparams ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  viewMode === 'cards' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cards View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  viewMode === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Table View
              </button>
            </div>
          </div>
        </div>

        {/* Hyperparameter Settings Panel */}
        {showHyperparams && (
          <div className="mb-6 p-4.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /> {activeModel.name} Parameters
              </h4>
              <span className="text-[11px] text-slate-400">Settings take effect immediately</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(selectedAlgorithm === 'item_cf' || selectedAlgorithm === 'user_cf') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Similarity Metric
                    </label>
                    <select
                      value={hyperparams.similarityMetric}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          similarityMetric: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      <option value="adjusted_cosine">Adjusted Cosine (Mean-Subtracted)</option>
                      <option value="cosine">Standard Cosine</option>
                      <option value="pearson">Pearson Correlation</option>
                      <option value="jaccard">Jaccard Co-Occurrence</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Top Neighbors (k-NN)</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.topKNeighbors}</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="30"
                      value={hyperparams.topKNeighbors}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          topKNeighbors: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </>
              )}

              {selectedAlgorithm === 'matrix_factorization' && (
                <>
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Latent Factors (d)</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.latentFactors}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="24"
                      value={hyperparams.latentFactors}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          latentFactors: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Training Epochs</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.epochs}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={hyperparams.epochs}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          epochs: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Learning Rate (γ)
                    </label>
                    <input
                      type="number"
                      step="0.005"
                      value={hyperparams.learningRate}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          learningRate: parseFloat(e.target.value),
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </>
              )}

              {selectedAlgorithm === 'hybrid' && (
                <>
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Collaborative Weight (w_cf)</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.cfWeight}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={hyperparams.cfWeight}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          cfWeight: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Content Weight (w_cnt)</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.contentWeight}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={hyperparams.contentWeight}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          contentWeight: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                      <span>Popularity Weight (w_pop)</span>
                      <span className="text-indigo-400 font-bold">{hyperparams.popularityWeight}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={hyperparams.popularityWeight}
                      onChange={(e) =>
                        setHyperparams({
                          ...hyperparams,
                          popularityWeight: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Primary Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Target User Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" /> Target User
              </label>
              <button
                onClick={handleRandomUser}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                title="Pick random user"
              >
                <Shuffle className="w-3 h-3" /> Random
              </button>
            </div>

            <div className="flex gap-2">
              <select
                disabled={isColdStartSim}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 disabled:opacity-40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                {userList.map((u) => (
                  <option key={u} value={u}>
                    {u} ({dataset.users.get(u)?.interactionCount} ratings)
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isColdStartSim}
                  onChange={(e) => setIsColdStartSim(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                />
                <span>Simulate Cold-Start User</span>
              </label>
              {targetUser && !isColdStartSim && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="text-indigo-400 hover:underline"
                >
                  View Profile ({targetUser.interactionCount})
                </button>
              )}
            </div>
          </div>

          {/* 2. Algorithm Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Ranking Algorithm
            </label>
            <select
              value={selectedAlgorithm}
              onChange={(e) => setSelectedAlgorithm(e.target.value as ModelAlgorithm)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="popularity">Popularity Baseline</option>
              <option value="item_cf">Item-Based Collaborative Filtering</option>
              <option value="user_cf">User-Based Collaborative Filtering</option>
              <option value="matrix_factorization">Matrix Factorization (Latent SVD)</option>
              <option value="content_based">Content-Based Filtering</option>
              <option value="hybrid">Hybrid Ensemble</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5 truncate">
              {activeModel.name}
            </p>
          </div>

          {/* 3. Top-K Recommendations Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Recommendation Count (K)
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                Top {k}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={Math.min(30, dataset.items.size)}
              value={k}
              onChange={(e) => setK(parseInt(e.target.value) || 5)}
              className="w-full accent-indigo-500 cursor-pointer mt-1"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>1</span>
              <span>10</span>
              <span>{Math.min(30, dataset.items.size)}</span>
            </div>
          </div>

          {/* 4. Filter Consumed Toggle & Tie-breaking */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Ranking Filters & Constraints
            </label>
            <label className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={filterConsumed}
                onChange={(e) => setFilterConsumed(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
              />
              <span>Exclude already consumed items</span>
            </label>
            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Deterministic tie-breaking (Score &gt; Pop &gt; ID)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target User Summary Bar (when user selected) */}
      {targetUser && !isColdStartSim && (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold">
              {selectedUserId.substring(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">{selectedUserId}</span>
                {targetUser.segment && (
                  <Badge variant="neutral" size="sm">
                    {targetUser.segment}
                  </Badge>
                )}
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                {targetUser.interactionCount} items rated (Avg score: {targetUser.avgRating})
              </div>
            </div>
          </div>

          {/* Top User Category Preferences */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 text-[11px]">Top Interests:</span>
            {targetUser.topCategories.slice(0, 3).map((cat, idx) => (
              <span
                key={idx}
                className="bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[11px] font-medium"
              >
                {cat.category} ({cat.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cold-Start Notice Banner */}
      {isColdStartSim && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start gap-3 text-xs text-amber-200">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Cold-Start Simulation Active</span>
            <span>
              Generating recommendations for a newly registered user with zero historical interactions. The algorithm automatically falls back to global Bayesian popularity signals with transparent explanatory notes.
            </span>
          </div>
        </div>
      )}

      {/* Recommendations Results View */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              Ranked Output (Top {recommendations.length})
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              ⚡ Generated in {execTime}ms
            </span>
          </div>

          <span className="text-xs text-slate-400">
            Sorted deterministically by Score DESC
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            No recommendations generated. Try disabling "Exclude consumed items" or adjusting filters.
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map((rec) => (
              <div
                key={rec.itemId}
                className={`bg-slate-900/90 border rounded-2xl p-5 transition-all flex flex-col justify-between hover:border-indigo-500/50 shadow-sm ${
                  rec.isColdStartFallback ? 'border-amber-800/50' : 'border-slate-800'
                }`}
              >
                <div>
                  {/* Card Header: Rank & Category */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                        #{rec.rank}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{rec.itemId}</span>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {rec.itemCategory}
                    </Badge>
                  </div>

                  {/* Item Title */}
                  <h4 className="text-base font-bold text-white mb-2 line-clamp-1" title={rec.itemName}>
                    {rec.itemName}
                  </h4>

                  {/* Score Indicator Bar */}
                  <div className="space-y-1 mb-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Predicted Score</span>
                      <span className="font-mono font-bold text-indigo-300">
                        {rec.predictedScore.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(8, rec.normalizedScore * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Primary Signal Explanation */}
                  <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-300 leading-relaxed">
                    <div className="flex items-center gap-1.5 text-indigo-400 font-semibold mb-1">
                      <Info className="w-3.5 h-3.5" />
                      <span>Why this item?</span>
                    </div>
                    <p className="line-clamp-3 text-slate-300 text-[11px]">
                      {rec.explanation.primarySignal}
                    </p>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 capitalize">
                    Confidence: <strong className="text-slate-200">{rec.explanation.confidence}</strong>
                  </span>
                  <button
                    onClick={() => setSelectedExplanationItem(rec)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Inspect Details →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">Rank</th>
                    <th className="px-4 py-3">Item Title & SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3">Algorithmic Signal Explanation</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {recommendations.map((rec) => (
                    <tr key={rec.itemId} className="hover:bg-slate-950/40">
                      <td className="px-4 py-3 text-center font-bold text-indigo-400">
                        #{rec.rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{rec.itemName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{rec.itemId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral" size="sm">
                          {rec.itemCategory}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white">
                        {rec.predictedScore.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 max-w-md">
                        {rec.explanation.primarySignal}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedExplanationItem(rec)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded transition"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Full User Interaction History */}
      {targetUser && (
        <Modal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={`User Profile: ${targetUser.userId}`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Total Ratings:</span>
                <span className="text-lg font-bold text-white">{targetUser.interactionCount}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Average Rating:</span>
                <span className="text-lg font-bold text-white">{targetUser.avgRating} / 5.0</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">User Cohort:</span>
                <span className="text-lg font-bold text-indigo-400 truncate block">
                  {targetUser.segment || 'Standard'}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Historical Interactions List
              </h4>
              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Item Title</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Rating/Weight</th>
                      <th className="px-3 py-2 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {dataset.interactions
                      .filter((i) => i.userId === targetUser.userId)
                      .map((i, idx) => (
                        <tr key={idx} className="hover:bg-slate-950/50">
                          <td className="px-3 py-1.5 font-sans font-medium text-white">
                            {i.itemName || i.itemId}
                          </td>
                          <td className="px-3 py-1.5 font-sans text-slate-400">
                            {i.itemCategory || 'N/A'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-indigo-300">
                            {i.value}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400 text-[10px]">
                            {i.timestamp ? new Date(i.timestamp).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Explainability Deep Dive */}
      {selectedExplanationItem && (
        <Modal
          isOpen={!!selectedExplanationItem}
          onClose={() => setSelectedExplanationItem(null)}
          title={`Recommendation Explainability: ${selectedExplanationItem.itemName}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 block mb-1">
                Primary Model Signal
              </span>
              <p className="text-sm text-slate-200 leading-relaxed">
                {selectedExplanationItem.explanation.primarySignal}
              </p>
            </div>

            {/* Score Breakdown Table */}
            {selectedExplanationItem.explanation.scoreBreakdown && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Mathematical Signal Decomposition
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <tbody className="divide-y divide-slate-800">
                      {Object.entries(selectedExplanationItem.explanation.scoreBreakdown).map(
                        ([metric, val], idx) => (
                          <tr key={idx} className="bg-slate-950/60">
                            <td className="px-4 py-2 font-medium text-slate-300">{metric}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-white">
                              {val}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Contributing Historical Items (if Item-CF) */}
            {selectedExplanationItem.explanation.contributingItems &&
              selectedExplanationItem.explanation.contributingItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Top Contributing Items From Your History
                  </h4>
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Item Name</th>
                          <th className="px-3 py-2 text-right">Taste Similarity</th>
                          <th className="px-3 py-2 text-right">Your Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {selectedExplanationItem.explanation.contributingItems.map((c, idx) => (
                          <tr key={idx} className="bg-slate-950/40">
                            <td className="px-3 py-2 font-sans font-medium text-white">
                              {c.itemName}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-bold">
                              {(c.similarity * 100).toFixed(0)}%
                            </td>
                            <td className="px-3 py-2 text-right text-indigo-300">
                              {c.userRating}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedExplanationItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
