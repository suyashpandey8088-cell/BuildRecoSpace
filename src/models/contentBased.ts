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

export class ContentBasedRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'content_based';
  public name = 'Content-Based Filtering (Attribute & Profile Match)';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private itemVectors: Map<string, Map<string, number>> = new Map(); // itemId -> { feature -> weight }
  private userProfiles: Map<string, Map<string, number>> = new Map(); // userId -> { feature -> weight }
  private userInteractionsMap: Map<string, Set<string>> = new Map();
  private vocabulary: Set<string> = new Set();
  private popularityFallback: PopularityRecommender;

  constructor() {
    this.popularityFallback = new PopularityRecommender();
  }

  public train(
    trainInteractions: Interaction[],
    itemsMetadata: Map<string, ItemMetadata>
  ): void {
    this.itemsMetadata = new Map(itemsMetadata);
    this.itemVectors.clear();
    this.userProfiles.clear();
    this.userInteractionsMap.clear();
    this.vocabulary.clear();

    this.popularityFallback.train(trainInteractions, itemsMetadata);

    if (itemsMetadata.size === 0) {
      this.isTrained = true;
      return;
    }

    // Step 1: Build item feature vectors (TF-IDF style on Category + Title terms)
    const docFrequencies = new Map<string, number>();

    for (const [itemId, meta] of this.itemsMetadata.entries()) {
      const tokens: string[] = [];
      if (meta.category) {
        // Boost category tokens
        const catClean = meta.category.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        for (const word of catClean.split(/\s+/)) {
          if (word.length > 2) {
            tokens.push(`cat:${word}`, `cat:${word}`); // 2x weight
          }
        }
      }

      if (meta.name) {
        const titleClean = meta.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        for (const word of titleClean.split(/\s+/)) {
          if (word.length > 2 && !['the', 'and', 'for', 'with', 'part', 'one', 'two', 'pro', 'max'].includes(word)) {
            tokens.push(`word:${word}`);
          }
        }
      }

      const termCounts = new Map<string, number>();
      for (const t of tokens) {
        termCounts.set(t, (termCounts.get(t) || 0) + 1);
        this.vocabulary.add(t);
      }

      for (const term of termCounts.keys()) {
        docFrequencies.set(term, (docFrequencies.get(term) || 0) + 1);
      }

      this.itemVectors.set(itemId, termCounts);
    }

    // Convert raw counts to normalized TF-IDF vectors
    const totalDocs = this.itemsMetadata.size;
    for (const [itemId, termCounts] of this.itemVectors.entries()) {
      const tfIdfVec = new Map<string, number>();
      let normSq = 0;

      for (const [term, count] of termCounts.entries()) {
        const tf = count;
        const df = docFrequencies.get(term) || 1;
        const idf = Math.log((1 + totalDocs) / (1 + df)) + 1;
        const weight = tf * idf;
        tfIdfVec.set(term, weight);
        normSq += weight * weight;
      }

      // L2 Normalize
      const norm = Math.sqrt(normSq) || 1;
      for (const [term, weight] of tfIdfVec.entries()) {
        tfIdfVec.set(term, weight / norm);
      }
      this.itemVectors.set(itemId, tfIdfVec);
    }

    // Step 2: Build user profile vectors from training interactions
    const userRatingSums = new Map<string, Map<string, number>>();

    for (const inter of trainInteractions) {
      let set = this.userInteractionsMap.get(inter.userId);
      if (!set) {
        set = new Set();
        this.userInteractionsMap.set(inter.userId, set);
      }
      set.add(inter.itemId);

      const iVec = this.itemVectors.get(inter.itemId);
      if (!iVec) continue;

      let uVec = userRatingSums.get(inter.userId);
      if (!uVec) {
        uVec = new Map();
        userRatingSums.set(inter.userId, uVec);
      }

      // Scale by interaction value (e.g. 5.0 rating gives 5x weight)
      for (const [term, weight] of iVec.entries()) {
        uVec.set(term, (uVec.get(term) || 0) + weight * inter.value);
      }
    }

    // Normalize user vectors
    for (const [userId, rawVec] of userRatingSums.entries()) {
      let normSq = 0;
      for (const val of rawVec.values()) normSq += val * val;
      const norm = Math.sqrt(normSq) || 1;

      const normalizedVec = new Map<string, number>();
      for (const [term, val] of rawVec.entries()) {
        normalizedVec.set(term, val / norm);
      }
      this.userProfiles.set(userId, normalizedVec);
    }

    this.isTrained = true;
  }

  public scoreCandidate(userId: string, itemId: string): number {
    const uVec = this.userProfiles.get(userId);
    const iVec = this.itemVectors.get(itemId);
    if (!uVec || !iVec) return 0;

    let dot = 0;
    for (const [term, weight] of uVec.entries()) {
      const iWeight = iVec.get(term);
      if (iWeight) dot += weight * iWeight;
    }
    return dot;
  }

  public recommend(
    userId: string,
    k: number = 10,
    filterConsumed: boolean = true,
    userHistory?: Interaction[]
  ): RecommendationItem[] {
    let uVec = this.userProfiles.get(userId);

    // If new user with history provided dynamically
    if (!uVec && userHistory && userHistory.length > 0) {
      const rawVec = new Map<string, number>();
      for (const inter of userHistory) {
        const iVec = this.itemVectors.get(inter.itemId);
        if (iVec) {
          for (const [term, weight] of iVec.entries()) {
            rawVec.set(term, (rawVec.get(term) || 0) + weight * inter.value);
          }
        }
      }
      let normSq = 0;
      for (const val of rawVec.values()) normSq += val * val;
      const norm = Math.sqrt(normSq) || 1;
      uVec = new Map();
      for (const [term, val] of rawVec.entries()) {
        uVec.set(term, val / norm);
      }
    }

    const consumedSet = new Set<string>();
    if (filterConsumed) {
      const set = this.userInteractionsMap.get(userId);
      if (set) {
        for (const it of set) consumedSet.add(it);
      }
      if (userHistory) {
        for (const it of userHistory) consumedSet.add(it.itemId);
      }
    }

    if (!uVec || uVec.size === 0) {
      const popRecs = this.popularityFallback.recommend(userId, k, filterConsumed, userHistory);
      return popRecs.map(r => ({
        ...r,
        explanation: {
          primarySignal: `Cold-Start User: No content preference history for "${userId}". Falling back to popularity.`,
          signalType: 'fallback',
          confidence: 'low',
          isFallback: true,
        },
        isColdStartFallback: true,
      }));
    }

    const candidates: ScoredCandidate[] = [];
    const allItemIds = Array.from(this.itemsMetadata.keys());

    for (const itemId of allItemIds) {
      if (filterConsumed && consumedSet.has(itemId)) continue;

      const iVec = this.itemVectors.get(itemId);
      const meta = this.itemsMetadata.get(itemId);

      if (!iVec) {
        const popScore = this.popularityFallback.scoreCandidate(userId, itemId);
        candidates.push({
          itemId,
          score: popScore * 0.1,
          explanation: {
            primarySignal: `Item has no extracted content features.`,
            signalType: 'fallback',
            confidence: 'low',
            isFallback: true,
          },
        });
        continue;
      }

      let similarity = 0;
      const matchedTerms: string[] = [];

      for (const [term, uWeight] of uVec.entries()) {
        const iWeight = iVec.get(term);
        if (iWeight) {
          similarity += uWeight * iWeight;
          matchedTerms.push(term.replace('cat:', 'Category: ').replace('word:', 'Keyword: '));
        }
      }

      if (similarity > 0) {
        const topMatched = matchedTerms.slice(0, 3).join(', ');
        candidates.push({
          itemId,
          score: similarity,
          explanation: {
            primarySignal: `Strong content match (${(similarity * 100).toFixed(0)}% affinity) with your interests in ${topMatched || meta?.category || 'similar topics'}.`,
            signalType: 'content_match',
            matchedCategories: meta?.category ? [meta.category] : [],
            confidence: similarity > 0.4 ? 'high' : 'medium',
            isFallback: false,
            scoreBreakdown: {
              'Content Cosine Similarity': Number(similarity.toFixed(4)),
              'Matched Feature Attributes': matchedTerms.length,
            },
          },
        });
      } else {
        const popScore = this.popularityFallback.scoreCandidate(userId, itemId);
        candidates.push({
          itemId,
          score: popScore * 0.05,
          explanation: {
            primarySignal: `No keyword/genre overlap with your previous interests.`,
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
