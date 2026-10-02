import { describe, expect, it } from 'vitest';
import { prepareDataset } from '../src/services/dataPreparation';
import { splitDataset } from '../src/services/dataSplitter';
import { PopularityRecommender } from '../src/models/popularity';
import { ItemBasedCFRecommender } from '../src/models/itemCollaborativeFiltering';
import { sortRankingsDeterministically } from '../src/models/recommenderBase';
import { applyMitigatedReranking } from '../src/services/biasAnalysis';

describe('Data Preparation Edge Cases', () => {
  it('should gracefully handle empty or malformed input rows without throwing', () => {
    const malformedData = [
      { user: '', item: '' },
      { user: null as any, item: 'item_1' },
      { user: 'user_1', item: undefined as any },
      { user: 'user_1', item: 'item_1', rating: 'invalid_num' },
      { user: 'user_2', item: 'item_2', rating: '4.5' },
    ];

    const result = prepareDataset(
      malformedData,
      { userIdCol: 'user', itemIdCol: 'item', interactionCol: 'rating' },
      {
        missingValueHandling: 'fill_default',
        defaultInteractionValue: 3.0,
        duplicateHandling: 'keep_latest',
        positiveThresholdRule: 'all_interactions',
        positiveThresholdValue: 1.0,
        minUserInteractions: 1,
        minItemInteractions: 1,
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.dataset?.interactions.length).toBe(2);
  });

  it('should detect and flag temporal leakage if test data precedes train data', () => {
    const interactions = [
      { id: '1', userId: 'u1', itemId: 'i1', value: 5, isPositive: true, timestamp: 1700000000000 },
      { id: '2', userId: 'u2', itemId: 'i2', value: 4, isPositive: true, timestamp: 1600000000000 }, // earlier
    ];

    const split = splitDataset(interactions, {
      method: 'temporal_holdout',
      trainRatio: 0.5,
      valRatio: 0.0,
      testRatio: 0.5,
      randomSeed: 42,
    });

    // In a chronological sort, id: 2 will be first in train (1600000000000) and id: 1 in test (1700000000000)
    expect(split.train[0].id).toBe('2');
    expect(split.test[0].id).toBe('1');
    expect(split.leakageCheckPassed).toBe(true);
  });
});

describe('Deterministic Tie-Breaking & Ranking Invariance', () => {
  it('should break ties deterministically using popularity and item_id', () => {
    const metadata = new Map([
      ['ITEM_B', { itemId: 'ITEM_B', name: 'Item B', popularityCount: 10, avgRating: 4.0 }],
      ['ITEM_A', { itemId: 'ITEM_A', name: 'Item A', popularityCount: 10, avgRating: 4.0 }],
      ['ITEM_C', { itemId: 'ITEM_C', name: 'Item C', popularityCount: 20, avgRating: 4.0 }],
    ]);

    const candidates = [
      { itemId: 'ITEM_B', score: 3.5, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false } },
      { itemId: 'ITEM_A', score: 3.5, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false } },
      { itemId: 'ITEM_C', score: 3.5, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false } },
    ];

    const sorted = sortRankingsDeterministically(candidates, metadata);

    // ITEM_C has higher popularity (20 vs 10) so it must come first
    expect(sorted[0].itemId).toBe('ITEM_C');
    // ITEM_A and ITEM_B have same score (3.5) and same popularity (10), so alphabetical tie-breaker applies (ITEM_A before ITEM_B)
    expect(sorted[1].itemId).toBe('ITEM_A');
    expect(sorted[2].itemId).toBe('ITEM_B');
  });
});

describe('Mitigation Simulator Boundaries', () => {
  it('should respect category diversity quota', () => {
    const metadata = new Map([
      ['I1', { itemId: 'I1', name: 'Item 1', category: 'Sci-Fi', popularityCount: 50, avgRating: 5 }],
      ['I2', { itemId: 'I2', name: 'Item 2', category: 'Sci-Fi', popularityCount: 40, avgRating: 4.8 }],
      ['I3', { itemId: 'I3', name: 'Item 3', category: 'Sci-Fi', popularityCount: 30, avgRating: 4.7 }],
      ['I4', { itemId: 'I4', name: 'Item 4', category: 'Drama', popularityCount: 20, avgRating: 4.5 }],
      ['I5', { itemId: 'I5', name: 'Item 5', category: 'Action', popularityCount: 15, avgRating: 4.2 }],
    ]);

    const baseRecs = [
      { rank: 1, itemId: 'I1', itemName: 'Item 1', itemCategory: 'Sci-Fi', predictedScore: 5.0, normalizedScore: 1, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false }, isColdStartFallback: false },
      { rank: 2, itemId: 'I2', itemName: 'Item 2', itemCategory: 'Sci-Fi', predictedScore: 4.8, normalizedScore: 0.9, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false }, isColdStartFallback: false },
      { rank: 3, itemId: 'I3', itemName: 'Item 3', itemCategory: 'Sci-Fi', predictedScore: 4.7, normalizedScore: 0.85, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false }, isColdStartFallback: false },
      { rank: 4, itemId: 'I4', itemName: 'Item 4', itemCategory: 'Drama', predictedScore: 4.5, normalizedScore: 0.8, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false }, isColdStartFallback: false },
      { rank: 5, itemId: 'I5', itemName: 'Item 5', itemCategory: 'Action', predictedScore: 4.2, normalizedScore: 0.7, explanation: { primarySignal: '', signalType: 'popularity' as const, confidence: 'high' as const, isFallback: false }, isColdStartFallback: false },
    ];

    // Quota max 1 per category
    const mitigated = applyMitigatedReranking(
      baseRecs,
      metadata,
      { popularityDiscountLambda: 0.0, categoryDiversityQuota: 1, minNoveltyThreshold: 0 },
      3
    );

    expect(mitigated.length).toBe(3);
    const categoriesInTop3 = mitigated.map(r => r.itemCategory);
    expect(new Set(categoriesInTop3).size).toBe(3);
    expect(categoriesInTop3).toContain('Sci-Fi');
    expect(categoriesInTop3).toContain('Drama');
    expect(categoriesInTop3).toContain('Action');
  });
});
