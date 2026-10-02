import {
  AuditLogEntry,
  ColumnMapping,
  DataPrepConfig,
  Interaction,
  ItemMetadata,
  PreparedDataset,
  RawRow,
  UserProfile,
} from '../types/recsys';
import { parseTimestampSafely } from '../utils/csvParser';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateMapping(
  mapping: ColumnMapping,
  availableColumns: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!mapping.userIdCol) {
    issues.push({
      field: 'userIdCol',
      message: 'User ID column mapping is required.',
      severity: 'error',
    });
  } else if (!availableColumns.includes(mapping.userIdCol)) {
    issues.push({
      field: 'userIdCol',
      message: `User ID column "${mapping.userIdCol}" was not found in dataset columns.`,
      severity: 'error',
    });
  }

  if (!mapping.itemIdCol) {
    issues.push({
      field: 'itemIdCol',
      message: 'Item ID column mapping is required.',
      severity: 'error',
    });
  } else if (!availableColumns.includes(mapping.itemIdCol)) {
    issues.push({
      field: 'itemIdCol',
      message: `Item ID column "${mapping.itemIdCol}" was not found in dataset columns.`,
      severity: 'error',
    });
  }

  if (mapping.userIdCol && mapping.itemIdCol && mapping.userIdCol === mapping.itemIdCol) {
    issues.push({
      field: 'itemIdCol',
      message: 'User ID and Item ID cannot map to the same column.',
      severity: 'error',
    });
  }

  if (mapping.interactionCol && !availableColumns.includes(mapping.interactionCol)) {
    issues.push({
      field: 'interactionCol',
      message: `Interaction column "${mapping.interactionCol}" was not found in dataset.`,
      severity: 'warning',
    });
  }

  if (mapping.timestampCol && !availableColumns.includes(mapping.timestampCol)) {
    issues.push({
      field: 'timestampCol',
      message: `Timestamp column "${mapping.timestampCol}" was not found in dataset.`,
      severity: 'warning',
    });
  }

  return issues;
}

export function prepareDataset(
  rawRows: RawRow[],
  mapping: ColumnMapping,
  config: DataPrepConfig
): { dataset?: PreparedDataset; error?: string; auditLog: AuditLogEntry[] } {
  const auditLog: AuditLogEntry[] = [];
  const log = (
    stage: string,
    reason: string,
    rowsAffected: number,
    severity: 'info' | 'warning' | 'error' = 'info'
  ) => {
    auditLog.push({
      stage,
      reason,
      rowsAffected,
      severity,
      timestamp: Date.now(),
    });
  };

  const rawRowCount = rawRows.length;
  log('Ingestion', `Loaded ${rawRowCount} raw records from source`, rawRowCount, 'info');

  if (rawRowCount === 0) {
    return {
      error: 'Cannot prepare an empty dataset. Source data contains 0 rows.',
      auditLog,
    };
  }

  if (!mapping.userIdCol || !mapping.itemIdCol) {
    return {
      error: 'User ID and Item ID mappings are strictly required to prepare data.',
      auditLog,
    };
  }

  // Step 1: Validate individual rows and handle missing values
  let missingIdDropped = 0;
  let missingValImputed = 0;
  let missingValDropped = 0;
  let validParsedRows: Array<{
    userId: string;
    itemId: string;
    value: number;
    timestamp?: number;
    rawTimestamp?: string;
    itemName?: string;
    itemCategory?: string;
    userSegment?: string;
    rawIndex: number;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rawUser = row[mapping.userIdCol];
    const rawItem = row[mapping.itemIdCol];

    if (rawUser === undefined || rawUser === null || String(rawUser).trim() === '' ||
        rawItem === undefined || rawItem === null || String(rawItem).trim() === '') {
      missingIdDropped++;
      continue;
    }

    const userId = String(rawUser).trim();
    const itemId = String(rawItem).trim();

    // Interaction value
    let val: number = 1.0;
    if (mapping.interactionCol && row[mapping.interactionCol] !== undefined && row[mapping.interactionCol] !== null && String(row[mapping.interactionCol]).trim() !== '') {
      const parsedNum = Number(row[mapping.interactionCol]);
      if (!isNaN(parsedNum) && isFinite(parsedNum)) {
        val = parsedNum;
      } else {
        // String interaction (e.g. 'purchase', 'click', 'like')
        const strVal = String(row[mapping.interactionCol]).trim().toLowerCase();
        if (strVal === 'purchase' || strVal === 'buy' || strVal === 'completed') val = 5.0;
        else if (strVal === 'cart' || strVal === 'bookmark' || strVal === 'star') val = 3.0;
        else if (strVal === 'click' || strVal === 'view' || strVal === 'read') val = 1.0;
        else val = config.defaultInteractionValue;
      }
    } else {
      if (config.missingValueHandling === 'drop_row' && mapping.interactionCol) {
        missingValDropped++;
        continue;
      } else if (config.missingValueHandling === 'fill_default') {
        missingValImputed++;
        val = config.defaultInteractionValue;
      }
    }

    // Timestamp
    let parsedTimestamp: number | undefined;
    let rawTimestamp: string | undefined;
    if (mapping.timestampCol && row[mapping.timestampCol]) {
      rawTimestamp = String(row[mapping.timestampCol]);
      parsedTimestamp = parseTimestampSafely(row[mapping.timestampCol]);
    }

    // Item Metadata
    const itemName = mapping.itemNameCol && row[mapping.itemNameCol] ? String(row[mapping.itemNameCol]).trim() : undefined;
    const itemCategory = mapping.itemCategoryCol && row[mapping.itemCategoryCol] ? String(row[mapping.itemCategoryCol]).trim() : undefined;
    const userSegment = mapping.userSegmentCol && row[mapping.userSegmentCol] ? String(row[mapping.userSegmentCol]).trim() : undefined;

    validParsedRows.push({
      userId,
      itemId,
      value: val,
      timestamp: parsedTimestamp,
      rawTimestamp,
      itemName,
      itemCategory,
      userSegment,
      rawIndex: i,
    });
  }

  if (missingIdDropped > 0) {
    log('Validation', `Dropped rows missing either User ID or Item ID`, missingIdDropped, 'warning');
  }
  if (missingValDropped > 0) {
    log('Missing Values', `Dropped rows with missing interaction value (drop_row rule)`, missingValDropped, 'warning');
  }
  if (missingValImputed > 0) {
    log('Missing Values', `Imputed missing interaction values with default (${config.defaultInteractionValue})`, missingValImputed, 'info');
  }

  if (validParsedRows.length === 0) {
    return {
      error: 'All source rows were dropped during validation. Please check column mappings and missing value settings.',
      auditLog,
    };
  }

  // Step 2: Date range filtering if configured
  if (config.dateRangeFilter?.startDate || config.dateRangeFilter?.endDate) {
    const startMs = config.dateRangeFilter.startDate ? Date.parse(config.dateRangeFilter.startDate) : undefined;
    const endMs = config.dateRangeFilter.endDate ? Date.parse(config.dateRangeFilter.endDate) : undefined;
    const initialCount = validParsedRows.length;

    validParsedRows = validParsedRows.filter(r => {
      if (!r.timestamp) return true;
      if (startMs && r.timestamp < startMs) return false;
      if (endMs && r.timestamp > endMs) return false;
      return true;
    });

    const dateFiltered = initialCount - validParsedRows.length;
    if (dateFiltered > 0) {
      log('Date Filter', `Filtered out rows outside specified date range`, dateFiltered, 'info');
    }
  }

  // Step 3: Duplicate Resolution (Grouping by user_id + item_id)
  const pairGroups = new Map<string, typeof validParsedRows>();
  for (const r of validParsedRows) {
    const key = `${r.userId}:::${r.itemId}`;
    const group = pairGroups.get(key) || [];
    group.push(r);
    pairGroups.set(key, group);
  }

  let duplicateCount = 0;
  let deduplicatedRows: typeof validParsedRows = [];

  for (const [, group] of pairGroups.entries()) {
    if (group.length === 1) {
      deduplicatedRows.push(group[0]);
      continue;
    }

    duplicateCount += group.length - 1;

    // Apply duplicate strategy
    if (config.duplicateHandling === 'keep_latest') {
      // Sort by timestamp desc, or fallback to raw index desc
      group.sort((a, b) => (b.timestamp || b.rawIndex) - (a.timestamp || a.rawIndex));
      deduplicatedRows.push(group[0]);
    } else if (config.duplicateHandling === 'keep_earliest') {
      group.sort((a, b) => (a.timestamp || a.rawIndex) - (b.timestamp || b.rawIndex));
      deduplicatedRows.push(group[0]);
    } else if (config.duplicateHandling === 'average') {
      const avgVal = group.reduce((sum, g) => sum + g.value, 0) / group.length;
      const latest = group.reduce((prev, curr) => ((curr.timestamp || curr.rawIndex) > (prev.timestamp || prev.rawIndex) ? curr : prev));
      deduplicatedRows.push({ ...latest, value: Number(avgVal.toFixed(3)) });
    } else if (config.duplicateHandling === 'sum') {
      const sumVal = group.reduce((sum, g) => sum + g.value, 0);
      const latest = group.reduce((prev, curr) => ((curr.timestamp || curr.rawIndex) > (prev.timestamp || prev.rawIndex) ? curr : prev));
      deduplicatedRows.push({ ...latest, value: sumVal });
    } else if (config.duplicateHandling === 'keep_max') {
      const maxItem = group.reduce((prev, curr) => (curr.value > prev.value ? curr : prev));
      deduplicatedRows.push(maxItem);
    }
  }

  if (duplicateCount > 0) {
    log('Deduplication', `Resolved ${duplicateCount} duplicate user-item interactions using "${config.duplicateHandling}" strategy`, duplicateCount, 'info');
  }

  // Step 4: Iterative K-Core Filtering (minUserInteractions and minItemInteractions)
  let kCoreActive = config.minUserInteractions > 1 || config.minItemInteractions > 1;
  let currentRows = deduplicatedRows;
  let kCoreIterations = 0;
  let totalKCoreDropped = 0;

  if (kCoreActive) {
    let rowsChanged = true;
    while (rowsChanged && kCoreIterations < 10) {
      kCoreIterations++;
      rowsChanged = false;

      // Count user frequencies
      const userCounts = new Map<string, number>();
      const itemCounts = new Map<string, number>();
      for (const r of currentRows) {
        userCounts.set(r.userId, (userCounts.get(r.userId) || 0) + 1);
        itemCounts.set(r.itemId, (itemCounts.get(r.itemId) || 0) + 1);
      }

      const nextRows = currentRows.filter(r => {
        const uCount = userCounts.get(r.userId) || 0;
        const iCount = itemCounts.get(r.itemId) || 0;
        return uCount >= config.minUserInteractions && iCount >= config.minItemInteractions;
      });

      if (nextRows.length < currentRows.length) {
        totalKCoreDropped += (currentRows.length - nextRows.length);
        currentRows = nextRows;
        rowsChanged = true;
      }
    }

    if (totalKCoreDropped > 0) {
      log('K-Core Filter', `Removed ${totalKCoreDropped} interactions below min thresholds (User >= ${config.minUserInteractions}, Item >= ${config.minItemInteractions}) across ${kCoreIterations} pass(es)`, totalKCoreDropped, 'info');
    }
  }

  if (currentRows.length === 0) {
    return {
      error: `All rows were filtered out after applying k-core thresholds (Min User: ${config.minUserInteractions}, Min Item: ${config.minItemInteractions}). Please lower the minimum activity threshold.`,
      auditLog,
    };
  }

  // Step 5: Construct Final Interactions & Determine Positive Feedback
  const finalInteractions: Interaction[] = currentRows.map((r, idx) => {
    let isPositive = true;
    if (config.positiveThresholdRule === 'explicit_threshold') {
      isPositive = r.value >= config.positiveThresholdValue;
    } else if (config.positiveThresholdRule === 'implicit_positive') {
      isPositive = true;
    } else if (config.positiveThresholdRule === 'all_interactions') {
      isPositive = r.value > 0;
    }

    return {
      id: `int_${idx + 1}`,
      userId: r.userId,
      itemId: r.itemId,
      value: r.value,
      isPositive,
      timestamp: r.timestamp,
      rawTimestamp: r.rawTimestamp,
      itemName: r.itemName,
      itemCategory: r.itemCategory,
      userSegment: r.userSegment,
    };
  });

  // Step 6: Construct User Profiles and Item Metadata
  const usersMap = new Map<string, UserProfile>();
  const itemsMap = new Map<string, ItemMetadata>();
  const categoriesSet = new Set<string>();
  const segmentsSet = new Set<string>();

  let minTs: number | undefined;
  let maxTs: number | undefined;

  for (const interaction of finalInteractions) {
    if (interaction.timestamp) {
      if (minTs === undefined || interaction.timestamp < minTs) minTs = interaction.timestamp;
      if (maxTs === undefined || interaction.timestamp > maxTs) maxTs = interaction.timestamp;
    }

    // User aggregation
    let user = usersMap.get(interaction.userId);
    if (!user) {
      user = {
        userId: interaction.userId,
        interactionCount: 0,
        positiveCount: 0,
        avgRating: 0,
        segment: interaction.userSegment,
        interactedItemIds: new Set(),
        topCategories: [],
        firstInteraction: interaction.timestamp,
        lastInteraction: interaction.timestamp,
      };
      usersMap.set(interaction.userId, user);
    }
    user.interactionCount++;
    if (interaction.isPositive) user.positiveCount++;
    user.interactedItemIds.add(interaction.itemId);
    if (interaction.timestamp) {
      if (!user.firstInteraction || interaction.timestamp < user.firstInteraction) user.firstInteraction = interaction.timestamp;
      if (!user.lastInteraction || interaction.timestamp > user.lastInteraction) user.lastInteraction = interaction.timestamp;
    }

    // Item aggregation
    let item = itemsMap.get(interaction.itemId);
    if (!item) {
      item = {
        itemId: interaction.itemId,
        name: interaction.itemName || interaction.itemId,
        category: interaction.itemCategory || 'Uncategorized',
        popularityCount: 0,
        avgRating: 0,
        firstSeen: interaction.timestamp,
        lastSeen: interaction.timestamp,
      };
      itemsMap.set(interaction.itemId, item);
    }
    item.popularityCount++;
    if (interaction.timestamp) {
      if (!item.firstSeen || interaction.timestamp < item.firstSeen) item.firstSeen = interaction.timestamp;
      if (!item.lastSeen || interaction.timestamp > item.lastSeen) item.lastSeen = interaction.timestamp;
    }

    if (interaction.itemCategory) categoriesSet.add(interaction.itemCategory);
    if (interaction.userSegment) segmentsSet.add(interaction.userSegment);
  }

  // Calculate averages and top categories for users
  for (const user of usersMap.values()) {
    const userInteractions = finalInteractions.filter(i => i.userId === user.userId);
    const sumVal = userInteractions.reduce((acc, i) => acc + i.value, 0);
    user.avgRating = userInteractions.length > 0 ? Number((sumVal / userInteractions.length).toFixed(2)) : 0;

    const catCounts = new Map<string, number>();
    for (const i of userInteractions) {
      if (i.itemCategory) {
        catCounts.set(i.itemCategory, (catCounts.get(i.itemCategory) || 0) + 1);
      }
    }
    user.topCategories = Array.from(catCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Calculate averages for items
  for (const item of itemsMap.values()) {
    const itemInteractions = finalInteractions.filter(i => i.itemId === item.itemId);
    const sumVal = itemInteractions.reduce((acc, i) => acc + i.value, 0);
    item.avgRating = itemInteractions.length > 0 ? Number((sumVal / itemInteractions.length).toFixed(2)) : 0;
  }

  const keptRowCount = finalInteractions.length;
  const droppedRowCount = rawRowCount - keptRowCount;
  const totalUsers = usersMap.size;
  const totalItems = itemsMap.size;
  const totalInteractions = keptRowCount;
  const totalPositiveInteractions = finalInteractions.filter(i => i.isPositive).length;
  
  const possibleMatrixCells = totalUsers * totalItems;
  const sparsityPct = possibleMatrixCells > 0 ? Number(((1 - (totalInteractions / possibleMatrixCells)) * 100).toFixed(2)) : 0;

  log('Completion', `Data preparation complete: Kept ${keptRowCount} interactions across ${totalUsers} users and ${totalItems} items (${sparsityPct}% sparsity)`, keptRowCount, 'info');

  const dataset: PreparedDataset = {
    interactions: finalInteractions,
    users: usersMap,
    items: itemsMap,
    rawRowCount,
    keptRowCount,
    droppedRowCount,
    auditLog,
    summary: {
      totalUsers,
      totalItems,
      totalInteractions,
      totalPositiveInteractions,
      sparsityPct,
      avgInteractionsPerUser: totalUsers > 0 ? Number((totalInteractions / totalUsers).toFixed(1)) : 0,
      avgInteractionsPerItem: totalItems > 0 ? Number((totalInteractions / totalItems).toFixed(1)) : 0,
      minTimestamp: minTs,
      maxTimestamp: maxTs,
      categories: Array.from(categoriesSet).sort(),
      userSegments: Array.from(segmentsSet).sort(),
    },
  };

  return { dataset, auditLog };
}
