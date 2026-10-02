import { DataSplit, Interaction, SplitConfig } from '../types/recsys';

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 */
function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function splitDataset(
  interactions: Interaction[],
  config: SplitConfig
): DataSplit {
  if (interactions.length === 0) {
    return {
      train: [],
      validation: [],
      test: [],
      config,
      trainUsers: new Set(),
      trainItems: new Set(),
      testUsers: new Set(),
      testItems: new Set(),
      coldUsersInTest: 0,
      coldItemsInTest: 0,
      leakageCheckPassed: true,
      leakageDetails: 'Empty dataset.',
    };
  }

  // Normalize ratios
  const totalRatio = config.trainRatio + config.valRatio + config.testRatio;
  const trainFrac = config.trainRatio / totalRatio;
  const valFrac = config.valRatio / totalRatio;

  let train: Interaction[] = [];
  let validation: Interaction[] = [];
  let test: Interaction[] = [];

  if (config.method === 'temporal_holdout') {
    // Sort all interactions with timestamps chronologically
    const hasTimestamps = interactions.some(i => i.timestamp !== undefined);
    
    if (hasTimestamps) {
      // Sort interactions: items with timestamp by time, items without by stable ID
      const sorted = [...interactions].sort((a, b) => {
        const timeA = a.timestamp ?? 0;
        const timeB = b.timestamp ?? 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      const trainCutoff = Math.floor(sorted.length * trainFrac);
      const valCutoff = Math.floor(sorted.length * (trainFrac + valFrac));

      train = sorted.slice(0, trainCutoff);
      validation = sorted.slice(trainCutoff, valCutoff);
      test = sorted.slice(valCutoff);
    } else {
      // Fallback to user-stratified if no timestamps exist
      return splitDataset(interactions, { ...config, method: 'user_stratified' });
    }
  } else if (config.method === 'user_stratified') {
    const prng = createPrng(config.randomSeed);
    
    // Group interactions by user
    const userGroups = new Map<string, Interaction[]>();
    for (const item of interactions) {
      const list = userGroups.get(item.userId) || [];
      list.push(item);
      userGroups.set(item.userId, list);
    }

    for (const [, userInteractions] of userGroups.entries()) {
      if (userInteractions.length === 1) {
        // Must stay in training so user is known to model
        train.push(userInteractions[0]);
        continue;
      }

      // Shuffle user's interactions deterministically
      const shuffled = [...userInteractions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const userTotal = shuffled.length;
      let userTestCount = Math.max(1, Math.round(userTotal * (config.testRatio / totalRatio)));
      let userValCount = Math.round(userTotal * (config.valRatio / totalRatio));
      
      // Ensure at least 1 item remains in train
      if (userTestCount + userValCount >= userTotal) {
        userTestCount = 1;
        userValCount = 0;
      }

      const trainSlice = shuffled.slice(0, userTotal - userTestCount - userValCount);
      const valSlice = shuffled.slice(userTotal - userTestCount - userValCount, userTotal - userTestCount);
      const testSlice = shuffled.slice(userTotal - userTestCount);

      train.push(...trainSlice);
      validation.push(...valSlice);
      test.push(...testSlice);
    }
  } else {
    // Global Random Split
    const prng = createPrng(config.randomSeed);
    const shuffled = [...interactions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const trainCutoff = Math.floor(shuffled.length * trainFrac);
    const valCutoff = Math.floor(shuffled.length * (trainFrac + valFrac));

    train = shuffled.slice(0, trainCutoff);
    validation = shuffled.slice(trainCutoff, valCutoff);
    test = shuffled.slice(valCutoff);
  }

  // Calculate user and item sets
  const trainUsers = new Set(train.map(i => i.userId));
  const trainItems = new Set(train.map(i => i.itemId));
  const testUsers = new Set(test.map(i => i.userId));
  const testItems = new Set(test.map(i => i.itemId));

  // Cold user and cold item detection
  let coldUsersInTest = 0;
  for (const u of testUsers) {
    if (!trainUsers.has(u)) coldUsersInTest++;
  }

  let coldItemsInTest = 0;
  for (const it of testItems) {
    if (!trainItems.has(it)) coldItemsInTest++;
  }

  // Leakage Verification
  let leakageCheckPassed = true;
  let leakageDetails = 'Zero data leakage detected. Test set interactions are completely isolated from training.';

  // Check 1: ID intersection between train and test sets
  const trainIds = new Set(train.map(i => i.id));
  const leakedIds = test.filter(i => trainIds.has(i.id));
  if (leakedIds.length > 0) {
    leakageCheckPassed = false;
    leakageDetails = `Severe Error: ${leakedIds.length} interaction IDs overlap between training and test sets.`;
  }

  // Check 2: Temporal leakage in temporal holdout
  if (config.method === 'temporal_holdout' && leakageCheckPassed) {
    const maxTrainTs = Math.max(...train.map(i => i.timestamp || 0));
    const minTestTs = Math.min(...test.map(i => i.timestamp || Infinity));
    if (minTestTs < maxTrainTs) {
      leakageCheckPassed = false;
      leakageDetails = `Temporal Leakage Warning: Test set contains interaction timestamp (${new Date(minTestTs).toISOString()}) earlier than latest training interaction (${new Date(maxTrainTs).toISOString()}).`;
    }
  }

  return {
    train,
    validation,
    test,
    config,
    trainUsers,
    trainItems,
    testUsers,
    testItems,
    coldUsersInTest,
    coldItemsInTest,
    leakageCheckPassed,
    leakageDetails,
  };
}
