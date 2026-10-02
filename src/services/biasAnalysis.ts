import {
  BiasAndCoverageAnalysis,
  DataSplit,
  ItemMetadata,
  MitigationConfig,
  PreparedDataset,
  RecommendationItem,
} from '../types/recsys';
import { RecommenderModel } from '../models/recommenderBase';

export function analyzeBiasAndCoverage(
  model: RecommenderModel,
  dataset: PreparedDataset,
  split: DataSplit,
  k: number = 10
): BiasAndCoverageAnalysis {
  const items = Array.from(dataset.items.values());
  const totalInteractions = dataset.interactions.length || 1;

  // Sort items by popularity descending
  const sortedItems = [...items].sort((a, b) => b.popularityCount - a.popularityCount);
  const totalItemsCount = sortedItems.length;

  const headCount = Math.max(1, Math.floor(totalItemsCount * 0.20));
  const midCount = Math.max(1, Math.floor(totalItemsCount * 0.30));

  const headItems = new Set(sortedItems.slice(0, headCount).map(i => i.itemId));
  const midItems = new Set(sortedItems.slice(headCount, headCount + midCount).map(i => i.itemId));
  const tailItems = new Set(sortedItems.slice(headCount + midCount).map(i => i.itemId));

  // Count recommendations per item across all test users (or all users)
  const usersToEvaluate = Array.from(dataset.users.keys());
  const itemRecCounts = new Map<string, number>();
  let totalRecsGenerated = 0;
  let sumRecPopularity = 0;

  for (const userId of usersToEvaluate) {
    const recs = model.recommend(userId, k, true);
    for (const r of recs) {
      itemRecCounts.set(r.itemId, (itemRecCounts.get(r.itemId) || 0) + 1);
      totalRecsGenerated++;
      const itemPop = dataset.items.get(r.itemId)?.popularityCount || 0;
      sumRecPopularity += itemPop;
    }
  }

  // Aggregate tier statistics
  let headInteractions = 0;
  let midInteractions = 0;
  let tailInteractions = 0;

  let headRecs = 0;
  let midRecs = 0;
  let tailRecs = 0;

  for (const item of items) {
    const recCount = itemRecCounts.get(item.itemId) || 0;
    if (headItems.has(item.itemId)) {
      headInteractions += item.popularityCount;
      headRecs += recCount;
    } else if (midItems.has(item.itemId)) {
      midInteractions += item.popularityCount;
      midRecs += recCount;
    } else {
      tailInteractions += item.popularityCount;
      tailRecs += recCount;
    }
  }

  const itemPopularityDistribution: BiasAndCoverageAnalysis['itemPopularityDistribution'] = [
    {
      tier: 'Head (Top 20%)',
      itemCount: headItems.size,
      interactionCount: headInteractions,
      interactionSharePct: Number(((headInteractions / totalInteractions) * 100).toFixed(1)),
      avgRecommendationsReceived: headItems.size > 0 ? Number((headRecs / headItems.size).toFixed(1)) : 0,
    },
    {
      tier: 'Mid (20-50%)',
      itemCount: midItems.size,
      interactionCount: midInteractions,
      interactionSharePct: Number(((midInteractions / totalInteractions) * 100).toFixed(1)),
      avgRecommendationsReceived: midItems.size > 0 ? Number((midRecs / midItems.size).toFixed(1)) : 0,
    },
    {
      tier: 'Tail (Bottom 50%)',
      itemCount: tailItems.size,
      interactionCount: tailInteractions,
      interactionSharePct: Number(((tailInteractions / totalInteractions) * 100).toFixed(1)),
      avgRecommendationsReceived: tailItems.size > 0 ? Number((tailRecs / tailItems.size).toFixed(1)) : 0,
    },
  ];

  // Gini concentration calculation
  const allFreqs = items.map(i => itemRecCounts.get(i.itemId) || 0).sort((a, b) => a - b);
  let gini = 0;
  const N = allFreqs.length;
  const totalFreqSum = allFreqs.reduce((sum, f) => sum + f, 0);
  if (N > 0 && totalFreqSum > 0) {
    let cum = 0;
    for (let i = 0; i < N; i++) {
      cum += (i + 1) * allFreqs[i];
    }
    gini = (2 * cum) / (N * totalFreqSum) - (N + 1) / N;
    gini = Math.max(0, Math.min(1, gini));
  }

  const avgRecPop = totalRecsGenerated > 0 ? Number((sumRecPopularity / totalRecsGenerated).toFixed(1)) : 0;
  const recommendedTailItemsCount = Array.from(tailItems).filter(id => (itemRecCounts.get(id) || 0) > 0).length;
  const longTailCoveragePct = tailItems.size > 0
    ? Number(((recommendedTailItemsCount / tailItems.size) * 100).toFixed(1))
    : 0;

  // Group Fairness Analysis by User Activity & User Cohort
  const groupFairnessAnalysis: BiasAndCoverageAnalysis['groupFairnessAnalysis'] = [];

  // Group 1: User Activity Tiers
  const activityGroups: { name: string; filter: (u: typeof dataset.users extends Map<string, infer U> ? U : never) => boolean }[] = [
    { name: 'Casual (≤ 3 interactions)', filter: u => u.interactionCount <= 3 },
    { name: 'Moderate (4 - 8 interactions)', filter: u => u.interactionCount > 3 && u.interactionCount <= 8 },
    { name: 'Power Users (> 8 interactions)', filter: u => u.interactionCount > 8 },
  ];

  const activityAnalysisGroups: BiasAndCoverageAnalysis['groupFairnessAnalysis'][0]['groups'] = [];

  for (const grp of activityGroups) {
    const matchingUsers = Array.from(dataset.users.values()).filter(grp.filter);
    if (matchingUsers.length === 0) continue;

    let pSum = 0;
    let rSum = 0;
    let ndcgSum = 0;
    let totalIntSum = 0;
    let validCount = 0;

    for (const u of matchingUsers) {
      totalIntSum += u.interactionCount;
      const testRelevant = new Set(
        split.test.filter(i => i.userId === u.userId && i.isPositive).map(i => i.itemId)
      );

      if (testRelevant.size === 0) continue;
      validCount++;

      const recs = model.recommend(u.userId, k, true);
      let hits = 0;
      let dcg = 0;

      for (let r = 0; r < recs.length; r++) {
        if (testRelevant.has(recs[r].itemId)) {
          hits++;
          dcg += 1 / Math.log2(r + 2);
        }
      }

      const p = hits / k;
      const recVal = hits / testRelevant.size;
      let idcg = 0;
      for (let r = 0; r < Math.min(k, testRelevant.size); r++) {
        idcg += 1 / Math.log2(r + 2);
      }
      const ndcg = idcg > 0 ? dcg / idcg : 0;

      pSum += p;
      rSum += recVal;
      ndcgSum += ndcg;
    }

    const den = Math.max(1, validCount);
    activityAnalysisGroups.push({
      groupName: grp.name,
      userCount: matchingUsers.length,
      avgInteractions: Number((totalIntSum / matchingUsers.length).toFixed(1)),
      precisionAtK: Number((pSum / den).toFixed(3)),
      recallAtK: Number((rSum / den).toFixed(3)),
      ndcgAtK: Number((ndcgSum / den).toFixed(3)),
    });
  }

  groupFairnessAnalysis.push({
    groupDimension: 'User Activity Level',
    groups: activityAnalysisGroups,
  });

  // Group 2: User Cohorts / Segments if available
  if (dataset.summary.userSegments.length > 0) {
    const cohortAnalysisGroups: BiasAndCoverageAnalysis['groupFairnessAnalysis'][0]['groups'] = [];

    for (const seg of dataset.summary.userSegments) {
      const matchingUsers = Array.from(dataset.users.values()).filter(u => u.segment === seg);
      if (matchingUsers.length === 0) continue;

      let pSum = 0;
      let rSum = 0;
      let ndcgSum = 0;
      let totalIntSum = 0;
      let validCount = 0;

      for (const u of matchingUsers) {
        totalIntSum += u.interactionCount;
        const testRelevant = new Set(
          split.test.filter(i => i.userId === u.userId && i.isPositive).map(i => i.itemId)
        );

        if (testRelevant.size === 0) continue;
        validCount++;

        const recs = model.recommend(u.userId, k, true);
        let hits = 0;
        let dcg = 0;

        for (let r = 0; r < recs.length; r++) {
          if (testRelevant.has(recs[r].itemId)) {
            hits++;
            dcg += 1 / Math.log2(r + 2);
          }
        }

        const p = hits / k;
        const recVal = hits / testRelevant.size;
        let idcg = 0;
        for (let r = 0; r < Math.min(k, testRelevant.size); r++) {
          idcg += 1 / Math.log2(r + 2);
        }
        const ndcg = idcg > 0 ? dcg / idcg : 0;

        pSum += p;
        rSum += recVal;
        ndcgSum += ndcg;
      }

      const den = Math.max(1, validCount);
      cohortAnalysisGroups.push({
        groupName: seg,
        userCount: matchingUsers.length,
        avgInteractions: Number((totalIntSum / matchingUsers.length).toFixed(1)),
        precisionAtK: Number((pSum / den).toFixed(3)),
        recallAtK: Number((rSum / den).toFixed(3)),
        ndcgAtK: Number((ndcgSum / den).toFixed(3)),
      });
    }

    groupFairnessAnalysis.push({
      groupDimension: 'User Cohort / Segment',
      groups: cohortAnalysisGroups,
    });
  }

  // Identified Risks
  const identifiedRisks: BiasAndCoverageAnalysis['identifiedRisks'] = [
    {
      title: 'Popularity & Exposure Bias',
      category: 'popularity_bias',
      severity: gini > 0.45 ? 'high' : 'medium',
      description: 'The top 20% head items dominate interactions and recommendation exposure, leaving niche/tail items under-recommended.',
      evidence: `Head items account for ${itemPopularityDistribution[0]?.interactionSharePct}% of interactions with Gini concentration of ${gini.toFixed(3)}.`,
      mitigationStrategy: 'Apply popularity-aware discounting (penalty λ) or calibrated re-ranking to boost long-tail exposure.',
    },
    {
      title: 'Activity Disparity (Cold-Start vs Power Users)',
      category: 'cold_start',
      severity: (activityAnalysisGroups[0]?.recallAtK || 0) < (activityAnalysisGroups[activityAnalysisGroups.length - 1]?.recallAtK || 0) * 0.7 ? 'high' : 'medium',
      description: 'Casual or new users with sparse histories experience lower recommendation accuracy compared to power users.',
      evidence: `Casual users achieved Recall@${k} of ${activityAnalysisGroups[0]?.recallAtK ?? 0} vs ${activityAnalysisGroups[activityAnalysisGroups.length - 1]?.recallAtK ?? 0} for power users.`,
      mitigationStrategy: 'Hybridize with content-based metadata and on-boarding preference questionnaires to bridge the cold-start gap.',
    },
    {
      title: 'Feedback Loop & Echo Chamber Risk',
      category: 'feedback_loop',
      severity: 'medium',
      description: 'Consistently recommending previously popular items reinforces historical biases and prevents the system from discovering new user interests.',
      evidence: `Observed recommendation popularity (${avgRecPop} avg) exceeds uniform catalog sampling.`,
      mitigationStrategy: 'Introduce controlled exploration (epsilon-greedy sampling or category diversity constraints).',
    },
  ];

  return {
    itemPopularityDistribution,
    giniConcentration: Number(gini.toFixed(3)),
    averageRecommendationPopularity: avgRecPop,
    longTailCoveragePct,
    groupFairnessAnalysis,
    identifiedRisks,
  };
}

/**
 * Apply Popularity-Aware Re-ranking and Category Diversity Quota
 */
export function applyMitigatedReranking(
  baseRecs: RecommendationItem[],
  itemsMetadata: Map<string, ItemMetadata>,
  config: MitigationConfig,
  k: number = 10
): RecommendationItem[] {
  if (baseRecs.length === 0) return [];

  // Step 1: Score penalty for popularity
  // S_new = S_orig - lambda * log(1 + popularity) / max_log_pop
  const maxPop = Math.max(...Array.from(itemsMetadata.values()).map(i => i.popularityCount), 1);
  const maxLogPop = Math.log(1 + maxPop) || 1;

  const lambda = config.popularityDiscountLambda; // 0.0 to 1.0

  const penalized = baseRecs.map(rec => {
    const meta = itemsMetadata.get(rec.itemId);
    const pop = meta?.popularityCount || 0;
    const popPenalty = lambda * (Math.log(1 + pop) / maxLogPop);
    const adjustedScore = Math.max(0, rec.predictedScore * (1 - popPenalty));

    return {
      ...rec,
      predictedScore: Number(adjustedScore.toFixed(4)),
      explanation: {
        ...rec.explanation,
        primarySignal: lambda > 0
          ? `${rec.explanation.primarySignal} (Mitigation applied: λ=${lambda.toFixed(2)} popularity discount).`
          : rec.explanation.primarySignal,
        scoreBreakdown: {
          ...rec.explanation.scoreBreakdown,
          'Base Score': rec.predictedScore,
          'Popularity Penalty (λ)': Number(popPenalty.toFixed(3)),
          'Adjusted Score': Number(adjustedScore.toFixed(3)),
        },
      },
    };
  });

  // Sort by adjusted score DESC
  penalized.sort((a, b) => b.predictedScore - a.predictedScore);

  // Step 2: Apply Category Diversity Quota if configured
  const quota = config.categoryDiversityQuota; // e.g. max 2 items per category
  let finalRecs: RecommendationItem[] = [];

  if (quota > 0) {
    const categoryCounts = new Map<string, number>();
    const deferred: RecommendationItem[] = [];

    for (const rec of penalized) {
      const cat = rec.itemCategory || 'Uncategorized';
      const count = categoryCounts.get(cat) || 0;

      if (count < quota) {
        categoryCounts.set(cat, count + 1);
        finalRecs.push(rec);
      } else {
        deferred.push(rec);
      }

      if (finalRecs.length >= k) break;
    }

    // Fill remaining slots if needed
    if (finalRecs.length < k && deferred.length > 0) {
      for (const rec of deferred) {
        finalRecs.push(rec);
        if (finalRecs.length >= k) break;
      }
    }
  } else {
    finalRecs = penalized.slice(0, k);
  }

  // Recalculate ranks and normalized scores
  const maxScore = Math.max(...finalRecs.map(r => r.predictedScore), 1e-6);
  return finalRecs.map((rec, idx) => ({
    ...rec,
    rank: idx + 1,
    normalizedScore: Number((rec.predictedScore / maxScore).toFixed(4)),
  }));
}
