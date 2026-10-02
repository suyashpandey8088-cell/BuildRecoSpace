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

export interface MatrixFactorizationConfig {
  latentFactors?: number;
  learningRate?: number;
  regularization?: number;
  epochs?: number;
  seed?: number;
}

function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MatrixFactorizationRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'matrix_factorization';
  public name = 'Matrix Factorization (Latent Factors / SVD)';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private userFactors: Map<string, Float64Array> = new Map();
  private itemFactors: Map<string, Float64Array> = new Map();
  private userBiases: Map<string, number> = new Map();
  private itemBiases: Map<string, number> = new Map();
  private userInteractionsMap: Map<string, Set<string>> = new Map();
  private globalMean: number = 3.5;
  private popularityFallback: PopularityRecommender;
  private config: MatrixFactorizationConfig;

  constructor(config: MatrixFactorizationConfig = {}) {
    this.config = {
      latentFactors: config.latentFactors || 8,
      learningRate: config.learningRate || 0.015,
      regularization: config.regularization || 0.02,
      epochs: config.epochs || 25,
      seed: config.seed || 42,
    };
    this.popularityFallback = new PopularityRecommender();
  }

  public train(
    trainInteractions: Interaction[],
    itemsMetadata: Map<string, ItemMetadata>
  ): void {
    this.itemsMetadata = new Map(itemsMetadata);
    this.userFactors.clear();
    this.itemFactors.clear();
    this.userBiases.clear();
    this.itemBiases.clear();
    this.userInteractionsMap.clear();

    this.popularityFallback.train(trainInteractions, itemsMetadata);

    if (trainInteractions.length === 0) {
      this.isTrained = true;
      return;
    }

    const d = this.config.latentFactors || 8;
    const lr = this.config.learningRate || 0.015;
    const reg = this.config.regularization || 0.02;
    const epochs = this.config.epochs || 25;
    const prng = createPrng(this.config.seed || 42);

    // Global mean
    const sumRatings = trainInteractions.reduce((acc, i) => acc + i.value, 0);
    this.globalMean = sumRatings / trainInteractions.length;

    // Track user consumed items
    for (const inter of trainInteractions) {
      let set = this.userInteractionsMap.get(inter.userId);
      if (!set) {
        set = new Set();
        this.userInteractionsMap.set(inter.userId, set);
      }
      set.add(inter.itemId);
    }

    // Initialize user vectors & biases
    const userIds = Array.from(this.userInteractionsMap.keys());
    for (const u of userIds) {
      const vec = new Float64Array(d);
      for (let f = 0; f < d; f++) {
        vec[f] = (prng() - 0.5) * 0.1;
      }
      this.userFactors.set(u, vec);
      this.userBiases.set(u, 0);
    }

    // Initialize item vectors & biases
    const itemIds = Array.from(this.itemsMetadata.keys());
    for (const i of itemIds) {
      const vec = new Float64Array(d);
      for (let f = 0; f < d; f++) {
        vec[f] = (prng() - 0.5) * 0.1;
      }
      this.itemFactors.set(i, vec);
      this.itemBiases.set(i, 0);
    }

    // Stochastic Gradient Descent
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const inter of trainInteractions) {
        const u = inter.userId;
        const i = inter.itemId;
        const r = inter.value;

        const p = this.userFactors.get(u);
        const q = this.itemFactors.get(i);
        if (!p || !q) continue;

        let dot = 0;
        for (let f = 0; f < d; f++) dot += p[f] * q[f];

        const bu = this.userBiases.get(u) || 0;
        const bi = this.itemBiases.get(i) || 0;
        const pred = this.globalMean + bu + bi + dot;
        const err = r - pred;

        // Update biases
        this.userBiases.set(u, bu + lr * (err - reg * bu));
        this.itemBiases.set(i, bi + lr * (err - reg * bi));

        // Update latent factors
        for (let f = 0; f < d; f++) {
          const pf = p[f];
          const qf = q[f];
          p[f] += lr * (err * qf - reg * pf);
          q[f] += lr * (err * pf - reg * qf);
        }
      }
    }

    this.isTrained = true;
  }

  public scoreCandidate(userId: string, itemId: string): number {
    const p = this.userFactors.get(userId);
    const q = this.itemFactors.get(itemId);
    if (!p || !q) {
      return this.popularityFallback.scoreCandidate(userId, itemId);
    }

    let dot = 0;
    for (let f = 0; f < p.length; f++) dot += p[f] * q[f];

    const bu = this.userBiases.get(userId) || 0;
    const bi = this.itemBiases.get(itemId) || 0;
    return this.globalMean + bu + bi + dot;
  }

  public recommend(
    userId: string,
    k: number = 10,
    filterConsumed: boolean = true,
    userHistory?: Interaction[]
  ): RecommendationItem[] {
    const userVec = this.userFactors.get(userId);
    const userBias = this.userBiases.get(userId) || 0;

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

    // Cold-start fallback
    if (!userVec) {
      const popRecs = this.popularityFallback.recommend(userId, k, filterConsumed, userHistory);
      return popRecs.map(r => ({
        ...r,
        explanation: {
          primarySignal: `Cold-Start User: Latent embedding not found for "${userId}". Ranked with popularity baseline.`,
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

      const itemVec = this.itemFactors.get(itemId);
      const itemBias = this.itemBiases.get(itemId) || 0;

      if (!itemVec) {
        const popScore = this.popularityFallback.scoreCandidate(userId, itemId);
        candidates.push({
          itemId,
          score: popScore * 0.1,
          explanation: {
            primarySignal: `Item has no latent representation. Ranked via baseline.`,
            signalType: 'fallback',
            confidence: 'low',
            isFallback: true,
          },
        });
        continue;
      }

      let dotProduct = 0;
      for (let f = 0; f < userVec.length; f++) {
        dotProduct += userVec[f] * itemVec[f];
      }

      const predictedScore = this.globalMean + userBias + itemBias + dotProduct;

      candidates.push({
        itemId,
        score: predictedScore,
        explanation: {
          primarySignal: `High latent factor alignment (affinity: ${dotProduct > 0 ? '+' : ''}${dotProduct.toFixed(3)}) across ${this.config.latentFactors} latent taste dimensions.`,
          signalType: 'collaborative_cluster',
          confidence: 'high',
          isFallback: false,
          scoreBreakdown: {
            'Global Mean (μ)': Number(this.globalMean.toFixed(2)),
            'User Bias (bu)': Number(userBias.toFixed(2)),
            'Item Bias (bi)': Number(itemBias.toFixed(2)),
            'Latent Affinity (P·Q)': Number(dotProduct.toFixed(3)),
          },
        },
      });
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
