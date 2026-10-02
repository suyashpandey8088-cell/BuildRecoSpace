import {
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  RecommendationItem,
} from '../types/recsys';
import {
  normalizeScores,
  RecommenderModel,
  ScoredCandidate,
  sortRankingsDeterministically,
} from './recommenderBase';

export interface PopularityModelConfig {
  rankingMetric?: 'bayesian_avg' | 'count' | 'avg_rating' | 'time_decay';
  priorWeight?: number; // C in Bayesian average (default 3.0)
  timeDecayHalfLifeDays?: number; // Half-life in days (default 30)
}

export class PopularityRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'popularity';
  public name = 'Popularity Baseline';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private userInteractionsMap: Map<string, Set<string>> = new Map();
  private itemScores: Map<string, { score: number; count: number; avgRating: number }> = new Map();
  private globalMeanRating = 3.5;
  private config: PopularityModelConfig;

  constructor(config: PopularityModelConfig = {}) {
    this.config = {
      rankingMetric: config.rankingMetric || 'bayesian_avg',
      priorWeight: config.priorWeight || 3.0,
      timeDecayHalfLifeDays: config.timeDecayHalfLifeDays || 30,
    };
  }

  public train(
    trainInteractions: Interaction[],
    itemsMetadata: Map<string, ItemMetadata>
  ): void {
    this.itemsMetadata = new Map(itemsMetadata);
    this.userInteractionsMap.clear();
    this.itemScores.clear();

    if (trainInteractions.length === 0) {
      this.isTrained = true;
      return;
    }

    // Build user interaction history
    for (const inter of trainInteractions) {
      let set = this.userInteractionsMap.get(inter.userId);
      if (!set) {
        set = new Set();
        this.userInteractionsMap.set(inter.userId, set);
      }
      set.add(inter.itemId);
    }

    // Calculate global average rating
    const totalRatingSum = trainInteractions.reduce((sum, i) => sum + i.value, 0);
    this.globalMeanRating = totalRatingSum / trainInteractions.length;

    // Item stats
    const itemStats = new Map<string, { sum: number; count: number; positiveCount: number; decaySum: number }>();
    const now = Math.max(...trainInteractions.map(i => i.timestamp || 0), Date.now());
    const halfLifeMs = (this.config.timeDecayHalfLifeDays || 30) * 86400000;

    for (const inter of trainInteractions) {
      let stat = itemStats.get(inter.itemId);
      if (!stat) {
        stat = { sum: 0, count: 0, positiveCount: 0, decaySum: 0 };
        itemStats.set(inter.itemId, stat);
      }
      stat.sum += inter.value;
      stat.count += 1;
      if (inter.isPositive) stat.positiveCount += 1;

      if (inter.timestamp) {
        const ageMs = Math.max(0, now - inter.timestamp);
        const weight = Math.pow(0.5, ageMs / halfLifeMs);
        stat.decaySum += inter.value * weight;
      } else {
        stat.decaySum += inter.value;
      }
    }

    // Populate all known items (including items in metadata that might have 0 train interactions)
    for (const [itemId, meta] of this.itemsMetadata.entries()) {
      const stat = itemStats.get(itemId);
      if (!stat) {
        this.itemScores.set(itemId, { score: 0, count: 0, avgRating: 0 });
        continue;
      }

      const avg = stat.sum / stat.count;
      let finalScore = 0;

      if (this.config.rankingMetric === 'count') {
        finalScore = stat.count;
      } else if (this.config.rankingMetric === 'avg_rating') {
        finalScore = avg;
      } else if (this.config.rankingMetric === 'time_decay') {
        finalScore = stat.decaySum;
      } else {
        // Bayesian weighted average (IMDb style formula)
        // (C * m + sum_r) / (C + v)
        const C = this.config.priorWeight || 3.0;
        finalScore = (C * this.globalMeanRating + stat.sum) / (C + stat.count);
      }

      this.itemScores.set(itemId, {
        score: finalScore,
        count: stat.count,
        avgRating: Number(avg.toFixed(2)),
      });
    }

    this.isTrained = true;
  }

  public scoreCandidate(userId: string, itemId: string): number {
    return this.itemScores.get(itemId)?.score || 0;
  }

  public recommend(
    userId: string,
    k: number = 10,
    filterConsumed: boolean = true,
    userHistory?: Interaction[]
  ): RecommendationItem[] {
    const consumedSet = new Set<string>();
    if (filterConsumed) {
      const trainedConsumed = this.userInteractionsMap.get(userId);
      if (trainedConsumed) {
        for (const it of trainedConsumed) consumedSet.add(it);
      }
      if (userHistory) {
        for (const it of userHistory) consumedSet.add(it.itemId);
      }
    }

    const candidates: ScoredCandidate[] = [];

    for (const [itemId, data] of this.itemScores.entries()) {
      if (filterConsumed && consumedSet.has(itemId)) {
        continue;
      }

      const meta = this.itemsMetadata.get(itemId);
      const explanationText = `Ranked #${candidates.length + 1} by global popularity with ${data.count} interactions and an average score of ${data.avgRating.toFixed(1)}.`;

      candidates.push({
        itemId,
        score: data.score,
        explanation: {
          primarySignal: explanationText,
          signalType: 'popularity',
          confidence: data.count > 5 ? 'high' : data.count > 1 ? 'medium' : 'low',
          isFallback: false,
          scoreBreakdown: {
            'Global Rating': data.avgRating,
            'Interaction Count': data.count,
            'Popularity Score': Number(data.score.toFixed(3)),
          },
        },
      });
    }

    const sorted = sortRankingsDeterministically(candidates, this.itemsMetadata).slice(0, k);
    const normalized = normalizeScores(sorted);

    // Enrich with item metadata
    return normalized.map((item, index) => {
      const meta = this.itemsMetadata.get(item.itemId);
      return {
        ...item,
        itemName: meta?.name || item.itemId,
        itemCategory: meta?.category || 'Uncategorized',
        rank: index + 1,
        explanation: {
          ...item.explanation,
          primarySignal: `Ranked #${index + 1} by global popularity with ${this.itemScores.get(item.itemId)?.count || 0} interactions (avg score: ${this.itemScores.get(item.itemId)?.avgRating || 0}).`,
        },
      };
    });
  }
}
