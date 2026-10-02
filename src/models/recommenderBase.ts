import {
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  RecommendationItem,
} from '../types/recsys';

export interface ScoredCandidate {
  itemId: string;
  score: number;
  explanation: RecommendationItem['explanation'];
}

export interface RecommenderModel {
  algorithm: ModelAlgorithm;
  name: string;
  isTrained: boolean;
  train(trainInteractions: Interaction[], itemsMetadata: Map<string, ItemMetadata>): void;
  recommend(
    userId: string,
    k: number,
    filterConsumed?: boolean,
    userHistory?: Interaction[]
  ): RecommendationItem[];
  scoreCandidate(userId: string, itemId: string, userHistory?: Interaction[]): number;
}

/**
 * Deterministic tie-breaking sorting comparator:
 * 1. Score DESC (higher is better)
 * 2. Item global popularity count DESC
 * 3. Item ID ASC (stable string comparison)
 */
export function sortRankingsDeterministically(
  candidates: ScoredCandidate[],
  itemsMetadata: Map<string, ItemMetadata>
): ScoredCandidate[] {
  return candidates.sort((a, b) => {
    // 1. Primary score difference (with small epsilon tolerance)
    const diff = b.score - a.score;
    if (Math.abs(diff) > 1e-7) {
      return diff;
    }

    // 2. Global popularity tie-breaker
    const popA = itemsMetadata.get(a.itemId)?.popularityCount || 0;
    const popB = itemsMetadata.get(b.itemId)?.popularityCount || 0;
    if (popA !== popB) {
      return popB - popA;
    }

    // 3. Alphabetical Item ID tie-breaker
    return a.itemId.localeCompare(b.itemId);
  });
}

/**
 * Normalizes scores to 0-1 range for uniform visualization
 */
export function normalizeScores(
  candidates: ScoredCandidate[],
  minExpected?: number,
  maxExpected?: number
): RecommendationItem[] {
  if (candidates.length === 0) return [];

  const rawScores = candidates.map(c => c.score);
  const minScore = minExpected ?? Math.min(...rawScores);
  const maxScore = maxExpected ?? Math.max(...rawScores);
  const range = maxScore - minScore;

  return candidates.map((candidate, index) => {
    let normalized = 1.0;
    if (range > 1e-7) {
      normalized = Math.max(0, Math.min(1, (candidate.score - minScore) / range));
    } else if (rawScores.length === 1) {
      normalized = 1.0;
    }

    return {
      rank: index + 1,
      itemId: candidate.itemId,
      itemName: candidate.itemId,
      itemCategory: 'Uncategorized',
      predictedScore: Number(candidate.score.toFixed(4)),
      normalizedScore: Number(normalized.toFixed(4)),
      explanation: candidate.explanation,
      isColdStartFallback: candidate.explanation.isFallback,
    };
  });
}
