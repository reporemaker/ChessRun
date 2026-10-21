<div align="center">

<a href="https://remaker.ch">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://remaker.ch/brand/remaker-logo-beyaz.png">
    <img src="https://remaker.ch/brand/remaker-logo.png" alt="RE*maker" height="44">
  </picture>
</a>

# ChessRun

<p><a href="https://chessrun.app"><img src="https://img.shields.io/badge/%E2%96%B6%20Play%20now-chessrun.app-f5c518?style=for-the-badge&amp;labelColor=0b0e14" alt="▶ Play now: chessrun.app" height="34"></a></p>

<p>
  <img src="docs/screenshots/menu.png" alt="ChessRun main menu" width="210">
  &nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/hunt.png" alt="Hunt mode" width="210">
  &nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/trio.png" alt="Trio mode" width="210">
</p>

<sub><sub>SEU // Emekulas // <a href="https://github.com/smrtkrft">SmartKraft</a></sub></sub>

</div>

Plays in the browser: [https://chessrun.app](https://chessrun.app). No install, no account; works on phone and desktop.

An endless runner on an endlessly scrolling chessboard. Two modes, one engine:

| Mode | You | Goal |
|---|---|---|
| **Hunt** ♞ | You become what you capture | Hunt the enemy king |
| **Escape** ♚ | You are the king, no transformation | Survive without being mated |

They mirror each other: in the classic mode you **hunt** the king, in Escape you **are** the king. Every day both modes share a board grown from the same seed (the daily challenge).

## Gameplay

The board shows 8 rows; its width is **chosen at the start: 4–8 columns**. A narrow corridor is a different game altogether — less room to run, but fewer enemies spawn too. A turn has three phases, each with its own animation:

```
1. You move               → your piece slides to the target, you become what you captured
   ↳ if you took the king → the board crumbles and is rebuilt (only then)
2. The board scrolls a row → a new row drops in at the top, the bottom one leaves
3. The enemy moves        → it moves a single piece
```

- You become the piece you capture. **This works both ways:** take a pawn as a queen and you drop to a pawn. This is the real decision of the game.
- **Give check and the enemy must defend.** Just like real chess: it cannot play any move that does not save its king — no approaching, no surrounding. So check is not just a reward hunt but a tempo weapon: you buy yourself a turn. **Consecutive checks multiply the score** (2, 4, 6… up to ×5): this is where skill really shows. If it has no saving move (mate) it does not freeze; it plays another piece at random, the king stays on the board and you get **+5**.
- **Taking the king rebuilds the board.** The squares fall away and new ones drop in: new pieces, new positions. The point is simple — so you don't hand back the life you just earned in the same turn.
- **Waiting is allowed.** Chess's "you must move" rule does not apply here; the price is dropping back one row.
- Take the enemy king for **+25 points and +1 life**. The king runs from you, and when taken a new one spawns — there is always a king on the board.
- If the enemy takes you, or you stay on the bottom row and fall off the board, **−1 life**. No lives left, game over.

### Why do you start as a knight?

A **knight**, not a pawn. Because the board scrolls every turn, a pawn moving 1 square forward is pushed 1 square back — net progress zero. It can't catch anything, it only waits for pieces to come to it, and it always loses to an enemy pawn. A knight can gain a net row per turn, which gives the player a real space of choices. To change it, edit `START_PIECE` in [`config.ts`](src/engine/config.ts).

### Scoring

| Piece | Pawn | Knight | Bishop | Rook | Queen | King |
|---|---|---|---|---|---|---|
| Points | 1 | 3 | 3 | 5 | 9 | 25 (+1 life) |

### Simplified chess rules

This is not a chess game, it is a runner played with chess *moves*. Deliberately left out:

- No castling, no en passant, no initial pawn double step.
- No pawn promotion — the "become what you capture" mechanic replaces it.
- **No obligation to move.** You can wait; the price is dropping back one row.
- Checkmate does not end the game: the enemy king is a reward target, and mate just removes the last obstacle to taking it.
- Pawn direction follows the flow of the board: the player moves up, the enemy moves down.

## Getting stuck and losing

The game **does not rescue you** when you get stuck. A piece blocking your way is not removed; losing is a real part of the game. The one thing you always have is waiting: the board scrolls, you drop back a row and the position changes.

In return, two calculations are done in the player's favour ([`fairness.ts`](src/engine/fairness.ts), [`game.ts`](src/engine/game.ts)):

1. **Danger is measured on the board after the move.** Looking at the threat map before the move is misleading: the player's own body blocks the line of a rook behind it, the player moves on, the line opens and that rook suddenly hits them. The "safe moves" counter in the HUD is based on this calculation.
2. **Ambushes created by the scroll are removed.** A player who lands on a square they saw was safe should not die because of a rook that just spawned at the top — death you had no chance to see and avoid is not a penalty, it's an accident. Pieces that already hit the square *before* the move are left alone: a risk taken knowingly is a risk. The cleanup cannot be done in a single pass; removing the piece in front of a rook opens its line, and that rook only becomes visible on the second pass.
3. **When the king is taken, the new board has no piece hitting the player.** The same cleanup is applied there, plus 2 squares around the player are left empty and the new king is placed far away. If the player is on the bottom row they are moved up one — otherwise they would give back the life they just earned on the next scroll.

Also, as long as `score === 0`, a catchable pawn is placed in the new row — so that no run ends with 0 points.

## Difficulty curve

The spawn rate is expressed not as a per-square probability but as the **expected number of pieces per row** — so instead of an abstract "5% chance per square" we can say "a piece in 75% of rows". The integer part is guaranteed, the fraction is a probability: `1.5` → one piece for sure, the second is a coin flip.

| Level | Expected | Measured | Empty rows |
|---|---|---|---|
| 1 (`BASE_ROW_PIECES`) | 0.75 | 0.750 | 25% |
| 5 | 1.35 | 1.356 | 0% |
| 13+ (cap) | 2.50 | 2.496 | 0% |

The level rises every 12 rows, each level adds `+0.15` pieces per row, and the cap is 2.5. Pieces in the same row land in different columns (the columns are shuffled and the first N are taken).

**Proportional to width:** spawning the same number of pieces per row in a 4-column corridor meant twice the density of the full board — the narrow corridor is chosen to be "a tighter game", not "twice the penalty". The rate scales by `× columns / 8`, so the pressure per square stays the same at every width. Effect measured over 300 simulated games:

| Width | Pieces per row | Average distance (before → after) |
|---|---|---|
| 4 | 0.38 | 12.3 → **22.2** |
| 6 | 0.56 | 16.7 → **23.3** |
| 8 | 0.75 | 20.3 → **21.8** |

Among spawned pieces, **pawns appear one third as often as all other pieces combined** (`PAWN_SPAWN_RATIO`). Crowds of pawns both clogged the board and, because capturing one drops the player to the weakest piece, made the game monotonous.

Balance valve: **while you play as a rook or queen, enemies spawn more densely** (`+0.25` pieces per row), so becoming a strong piece has a cost. To turn it off, set `HEAVY_PIECE_ROW_BONUS` in [`config.ts`](src/engine/config.ts) to `0`.

## Architecture

The game logic is fully separate from rendering, written as pure functions. `src/engine/` knows nothing about React; it takes a state and a move and returns a new state. That way the rules can be verified with unit tests, and if the UI changes (canvas, native, another engine) the engine moves over as is.

**Randomness is injected:** `Math.random` has been removed from the engine entirely and replaced by a seedable generator ([`engine/random.ts`](src/engine/random.ts), mulberry32). The same seed + the same move sequence produce exactly the same game — the daily challenge, run replay and server-verifiable scores all rest on this. A test verifies it by comparing board signatures square by square.

```
src/
  engine/            Game core, independent of React
    types.ts         State and event types
    config.ts        All balancing constants and difficulty functions
    random.ts        Seedable generator (mulberry32) and helpers
    moves.ts         Piece moves, threat and check calculation
    board.ts         Board generation, row spawning, scrolling, rebuilding
    fairness.ts      Safe move / unattacked square calculation
    ai.ts            Enemy move selection (forced defence under check)
    game.ts          Turn phases + rules of both modes
    game.test.ts     Classic mode rules and integrity tests
    kingrun.test.ts  Escape rules
    trio.test.ts     Trio: squad, losses, reinforcements, integrity
    random.test.ts   Reproducibility: same seed = same game
  components/
    Home.tsx         Home screen: four cards over the flowing board
    Settings.tsx     Settings window (seven sections)
    Pages.tsx        How to play / About — full screen
    Game.tsx         Game view (desktop console / mobile four corners)
    Board.tsx        Board, FLIP animation, scrolling, rebuild
  ui/i18n.ts         Flat five-language dictionary + fallback to EN
  ui/i18n.test.ts    Dictionary guard: missing key and variable tests
  ui/text.ts         useT() — translation hook bound to the selected language
  ui/settings.ts     Piece colour / sound / language store (useSyncExternalStore)
  ui/modes.ts        Mode cards on the home screen and the mode of the day
  ui/ranking.ts      Single read point for the ranking (including serverless state)
  ui/pieces.ts       Piece glyphs and name keys
  ui/timing.ts       Phase durations and speed setting
  ui/sound.ts        Retro effects generated with WebAudio (no files)
  ui/coach.ts        Contextual hints for the first game
  ui/identity.ts     Device token and HMAC signing
  ui/scores.ts       Score book, records, weekly contest, daily, streak
  ui/share.ts        Share card and clipboard/share bridge
  ui/leaderboard.ts  Server endpoint (active if VITE_LEADERBOARD_URL is set)
public/
  manifest.webmanifest   PWA identity
  sw.js                  Offline cache
  icon.svg               App icon (+ maskable variant)
```

The engine knows nothing about timing: it splits the turn into three pure functions and hands them to the UI, which plays them in order with animation time in between. In tests the same functions are called back to back without animation.

### Animation

- **Piece movement:** the FLIP technique. Each piece's previous square is remembered via `offsetTop/offsetLeft` and the piece is slid to its new square with the Web Animations API. The measurement is not affected by `transform`, so it does not clash with the scroll animation.
- **Row scroll:** the board starts one row higher and slides down to zero. The removed row is kept in the DOM as a "ghost row", so it really looks like it is leaving downwards — the screen does not jump.
- **Board rebuild — arcade flashing:** two phases. First, with the old board still in place, the rows flash hard colour changes three times from top to bottom and are crushed (`boardOut`, 598ms), then the new board opens in the same order (`boardIn`, 558ms). The delay comes from each square's `--i` (row index), which gives it a scanning feel.

  What gives it character is not the keyframes but the **timing function**: `steps(1, end)`. With no in-between frames every transition cuts hard — that was all old hardware could do. Play the same keyframes with `ease` and the effect instantly looks "modern" and soft, and the 8-bit hardness is gone. Durations are passed to the CSS from [`ui/timing.ts`](src/ui/timing.ts) as inline variables, so the animation and the phase duration never drift apart.
- With `prefers-reduced-motion` on, all animations are off.

### Enemy AI

The enemy moves a single piece each turn.

**Under check it can do nothing else.** Its moves go through a "play the move → does the player still hit the king → undo" test; this one test covers all three defences at once (the king escaping, the checking piece being taken, a piece stepping in to block the line) and also rules out escaping to a square that is still attacked. If no move passes, it is mate: one of the rejected moves with a non-king piece is played at random — the game doesn't freeze, but the king isn't saved either.

When not in check, the priorities are:

1. If it can take the player, it does — with **its cheapest piece**, so that valuable pieces stay on the board as rewards for the player.
2. The king runs when the player comes within 3 squares.
3. The other pieces approach the player; a move onto a square that can hit the player takes priority.

The weights are set by the constants at the top of [`src/engine/ai.ts`](src/engine/ai.ts).

## Escape

The king moves 1 square per turn, the board scrolls 1 row per turn: **net progress zero.** At first sight this is a flaw — in fact the whole mode is built on it:

> To survive you **have to step up every turn.** Every turn you don't brings you one row closer to the bottom. You have a margin of about 6 rows.

That is why the score is not "progress" but **rows survived** — in the story the world flows past you anyway.

| | Rule |
|---|---|
| Move | **You can't step onto an attacked square** (a real chess king) |
| Capture | You take an undefended adjacent piece, you can't take a defended one |
| Death | Mate (attacked + no safe square) or falling off the bottom row |
| Lives | One — the run ends sharply |
| Score | Rows survived + capture points |

There are hardly any new rules in the engine: the safe move calculation already existed as a hint layer ([`unattackedMoves`](src/engine/fairness.ts)); here it becomes **the rule itself**.

This has a side effect, pinned down by a test: since the player always lands on an unattacked square and ambushes from the scroll are cleared, **the enemy can never take them**. Two real deaths remain. Measured over 300 simulated runs: 20–34 rows survived, **85% end by falling, 15% by mate**; 54–77% of turns are spent under threat.

### Arcade outro

When a run ends — **in all three modes** — a three-act ending from old arcade cabinets plays ([`ArcadeOutro.tsx`](src/components/ArcadeOutro.tsx)):

1. **Death** — the board flips hard to inverse colours twice, then collapses to the centre line like a CRT television and fades out, glowing down to a white dot.
2. **Title** — CHECKMATE / GAME OVER flashes with `steps(1)`, the score climbs counter by counter.
3. **Table** — the top 8 runs drop in row by row from above, your row flashes, your rank is shown.

Tapping the screen skips ahead: watch it if you like, or jump straight to the table.

**The three animations across modes:**

| | Hunt | Escape | Trio |
|---|---|---|---|
| King taken → board crumbles | ✅ | — | ✅ |
| Stuck → reshuffle | ✅ | ✅ | ✅ |
| Arcade outro → red alert | ✅ | ✅ | ✅ |

The king-capture animation **can't run** in Escape: no enemy king spawns in that mode (`withKing: mode !== 'kingRun'`), because the king is the player. The other two apply in all three modes. The end screen has a single path too: the plain overlay is gone, all three modes get the same arcade outro.


## Trio

The third mode manages not a single piece but a **squad**: the queen, rook and bishop are yours, but each turn you move only **one** of them. The board still scrolls on every move, so the two pieces you didn't move sink one row.

The whole mode rests on one equation:

> If you have N pieces and make one move per turn, the piece you move must climb **at least N rows**. Otherwise the squad's total height drops every turn.

That is why all three must be sliding pieces: with a knight or a pawn the equation doesn't close. For the same reason the squad cap is **4**; a fifth piece would not be a gift but a burden that thins out everyone's turns.

| | Rule |
|---|---|
| Move | One piece per turn. Touching your own piece selects it, it doesn't use up the turn |
| Transformation | None — the squad is fixed |
| Score | Rows + captures + **new threats** (at most 3 per turn) + king + mate (20) |
| Loss | A piece falls off or is taken; the run only ends when the squad is gone |
| Reward | Taking the enemy king brings back a missing piece; with a full squad a 4th piece joins |
| Corridor | At least 6 wide — three sliding pieces lock each other up in 4 columns |

The fourth piece is always a **second bishop**, and it always spawns on the opposite colour: a single bishop never sees half the board.

**Two things found by measurement.** The design said "density roughly doubled"; measuring 300 runs each showed that this killed the mode — with a multiplier of 2 a run lasted 10.5 turns, 13.6 at 1.5, 20.6 at 1, and only at 1 did it sit between Hunt (17.6) and Escape (23.0). The second one was harsher: while the ambush protection was applied only to the piece being moved, the whole squad was taken in **6 turns** on average and the number of pieces lost by falling was **zero** — the scroll spawns free attackers every turn, it doesn't miss one of three targets, and the player's single move can't keep up. The protection was extended to the whole squad; threats the player walks into *with their own move* are left untouched.

The score sources were measured too (300 runs, average): rows 20.5 · captures 28.1 · king captures 23.3 · checks 8.7 · threats 6.4. The threat score is a deliberately small share: it rewards building pressure but doesn't carry the game on its own.

## Daily challenge

The seed is derived from the date (`hashSeed('2026-08-16')`), and both modes share the same seed: **on a given day everyone gets the same pieces spawning in the same places.** The day turns over at 00:00; the streak counts consecutive days played — if you haven't played today it counts from yesterday, so it doesn't break before the day is over.

The share card on the end screen follows the Wordle idea, but with visuals specific to this game: the **transformation chain** in the classic mode, a bar of rows survived in Escape.

```
ChessRun · 16.08.2026
♞→♝→♛→♟
42 points · 30 rows
🔥 5 days
```

## Tempo

A turn takes **650ms** (Normal). It used to be 1220ms: almost all of an average 20-turn game was spent watching animations, with the player's hand waiting in the air for over a second on every move. Durations were shortened and a speed switch was added to the HUD:

| Setting | Multiplier | Turn duration |
|---|---|---|
| Slow | 1.6× | 1040ms |
| Normal | 1.0× | 650ms |
| Fast | 0.55× | 358ms |

The multiplier goes from a single place ([`ui/timing.ts`](src/ui/timing.ts)) to both the phase waits and the CSS animations — if the two drift apart, animations get cut off halfway. The choice is stored in `localStorage`.

## King hunt

The king is the most valuable target on the board and the real goal of the game: **+25 points, +1 life, a brand new board.** Two indicators make this visible:

- **♚ counter:** how many moves it takes your current piece to reach the king. Found with BFS, taking width and blocking pieces into account ([`movesToKing`](src/engine/game.ts)); in a 300-game measurement it could be computed in 94% of cases, 3.01 moves on average. Side benefit: it teaches someone who doesn't know chess how their piece moves — "3 as a knight, 1 once you become a bishop".
- **CHECK ×N badge:** the chained check multiplier.

## Sound

There are no sound files: every effect is generated on the fly with a WebAudio oscillator ([`ui/sound.ts`](src/ui/sound.ts)). Square/sawtooth waves, hard attack, short decay — the same 8-bit language as the board's flashing animation. Since several events can happen in one turn (captured + transformed + gave check), they are not all played on top of each other; the "biggest" event is picked by priority. Sound can be turned off from the HUD and the choice is saved.

## UI indicators

The board is deliberately plain: **no safe/dangerous square colouring.** Playable empty squares are marked with a neutral grey dot — as in chess apps, judging them is the player's job. Numeric help stays in the HUD: the "safe moves" counter, the ♚ distance counter, the **CHECK** badge that lights up when you give check, and the golden halo on the enemy king's square.

A fixed **CRT scanline** sits over the board — it doesn't move with the scrolling board, it is stuck to the frame. It carries half of the retro feel.

### Tutorial: contextual hints instead of a modal

Since the guide squares were removed, a player who doesn't know chess had nothing to hold on to; but stopping the game to give a lesson kills the runner's tempo. The solution: **one-line hints that appear exactly at the relevant moment and are shown once** ([`ui/coach.ts`](src/ui/coach.ts)). On the first move "the piece with the green ring is you", on the first transformation "now you move like it", the multiplier rule on the first check, a falling warning when you approach the bottom row, a reminder to wait when you have no moves left. Seen hints are marked in `localStorage`.

## Development

```bash
npm install
npm run dev      # development server
npm test         # engine tests
npm run build    # type check + production build
npm run lint
```

## Identity and scores — no account

No sign-up, no email, no password. On first launch every browser generates its own **token** (`crypto.randomUUID`) and an **HMAC-SHA256 key**; the key never leaves the device. Every run is written to the score book together with the signature of the `token|score|distance|columns|level|time|week` payload ([`ui/identity.ts`](src/ui/identity.ts), [`ui/scores.ts`](src/ui/scores.ts)). Players can choose any name; the token stays the same when the name changes.

> **Honest limit:** since the key lives in the browser, this signature *makes tampering detectable*, it can't stop a determined cheat — someone editing storage by hand can re-sign with their own key. Real protection only comes on the server, by replaying and verifying a seeded run. That is why seeded randomness is still at the top of the list.

The **weekly contest** runs on the ISO week key (`2026-W33`): a week belongs to the year its Thursday falls in, so the week around New Year isn't split in two. The week turns over on Monday at 00:00, finished weeks go to the archive.

Without a server the contest means "beat your own record". As soon as `VITE_LEADERBOARD_URL` is set, the same signed records start going to the global table, and nothing else changes in the UI ([`ui/leaderboard.ts`](src/ui/leaderboard.ts)):

```
POST {url}/runs      body: run + token + name + alg   → 204
GET  {url}/weekly?week=2026-W33                       → { entries: [...] }
```

## Install and deployment

The app is a **PWA**: with `manifest.webmanifest` and a service worker with runtime caching ([`public/sw.js`](public/sw.js)), it works offline once opened and can be added to the home screen. The service worker is registered only in the production build; in development it clashes with Vite's hot reload.

Navigation requests use **network first** (so a new version isn't missed), hashed assets use **cache first**.

> The icons are SVG. Chrome/Edge/Android use them without issue; for the iOS home screen icon, PNGs (180×180, 512×512) still need to be generated.

## Game screen

One markup, two layouts — the breakpoint is `900px`:

- **Desktop — console.** The board sits on the left and takes all the remaining height (~656px at 1280×760); on the right a single 384px column is ordered top to bottom **by frequency of use**: score → turn status → settings → badges → links → ad. Since only one side is used, the other three are left to the board.
- **Mobile — four corners.** The scores are spread over the four corners of the board (score · your best at the top, distance · lives at the bottom), the board in the middle, and the gear at the bottom as the only thing to tap. Nothing else; the space around the board is empty on purpose.

The **board size** comes from a single rule via `--cell`: on mobile the square size is `1/8` of the screen width and fixed (8 columns fit edge to edge, a narrow corridor is centred with the same square size and leaves the edges empty); on desktop the remaining **height** decides. No scrolling in either case.

**In-game settings:** speed · sound · piece colour · language. Piece colour is a visual **skin**: the engine's colours stay fixed, the player's pieces are painted in the chosen colour and the enemy's in the opposite one — so the setting works instantly even mid-run. Corridor and ranking stay in the window (they would break up the run). On mobile the way out is in the window behind the gear: during a game a **back to menu** link appears there.

The **ad slot** is drawn only if `VITE_AD_SLOT` is set, and when drawn it reserves its space — the board doesn't jump when it loads.

## Languages

There are five languages and **all are complete**: TR, EN, DE, ES, FR ([`ui/i18n.ts`](src/ui/i18n.ts)). The dictionary is flat — keys are dotted (`home.streak`) — because a missing translation falls back per key: first EN, then TR, and finally the key itself. A raw key never reaches the screen, and an unknown key doesn't crash the UI; tests verify this for five languages × all keys.

Coverage is computed from the dictionary itself, not from a fixed list ([`missingKeys`](src/ui/i18n.ts)): if a new text is forgotten in one language the test fails, and the settings window tells the reader what's missing. So the fallback mechanism sits idle today but stays on guard against breakage.

## Next steps

- [x] Server side of the weekly table — `server/src/lb.ts`, D1 (`lb_*` tables), "Names" moderation in the panel (18 August 2026)
- [ ] Watching run replays (seed + move sequence record; the engine is already deterministic)
- [ ] Keyboard controls
- [ ] PNG icons for iOS
- [ ] A separate burst animation for captured pieces

## License

Code: [AGPL-3.0](LICENSE). Anyone who modifies the game and runs it on a server must also share their modified source code with the players.
Piece artwork (chessnut): [Apache-2.0](LICENSES/chessnut-APACHE-2.0.txt).
