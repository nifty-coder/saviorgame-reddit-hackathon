import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getTodayDateString } from '../shared/generator';
import type { InitDataResponse, LeaderboardEntry } from '../shared/types';

export const Splash = () => {
  const [data, setData] = useState<InitDataResponse | null>(null);

  useEffect(() => {
    async function loadInit() {
      try {
        const res = await fetch('/api/init');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.warn('Splash init fetch warning:', err);
      }
    }
    void loadInit();
  }, []);

  const todayStr = data?.dateStr || getTodayDateString();
  const username = data?.username || context.username || 'Operative';
  const streak = data?.profile?.currentStreak ?? 0;
  const topPlayers: LeaderboardEntry[] = data?.leaderboard?.slice(0, 3) || [];
  const directive = data?.directive;

  return (
    <div className="flex relative flex-col justify-between items-center w-full h-full min-h-[380px] p-3 sm:p-4 bg-[#080c11] text-slate-100 select-none overflow-hidden">
      <div className="absolute inset-0 scanlines opacity-40 pointer-events-none" />

      {/* Top Sector Header */}
      <header className="w-full flex justify-between items-center border-b border-slate-800 pb-1.5 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-semibold tracking-wider text-emerald-400">
            SECTOR 9x9 // ACTIVE
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-slate-400">DAILY SEED: </span>
          <span className="text-xs font-mono font-bold text-amber-400">{todayStr}</span>
        </div>
      </header>

      {/* Hero Brand & Briefing */}
      <div className="flex flex-col items-center justify-center my-auto text-center z-10 max-w-sm px-2">
        <div className="relative mb-2 flex items-center justify-center">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/20 via-slate-800 to-slate-900 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <svg
              className="w-8 h-8 text-amber-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 19 8 19 16 12 22 5 16 5 8 12 2" />
              <line x1="12" y1="8" x2="12" y2="14" />
              <circle cx="12" cy="17" r="0.5" fill="currentColor" />
            </svg>
          </div>
          {streak > 0 && (
            <div className="absolute -top-1 -right-2 bg-gradient-to-r from-orange-600 to-amber-600 text-[10px] font-mono font-bold text-white px-1.5 py-0.5 rounded-full border border-orange-400/50 flex items-center gap-0.5 shadow">
              🔥 {streak}d
            </div>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-widest font-mono text-slate-100 uppercase">
          SAVIOR
        </h1>
        <p className="text-[10px] sm:text-[11px] font-mono tracking-wide text-amber-400/90 uppercase mt-0.5 mb-1.5">
          Tactical Stealth & Community Extraction
        </p>

        <p className="text-xs text-slate-300 leading-relaxed max-w-[280px]">
          Collaborate with fellow Redditors to evade ambush Hunters. Deploy tactical beacons, salvage fallen dogtags, and reach Extraction alive.
        </p>

        {/* Community Directive Banner */}
        {directive && (
          <div className="w-full mt-2.5 px-2.5 py-1.5 bg-slate-900/90 border border-cyan-500/40 rounded-lg text-left">
            <div className="flex justify-between items-center text-[10px] font-mono mb-1">
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                🤝 SQUAD DIRECTIVE
              </span>
              <span className="text-amber-300 font-semibold">
                {directive.totalExtractions}/15 Extracted
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.min(100, (directive.totalExtractions / 15) * 100)}%`,
                }}
              />
            </div>
            <div className="text-[9px] font-mono text-slate-400 mt-1 flex justify-between">
              <span>Tier {directive.tier}: {directive.activePerks[0] || 'Early Radar'}</span>
              <span className="text-emerald-400">Community Perk Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard Preview */}
      {topPlayers.length > 0 && (
        <div className="w-full max-w-sm mb-2 z-10 bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-xs">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex justify-between">
            <span>Today's Top Operatives</span>
            <span className="text-amber-400/80">Leaderboard</span>
          </div>
          <div className="space-y-1">
            {topPlayers.map((entry) => (
              <div
                key={entry.username}
                className="flex justify-between items-center text-[11px] font-mono text-slate-300"
              >
                <span className="truncate max-w-[150px]">
                  #{entry.rank} {entry.username}
                </span>
                <span className="text-amber-300 font-semibold">
                  {entry.score.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Launch Button */}
      <div className="w-full max-w-sm z-10 flex flex-col items-center gap-1 pb-1">
        <button
          className="w-full py-2.5 sm:py-3 px-6 rounded-lg bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 active:scale-[0.98] text-slate-950 font-mono font-extrabold tracking-wider text-sm uppercase shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 border border-amber-300/60"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          <svg
            className="w-4 h-4 fill-current"
            viewBox="0 0 24 24"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          DEPLOY OPERATIVE // START
        </button>
        <span className="text-[10px] font-mono text-slate-500">
          Agent: <span className="text-slate-300">{username}</span> | Resets 00:00 UTC | <span className="text-amber-500/80 font-bold">v1.2.0-coop</span>
        </span>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
