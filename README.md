# SAVIOR — Daily Tactical Stealth & Community Extraction

> **Reddit Game of the Day Hackathon Entry (Devvit Web)**  
> *Submission Deadline: December 8, 2026*

**SAVIOR** is a daily tactical stealth-extraction puzzle game built natively for Reddit's Developer Platform (**Devvit Web**). Every day at **00:00 UTC**, a fresh 9x9 subterranean labyrinth is generated from a deterministic daily seed. 

Redditors navigate tight corridors, evade **telegraphed Hunter sightlines**, scavenge scattered **Food Rations**, deploy **collaborative tactical beacons** to guide their community squad, and fight to reach the **Extraction Gate** before stamina runs dry.

---

## 🎮 Key Features & Mechanics

### 1. Deterministic Daily 9x9 Labyrinth (Solvable by Design)
- **Universal Daily Seed:** Every player in every timezone tackles the exact same 9x9 layout each day (`YYYY-MM-DD`).
- **Guaranteed Solvability:** Validated via automated **Breadth-First Search (BFS)** pathfinding to ensure reachable routes to all 5 food rations and the extraction gate within the stamina budget.
- **Daily Reset:** Sector resets automatically at 00:00 UTC with updated community directives.

### 2. Stamina & Resource Management
- **25 Starting Stamina:** Every normal step consumes 1 Stamina.
- **5 Food Rations:** Scattered across the sector. Each ration restores **+4 Stamina** and awards **+300 pts**.
- **Extraction Condition:** Reach the Extraction Gate with **at least 1 Food Ration** before Stamina hits 0.
- **Failure Conditions:** Step onto an alerted Hunter tile without defensive cover, get cornered, or starve at 0 Stamina.

### 3. Telegraphed Hunter AI (Tactics Over Luck)
- **3-Tile Sightline Cones:** Hunters patrol on cyclical routes and project dangerous vision cones across unobstructed floor tiles.
- **Intent Arrows:** Hunters broadcast their intended movement tile and facing direction *before* the player commits a turn.
- **Chase & Alert State:** Stepping into a Hunter's sightline alerts them into pursuit mode.

### 4. Tactical Loadout
- ⚡ **Vault [Jump]:** Leap 2 tiles in a straight line over floor hazards, traps, or a Hunter (+200 pts per Hunter vaulted).
- 🗡️ **Ambush Blade [Knife]:** High-risk melee strike that permanently eliminates an adjacent Hunter (+1,200 pts)—valid only when attacking from behind or striking out of a stealth alcove.
- 💨 **Woosh-Smacker [Kinetic Repulsor]:** Directional blast that knocks a Hunter back up to 3 tiles and stuns them for 2 turns (+250 pts).
- 🟦 **Hideout Cave [Stealth Alcove]:** Recessed wall alcoves that grant 2 turns of complete invisibility (+500 pts Shadow Bypass bonus when Hunters pass nearby).
- 🔮 **The Oracle Gambit:** Optional pre-run wager committing to a operational restriction (e.g. *Ghost Operative*, *Glutton's Heist*, *Speed Demon*, *Hunter's Bane*) awarding **+700 pts & a 1.5x score multiplier**.

---

## 🤝 Community Collaboration & Asynchronous Social Loop

### 📡 Tactical Squad Beacons
Players can deploy **1 Squad Beacon** during their run to assist subsequent runners:
- **⚠️ Ambush Warning Flare:** Flags dangerous Hunter patrol convergence points for fellow Redditors (+200 pts contributor bonus, +100 pts scout bonus for runners).
- **📦 Emergency Supply Cache:** Leaves field rations that restore **+2 Stamina** when collected by other players.

### 🎖️ Fallen Operative Dogtag Salvage
When a player is captured or starves, their final coordinate becomes a **Fallen Operative Dogtag** tile. Subsequent players who reach that location can **salvage the dogtag** to gain **+400 pts, +1 Stamina, and +1 Vault charge**, honoring their fallen comrade.

### 🌍 Subreddit Community Directive
The entire subreddit works toward a shared daily extraction target:
- **Tier 1 (3 Extractions):** Early Radar perimeter alert for all players.
- **Tier 2 (7 Extractions):** +1 Starting Vault charge for every runner.
- **Tier 3 (15 Extractions):** +500 pts Community Extraction Bonus for all extractions today.

### 🎭 Asynchronous Rivalry & Decoys
Extracted operatives can plant **1 Decoy Hazard** (Fake Ration or Wire Trap) to challenge subsequent runners.

### 💬 One-Click Reddit Recap Comment
At the end of a run, players can trigger an explicit, spoiler-safe emoji recap directly into the Reddit comment thread:
```markdown
### 🗡️ SAVIOR Tactical Extraction — 2026-11-23
**Status:** 🟩 EXTRACTED | **Score:** 4,850 pts
**Rations Scavenged:** 4/5 🍞 | **Turns Taken:** 19 ⏱️
**Operative Flair:** *Guardian Savior*
**The Oracle Gambit:** [Glutton's Heist] ✅ FULFILLED (1.5x)
**Squad Collaboration:** 🎖️ 1 Dogtags Salvaged | 📡 1 Beacons Placed

🟩▫️▫️⬛▫️▫️▫️▫️▫️
🟨🟨▫️⬛▫️🟨🟨🟨▫️
▫️🟨⬛⬛▫️🟨⬛🟨▫️
▫️🟨🟨🟨🟨🟨▫️🟨▫️
▫️▫️▫️▫️▫️▫️▫️🟨🟦
```

---

## 🛠️ Technical Stack & Architecture

```
saviorgame/
├── devvit.json                   # Devvit Web configuration & entrypoints
├── package.json                  # Dependencies & execution scripts
├── vite.config.ts                # Vite build pipeline with Tailwind 4
├── src/
│   ├── shared/
│   │   ├── types.ts              # Core contracts, game entities, and API interfaces
│   │   ├── generator.ts          # Deterministic Mulberry32 PRNG + BFS solvability validator
│   │   ├── engine.ts             # Functional game engine, AI telegraphs, tactical cards
│   │   └── engine.test.ts        # Comprehensive unit test suite (13 passing tests)
│   ├── server/
│   │   ├── index.ts              # Hono server setup for Devvit Web
│   │   ├── core/post.ts          # Automated daily post creation
│   │   └── routes/
│   │       ├── api.ts            # REST endpoints (init, submit-run, beacons, comment recap)
│   │       └── menu.ts           # Moderator menu items
│   └── client/
│       ├── splash.html / tsx     # High-contrast inline post entrypoint with Community Directive
│       ├── game.html / tsx       # Flagship single-viewport HTML5 Canvas game with HUD dock
│       └── index.css             # Dark-slate tactical styles, scanlines, and animations
```

---

## 🚀 Development & Testing Guide

### Prerequisites
- Node.js >= 22 (tested with Node 24)
- Devvit CLI: `npm install -g devvit`

### Commands
```bash
# Navigate to the game project
cd saviorgame

# Run unit test suite (deterministic generator, BFS solver, AI telegraphs, co-op mechanics)
npm run test:unit

# Type check across shared, server, and client tsconfigs
npm run test:types

# Run ESLint
npm run lint

# Compile production bundle with Vite
npm run build

# Start local Devvit playtest against a test subreddit (<200 members)
devvit login
devvit playtest <your_test_subreddit>
```
# saviorgame-reddit-hackathon
