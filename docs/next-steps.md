# V-Lo: where we are and what's next

*Hand-off written 2026-10-12, end of a long working session (Oct 9–12). Branch: `feature/recording-buffer`.*

## What V-Lo is

A velocity-based training (VBT) product for powerlifting, built as a KTH Sports Technology course project (HT26). Two Movesense IMU sensors clip to the barbell sleeves; the app measures how fast the bar moves on every rep and uses that to steer training: coaches prescribe a **speed zone** instead of a fixed weight, and the app suggests the weight from the athlete's own recorded sets.

Three parts, all in this repo now:

| Part | Where | What it does |
|---|---|---|
| **Website** | `vlo.html`, `js/`, `css/` | Marketing page + the app: sensors, workouts, plans, team. Reads and writes Supabase. |
| **Processing** | `python/` | `main.py` turns a recorded set into reps (speed per rep) using the data team's `Squats.py` logic. |
| **Database** | Supabase; `supabase/`, `docs/database.md` | People and teams, recordings (`sessions` + `reps`), plans and workouts. Diagram: `docs/database-diagram.svg`. |

The data team's own code lives in `SportsTechVeloProject/Product-testing` (branch `main`). Their squat files are copied unchanged into `python/squat/` by `python/sync_data_team.py` (`squat/SOURCE.txt` says which commit); `python/squats.py` runs the same steps as their `Squats2.py` on recordings from the website. Squats2 needs the rep count, a speed type (slow/medium/fast, from the coach's zone; `medium` without one), a few seconds standing still at the start, and the bar being racked before Stop.

## What was done Oct 9–12

**Processing (Python)**
- `python/main.py`: one recorded set from file → Supabase Storage → `sessions` row → `squats.py` → `reps` rows. Debuggable step by step in VS Code (`--dry-run`, `--session`, `--plot`).
- `python/main.py --watch`: the **processing watcher**. Every 2 s it processes recordings with no `analyzed_at`/`analysis_error`, using the service key. Lifts without analysis code yet (bench, deadlift, other barbell lifts) are kept *waiting* and re-queued automatically once their code exists.
- Verified our copy gives identical results to the data team's `Squats2.py`. Found that their velocity method (`calculate_velocity3`) fails on the 2026-10-09 slow/medium/fast recordings (walkout, long sets, re-rack, slow reps, integrating magnitude). See the handoff page sent to them.

**Website**
- **Squat/Bench/Deadlift tabs** show the logged-in lifter's real sets (demo data for visitors, labelled examples for lifters with none yet): zone-coloured bar speed chart, top-speed dots, fastest rep, left vs right speed per rep with uneven reps flagged (22% limit, `LR_MISMATCH_LIMIT` in `js/core.js`).
- **Team page**: progress card per athlete with rep detail and fastest rep; "See their training".
- **Plans → Plan builder** (coaches/admins only): save plans to the team, assign to athletes with start date + training weekdays → dated workouts.
- **Plans → My training** (`js/training.js`): calendar (every day clickable; rest days can get a free workout), workout list, per-exercise cards, workout timer (Start/Finish), free workouts, "last time", next set pre-filled from the previous one.
- **Recording** (`js/sensors.js`, `js/recorder.js`, `js/recordings.js`): gyro now recorded alongside the accelerometer; ● Record / ■ Stop & save per set; upload to Storage + `sessions`; result shown in the set row once processed. **Simulate** replays a real recording to try the flow, and simulated recordings are never uploaded or analyzed.
- **Exercise bank** (`js/exercises.js`, 101 exercises): names in EN/IS/SV, which fields a set has (weight, reps, time, distance…), whether the sensors record it (analyzed: squat/bench/deadlift families; "analysis coming": other barbell lifts).
- **Velocity-based suggestions** (`js/vbt.js`): coach writes a zone per exercise (e.g. `Back squat 5x3 strength-speed`); first-set weight from the athlete's load–velocity line; next-set weight after each recorded set (faster than zone → heavier). Set speed = average of all reps' mean speeds. 2.5 kg steps.
- Plan reader understands durations (`Bike 20 min`, `Plank 3x45s`) and zones.
- ⓘ explanations on hover/tap; "Connect sensors ↑" link; login switching in another tab now reloads the page.

**Database**: tables `plans`, `plan_assignments`, `workouts`, `set_logs` with row level security (`supabase/plans.sql`), plus migrations in `supabase/migrations/`. Docs and diagram in `docs/`.

## Current state, read before starting

- **Not committed:** everything listed under "Website", the watcher, `js/exercises.js`, `js/training.js`, `js/vbt.js`, `js/recorder.js`, `js/recordings.js`, `js/coachplans.js`, `supabase/`, `docs/database*`. Commit first.
- **Database:** `plans.sql` and all three migrations have been run. `set_logs-updates.sql` had to be run twice; the check query (in the chat) should show 8 × `true`.
- **Processing isn't automatic yet:** a real recording shows "Processing…" until `main.py --watch` runs. Decided: move it to **Azure Functions** (below).
- **Not tested with real hardware yet:** Bluetooth recording with the gyro subscription. Simulated flow is tested.
- **Windows Application Control** blocked `imufusion`/`scipy` in Claude's shell on 2026-10-12, so Python was tested in the browser (Pyodide) with a stand-in for `imufusion`. It may or may not affect the user's own VS Code runs.
- **Velocity numbers are not reliable yet** (data team's algorithm). The UI doesn't label them as experimental (user's choice).

## Next steps, in order

### 1. Zones on every Movesense exercise (do this first, it's quick)
Goal: the athlete always knows which speed zone they're working in, and sees their measured speed against it.
- **Coach / plan builder:** every Movesense exercise needs a zone. Show "⚠ No zone" next to Movesense exercises without one, with a quick picker (four zone buttons) that writes the zone into the plan. Add a **Zone** column to the downloadable coach template (`buildTemplateXlsx` in `js/plans.js`).
- **Athlete card:** a clear line at the top: **"Speed zone: Strength–speed · 0.50–0.75 m/s average"** with ⓘ.
- **Set row:** a **Speed** column showing the measured average velocity after processing, coloured in-zone (green) / outside (amber), and the next row's weight pre-filled with the suggestion and marked "suggested". Fold the long result/suggestion lines into the row; details stay in ⓘ.
- **Open question for the user:** they wrote "speed strength (0.5–0.75)". In the site's zone table 0.50–0.75 m/s is **Strength–speed** and **Speed–strength** is > 0.75. Confirm the naming/ranges before building (zone limits live in `EXERCISES` in `js/core.js`).

### 2. Automatic processing on Azure Functions (code written 2026-10-13)
- Code: `python/function_app.py` (webhook → queue → analysis, plus an hourly sweep), `host.json`, `requirements.txt`.
- Setup, deployment and testing: **[azure-processing.md](azure-processing.md)**. Still to do: create the app, deploy, add the Supabase webhook.
- Then: measure time from Stop to result (for the paper), warm and after a cold start.
- Maybe: show "Waiting to be processed…" if a set isn't processed within ~1 minute.

### 3. Real-sensor test
Run a warm-up ramp (e.g. 3 reps at 3–4 weights) with real sensors through My training. That checks Bluetooth + gyro and gives a first real load–velocity line. Ideally with GymAware alongside.

### 4. Coach overview + giving sessions (approved in principle)
- **Team page → Athletes table** for coaches: today (planned / ⏱ in progress / done), this week (done/planned/missed), last trained, speed trend, flags (missed, falling speed, uneven L/R); a "Today" strip; click a name → their calendar.
- **Give a session**: tick one or more athletes, pick a date, then either **a day from a team plan** or **write it on the spot** (plan format, bank-recognised). Each athlete's copy can be adjusted individually afterwards. Coaches can move/delete given sessions.
- Database: `workouts.content` (jsonb, for sessions not from a plan), `workouts.given_by`, and an RLS change so a team's coaches can create workouts for their athletes. Show the SQL to the user before running.

### 5. Squat section connection (proposed, not yet answered)
History grouped by workout day; "View in Squat" link on recorded sets; the lifter's load–velocity line in the header instead of the demo "Est. 1RM".

### Later
- Auto-stop a recording when the bar is still for ~3 s; rest timer between sets.
- `supabase/teams.sql`: one team per athlete (coaches unlimited), `create_team()`; team dropdown for coaches with several teams; "Create a team" button.
- Leaderboard: power and W/kg (needs bodyweight in profiles); estimated 1RM later. Ideas in `docs/gamification-ideas.xlsx`.
- Copy a plan to another team; personal plans in the website.
- Zone limits for women (research).
- GitHub: create the drafted issues (sub-issues of #15 "Design website" in `VelocityMeasuringProject_Issues`, Team: Product team, Iteration 4). Needs `gh` installed + `gh auth login --scopes project`.
- Push `feature/recording-buffer`, open a PR to `main`, merge.

## Key files

| File | What's in it |
|---|---|
| `js/training.js` | My training: calendar, workouts, set rows, recording, free workouts, timer |
| `js/exercises.js` | Exercise bank |
| `js/vbt.js` | Weight suggestions from speed |
| `js/sensors.js`, `js/recorder.js`, `js/recordings.js` | Bluetooth, collecting a set, uploading it |
| `js/coachplans.js`, `js/plans.js` | Plan builder: reading plans, saving, assigning |
| `js/mysets.js`, `js/charts.js` | Squat/Bench/Deadlift tabs with real data |
| `python/main.py` | Processing and the watcher |
| `supabase/plans.sql`, `supabase/migrations/` | Database setup |
| `docs/database.md`, `docs/database-diagram.svg` | How the tables connect |
