/**
 * Types and interfaces for the RecoSpace recommendation analytics platform
 */

export type InteractionType = 'rating' | 'click' | 'purchase' | 'view' | 'bookmark' | 'enrollment';

export interface RawRow {
  [key: string]: string | number | undefined | null;
}

export interface ColumnMapping {
  userIdCol: string;
  itemIdCol: string;
  interactionCol?: string; // e.g. rating, weight, or event type
  timestampCol?: string;
  itemNameCol?: string;
  itemCategoryCol?: string;
  userSegmentCol?: string;
}

export interface ColumnMetadata {
  name: string;
  sampleValues: (string | number)[];
  detectedType: 'string' | 'number' | 'date' | 'boolean';
  uniqueCount: number;
  nullCount: number;
  totalCount: number;
}

export interface DataPrepConfig {
  missingValueHandling: 'drop_row' | 'fill_default' | 'ignore';
  defaultInteractionValue: number;
  duplicateHandling: 'keep_latest' | 'keep_earliest' | 'average' | 'sum' | 'keep_max';
  positiveThresholdRule: 'explicit_threshold' | 'implicit_positive' | 'all_interactions';
  positiveThresholdValue: number;
  minUserInteractions: number; // k-core user
  minItemInteractions: number; // k-core item
  dateRangeFilter?: {
    startDate?: string;
    endDate?: string;
  };
}

export interface Interaction {
  id: string;
  userId: string;
  itemId: string;
  value: number; // normalized numerical weight/rating
  isPositive: boolean;
  timestamp?: number; // epoch ms
  rawTimestamp?: string;
  itemName?: string;
  itemCategory?: string;
  userSegment?: string;
  metadata?: Record<string, any>;
}

export interface ItemMetadata {
  itemId: string;
  name: string;
  category?: string;
  tags?: string[];
  popularityCount: number;
  avgRating: number;
  firstSeen?: number;
  lastSeen?: number;
}

export interface UserProfile {
  userId: string;
  interactionCount: number;
  positiveCount: number;
  avgRating: number;
  segment?: string;
  interactedItemIds: Set<string>;
  topCategories: { category: string; count: number }[];
  firstInteraction?: number;
  lastInteraction?: number;
}

export interface PreparedDataset {
  interactions: Interaction[];
  users: Map<string, UserProfile>;
  items: Map<string, ItemMetadata>;
  rawRowCount: number;
  keptRowCount: number;
  droppedRowCount: number;
  auditLog: AuditLogEntry[];
  summary: DatasetSummary;
}

export interface AuditLogEntry {
  stage: string;
  reason: string;
  rowsAffected: number;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
}

export interface DatasetSummary {
  totalUsers: number;
  totalItems: number;
  totalInteractions: number;
  totalPositiveInteractions: number;
  sparsityPct: number;
  avgInteractionsPerUser: number;
  avgInteractionsPerItem: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  categories: string[];
  userSegments: string[];
}

export type SplitMethod = 'temporal_holdout' | 'user_stratified' | 'global_random';

export interface SplitConfig {
  method: SplitMethod;
  trainRatio: number; // e.g. 0.70
  valRatio: number;   // e.g. 0.15
  testRatio: number;  // e.g. 0.15
  randomSeed: number;
  temporalThreshold?: number; // timestamp cutoff if manual
}

export interface DataSplit {
  train: Interaction[];
  validation: Interaction[];
  test: Interaction[];
  config: SplitConfig;
  trainUsers: Set<string>;
  trainItems: Set<string>;
  testUsers: Set<string>;
  testItems: Set<string>;
  coldUsersInTest: number;
  coldItemsInTest: number;
  leakageCheckPassed: boolean;
  leakageDetails?: string;
}

export type ModelAlgorithm = 
  | 'popularity'
  | 'item_cf'
  | 'user_cf'
  | 'matrix_factorization'
  | 'content_based'
  | 'hybrid';

export interface ModelHyperparameters {
  // Popularity
  popularityMetric?: 'count' | 'avg_rating' | 'bayesian_avg' | 'time_decay';
  timeDecayHalfLifeDays?: number;

  // Item-CF & User-CF
  similarityMetric?: 'cosine' | 'adjusted_cosine' | 'jaccard' | 'pearson';
  topKNeighbors?: number;
  minOverlap?: number;

  // Matrix Factorization
  latentFactors?: number;
  learningRate?: number;
  regularization?: number;
  epochs?: number;

  // Content-Based
  contentSimilarity?: 'cosine' | 'jaccard';

  // Hybrid
  cfWeight?: number;
  contentWeight?: number;
  popularityWeight?: number;
}

export interface RecommendationExplanation {
  primarySignal: string;
  signalType: 'similarity' | 'popularity' | 'collaborative_cluster' | 'content_match' | 'fallback';
  contributingItems?: { itemId: string; itemName: string; similarity: number; userRating: number }[];
  contributingNeighbors?: { userId: string; similarity: number; rating: number }[];
  matchedCategories?: string[];
  scoreBreakdown?: Record<string, number>;
  confidence: 'high' | 'medium' | 'low';
  isFallback: boolean;
  notes?: string;
}

export interface RecommendationItem {
  rank: number;
  itemId: string;
  itemName: string;
  itemCategory: string;
  predictedScore: number;
  normalizedScore: number; // 0 to 1
  explanation: RecommendationExplanation;
  isColdStartFallback: boolean;
}

export interface UserRecommendationResult {
  userId: string;
  modelAlgorithm: ModelAlgorithm;
  algorithmName: string;
  recommendations: RecommendationItem[];
  userHistoryCount: number;
  executionTimeMs: number;
  isColdStartUser: boolean;
  k: number;
  filterConsumed: boolean;
}

export interface EvaluationMetrics {
  k: number;
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
  mrrAtK: number;
  catalogCoveragePct: number;
  userCoveragePct: number;
  giniIndex: number;
  noveltyScore: number;
  evaluatedUserCount: number;
  usersWithRelevantItems: number;
  skippedUserCount: number;
  computationTimeMs: number;
}

export interface ModelBenchmarkResult {
  algorithm: ModelAlgorithm;
  name: string;
  description: string;
  metrics: EvaluationMetrics;
  metricsByK?: Record<number, EvaluationMetrics>;
}

export interface BiasAndCoverageAnalysis {
  itemPopularityDistribution: {
    tier: 'Head (Top 20%)' | 'Mid (20-50%)' | 'Tail (Bottom 50%)';
    itemCount: number;
    interactionCount: number;
    interactionSharePct: number;
    avgRecommendationsReceived: number;
  }[];
  giniConcentration: number;
  averageRecommendationPopularity: number;
  longTailCoveragePct: number;
  groupFairnessAnalysis: {
    groupDimension: string;
    groups: {
      groupName: string;
      userCount: number;
      avgInteractions: number;
      precisionAtK: number;
      recallAtK: number;
      ndcgAtK: number;
    }[];
  }[];
  identifiedRisks: {
    title: string;
    category: 'popularity_bias' | 'exposure_bias' | 'cold_start' | 'group_disparity' | 'feedback_loop';
    severity: 'low' | 'medium' | 'high';
    description: string;
    evidence: string;
    mitigationStrategy: string;
  }[];
}

export interface MitigationConfig {
  popularityDiscountLambda: number; // 0.0 (no discount) to 1.0 (heavy long-tail boost)
  categoryDiversityQuota: number; // max items per category in top-K (0 = disabled)
  minNoveltyThreshold: number; // 0 = disabled
}
