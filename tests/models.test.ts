import { describe, expect, it } from 'vitest';
import { SAMPLE_DATASETS } from '../src/data/sampleDatasets';
import { parseCsvText } from '../src/utils/csvParser';
import { prepareDataset } from '../src/services/dataPreparation';
import { splitDataset } from '../src/services/dataSplitter';
import { UserBasedCFRecommender } from '../src/models/userCollaborativeFiltering';
import { MatrixFactorizationRecommender } from '../src/models/matrixFactorization';
import { ContentBasedRecommender } from '../src/models/contentBased';
import { HybridRecommender } from '../src/models/hybridModel';
import { benchmarkAllModels } from '../src/services/evaluation';

describe('Advanced Recommendation Models', () => {
  const sample = SAMPLE_DATASETS[1]; // Ecommerce
  const parsed = parseCsvText(sample.csvData);
  const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
  const split = splitDataset(dataset!.interactions, {
    method: 'temporal_holdout',
    trainRatio: 0.75,
    valRatio: 0.1,
    testRatio: 0.15,
    randomSeed: 42,
  });

  it('User-Based CF produces ranked recommendations with neighbor signals', () => {
    const userCf = new UserBasedCFRecommender({ similarityMetric: 'pearson', topKNeighbors: 10 });
    userCf.train(split.train, dataset!.items);

    const targetUser = Array.from(dataset!.users.keys())[0];
    const recs = userCf.recommend(targetUser, 5, true);

    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].rank).toBe(1);
    expect(recs[0].normalizedScore).toBeGreaterThanOrEqual(0);
  });

  it('Matrix Factorization trains and generates personalized rankings', () => {
    const mf = new MatrixFactorizationRecommender({ latentFactors: 6, epochs: 20, seed: 100 });
    mf.train(split.train, dataset!.items);

    const targetUser = Array.from(dataset!.users.keys())[0];
    const recs = mf.recommend(targetUser, 6, true);

    expect(recs.length).toBeLessThanOrEqual(6);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].explanation.signalType).toBe('collaborative_cluster');
  });

  it('Content-Based Recommender scores items based on genre/title features', () => {
    const cb = new ContentBasedRecommender();
    cb.train(split.train, dataset!.items);

    const targetUser = Array.from(dataset!.users.keys())[0];
    const recs = cb.recommend(targetUser, 5, true);

    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].explanation.signalType).toBe('content_match');
  });

  it('Hybrid Ensemble combines collaborative, content, and popularity', () => {
    const hybrid = new HybridRecommender({ cfWeight: 0.5, contentWeight: 0.3, popularityWeight: 0.2 });
    hybrid.train(split.train, dataset!.items);

    const targetUser = Array.from(dataset!.users.keys())[0];
    const recs = hybrid.recommend(targetUser, 5, true);

    expect(recs.length).toBe(5);
    expect(recs[0].explanation.scoreBreakdown).toHaveProperty('Collaborative Component');
    expect(recs[0].explanation.scoreBreakdown).toHaveProperty('Content Component');
    expect(recs[0].explanation.scoreBreakdown).toHaveProperty('Popularity Component');
  });

  it('Benchmarks all 6 models side-by-side with multi-K metrics', () => {
    const benchmarks = benchmarkAllModels(split, dataset!.items, {
      kValues: [3, 5],
      selectedK: 5,
      positiveThresholdOnly: true,
    });

    expect(benchmarks.length).toBe(6);
    for (const b of benchmarks) {
      expect(b.metrics.k).toBe(5);
      expect(b.metricsByK).toHaveProperty('3');
      expect(b.metricsByK).toHaveProperty('5');
    }
  });
});
