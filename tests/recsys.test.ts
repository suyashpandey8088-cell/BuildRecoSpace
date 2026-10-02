import { describe, expect, it } from 'vitest';
import { SAMPLE_DATASETS } from '../src/data/sampleDatasets';
import { parseCsvText } from '../src/utils/csvParser';
import { prepareDataset, validateMapping } from '../src/services/dataPreparation';
import { splitDataset } from '../src/services/dataSplitter';
import { PopularityRecommender } from '../src/models/popularity';
import { ItemBasedCFRecommender } from '../src/models/itemCollaborativeFiltering';
import { UserBasedCFRecommender } from '../src/models/userCollaborativeFiltering';
import { MatrixFactorizationRecommender } from '../src/models/matrixFactorization';
import { ContentBasedRecommender } from '../src/models/contentBased';
import { HybridRecommender } from '../src/models/hybridModel';
import { evaluateModelOnSplit } from '../src/services/evaluation';
import { analyzeBiasAndCoverage, applyMitigatedReranking } from '../src/services/biasAnalysis';

describe('Data Ingestion & Parsing', () => {
  it('should parse valid CSV sample dataset correctly', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    expect(parsed.errors.length).toBe(0);
    expect(parsed.totalRows).toBeGreaterThan(50);
    expect(parsed.columns).toContain('user_id');
    expect(parsed.columns).toContain('movie_id');
    expect(parsed.columns).toContain('rating');
  });

  it('should return errors on empty CSV text', () => {
    const parsed = parseCsvText('');
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.totalRows).toBe(0);
  });

  it('should validate column mappings and detect missing columns', () => {
    const validIssues = validateMapping(
      { userIdCol: 'user_id', itemIdCol: 'movie_id' },
      ['user_id', 'movie_id', 'rating']
    );
    expect(validIssues.filter(i => i.severity === 'error').length).toBe(0);

    const invalidIssues = validateMapping(
      { userIdCol: 'non_existent_user', itemIdCol: 'movie_id' },
      ['user_id', 'movie_id', 'rating']
    );
    expect(invalidIssues.some(i => i.severity === 'error')).toBe(true);
  });
});

describe('Data Preparation & Cleaning', () => {
  it('should clean, deduplicate, and prepare sample dataset with audit log', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset, error, auditLog } = prepareDataset(
      parsed.data,
      sample.defaultMapping,
      sample.defaultPrepConfig
    );

    expect(error).toBeUndefined();
    expect(dataset).toBeDefined();
    expect(dataset!.interactions.length).toBeGreaterThan(0);
    expect(dataset!.users.size).toBeGreaterThan(0);
    expect(dataset!.items.size).toBeGreaterThan(0);
    expect(dataset!.summary.sparsityPct).toBeGreaterThan(0);
    expect(auditLog.length).toBeGreaterThan(0);
  });

  it('should handle duplicate user-item interactions with average rule', () => {
    const rawData = [
      { u: 'u1', i: 'i1', r: 3, t: '2024-01-01' },
      { u: 'u1', i: 'i1', r: 5, t: '2024-01-02' },
      { u: 'u1', i: 'i2', r: 4, t: '2024-01-01' },
    ];

    const { dataset } = prepareDataset(
      rawData,
      { userIdCol: 'u', itemIdCol: 'i', interactionCol: 'r', timestampCol: 't' },
      {
        missingValueHandling: 'drop_row',
        defaultInteractionValue: 1,
        duplicateHandling: 'average',
        positiveThresholdRule: 'all_interactions',
        positiveThresholdValue: 1,
        minUserInteractions: 1,
        minItemInteractions: 1,
      }
    );

    expect(dataset?.interactions.length).toBe(2);
    const u1i1 = dataset?.interactions.find(x => x.userId === 'u1' && x.itemId === 'i1');
    expect(u1i1?.value).toBe(4); // average of 3 and 5
  });
});

describe('Data Splitting & Leakage Prevention', () => {
  it('should split data into train, val, and test without ID leakage', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    expect(dataset).toBeDefined();

    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.7,
      valRatio: 0.15,
      testRatio: 0.15,
      randomSeed: 42,
    });

    expect(split.train.length).toBeGreaterThan(0);
    expect(split.test.length).toBeGreaterThan(0);
    expect(split.leakageCheckPassed).toBe(true);

    // Verify train and test interactions are disjoint
    const trainIds = new Set(split.train.map(i => i.id));
    for (const testInter of split.test) {
      expect(trainIds.has(testInter.id)).toBe(false);
    }
  });

  it('should produce reproducible user-stratified split with seed', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);

    const split1 = splitDataset(dataset!.interactions, {
      method: 'user_stratified',
      trainRatio: 0.8,
      valRatio: 0.0,
      testRatio: 0.2,
      randomSeed: 999,
    });

    const split2 = splitDataset(dataset!.interactions, {
      method: 'user_stratified',
      trainRatio: 0.8,
      valRatio: 0.0,
      testRatio: 0.2,
      randomSeed: 999,
    });

    expect(split1.train.length).toBe(split2.train.length);
    expect(split1.test.length).toBe(split2.test.length);
    expect(split1.train[0].id).toBe(split2.train[0].id);
  });
});

describe('Recommendation Models & Deterministic Ranking', () => {
  it('should train and rank using Popularity Baseline deterministically', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.8,
      valRatio: 0.0,
      testRatio: 0.2,
      randomSeed: 42,
    });

    const model = new PopularityRecommender();
    model.train(split.train, dataset!.items);

    const recs1 = model.recommend('USR_001', 5, true);
    const recs2 = model.recommend('USR_001', 5, true);

    expect(recs1.length).toBe(5);
    expect(recs1[0].itemId).toBe(recs2[0].itemId);
    expect(recs1[0].explanation.primarySignal).toBeDefined();
  });

  it('should produce personalized recommendations with Item-CF and explain signals', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.8,
      valRatio: 0.0,
      testRatio: 0.2,
      randomSeed: 42,
    });

    const itemCf = new ItemBasedCFRecommender();
    itemCf.train(split.train, dataset!.items);

    const recs = itemCf.recommend('USR_001', 5, true);
    expect(recs.length).toBe(5);
    expect(recs[0].explanation).toBeDefined();
  });

  it('should fallback gracefully for cold-start unknown users', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.8,
      valRatio: 0.0,
      testRatio: 0.2,
      randomSeed: 42,
    });

    const itemCf = new ItemBasedCFRecommender();
    itemCf.train(split.train, dataset!.items);

    const coldRecs = itemCf.recommend('UNKNOWN_COLD_USER_999', 5, true);
    expect(coldRecs.length).toBe(5);
    expect(coldRecs[0].isColdStartFallback).toBe(true);
    expect(coldRecs[0].explanation.signalType).toBe('fallback');
  });

  it('should evaluate models and calculate Precision, Recall, NDCG, MRR, and Catalog Coverage', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.7,
      valRatio: 0.15,
      testRatio: 0.15,
      randomSeed: 42,
    });

    const popularity = new PopularityRecommender();
    popularity.train(split.train, dataset!.items);

    const metrics = evaluateModelOnSplit(popularity, split, dataset!.items, 5, true);
    expect(metrics.k).toBe(5);
    expect(metrics.precisionAtK).toBeGreaterThanOrEqual(0);
    expect(metrics.recallAtK).toBeGreaterThanOrEqual(0);
    expect(metrics.ndcgAtK).toBeGreaterThanOrEqual(0);
    expect(metrics.catalogCoveragePct).toBeGreaterThanOrEqual(0);
  });

  it('should compute bias analysis and apply popularity mitigation', () => {
    const sample = SAMPLE_DATASETS[0];
    const parsed = parseCsvText(sample.csvData);
    const { dataset } = prepareDataset(parsed.data, sample.defaultMapping, sample.defaultPrepConfig);
    const split = splitDataset(dataset!.interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.7,
      valRatio: 0.15,
      testRatio: 0.15,
      randomSeed: 42,
    });

    const popularity = new PopularityRecommender();
    popularity.train(split.train, dataset!.items);

    const bias = analyzeBiasAndCoverage(popularity, dataset!, split, 5);
    expect(bias.itemPopularityDistribution.length).toBe(3);
    expect(bias.identifiedRisks.length).toBeGreaterThan(0);

    const baseRecs = popularity.recommend('USR_001', 10, true);
    const mitigatedRecs = applyMitigatedReranking(
      baseRecs,
      dataset!.items,
      { popularityDiscountLambda: 0.8, categoryDiversityQuota: 2, minNoveltyThreshold: 0 },
      10
    );

    expect(mitigatedRecs.length).toBe(baseRecs.length);
    expect(mitigatedRecs[0].explanation.primarySignal).toContain('Mitigation applied');
  });
});
