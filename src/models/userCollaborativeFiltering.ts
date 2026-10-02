import {
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  RecommendationItem,
} from '../types/recsys';
import { PopularityRecommender } from './popularity';
import {
  normalizeScores,
  RecommenderModel,
  ScoredCandidate,
  sortRankingsDeterministically,
} from './recommenderBase';

export interface UserCFConfig {
  similarityMetric?: 'pearson' | 'cosine';
  topKNeighbors?: number;
  minOverlap?: number;
}

export class UserBasedCFRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'user_cf';
  public name = 'User-Based Collaborative Filtering';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private userRatings: Map<string, Map<string, number>> = new Map();
  private itemRatings: Map<string, Map<string, number>> = new Map();
  private userMeans: Map<string, number> = new Map();
  private popularityFallback: PopularityRecommender;
  private config: UserCFConfig;

  constructor(config: UserCFConfig = {}) {
    this.config = {
      similarityMetric: config.similarityMetric || 'pearson',
      topKNeighbors: config.topKNeighbors || 15,
      minOverlap: config.minOverlap || 1,
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

    this.popularityFallback.train(trainInteractions, itemsMetadata);

    if (trainInteractions.length === 0) {
      this.isTrained = true;
      return;
    }

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

    for (const [userId, ratings] of this.userRatings.entries()) {
      let sum = 0;
      for (const val of ratings.values()) sum += val;
      this.userMeans.set(userId, sum / ratings.size);
    }

    this.isTrained = true;
  }

  private computeUserSimilarity(
    ratingsA: Map<string, number>,
    ratingsB: Map<string, number>,
    meanA: number,
    meanB: number
  ): number {
    const commonItems: string[] = [];
    for (const itemId of ratingsA.keys()) {
      if (ratingsB.has(itemId)) {
        commonItems.push(itemId);
      }
    }

    if (commonItems.length < (this.config.minOverlap || 1)) return 0;

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (const it of commonItems) {
      const diffA = this.config.similarityMetric === 'pearson' ? ratingsA.get(it)! - meanA : ratingsA.get(it)!;
      const diffB = this.config.similarityMetric === 'pearson' ? ratingsB.get(it)! - meanB : ratingsB.get(it)!;
      num += diffA * diffB;
      denA += diffA * diffA;
      denB += diffB * diffB;
    }

    const denominator = Math.sqrt(denA) * Math.sqrt(denB);
    if (denominator <= 1e-9) return 0;
    return Math.max(0, num / denominator);
  }

  public scoreCandidate(userId: string, itemId: string): number {
    const targetRatings = this.userRatings.get(userId);
    if (!targetRatings || targetRatings.size === 0) {
      return this.popularityFallback.scoreCandidate(userId, itemId);
    }

    const targetMean = this.userMeans.get(userId) || 3.0;
    const itemRatingsMap = this.itemRatings.get(itemId);
    if (!itemRatingsMap || itemRatingsMap.size === 0) {
      return 0;
    }

    let weightedDiffSum = 0;
    let simSum = 0;

    for (const [otherUserId, otherRating] of itemRatingsMap.entries()) {
      if (otherUserId === userId) continue;
      const otherRatings = this.userRatings.get(otherUserId);
      if (!otherRatings) continue;

      const otherMean = this.userMeans.get(otherUserId) || 3.0;
      const sim = this.computeUserSimilarity(targetRatings, otherRatings, targetMean, otherMean);

      if (sim > 0.05) {
        weightedDiffSum += sim * (otherRating - otherMean);
        simSum += Math.abs(sim);
      }
    }

    if (simSum > 0) {
      return targetMean + (weightedDiffSum / simSum);
    }

    return 0;
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

    if (userRatingsMap.size === 0) {
      const popRecs = this.popularityFallback.recommend(userId, k, filterConsumed, userHistory);
      return popRecs.map(r => ({
        ...r,
        explanation: {
          primarySignal: `Cold-Start User: No peer history found for "${userId}". Falling back to top popularity baseline.`,
          signalType: 'fallback',
          confidence: 'low',
          isFallback: true,
        },
        isColdStartFallback: true,
      }));
    }

    let targetSum = 0;
    for (const v of userRatingsMap.values()) targetSum += v;
    const targetMean = targetSum / userRatingsMap.size;

    const consumedSet = new Set<string>();
    if (filterConsumed) {
      for (const itemId of userRatingsMap.keys()) {
        consumedSet.add(itemId);
      }
    }

    // Find similar neighbors
    const neighbors: { userId: string; similarity: number; mean: number }[] = [];
    for (const [otherUserId, otherRatings] of this.userRatings.entries()) {
      if (otherUserId === userId) continue;
      const otherMean = this.userMeans.get(otherUserId) || 3.0;
      const sim = this.computeUserSimilarity(userRatingsMap, otherRatings, targetMean, otherMean);
      if (sim > 0.05) {
        neighbors.push({ userId: otherUserId, similarity: sim, mean: otherMean });
      }
    }

    neighbors.sort((a, b) => b.similarity - a.similarity);
    const topNeighbors = neighbors.slice(0, this.config.topKNeighbors || 15);

    const candidates: ScoredCandidate[] = [];
    const allItemIds = Array.from(this.itemsMetadata.keys());

    for (const candItemId of allItemIds) {
      if (filterConsumed && consumedSet.has(candItemId)) continue;

      let weightedDiffSum = 0;
      let simSum = 0;
      const neighborContributors: { userId: string; similarity: number; rating: number }[] = [];

      for (const n of topNeighbors) {
        const otherRating = this.userRatings.get(n.userId)?.get(candItemId);
        if (otherRating !== undefined) {
          weightedDiffSum += n.similarity * (otherRating - n.mean);
          simSum += Math.abs(n.similarity);
          neighborContributors.push({
            userId: n.userId,
            similarity: Number(n.similarity.toFixed(3)),
            rating: otherRating,
          });
        }
      }

      if (simSum > 0) {
        const predictedRating = targetMean + (weightedDiffSum / simSum);
        neighborContributors.sort((a, b) => b.similarity - a.similarity);

        const topContributors = neighborContributors.slice(0, 3);
        const neighborDesc = topContributors
          .map(c => `User ${c.userId} (sim ${(c.similarity * 100).toFixed(0)}%, score: ${c.rating})`)
          .join(', ');

        candidates.push({
          itemId: candItemId,
          score: predictedRating,
          explanation: {
            primarySignal: `Recommended by ${neighborContributors.length} similar peer user(s) with taste overlap: ${neighborDesc}.`,
            signalType: 'similarity',
            contributingNeighbors: topContributors,
            confidence: neighborContributors.length >= 2 ? 'high' : 'medium',
            isFallback: false,
            scoreBreakdown: {
              'Baseline Target Mean': Number(targetMean.toFixed(2)),
              'Neighbor Peer Consensus': Number((weightedDiffSum / simSum).toFixed(2)),
              'Active Similar Peers': neighborContributors.length,
            },
          },
        });
      } else {
        const popScore = this.popularityFallback.scoreCandidate(userId, candItemId);
        candidates.push({
          itemId: candItemId,
          score: popScore * 0.1,
          explanation: {
            primarySignal: `Item has no ratings from your closest neighbor peers. Ranked via global popularity.`,
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
