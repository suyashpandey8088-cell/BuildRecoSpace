import {
  DataSplit,
  EvaluationMetrics,
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  ModelBenchmarkResult,
} from '../types/recsys';
import { ContentBasedRecommender } from '../models/contentBased';
import { HybridRecommender } from '../models/hybridModel';
import { ItemBasedCFRecommender } from '../models/itemCollaborativeFiltering';
import { MatrixFactorizationRecommender } from '../models/matrixFactorization';
import { PopularityRecommender } from '../models/popularity';
import { RecommenderModel } from '../models/recommenderBase';
import { UserBasedCFRecommender } from '../models/userCollaborativeFiltering';

export interface EvaluationOptions {
  kValues: number[];
  selectedK: number;
  positiveThresholdOnly: boolean;
}

export function evaluateModelOnSplit(
  model: RecommenderModel,
  split: DataSplit,
  itemsMetadata: Map<string, ItemMetadata>,
  k: number = 10,
  positiveOnly: boolean = true
): EvaluationMetrics {
  const startTime = performance.now();

  // Make sure model is trained on train set
  if (!model.isTrained) {
    model.train(split.train, itemsMetadata);
  }

  // Group test interactions by user
  const testUserRelevantItems = new Map<string, Set<string>>();
  for (const inter of split.test) {
    if (positiveOnly && !inter.isPositive) continue;
    let set = testUserRelevantItems.get(inter.userId);
    if (!set) {
      set = new Set();
      testUserRelevantItems.set(inter.userId, set);
    }
    set.add(inter.itemId);
  }

  // Precompute item global probabilities for Novelty score
  const trainItemCounts = new Map<string, number>();
  for (const inter of split.train) {
    trainItemCounts.set(inter.itemId, (trainItemCounts.get(inter.itemId) || 0) + 1);
  }
  const totalTrainInteractions = split.train.length || 1;

  // We evaluate on users that are present in both train and test (or all test users)
  const evaluatedUsers = Array.from(testUserRelevantItems.keys());
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumNdcg = 0;
  let sumMrr = 0;
  let sumNovelty = 0;
  let validUserCount = 0;
  let usersWithRecommendations = 0;

  const catalogAllItems = new Set(itemsMetadata.keys());
  const uniqueRecommendedItems = new Set<string>();
  const itemRecommendationFreq = new Map<string, number>();

  for (const userId of evaluatedUsers) {
    const relevantItems = testUserRelevantItems.get(userId);
    if (!relevantItems || relevantItems.size === 0) continue;

    validUserCount++;

    // Generate Top-K recommendations, excluding training consumed items
    const recs = model.recommend(userId, k, true);

    if (recs.length > 0) {
      usersWithRecommendations++;
    }

    let hits = 0;
    let dcg = 0;
    let firstHitRank = 0;
    let userNoveltySum = 0;

    for (let r = 0; r < recs.length; r++) {
      const rec = recs[r];
      const rank = r + 1;
      const itemId = rec.itemId;

      uniqueRecommendedItems.add(itemId);
      itemRecommendationFreq.set(itemId, (itemRecommendationFreq.get(itemId) || 0) + 1);

      // Novelty calculation: -log2(P(item))
      const count = trainItemCounts.get(itemId) || 0.5;
      const pItem = count / totalTrainInteractions;
      const selfInfo = -Math.log2(Math.max(pItem, 1e-6));
      userNoveltySum += selfInfo;

      if (relevantItems.has(itemId)) {
        hits++;
        dcg += 1 / Math.log2(rank + 1);
        if (firstHitRank === 0) {
          firstHitRank = rank;
        }
      }
    }

    // Precision & Recall
    const precision = hits / k;
    const recall = hits / relevantItems.size;
    sumPrecision += precision;
    sumRecall += recall;

    // Ideal DCG
    const idealHits = Math.min(k, relevantItems.size);
    let idcg = 0;
    for (let r = 1; r <= idealHits; r++) {
      idcg += 1 / Math.log2(r + 1);
    }
    const ndcg = idcg > 0 ? dcg / idcg : 0;
    sumNdcg += ndcg;

    // MRR
    const mrr = firstHitRank > 0 ? 1 / firstHitRank : 0;
    sumMrr += mrr;

    // Novelty
    const avgUserNovelty = recs.length > 0 ? userNoveltySum / recs.length : 0;
    sumNovelty += avgUserNovelty;
  }

  // Calculate Gini index across all items in catalog
  // Gini = (2 * sum(i * freq_i)) / (N * sum(freq)) - (N + 1) / N
  const allFreqs: number[] = [];
  for (const itemId of catalogAllItems) {
    allFreqs.push(itemRecommendationFreq.get(itemId) || 0);
  }
  allFreqs.sort((a, b) => a - b);

  let giniIndex = 0;
  const N = allFreqs.length;
  const totalFreqSum = allFreqs.reduce((sum, f) => sum + f, 0);

  if (N > 0 && totalFreqSum > 0) {
    let cumulativeSum = 0;
    for (let i = 0; i < N; i++) {
      cumulativeSum += (i + 1) * allFreqs[i];
    }
    giniIndex = (2 * cumulativeSum) / (N * totalFreqSum) - (N + 1) / N;
    giniIndex = Math.max(0, Math.min(1, giniIndex));
  }

  const denominator = Math.max(1, validUserCount);
  const catalogCoveragePct = catalogAllItems.size > 0
    ? Number(((uniqueRecommendedItems.size / catalogAllItems.size) * 100).toFixed(2))
    : 0;
  const userCoveragePct = evaluatedUsers.length > 0
    ? Number(((usersWithRecommendations / evaluatedUsers.length) * 100).toFixed(2))
    : 0;

  const computationTimeMs = Math.round(performance.now() - startTime);

  return {
    k,
    precisionAtK: Number((sumPrecision / denominator).toFixed(4)),
    recallAtK: Number((sumRecall / denominator).toFixed(4)),
    ndcgAtK: Number((sumNdcg / denominator).toFixed(4)),
    mrrAtK: Number((sumMrr / denominator).toFixed(4)),
    catalogCoveragePct,
    userCoveragePct,
    giniIndex: Number(giniIndex.toFixed(4)),
    noveltyScore: Number((sumNovelty / denominator).toFixed(3)),
    evaluatedUserCount: validUserCount,
    usersWithRelevantItems: validUserCount,
    skippedUserCount: split.testUsers.size - validUserCount,
    computationTimeMs,
  };
}

export function benchmarkAllModels(
  split: DataSplit,
  itemsMetadata: Map<string, ItemMetadata>,
  options: EvaluationOptions
): ModelBenchmarkResult[] {
  const k = options.selectedK;

  // Initialize and train models on train split
  const popularity = new PopularityRecommender();
  const itemCf = new ItemBasedCFRecommender();
  const userCf = new UserBasedCFRecommender();
  const matrixFact = new MatrixFactorizationRecommender();
  const contentBased = new ContentBasedRecommender();
  const hybrid = new HybridRecommender();

  const modelList: { model: RecommenderModel; desc: string }[] = [
    {
      model: popularity,
      desc: 'Global popularity baseline ranking by interaction volume & Bayesian average.',
    },
    {
      model: itemCf,
      desc: 'Item-Item Collaborative Filtering using Adjusted Cosine similarity matrix.',
    },
    {
      model: userCf,
      desc: 'User-User k-NN Collaborative Filtering using Pearson taste correlation.',
    },
    {
      model: matrixFact,
      desc: 'Latent Factor Matrix Factorization trained via Regularized SGD.',
    },
    {
      model: contentBased,
      desc: 'Content-Based Filtering matching TF-IDF item genres/titles with user history.',
    },
    {
      model: hybrid,
      desc: 'Hybrid ensemble blending CF (50%), Content (30%), and Popularity (20%).',
    },
  ];

  const results: ModelBenchmarkResult[] = [];

  for (const { model, desc } of modelList) {
    model.train(split.train, itemsMetadata);

    const primaryMetrics = evaluateModelOnSplit(
      model,
      split,
      itemsMetadata,
      k,
      options.positiveThresholdOnly
    );

    const metricsByK: Record<number, EvaluationMetrics> = {};
    for (const testK of options.kValues) {
      metricsByK[testK] = evaluateModelOnSplit(
        model,
        split,
        itemsMetadata,
        testK,
        options.positiveThresholdOnly
      );
    }

    results.push({
      algorithm: model.algorithm,
      name: model.name,
      description: desc,
      metrics: primaryMetrics,
      metricsByK,
    });
  }

  return results;
}
