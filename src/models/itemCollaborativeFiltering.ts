import {
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  RecommendationExplanation,
  RecommendationItem,
} from '../types/recsys';
import { PopularityRecommender } from './popularity';
import {
  normalizeScores,
  RecommenderModel,
  ScoredCandidate,
  sortRankingsDeterministically,
} from './recommenderBase';

export interface ItemCFConfig {
  similarityMetric?: 'cosine' | 'adjusted_cosine' | 'jaccard';
  topKNeighbors?: number;
  minSimilarityThreshold?: number;
}

export class ItemBasedCFRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'item_cf';
  public name = 'Item-Based Collaborative Filtering';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private userRatings: Map<string, Map<string, number>> = new Map(); // userId -> { itemId -> rating }
  private itemRatings: Map<string, Map<string, number>> = new Map(); // itemId -> { userId -> rating }
  private userMeans: Map<string, number> = new Map();
  private similarityMatrix: Map<string, Map<string, number>> = new Map();
  private popularityFallback: PopularityRecommender;
  private config: ItemCFConfig;

  constructor(config: ItemCFConfig = {}) {
    this.config = {
      similarityMetric: config.similarityMetric || 'adjusted_cosine',
      topKNeighbors: config.topKNeighbors || 20,
      minSimilarityThreshold: config.minSimilarityThreshold || 0.05,
    };
    this.popularityFallback = new PopularityRecommender();
  }

  public train(
    trainInteractions: Interaction[],
    itemsMetadata: Map<string, ItemMetadata>
  ): void {
    this.itemsMetadata = new Map(itemsMetadata);
    this.userRatings.clear();
    this.itemRatings.clear();
    this.userMeans.clear();
    this.similarityMatrix.clear();

    this.popularityFallback.train(trainInteractions, itemsMetadata);

    if (trainInteractions.length === 0) {
      this.isTrained = true;
      return;
    }

    // Index ratings
    for (const inter of trainInteractions) {
      let uMap = this.userRatings.get(inter.userId);
      if (!uMap) {
        uMap = new Map();
        this.userRatings.set(inter.userId, uMap);
      }
      uMap.set(inter.itemId, inter.value);

      let iMap = this.itemRatings.get(inter.itemId);
      if (!iMap) {
        iMap = new Map();
        this.itemRatings.set(inter.itemId, iMap);
      }
      iMap.set(inter.userId, inter.value);
    }

    // Compute user mean ratings
    for (const [userId, ratings] of this.userRatings.entries()) {
      let sum = 0;
      for (const val of ratings.values()) sum += val;
      this.userMeans.set(userId, sum / ratings.size);
    }

    // Compute Item-Item Similarity Matrix
    const itemIds = Array.from(this.itemsMetadata.keys());
    for (let i = 0; i < itemIds.length; i++) {
      const itemA = itemIds[i];
      const ratingsA = this.itemRatings.get(itemA);
      if (!ratingsA || ratingsA.size === 0) continue;

      let simMapA = this.similarityMatrix.get(itemA);
      if (!simMapA) {
        simMapA = new Map();
        this.similarityMatrix.set(itemA, simMapA);
      }

      for (let j = i + 1; j < itemIds.length; j++) {
        const itemB = itemIds[j];
        const ratingsB = this.itemRatings.get(itemB);
        if (!ratingsB || ratingsB.size === 0) continue;

        let simMapB = this.similarityMatrix.get(itemB);
        if (!simMapB) {
          simMapB = new Map();
          this.similarityMatrix.set(itemB, simMapB);
        }

        const sim = this.computeItemSimilarity(itemA, itemB, ratingsA, ratingsB);
        if (sim > (this.config.minSimilarityThreshold || 0)) {
          simMapA.set(itemB, sim);
          simMapB.set(itemA, sim);
        }
      }
    }

    this.isTrained = true;
  }

  private computeItemSimilarity(
    itemA: string,
    itemB: string,
    ratingsA: Map<string, number>,
    ratingsB: Map<string, number>
  ): number {
    const metric = this.config.similarityMetric;

    // Find overlapping users
    const commonUsers: string[] = [];
    for (const u of ratingsA.keys()) {
      if (ratingsB.has(u)) {
        commonUsers.push(u);
      }
    }

    if (commonUsers.length === 0) return 0;

    if (metric === 'jaccard') {
      const allUsers = new Set([...ratingsA.keys(), ...ratingsB.keys()]);
      return commonUsers.length / allUsers.size;
    }

    if (metric === 'adjusted_cosine') {
      let num = 0;
      let denA = 0;
      let denB = 0;

      for (const u of commonUsers) {
        const uMean = this.userMeans.get(u) || 0;
        const diffA = ratingsA.get(u)! - uMean;
        const diffB = ratingsB.get(u)! - uMean;
        num += diffA * diffB;
        denA += diffA * diffA;
        denB += diffB * diffB;
      }

      const denominator = Math.sqrt(denA) * Math.sqrt(denB);
      if (denominator <= 1e-9) return 0;
      return Math.max(0, num / denominator);
    }

    // Standard Cosine
    let num = 0;
    let denA = 0;
    let denB = 0;

    for (const u of commonUsers) {
      const valA = ratingsA.get(u)!;
      const valB = ratingsB.get(u)!;
      num += valA * valB;
      denA += valA * valA;
      denB += valB * valB;
    }

    const denominator = Math.sqrt(denA) * Math.sqrt(denB);
    if (denominator <= 1e-9) return 0;
    return Math.max(0, num / denominator);
  }

  public scoreCandidate(userId: string, itemId: string, userHistory?: Interaction[]): number {
    const userRatingsMap = this.userRatings.get(userId) || new Map<string, number>();
    if (userHistory) {
      for (const inter of userHistory) {
        userRatingsMap.set(inter.itemId, inter.value);
      }
    }

    if (userRatingsMap.size === 0) {
      return this.popularityFallback.scoreCandidate(userId, itemId);
    }

    const itemSims = this.similarityMatrix.get(itemId);
    if (!itemSims || itemSims.size === 0) {
      return 0;
    }

    let weightedSum = 0;
    let simSum = 0;

    for (const [histItemId, rating] of userRatingsMap.entries()) {
      const sim = itemSims.get(histItemId);
      if (sim && sim > 0) {
        weightedSum += sim * rating;
        simSum += Math.abs(sim);
      }
    }

    return simSum > 0 ? weightedSum / simSum : 0;
  }

  public recommend(
    userId: string,
    k: number = 10,
    filterConsumed: boolean = true,
    userHistory?: Interaction[]
  ): RecommendationItem[] {
    const userRatingsMap = new Map<string, number>(this.userRatings.get(userId) || new Map());
    if (userHistory) {
      for (const inter of userHistory) {
        userRatingsMap.set(inter.itemId, inter.value);
      }
    }

    const consumedSet = new Set<string>();
    if (filterConsumed) {
      for (const itemId of userRatingsMap.keys()) {
        consumedSet.add(itemId);
      }
    }

    // Handle Cold Start user (no history in training or provided history)
    if (userRatingsMap.size === 0) {
      const popRecs = this.popularityFallback.recommend(userId, k, filterConsumed, userHistory);
      return popRecs.map(r => ({
        ...r,
        explanation: {
          primarySignal: `Cold-Start User: No interaction history found for "${userId}". Falling back to top popularity baseline.`,
          signalType: 'fallback',
          confidence: 'low',
          isFallback: true,
        },
        isColdStartFallback: true,
      }));
    }

    const candidates: ScoredCandidate[] = [];
    const allItemIds = Array.from(this.itemsMetadata.keys());

    for (const candItemId of allItemIds) {
      if (filterConsumed && consumedSet.has(candItemId)) continue;

      const simMap = this.similarityMatrix.get(candItemId);
      const contributingItems: NonNullable<RecommendationExplanation['contributingItems']> = [];

      let weightedSum = 0;
      let simSum = 0;

      if (simMap) {
        for (const [histItemId, userRating] of userRatingsMap.entries()) {
          const sim = simMap.get(histItemId);
          if (sim && sim > 0) {
            weightedSum += sim * userRating;
            simSum += Math.abs(sim);
            contributingItems.push({
              itemId: histItemId,
              itemName: this.itemsMetadata.get(histItemId)?.name || histItemId,
              similarity: Number(sim.toFixed(3)),
              userRating,
            });
          }
        }
      }

      if (simSum > 0) {
        const predictedRating = weightedSum / simSum;
        contributingItems.sort((a, b) => (b.similarity * b.userRating) - (a.similarity * a.userRating));

        const topContributors = contributingItems.slice(0, 3);
        const topContributorStr = topContributors
          .map(c => `"${c.itemName}" (sim: ${(c.similarity * 100).toFixed(0)}%, your score: ${c.userRating})`)
          .join(', ');

        candidates.push({
          itemId: candItemId,
          score: predictedRating,
          explanation: {
            primarySignal: `Recommended because you interacted with ${topContributorStr}.`,
            signalType: 'similarity',
            contributingItems: topContributors,
            confidence: contributingItems.length >= 3 ? 'high' : 'medium',
            isFallback: false,
            scoreBreakdown: {
              'Predicted Score': Number(predictedRating.toFixed(3)),
              'Similar Historical Items': contributingItems.length,
              'Top Similarity': topContributors[0]?.similarity || 0,
            },
          },
        });
      } else {
        // Fallback for isolated items with 0 item-item similarity
        const popScore = this.popularityFallback.scoreCandidate(userId, candItemId);
        candidates.push({
          itemId: candItemId,
          score: popScore * 0.1, // scaled down so CF matches win
          explanation: {
            primarySignal: `Item has no co-interaction similarities with your history. Ranked using global popularity baseline.`,
            signalType: 'fallback',
            confidence: 'low',
            isFallback: true,
          },
        });
      }
    }

    const sorted = sortRankingsDeterministically(candidates, this.itemsMetadata).slice(0, k);
    const normalized = normalizeScores(sorted);

    return normalized.map((item, index) => {
      const meta = this.itemsMetadata.get(item.itemId);
      return {
        ...item,
        itemName: meta?.name || item.itemId,
        itemCategory: meta?.category || 'Uncategorized',
        rank: index + 1,
      };
    });
  }
}
