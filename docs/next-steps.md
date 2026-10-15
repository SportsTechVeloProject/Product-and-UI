# V-Lo: where we are and what's next

*Hand-off first written 2026-10-12 by svanbergaddi (Oct 9–12 session). Updated 2026-10-15 by greipur22 after merging `greipur-dev` into `main` (commit `51bcfc9`): adds the work of Oct 13–15. Each commit message lists its changes in detail.*

## What V-Lo is

A velocity-based training (VBT) product for powerlifting, built as a KTH Sports Technology course project (HT26). Two Movesense IMU sensors clip to the barbell sleeves. The app measures how fast the bar moves on every rep and uses that to steer training: coaches prescribe a **speed zone** instead of a fixed weight, and the app suggests the weight from the athlete's own recorded sets.

Three parts, all in this repo:

| Part | Where | What it does |
|---|---|---|
| **Website** | `vlo.html`, `js/`, `css/` | Marketing page + the app: sensors, workouts, plans, team. Reads and writes Supabase. |
| **Processing** | `python/` | Turns a recorded set into reps (speed per rep) with the data team's `Squats2` logic. Runs as an **Azure Function** (`function_app.py`), or locally with `main.py --watch`. |
| **Database** | Supabase; `supabase/`, `docs/database.md` | People and teams, recordings (`sessions` + `reps`), plans and workouts, pictures (Storage). Diagram: `docs/database-diagram.svg`. |

The data team's own code lives in `SportsTechVeloProject/Product-testing` (branch `main`). Their squat files are copied unchanged into `python/squat/` by `python/sync_data_team.py` (`squat/SOURCE.txt` says which commit). `python/squats.py` runs the same steps as their `Squats2.py` on recordings from the website.

Squats2 needs:
- the rep count
- a speed type, fast / medium / slow: the recording's `target_zone`, see [Speed zones](#speed-zones); `medium` when there is none
- a few seconds standing still at the start
- the bar racked before Stop

## Speed zones

*Settled 2026-10-15 after several renames.*

**The website shows the five velocity zones from the VBT literature** (Bryan Mann, as published by GymAware: <https://gymaware.com/velocity_zones/>). **The code has three groups underneath**, the same words as Squats2's TYPE. Every zone belongs to exactly one group:

| Zone key | Shown on the website | Mean bar speed | % of 1RM (GymAware article text) | Code group |
|---|---|---|---|---|
| `starting_strength` | Starting strength | > 1.30 m/s | bodyweight / very light | `fast` |
| `speed_strength` | Speed-strength | 1.00–1.30 m/s | about 20–40% | `medium` |
| `strength_speed` | Strength-speed | 0.75–1.00 m/s | about 40–60% | `medium` |
| `accelerative_strength` | Accelerative strength | 0.50–0.75 m/s | about 65–80% | `medium` |
| `absolute_strength` | Absolute strength | < 0.50 m/s | about 80–100% | `slow` |

- **The same limits apply to squat, bench and deadlift.** The zone is always decided by the measured bar speed; the % of 1RM is descriptive text only. The article's numbers were chosen over GymAware's chart image, which differs slightly.
- **Code (`js/core.js`):**
  - `SPEED_ZONES`: the five `{ key, min, label, group }`, fastest first.
  - `SPEED_GROUPS`: the three groups.
  - `zoneFor(ex, v)` returns the zone key.
  - `zoneLabel()` gives the display name.
  - `zoneGroup()` gives fast/medium/slow.
  - `zoneKey()` accepts any name, including every older one (Power, Traditional, Maximal strength, Speed–strength…).
  - `ZONE_INFO` holds the descriptions and %.
- **Plans:** the coach writes one of the five (`Back squat 5x3 strength-speed`, `zone: accelerative`, `@absolute`), or picks it in the plan builder's zone picker. Weight suggestions then aim at that zone's range (e.g. 0.75–1.00 m/s).
  - `medium` (or Power / Traditional) still works as a broad target for the whole 0.50–1.30 m/s.
  - Single words only count when marked (`zone:` / `@`), followed by "zone", or last on the line, so "Power clean 3x3" and "3x5 slow eccentric" stay plain text.
- **Recordings** save the zone's **code group** as `sessions.target_zone` (`fast`/`medium`/`slow`). The database rule allows those plus the four old names; old rows were converted on 2026-10-15. `python/squats.py` passes `fast`/`medium`/`slow` straight through as the TYPE and keeps the old names' original mapping for older recordings.

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
- **Recording** (`js/sensors.js`, `js/recorder.js`, `js/recordings.js`): gyro recorded alongside the accelerometer; ● Record / ■ Stop & save per set; upload to Storage + `sessions`; result shown in the set row once processed. **Simulate** replays a real recording to try the flow; simulated recordings are never uploaded or analyzed.
- **Exercise bank** (`js/exercises.js`, 101 exercises): names in EN/IS/SV, which fields a set has (weight, reps, time, distance…), and whether the sensors record it (analyzed: squat/bench/deadlift families; "analysis coming": other barbell lifts).
- **Velocity-based suggestions** (`js/vbt.js`): the coach writes a zone per exercise; first-set weight from the athlete's load–velocity line; next-set weight after each recorded set (faster than zone → heavier). Set speed = average of all reps' mean speeds. 2.5 kg steps.
- Plan reader understands durations (`Bike 20 min`, `Plank 3x45s`) and zones.
- ⓘ explanations on hover/tap; "Connect sensors ↑" link; login switching in another tab reloads the page.

**Database**: tables `plans`, `plan_assignments`, `workouts`, `set_logs` with row level security (`supabase/plans.sql`), plus migrations in `supabase/migrations/`. Docs and diagram in `docs/`.

## What was done Oct 13 (svanbergaddi)

- **Speed zones in training:**
  - zone picker and "⚠ No zone" warnings in the plan builder
  - a Zone column in the coach template
  - a speed column and suggested weights in My training
  - "No speed zone set by your coach" on the athlete card
- **Target zone on recordings** (`sessions.target_zone`, migration `2026-10-13-session-target-zone.sql`), passed to the analysis as Squats2's TYPE.
- **Squats2:** the data team's analysis copied in with `python/sync_data_team.py`; clearer analysis errors.
- **Azure Functions processing** (`python/function_app.py`, `host.json`, `requirements.txt`): webhook → queue → analysis, plus a retry sweep. Migration `2026-10-14-resend-waiting-sessions.sql`. Setup in **[azure-processing.md](azure-processing.md)**.
- **Single-sensor test mode** (`?mirror=1`).

## What was done Oct 14–15 (greipur22)

**Team page**, top to bottom:
- **Header:** the team picture (or initial on the team colour) next to the name. **Today's sessions** sits to the right of it.
  - Athletes see their plan for today (exercises, status Not started / In progress / ✓ Done, a button that opens it in Training, or the next planned day).
  - Coaches/admins see everyone with a session today plus anyone who trained without a plan.
- **Join requests** (coaches/admins, only while someone is waiting) at the top, with a red count also on the header team badge.
- **Stat tiles:**
  - **Athletes** ("plus N coaches · N admins").
  - **Total lifted.**
  - **Lifted this week:** kg since Monday, with an arrow ↑/↓ when more than 5% ahead/behind the average of earlier weeks, scaled to how far into the week it is (`PACE_MARGIN`).
  - **Average bar speed per lift:** back squat, bench press, deadlift.
- **Top PRs:** per exercise, one row per zone, the 3 heaviest sensor-recorded sets, **one per athlete** (their best), with weight, average speed, date and time. Ties go to the faster set.
- **Coaches / Athletes lists:**
  - Each person has a round picture or initial.
  - **"Last trained … · N days this week"** (coaches/admins for everyone, athletes only for themselves).
  - **Readiness flags:**
    - "⚠ 21% slower than usual on back squat at 100 kg": the latest recorded set in the last 7 days is more than 8% slower than the person's own expected speed at that load (least-squares line through earlier sets, or earlier sets within 2.5 kg).
    - "High fatigue … (N% velocity loss)": more than 35%, a placeholder.
    - Constants are at the top of that section in `js/team.js`.
  - **Admins: "Manage"** on everyone else: role Athlete / Coach / Admin, or Remove from team (with confirmation).
- **Recent activity** (coaches/admins): latest training grouped per person, exercise and day.
- **Person progress:** a chart per recorded lift of average set speed over time (dots coloured by zone, hover for details), plus the set table.
- **Add people** collapsed behind a button. **Leave team** for everyone.
- **Edit team look** (coaches/admins): team picture and one of 8 team colours (each at least 3:1 contrast in light and dark mode).

**Elsewhere:**
- **Profile icon:** the round profile icon (picture or initial) replaces "Log in" when logged in. It's locked top-right in both headers; both headers are sticky and 76 px tall.
- **Account settings:** upload / change / remove a profile picture.
- **Buttons:** hand cursor and highlight on hover.
- **Coach viewing an athlete's training:** no sensor panel, and the tab reads "Anna's training".
- **Speed zones:** the five literature zones, see [Speed zones](#speed-zones).

**Privacy rules** (decided with the product owner):
- An athlete's own data (sets, last trained, readiness, activity) is visible only to **that athlete and the team's coaches/admins**. This is enforced by the database rules on `sessions`, `set_logs` and `workouts`.
- Team-wide totals are visible to all members.
- **Exception, chosen deliberately:** Top PRs shows names to the whole team.
- **Team pictures are members-only** (private bucket; team search doesn't return them). Profile pictures are viewable by link (public bucket, random file names, no browsing).

**Database** (all applied to Supabase and tested with real accounts inside rolled-back transactions):

| Migration | What it adds |
|---|---|
| `2026-10-14-team-stats.sql` | `team_weekly_volume()` and `team_top_lifts()`: read-only, answer only team members, return totals / top 3 only. Top PRs gets the zone limits from `SPEED_ZONES`. |
| `2026-10-14-team-identity.sql` | Buckets `pictures` (public link) and `team-pictures` (private, members read via 1-hour links, coaches/admins upload); upload/delete rules; columns `profiles.avatar_path`, `teams.logo_path`, `teams.color`; `team_roster` / `team_top_lifts` also return pictures. |
| `2026-10-14-keep-an-admin.sql` | Trigger `team_members_guard`: a team always keeps at least one admin, and only a member's role can be changed (not moved to another person/team). |
| `2026-10-15-target-zone-groups.sql` | `sessions.target_zone` accepts `fast`/`medium`/`slow` (plus the old names); 22 old rows converted to `medium`. |

**Local development:**
- **`python devserver.py`** serves the site on http://localhost:8080/vlo.html without browser caching (`.claude/launch.json` uses it).
- Script and style links in `vlo.html` carry **`?v=N`** (now 15). Bump it when changing JS/CSS so browsers that cached an older copy download the files again.

## Current state, read before starting

- **Everything is on `main`** (`51bcfc9`), which is the same as `greipur-dev`.
- **Azure needs a redeploy** after the 2026-10-15 merge: `python/squats.py` now takes `fast`/`medium`/`slow`. Until then, the cloud analysis treats new recordings as `medium`. Deploy as in [azure-processing.md](azure-processing.md); there's no automatic deploy.
- **Analysis exists for the squat family only.** Deadlift and bench recordings wait with "No analysis for … yet" and are processed automatically once the code exists. Issue [#67](https://github.com/SportsTechVeloProject/VelocityMeasuringProject_Issues/issues/67) (Data team, under #25).
- **Common analysis errors on real recordings:**
  - "Couldn't find the reported number of reps"
  - "Couldn't find the end of the set" (Stop pressed before racking)
  - "Recording too short" (Squats2 needs ≥ 6 s, starting with 2–5 s standing still)
- **Velocity numbers are not reliable yet** (data team's algorithm). The UI doesn't label them as experimental (product owner's choice).
- **The weekly total counts test/simulated recordings** for now (product owner's choice).
- **The site runs on localhost only**, so invite links and confirmation emails don't work across devices until it's hosted.

## Next steps

### 1. Redeploy Azure and measure
Redeploy after the 2026-10-15 merge. Then measure the time from Stop to result (for the paper), warm and after a cold start. Maybe show "Waiting to be processed…" if a set isn't processed within ~1 minute.

### 2. Real-sensor test
Run a warm-up ramp (e.g. 3 reps at 3–4 weights) with real sensors through My training. That checks Bluetooth + gyro and gives a first real load–velocity line. Ideally with GymAware alongside.

### 3. Deadlift and bench analysis (data team)
Issue #67. Hooking a new analysis up is one line in `python/main.py` (`DEADLIFT_FAMILY` / `BENCH_FAMILY` are already listed, commented out).

### 4. Giving sessions (approved in principle)
*The coach overview part is done (Oct 14–15).*
- **Give a session:** tick one or more athletes, pick a date, then either **a day from a team plan** or **write it on the spot** (plan format, bank-recognised). Each athlete's copy can be adjusted individually afterwards. Coaches can move/delete given sessions.
- Database: `workouts.content` (jsonb, for sessions not from a plan), `workouts.given_by`, and a rule change so a team's coaches can create workouts for their athletes. Show the SQL to the product owner before running.

### 5. Estimated 1RM per lift (not built)
Load–velocity profile: fit weight vs. speed across a person's sets and find the weight at the minimum velocity threshold (roughly 0.30 m/s squat, 0.15–0.20 bench, ~0.15 deadlift; check exact values and references before building). The literature (e.g. González-Badillo & Sánchez-Medina; Banyard et al.) shows it can over- or under-estimate, so show it as an estimate only, with enough sets across light to heavy weights. It could replace the demo "Est. 1RM" in the Squat tab header.

### 6. Squat section connection (proposed, not yet answered)
History grouped by workout day; "View in Squat" link on recorded sets.

### Later
- Tune the readiness thresholds (8% drop, 35% velocity loss) with real data.
- Auto-stop a recording when the bar is still for ~3 s; rest timer between sets.
- `supabase/teams.sql`: one team per athlete (coaches unlimited), `create_team()`; team dropdown for coaches with several teams; "Create a team" button.
- Leaderboard extras: power and W/kg (needs bodyweight in profiles). Ideas in `docs/gamification-ideas.xlsx`.
- Copy a plan to another team; personal plans in the website.
- Zone limits for women (research).
- Host the website (GitHub Pages / Netlify) so invite links and emails work.

## Key files

| File | What's in it |
|---|---|
| `js/core.js` | Shared model: `SPEED_ZONES` (5 zones), `SPEED_GROUPS` (3), zone helpers, `ZONE_INFO`, demo lifter |
| `js/team.js` | Team page: stats, Top PRs, roster status, readiness, activity, Today, progress charts, pictures, team look, roles, leave |
| `js/auth.js` | Login, profile and team loading, team badge |
| `js/training.js` | My training: calendar, workouts, set rows, recording, free workouts, timer, zone line and speed column |
| `js/exercises.js` | Exercise bank |
| `js/vbt.js` | Weight suggestions from speed |
| `js/sensors.js`, `js/recorder.js`, `js/recordings.js` | Bluetooth, collecting a set, uploading it (with the target zone group) |
| `js/coachplans.js`, `js/plans.js` | Plan builder: reading plans (zones), zone picker, saving, assigning, coach template |
| `js/mysets.js`, `js/charts.js`, `js/app.js` | Squat/Bench/Deadlift tabs with real data, charts, zone popup |
| `python/main.py`, `python/squats.py`, `python/function_app.py` | Processing: watcher, Squats2 steps, Azure Function |
| `supabase/plans.sql`, `supabase/migrations/` | Database setup and changes |
| `docs/database.md`, `docs/database-diagram.svg`, `docs/azure-processing.md` | How the tables connect; Azure setup |
| `devserver.py` | No-cache local server |
