import {
  Interaction,
  ItemMetadata,
  ModelAlgorithm,
  RecommendationItem,
} from '../types/recsys';
import { ContentBasedRecommender } from './contentBased';
import { ItemBasedCFRecommender } from './itemCollaborativeFiltering';
import { MatrixFactorizationRecommender } from './matrixFactorization';
import { PopularityRecommender } from './popularity';
import {
  normalizeScores,
  RecommenderModel,
  ScoredCandidate,
  sortRankingsDeterministically,
} from './recommenderBase';

export interface HybridConfig {
  cfWeight?: number;
  contentWeight?: number;
  popularityWeight?: number;
  cfEngine?: 'item_cf' | 'matrix_factorization';
}

export class HybridRecommender implements RecommenderModel {
  public algorithm: ModelAlgorithm = 'hybrid';
  public name = 'Hybrid Ensemble (CF + Content + Popularity)';
  public isTrained = false;

  private itemsMetadata: Map<string, ItemMetadata> = new Map();
  private cfModel: RecommenderModel;
  private contentModel: ContentBasedRecommender;
  private popularityModel: PopularityRecommender;
  private config: HybridConfig;

  constructor(config: HybridConfig = {}) {
    this.config = {
      cfWeight: config.cfWeight ?? 0.5,
      contentWeight: config.contentWeight ?? 0.3,
      popularityWeight: config.popularityWeight ?? 0.2,
      cfEngine: config.cfEngine || 'item_cf',
    };

    this.cfModel = this.config.cfEngine === 'matrix_factorization'
      ? new MatrixFactorizationRecommender()
      : new ItemBasedCFRecommender();
    this.contentModel = new ContentBasedRecommender();
    this.popularityModel = new PopularityRecommender();
  }

  public train(
    trainInteractions: Interaction[],
    itemsMetadata: Map<string, ItemMetadata>
  ): void {
    this.itemsMetadata = new Map(itemsMetadata);
    this.cfModel.train(trainInteractions, itemsMetadata);
    this.contentModel.train(trainInteractions, itemsMetadata);
    this.popularityModel.train(trainInteractions, itemsMetadata);
    this.isTrained = true;
  }

  public scoreCandidate(userId: string, itemId: string, userHistory?: Interaction[]): number {
    const sCf = this.cfModel.scoreCandidate(userId, itemId, userHistory);
    const sCnt = this.contentModel.scoreCandidate(userId, itemId);
    const sPop = this.popularityModel.scoreCandidate(userId, itemId);

    const wCf = this.config.cfWeight ?? 0.5;
    const wCnt = this.config.contentWeight ?? 0.3;
    const wPop = this.config.popularityWeight ?? 0.2;

    return wCf * sCf + wCnt * sCnt + wPop * sPop;
  }

  public recommend(
    userId: string,
    k: number = 10,
    filterConsumed: boolean = true,
    userHistory?: Interaction[]
  ): RecommendationItem[] {
    const cfRecs = this.cfModel.recommend(userId, this.itemsMetadata.size, filterConsumed, userHistory);
    const cntRecs = this.contentModel.recommend(userId, this.itemsMetadata.size, filterConsumed, userHistory);
    const popRecs = this.popularityModel.recommend(userId, this.itemsMetadata.size, filterConsumed, userHistory);

    const cfMap = new Map(cfRecs.map(r => [r.itemId, r.normalizedScore]));
    const cntMap = new Map(cntRecs.map(r => [r.itemId, r.normalizedScore]));
    const popMap = new Map(popRecs.map(r => [r.itemId, r.normalizedScore]));

    const wCf = this.config.cfWeight ?? 0.5;
    const wCnt = this.config.contentWeight ?? 0.3;
    const wPop = this.config.popularityWeight ?? 0.2;
    const totalWeight = (wCf + wCnt + wPop) || 1.0;

    const candidates: ScoredCandidate[] = [];
    const allItemIds = Array.from(this.itemsMetadata.keys());

    const consumedSet = new Set<string>();
    if (filterConsumed && userHistory) {
      for (const h of userHistory) consumedSet.add(h.itemId);
    }

    for (const itemId of allItemIds) {
      if (filterConsumed && consumedSet.has(itemId)) continue;

      const normCf = cfMap.get(itemId) ?? 0;
      const normCnt = cntMap.get(itemId) ?? 0;
      const normPop = popMap.get(itemId) ?? 0;

      const blendedScore = (wCf * normCf + wCnt * normCnt + wPop * normPop) / totalWeight;

      candidates.push({
        itemId,
        score: blendedScore,
        explanation: {
          primarySignal: `Ensemble Score ${(blendedScore * 100).toFixed(0)}%: CF (${(normCf * 100).toFixed(0)}%), Content (${(normCnt * 100).toFixed(0)}%), Popularity (${(normPop * 100).toFixed(0)}%).`,
          signalType: 'collaborative_cluster',
          confidence: 'high',
          isFallback: false,
          scoreBreakdown: {
            'Collaborative Component': Number((normCf * wCf).toFixed(3)),
            'Content Component': Number((normCnt * wCnt).toFixed(3)),
            'Popularity Component': Number((normPop * wPop).toFixed(3)),
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
