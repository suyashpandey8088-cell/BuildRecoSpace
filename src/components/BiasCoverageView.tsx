import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Scale,
  Sparkles,
  PieChart,
  Users,
  Info,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import {
  BiasAndCoverageAnalysis,
  DataSplit,
  MitigationConfig,
  PreparedDataset,
  RecommendationItem,
} from '../types/recsys';
import { ItemBasedCFRecommender } from '../models/itemCollaborativeFiltering';
import { analyzeBiasAndCoverage, applyMitigatedReranking } from '../services/biasAnalysis';
import { DistributionBar, SimpleBarChart } from './common/Charts';
import { AlertBanner, Badge, MetricCard } from './common/UIComponents';

interface BiasCoverageViewProps {
  dataset: PreparedDataset;
  split: DataSplit;
}

export const BiasCoverageView: React.FC<BiasCoverageViewProps> = ({
  dataset,
  split,
}) => {
  const model = useMemo(() => {
    const cf = new ItemBasedCFRecommender();
    cf.train(split.train, dataset.items);
    return cf;
  }, [dataset, split]);

  // Compute Bias Analysis
  const biasAnalysis = useMemo<BiasAndCoverageAnalysis>(() => {
    return analyzeBiasAndCoverage(model, dataset, split, 10);
  }, [model, dataset, split]);

  // Mitigation Simulator State
  const [mitigationConfig, setMitigationConfig] = useState<MitigationConfig>({
    popularityDiscountLambda: 0.5,
    categoryDiversityQuota: 2,
    minNoveltyThreshold: 0,
  });

  const [simUserId, setSimUserId] = useState<string>(
    Array.from(dataset.users.keys())[0] || 'USR_001'
  );

  // Raw recommendations for simulation user
  const baseRecs = useMemo(() => {
    return model.recommend(simUserId, 10, true);
  }, [model, simUserId]);

  // Mitigated recommendations
  const mitigatedRecs = useMemo(() => {
    return applyMitigatedReranking(
      baseRecs,
      dataset.items,
      mitigationConfig,
      10
    );
  }, [baseRecs, dataset.items, mitigationConfig]);

  // Comparison metrics for before/after
  const baseAvgPop = baseRecs.length > 0
    ? baseRecs.reduce((sum, r) => sum + (dataset.items.get(r.itemId)?.popularityCount || 0), 0) / baseRecs.length
    : 0;

  const mitigatedAvgPop = mitigatedRecs.length > 0
    ? mitigatedRecs.reduce((sum, r) => sum + (dataset.items.get(r.itemId)?.popularityCount || 0), 0) / mitigatedRecs.length
    : 0;

  const baseDistinctCats = new Set(baseRecs.map(r => r.itemCategory)).size;
  const mitigatedDistinctCats = new Set(mitigatedRecs.map(r => r.itemCategory)).size;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" /> Bias, Coverage & Fairness Analysis
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Inspect popularity concentration, user group performance disparities, and test real-time bias mitigation strategies.
            </p>
          </div>

          <Badge variant="neutral" size="md">
            Gini Exposure: {biasAnalysis.giniConcentration.toFixed(3)}
          </Badge>
        </div>
      </div>

      {/* Epistemological & Ethical Disclaimer */}
      <AlertBanner
        type="info"
        title="Measurement & Fairness Guidelines"
        message="All observations in this studio are empirical measurements computed on historical interaction logs. Observational correlation does not imply causation. Demographic fairness analyses utilize only explicitly mapped metadata attributes; sensitive personal traits are never inferred."
      />

      {/* High-Level Bias Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Exposure Gini Index"
          value={biasAnalysis.giniConcentration.toFixed(3)}
          subtitle="0 = equal, 1 = concentrated"
          badge={biasAnalysis.giniConcentration > 0.4 ? 'Concentrated' : 'Balanced'}
          badgeVariant={biasAnalysis.giniConcentration > 0.4 ? 'warning' : 'success'}
          icon={<Scale className="w-4 h-4" />}
          tooltip="Gini coefficient measuring inequality in recommendation frequency across catalog"
        />
        <MetricCard
          title="Long-Tail Item Coverage"
          value={`${biasAnalysis.longTailCoveragePct}%`}
          subtitle="Tail items (bottom 50% catalog)"
          icon={<PieChart className="w-4 h-4" />}
          tooltip="Percentage of niche/tail items that receive at least one recommendation"
        />
        <MetricCard
          title="Avg Rec Popularity"
          value={biasAnalysis.averageRecommendationPopularity.toFixed(1)}
          subtitle="Avg interactions of recommended items"
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <MetricCard
          title="Identified Risk Factors"
          value={biasAnalysis.identifiedRisks.length}
          subtitle="Potential feedback loops & bias"
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Two Column Layout: Long-Tail Distribution & User Group Fairness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Item Popularity Tier Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-400" /> Catalog Popularity Concentration (Head vs Tail)
            </h3>
            <span className="text-xs text-slate-400">80/20 Distribution</span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3.5 py-2.5">Catalog Tier</th>
                  <th className="px-3.5 py-2.5 text-right">Items</th>
                  <th className="px-3.5 py-2.5 text-right">Interactions</th>
                  <th className="px-3.5 py-2.5 text-right">Volume Share</th>
                  <th className="px-3.5 py-2.5 text-right">Avg Recs Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {biasAnalysis.itemPopularityDistribution.map((tier, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/40">
                    <td className="px-3.5 py-2.5 font-sans font-semibold text-white">
                      {tier.tier}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">{tier.itemCount}</td>
                    <td className="px-3.5 py-2.5 text-right">{tier.interactionCount}</td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-indigo-400">
                      {tier.interactionSharePct}%
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-emerald-400">
                      {tier.avgRecommendationsReceived}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The top 20% head items account for the majority of user interactions and recommendation impressions, indicating potential exposure concentration.
          </p>
        </div>

        {/* User Activity Level & Group Fairness Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" /> Performance Across User Activity Tiers
            </h3>
            <span className="text-xs text-slate-400">Disparity Audit</span>
          </div>

          <div className="space-y-4">
            {biasAnalysis.groupFairnessAnalysis.map((dim, dIdx) => (
              <div key={dIdx} className="space-y-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Dimension: {dim.groupDimension}
                </span>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2 text-right">Users</th>
                        <th className="px-3 py-2 text-right">Avg History</th>
                        <th className="px-3 py-2 text-right">Recall@10</th>
                        <th className="px-3 py-2 text-right">NDCG@10</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {dim.groups.map((g, gIdx) => (
                        <tr key={gIdx} className="hover:bg-slate-950/40">
                          <td className="px-3 py-2 font-sans font-medium text-white">{g.groupName}</td>
                          <td className="px-3 py-2 text-right">{g.userCount}</td>
                          <td className="px-3 py-2 text-right">{g.avgInteractions}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-400">
                            {(g.recallAtK * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-300">
                            {g.ndcgAtK.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Identified Risks & Warning Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> Algorithmic Bias Risks & Mitigation Register
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {biasAnalysis.identifiedRisks.map((risk, idx) => (
            <div
              key={idx}
              className="bg-slate-950 p-4.5 rounded-xl border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-xs">{risk.title}</h4>
                  <Badge
                    variant={risk.severity === 'high' ? 'danger' : 'warning'}
                    size="sm"
                  >
                    {risk.severity.toUpperCase()} RISK
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  {risk.description}
                </p>
                <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 mb-3">
                  <strong className="text-slate-300 block mb-0.5">Empirical Evidence:</strong>
                  {risk.evidence}
                </div>
              </div>
              <div className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                <strong className="text-emerald-300 block mb-0.5">Mitigation Strategy:</strong>
                {risk.mitigationStrategy}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Bias Mitigation & Reranking Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" /> Live Bias Mitigation & Calibrated Reranking Simulator
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Tune popularity-aware penalty discount and category diversity quotas to observe trade-offs in real time.
            </p>
          </div>

          {/* User selector for simulation */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Simulation User:</span>
            <select
              value={simUserId}
              onChange={(e) => setSimUserId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
            >
              {Array.from(dataset.users.keys()).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Simulator Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Popularity Discount Slider */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-200">
                Popularity Penalty Discount (λ)
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                λ = {mitigationConfig.popularityDiscountLambda.toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Discounts over-recommended popular items in favor of relevant long-tail discoveries
            </p>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={mitigationConfig.popularityDiscountLambda}
              onChange={(e) =>
                setMitigationConfig({
                  ...mitigationConfig,
                  popularityDiscountLambda: parseFloat(e.target.value),
                })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>0.0 (No penalty)</span>
              <span>0.5 (Balanced)</span>
              <span>1.0 (Maximum niche boost)</span>
            </div>
          </div>

          {/* Category Diversity Quota */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-200">
                Category Exposure Quota
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                Max {mitigationConfig.categoryDiversityQuota} / category
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Caps maximum items from the same genre/category in top-K to prevent filter bubbles
            </p>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={mitigationConfig.categoryDiversityQuota}
              onChange={(e) =>
                setMitigationConfig({
                  ...mitigationConfig,
                  categoryDiversityQuota: parseInt(e.target.value),
                })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>1 (Max Diversity)</span>
              <span>2 (Recommended)</span>
              <span>5 (Unconstrained)</span>
            </div>
          </div>
        </div>

        {/* Live Trade-Off Comparison Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Baseline Avg Pop:</span>
            <span className="text-base font-bold text-slate-300">{baseAvgPop.toFixed(1)}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Mitigated Avg Pop:</span>
            <span className="text-base font-bold text-emerald-400">
              {mitigatedAvgPop.toFixed(1)}{' '}
              {mitigatedAvgPop < baseAvgPop && (
                <span className="text-xs text-emerald-400 font-normal">
                  (-{(((baseAvgPop - mitigatedAvgPop) / (baseAvgPop || 1)) * 100).toFixed(0)}%)
                </span>
              )}
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Baseline Categories:</span>
            <span className="text-base font-bold text-slate-300">{baseDistinctCats}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Mitigated Categories:</span>
            <span className="text-base font-bold text-cyan-400">{mitigatedDistinctCats}</span>
          </div>
        </div>

        {/* Side-by-Side Ranked Recommendations Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Baseline Recommendations */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Original Unconstrained Ranking
              </span>
              <Badge variant="neutral" size="sm">
                Base
              </Badge>
            </div>
            <div className="p-3 space-y-2">
              {baseRecs.slice(0, 5).map((rec) => (
                <div
                  key={rec.itemId}
                  className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400">#{rec.rank}</span>
                    <span className="font-semibold text-white truncate max-w-[160px]">
                      {rec.itemName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" size="sm">
                      {rec.itemCategory}
                    </Badge>
                    <span className="font-mono text-slate-300">{rec.predictedScore.toFixed(3)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mitigated Recommendations */}
          <div className="border border-indigo-900/40 rounded-xl overflow-hidden bg-indigo-950/10">
            <div className="bg-indigo-950/40 px-4 py-3 border-b border-indigo-900/40 flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                Mitigated & Calibrated Ranking
              </span>
              <Badge variant="success" size="sm">
                Penalty λ={mitigationConfig.popularityDiscountLambda}
              </Badge>
            </div>
            <div className="p-3 space-y-2">
              {mitigatedRecs.slice(0, 5).map((rec) => (
                <div
                  key={rec.itemId}
                  className="bg-slate-950/80 p-2.5 rounded-lg border border-indigo-900/40 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-400">#{rec.rank}</span>
                    <span className="font-semibold text-white truncate max-w-[160px]">
                      {rec.itemName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" size="sm">
                      {rec.itemCategory}
                    </Badge>
                    <span className="font-mono text-emerald-400 font-bold">
                      {rec.predictedScore.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
