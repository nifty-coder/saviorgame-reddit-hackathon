import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import { generateDailyMap, getTodayDateString } from '../../shared/generator';
import type {
  CommentRecapRequest,
  CommentRecapResponse,
  CommunityBeacon,
  CommunityDirective,
  DecoyHazard,
  FallenOperative,
  InitDataResponse,
  LeaderboardEntry,
  PlaceBeaconRequest,
  PlaceBeaconResponse,
  PlaceDecoyRequest,
  PlaceDecoyResponse,
  ReplayStep,
  SubmitRunRequest,
  SubmitRunResponse,
  UserProfile,
} from '../../shared/types';

export const api = new Hono();

function getDaysDifference(d1: string, d2: string): number {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function calculateDirective(dateStr: string, totalCount: number): CommunityDirective {
  let tier = 0;
  const activePerks: string[] = [];

  if (totalCount >= 15) {
    tier = 3;
    activePerks.push('Enhanced Radar', '+1 Starting Vault', '+500 Community Extraction Bonus');
  } else if (totalCount >= 7) {
    tier = 2;
    activePerks.push('Enhanced Radar', '+1 Starting Vault');
  } else if (totalCount >= 3) {
    tier = 1;
    activePerks.push('Enhanced Radar');
  }

  return {
    dateStr,
    totalExtractions: totalCount,
    tier,
    activePerks,
  };
}

// GET /api/init - Initialize daily state, user profile, leaderboard, community directive, and map
api.get('/init', async (c) => {
  const postId = context.postId ?? 'local-preview-post';
  let username = 'Operative';

  try {
    const fetchedUser = await reddit.getCurrentUsername();
    if (fetchedUser) username = fetchedUser;
  } catch (err) {
    console.warn('Could not fetch reddit username, defaulting to Operative:', err);
  }

  const todayStr = getTodayDateString();

  try {
    // 1. Fetch community decoys, beacons, and fallen operatives
    const decoysKey = `savior:decoys:${todayStr}`;
    const decoysJson = await redis.get(decoysKey);
    let decoys: DecoyHazard[] = [];
    if (decoysJson) {
      try {
        decoys = JSON.parse(decoysJson);
      } catch (e) {
        console.error('Error parsing decoys JSON', e);
      }
    }

    const beaconsKey = `savior:beacons:${todayStr}`;
    const beaconsJson = await redis.get(beaconsKey);
    let beacons: CommunityBeacon[] = [];
    if (beaconsJson) {
      try {
        beacons = JSON.parse(beaconsJson);
      } catch (e) {
        console.error('Error parsing beacons JSON', e);
      }
    }

    const fallenKey = `savior:fallen:${todayStr}`;
    const fallenJson = await redis.get(fallenKey);
    let fallenOperatives: FallenOperative[] = [];
    if (fallenJson) {
      try {
        fallenOperatives = JSON.parse(fallenJson);
      } catch (e) {
        console.error('Error parsing fallen JSON', e);
      }
    }

    // 2. Fetch Community Directive progress
    const communityCountStr = await redis.get(`savior:community:${todayStr}:count`);
    const totalExtractionsToday = communityCountStr ? parseInt(communityCountStr) : 0;
    const directive = calculateDirective(todayStr, totalExtractionsToday);

    // 3. Generate today's map with verified BFS path & community entities
    const todayMap = generateDailyMap(todayStr, decoys, beacons, fallenOperatives);

    // 4. Fetch user profile and streak
    const profileKey = `savior:profile:${username}`;
    const profileJson = await redis.get(profileKey);
    let profile: UserProfile = {
      username,
      currentStreak: 0,
      bestStreak: 0,
      totalExtractions: 0,
      topScore: 0,
      favoriteFlair: 'Operative',
      hasPlayedToday: false,
      operativesRescued: 0,
      beaconsContributed: 0,
    };

    if (profileJson) {
      try {
        const parsed = JSON.parse(profileJson);
        profile = {
          ...profile,
          ...parsed,
          username,
        };
      } catch (e) {
        console.error('Error parsing profile JSON', e);
      }
    }

    // 5. Fetch daily leaderboard (top 10)
    const leaderboardKey = `savior:lb:${todayStr}`;
    const topMembers = await redis.zRange(leaderboardKey, 0, 9, {
      by: 'rank',
      reverse: true,
    });

    const leaderboard: LeaderboardEntry[] = [];
    if (topMembers && topMembers.length > 0) {
      for (let i = 0; i < topMembers.length; i++) {
        const item = topMembers[i];
        if (!item) continue;

        const metaKey = `savior:meta:${todayStr}:${item.member}`;
        const metaJson = await redis.get(metaKey);
        let meta = {
          rations: 0,
          turns: 0,
          flairTag: 'Operative',
          oracleFulfilled: false,
          timestamp: Date.now(),
          pathLength: 0,
        };
        if (metaJson) {
          try {
            meta = { ...meta, ...JSON.parse(metaJson) };
          } catch (e) {
            console.error('Error parsing meta JSON', e);
          }
        }

        leaderboard.push({
          rank: i + 1,
          username: item.member,
          score: item.score,
          rations: meta.rations,
          turns: meta.turns,
          flairTag: meta.flairTag,
          oracleFulfilled: meta.oracleFulfilled,
          dateStr: todayStr,
          timestamp: meta.timestamp,
          pathLength: meta.pathLength,
        });
      }
    }

    // 6. Fetch top ghost replay if available
    const ghostKey = `savior:ghost:${todayStr}:top`;
    const ghostJson = await redis.get(ghostKey);
    let topGhost: ReplayStep[] | undefined;
    if (ghostJson) {
      try {
        topGhost = JSON.parse(ghostJson);
      } catch (e) {
        console.error('Error parsing ghost JSON', e);
      }
    }

    return c.json<InitDataResponse>({
      type: 'init',
      username,
      dateStr: todayStr,
      postId,
      profile,
      leaderboard,
      todayMap,
      topGhost,
      directive,
    });
  } catch (error) {
    console.error('Failed to initialize savior game state:', error);
    const fallbackMap = generateDailyMap(todayStr, []);
    return c.json<InitDataResponse>({
      type: 'init',
      username,
      dateStr: todayStr,
      postId,
      profile: {
        username,
        currentStreak: 0,
        bestStreak: 0,
        totalExtractions: 0,
        topScore: 0,
        favoriteFlair: 'Operative',
        hasPlayedToday: false,
        operativesRescued: 0,
        beaconsContributed: 0,
      },
      leaderboard: [],
      todayMap: fallbackMap,
      directive: {
        dateStr: todayStr,
        totalExtractions: 0,
        tier: 0,
        activePerks: [],
      },
    });
  }
});

// POST /api/submit-run - Submit daily extraction run
api.post('/submit-run', async (c) => {
  let body: SubmitRunRequest;
  try {
    body = await c.req.json<SubmitRunRequest>();
  } catch (err) {
    return c.json({ success: false, message: 'Invalid payload' }, 400);
  }

  let username = 'Operative';
  try {
    const fetchedUser = await reddit.getCurrentUsername();
    if (fetchedUser) username = fetchedUser;
  } catch (e) {
    console.warn('Could not retrieve username during submit:', e);
  }

  const {
    dateStr,
    score,
    rations,
    turns,
    status,
    playerPos,
    gambitFulfilled,
    flairTag,
    history,
    stats,
  } = body;

  try {
    const leaderboardKey = `savior:lb:${dateStr}`;

    if (score > 0) {
      await redis.zAdd(leaderboardKey, { member: username, score });

      const metaKey = `savior:meta:${dateStr}:${username}`;
      await redis.set(
        metaKey,
        JSON.stringify({
          rations,
          turns,
          flairTag,
          oracleFulfilled: gambitFulfilled,
          timestamp: Date.now(),
          pathLength: history.length,
        })
      );
    }

    // If player fell (captured or starved), leave a Fallen Operative Dogtag for comrades!
    if (status === 'captured' || status === 'starved') {
      const fallenKey = `savior:fallen:${dateStr}`;
      const fallenJson = await redis.get(fallenKey);
      let fallenList: FallenOperative[] = [];
      if (fallenJson) {
        try {
          fallenList = JSON.parse(fallenJson);
        } catch (e) {
          console.error(e);
        }
      }
      if (fallenList.length >= 6) fallenList.shift();
      fallenList.push({
        id: `fallen-${Date.now()}`,
        x: playerPos.x,
        y: playerPos.y,
        username,
        cause: status,
      });
      await redis.set(fallenKey, JSON.stringify(fallenList));
    }

    // If extracted, increment community directive counter
    let totalCommunityExtractions = 0;
    if (status === 'extracted') {
      totalCommunityExtractions = await redis.incrBy(
        `savior:community:${dateStr}:count`,
        1
      );
    } else {
      const cStr = await redis.get(`savior:community:${dateStr}:count`);
      totalCommunityExtractions = cStr ? parseInt(cStr) : 0;
    }
    const directive = calculateDirective(dateStr, totalCommunityExtractions);

    // Update user profile and streak
    const profileKey = `savior:profile:${username}`;
    const profileJson = await redis.get(profileKey);
    let currentStreak = 0;
    let bestStreak = 0;
    let totalExtractions = 0;
    let topScore = score;
    let lastPlayedDate = '';
    let operativesRescued = 0;
    let beaconsContributed = 0;

    if (profileJson) {
      try {
        const p = JSON.parse(profileJson);
        currentStreak = p.currentStreak || 0;
        bestStreak = p.bestStreak || 0;
        totalExtractions = p.totalExtractions || 0;
        topScore = Math.max(topScore, p.topScore || 0);
        lastPlayedDate = p.lastPlayedDate || '';
        operativesRescued = (p.operativesRescued || 0) + (stats?.dogtagsSalvaged || 0);
        beaconsContributed = (p.beaconsContributed || 0) + (stats?.beaconsPlaced || 0);
      } catch (e) {
        console.error('Error parsing profile during submit', e);
      }
    }

    if (status === 'extracted') {
      totalExtractions++;
      if (!lastPlayedDate) {
        currentStreak = 1;
      } else {
        const daysDiff = getDaysDifference(lastPlayedDate, dateStr);
        if (daysDiff === 1) {
          currentStreak++;
        } else if (daysDiff === 0) {
          // preserve
        } else {
          currentStreak = 1;
        }
      }
      bestStreak = Math.max(bestStreak, currentStreak);
      lastPlayedDate = dateStr;
    }

    await redis.set(
      profileKey,
      JSON.stringify({
        username,
        currentStreak,
        bestStreak,
        totalExtractions,
        topScore,
        favoriteFlair: flairTag,
        lastPlayedDate,
        hasPlayedToday: true,
        operativesRescued,
        beaconsContributed,
      })
    );

    if (status === 'extracted' && history && history.length > 0) {
      const ghostKey = `savior:ghost:${dateStr}:top`;
      const currentGhostScoreKey = `savior:ghost_score:${dateStr}`;
      const currentTopScore = await redis.get(currentGhostScoreKey);
      if (!currentTopScore || score > parseInt(currentTopScore)) {
        await redis.set(ghostKey, JSON.stringify(history));
        await redis.set(currentGhostScoreKey, score.toString());
      }
    }

    let flairAssigned: string | undefined;
    if (context.subredditName && status === 'extracted') {
      try {
        const flairText = `${flairTag} | 🔥 ${currentStreak}d`;
        await reddit.setUserFlair({
          subredditName: context.subredditName,
          username,
          text: flairText,
        });
        flairAssigned = flairText;
      } catch (err) {
        console.log('User flair not modified (optional feature):', err);
      }
    }

    const topMembers = await redis.zRange(leaderboardKey, 0, 9, {
      by: 'rank',
      reverse: true,
    });
    let rank = 1;
    const leaderboard: LeaderboardEntry[] = [];

    for (let i = 0; i < topMembers.length; i++) {
      const item = topMembers[i];
      if (!item) continue;

      if (item.member === username) {
        rank = i + 1;
      }
      const metaKey = `savior:meta:${dateStr}:${item.member}`;
      const metaJson = await redis.get(metaKey);
      let meta = {
        rations: 0,
        turns: 0,
        flairTag: 'Operative',
        oracleFulfilled: false,
        timestamp: Date.now(),
        pathLength: 0,
      };
      if (metaJson) {
        try {
          meta = { ...meta, ...JSON.parse(metaJson) };
        } catch (e) {
          console.error(e);
        }
      }

      leaderboard.push({
        rank: i + 1,
        username: item.member,
        score: item.score,
        rations: meta.rations,
        turns: meta.turns,
        flairTag: meta.flairTag,
        oracleFulfilled: meta.oracleFulfilled,
        dateStr,
        timestamp: meta.timestamp,
        pathLength: meta.pathLength,
      });
    }

    return c.json<SubmitRunResponse>({
      success: true,
      rank,
      newStreak: currentStreak,
      flairAssigned,
      leaderboard,
      directive,
    });
  } catch (error) {
    console.error('Failed to submit savior run:', error);
    return c.json<SubmitRunResponse>({
      success: true,
      rank: 1,
      newStreak: 1,
      leaderboard: [],
      directive: {
        dateStr,
        totalExtractions: 0,
        tier: 0,
        activePerks: [],
      },
    });
  }
});

// POST /api/place-beacon - Deploy a tactical squad beacon (Ambush Warning or Supply Cache)
api.post('/place-beacon', async (c) => {
  let body: PlaceBeaconRequest;
  try {
    body = await c.req.json<PlaceBeaconRequest>();
  } catch (err) {
    return c.json({ success: false, message: 'Invalid payload' }, 400);
  }

  let username = 'Squad Operative';
  try {
    const fetchedUser = await reddit.getCurrentUsername();
    if (fetchedUser) username = fetchedUser;
  } catch (e) {
    console.warn(e);
  }

  const { dateStr, x, y, type, note } = body;
  const beaconsKey = `savior:beacons:${dateStr}`;

  try {
    const beaconsJson = await redis.get(beaconsKey);
    let beacons: CommunityBeacon[] = [];
    if (beaconsJson) {
      try {
        beacons = JSON.parse(beaconsJson);
      } catch (e) {
        console.error(e);
      }
    }

    const newBeacon: CommunityBeacon = {
      id: `beacon-${Date.now()}`,
      x,
      y,
      type,
      placedBy: username,
      note: note || (type === 'ambush_warning' ? 'Hunter patrol route' : 'Emergency rations'),
      collected: false,
    };

    if (beacons.length >= 8) {
      beacons.shift();
    }
    beacons.push(newBeacon);

    await redis.set(beaconsKey, JSON.stringify(beacons));

    return c.json<PlaceBeaconResponse>({
      success: true,
      beacon: newBeacon,
    });
  } catch (err) {
    console.error('Error placing beacon:', err);
    return c.json<PlaceBeaconResponse>({
      success: true,
      beacon: {
        id: `beacon-${Date.now()}`,
        x,
        y,
        type,
        placedBy: username,
        note,
      },
    });
  }
});

// POST /api/place-decoy - Plant a decoy hazard or fake ration for subsequent players
api.post('/place-decoy', async (c) => {
  let body: PlaceDecoyRequest;
  try {
    body = await c.req.json<PlaceDecoyRequest>();
  } catch (err) {
    return c.json({ success: false, message: 'Invalid payload' }, 400);
  }

  let username = 'Rival Operative';
  try {
    const fetchedUser = await reddit.getCurrentUsername();
    if (fetchedUser) username = fetchedUser;
  } catch (e) {
    console.warn(e);
  }

  const { dateStr, x, y, type } = body;
  const decoysKey = `savior:decoys:${dateStr}`;

  try {
    const decoysJson = await redis.get(decoysKey);
    let decoys: DecoyHazard[] = [];
    if (decoysJson) {
      try {
        decoys = JSON.parse(decoysJson);
      } catch (e) {
        console.error(e);
      }
    }

    const newDecoy: DecoyHazard = {
      x,
      y,
      type,
      placedBy: username,
    };

    if (decoys.length >= 5) {
      decoys.shift();
    }
    decoys.push(newDecoy);

    await redis.set(decoysKey, JSON.stringify(decoys));

    return c.json<PlaceDecoyResponse>({
      success: true,
      decoy: newDecoy,
    });
  } catch (err) {
    console.error('Error placing decoy:', err);
    return c.json<PlaceDecoyResponse>({
      success: true,
      decoy: { x, y, type, placedBy: username },
    });
  }
});

// POST /api/recap-comment - Post spoiler-safe emoji recap directly to thread
api.post('/recap-comment', async (c) => {
  let body: CommentRecapRequest;
  try {
    body = await c.req.json<CommentRecapRequest>();
  } catch (err) {
    return c.json({ success: false, message: 'Invalid payload' }, 400);
  }

  const {
    dateStr,
    score,
    rations,
    turns,
    status,
    gambitTitle,
    gambitFulfilled,
    flairTag,
    gridVisual,
    coopStats,
  } = body;

  const outcomeIcon = status === 'extracted' ? '🟩 EXTRACTED' : '🟥 FALLEN';
  const gambitIcon = gambitFulfilled ? '✅ FULFILLED (1.5x)' : '❌ MISSED';

  const commentMarkdown = `### 🗡️ SAVIOR Tactical Extraction — ${dateStr}
**Status:** ${outcomeIcon} | **Score:** ${score.toLocaleString()} pts
**Rations Scavenged:** ${rations}/5 🍞 | **Turns Taken:** ${turns} ⏱️
**Operative Flair:** *${flairTag}*
**The Oracle Gambit:** [${gambitTitle}] ${gambitIcon}
**Squad Collaboration:** 🎖️ ${coopStats?.dogtagsSalvaged || 0} Dogtags Salvaged | 📡 ${coopStats?.beaconsPlaced || 0} Beacons Placed

${gridVisual}

*Play today's daily 9x9 sector on r/${context.subredditName || 'SaviorGame'}!*`;

  try {
    if (context.postId) {
      const comment = await reddit.submitComment({
        id: context.postId,
        text: commentMarkdown,
      });

      return c.json<CommentRecapResponse>({
        success: true,
        commentId: comment.id,
        commentText: commentMarkdown,
      });
    }
  } catch (error) {
    console.warn('Could not post reddit comment directly (context missing or local mock):', error);
  }

  return c.json<CommentRecapResponse>({
    success: true,
    commentText: commentMarkdown,
  });
});
