# What was done on `greipur-dev`, 2026-10-14

*Written 2026-10-14 by greipur22 (with Claude), for whoever merges `main` into `greipur-dev`. Fold the relevant parts into `next-steps.md` during the merge. Each commit message also lists its changes in detail.*

**State:** 21 commits on `greipur-dev`, all pushed. **Not merged with `main` yet.** `main` has 7 newer commits (vbt-zones, Squats2, Azure processing). See [Merging with main](#merging-with-main) before merging.

---

## 1. Speed zones: three zones, the same for every lift

The four old zones (speed-strength, strength-speed, accelerative, maximal) are replaced everywhere by three. **Code uses the data team's `Squats2` names, the website shows full names:**

| Key (code, database) | Shown on the website | Mean bar speed | % of 1RM | Combines the classic zones |
|---|---|---|---|---|
| `fast` | Starting Strength / Speed | > 1.30 m/s | 0–30% | starting strength |
| `medium` | Power | 0.50–1.30 m/s | 30–80% | speed-strength, strength-speed, accelerative strength |
| `slow` | Absolute Strength | < 0.50 m/s | 80–100% | absolute strength |

- Limits are based on the GymAware velocity-zone chart. They're the same for squat, bench and deadlift (deadlift used to have lower limits).
- **One place to change them:** `SPEED_ZONES` in `js/core.js` (`{ key, min, label }`, fastest first).
- `zoneKey(name)` turns any zone name into its key: keys, labels, and all older names (Strength–speed, Maximal strength, Explosivity, Traditional, Power…). `zoneLabel(name)` gives the display name. `zoneFor()` returns the key; every place that displays a zone wraps it in `zoneLabel()`.
- `ZONE_INFO` (descriptions, % of 1RM, and the classic zones each zone covers) and `BLOCK_EXPECTATION` are keyed by key.
- **Zone popup** (click a zone in the app): range, % of 1RM, and a table of the classic zones it covers. Power explains that it combines the three zones between 0.50 and 1.30 m/s.
- **Landing-page zone table:** the three zones with a "% of 1RM" column.
- **Plan reader:** the coach can write `Back squat 5x3 power`, `zone: absolute strength`, `@starting strength`, or the keys `fast/medium/slow`. Single words count only when marked (`zone:` / `@`), followed by "zone", or last on the line, so "Power clean 3x3" and "3x5 slow eccentric" aren't read as zones. Saved as the key. Old names in saved plans still work (speed-strength, strength-speed and accelerative → `medium`, maximal → `slow`).
- **Effect on weight suggestions (`js/vbt.js`):** Power is wide (0.50–1.30). A suggestion aims at the middle of the zone (~0.90 m/s) and "stays at this weight" anywhere inside it. Coaches who want tighter control can write an exact speed (`@0.6 m/s`).

## 2. Team page

Top to bottom:

- **Header:** the team picture (or initial on the team colour) next to the name. **Today's sessions** sits to the right of the name and descriptions, and drops below on phones.
- **Join requests** (coaches/admins, only while someone is waiting) at the top, with a red count also on the team badge in the header.
- **Stat tiles:**
  - **Athletes:** number of athletes, "plus N coaches · N admins".
  - **Total lifted.**
  - **Lifted this week:** kg (weight × reps) since Monday, with an arrow: ↑ more than 5% ahead / ↓ more than 5% behind the average of earlier weeks, scaled to how far into the week it is. Earlier weeks are counted from the team's first active week (`PACE_MARGIN`).
  - **Average bar speed per lift:** back squat, bench press and deadlift only, "no data yet" until recorded.
- **Top PRs:** per exercise and zone, the 3 heaviest sensor-recorded sets, **one per athlete** (their best), with picture, weight, average speed, date and time. Ties go to the faster set. Only analysed lifts, so test recordings are left out.
- **Coaches / Athletes lists:**
  - Each person has a round picture or initial.
  - **"Last trained … · N days this week"**: coaches/admins see it for everyone, athletes only for themselves.
  - **Readiness flags:**
    - **"⚠ 21% slower than usual on back squat at 100 kg"**: the latest recorded set (last 7 days) is more than 8% slower than the person's own expected speed at that load. "Expected" comes from a least-squares line through their earlier sets (≥ 3 sets, ≥ 2 weights), otherwise the average of earlier sets within 2.5 kg.
    - **"High fatigue in last … set (N% velocity loss)"**: more than 35%. This threshold is a placeholder.
    - Constants: `READINESS_DROP`, `READINESS_RECENT_DAYS`, `HIGH_VELOCITY_LOSS`, `ACTIVITY_DAYS` in `js/team.js`.
  - **Admins: "Manage"** on everyone else: role Athlete / Coach / Admin, or **Remove from team** (with confirmation).
- **Recent activity** (coaches/admins): the latest training grouped per person, exercise and day, e.g. "2 sets · top 100 kg × 5 · best set avg 0.45 m/s · 2 h ago". It counts sets ticked off in Training plus sensor recordings, and a recording linked to a set is counted once.
- **Person progress** (click a person): summary tiles, **a chart per recorded lift** of average set speed over time (dots coloured by zone, zone bands, hover for date / weight × reps / speed), and the set table.
- **Add people / Suggest someone:** collapsed behind a button.
- **Leave team** for everyone, with confirmation.
- **Edit team look** (coaches/admins): upload/remove the team picture and pick one of 8 team colours, each checked to have at least 3:1 contrast on the light and dark backgrounds. The colour tints the team name and the header badge.

**Today's session**
- **Athletes** see their plan for today: workout, plan, exercises like "Back squat 5×3 · Power", status Not started / In progress / ✓ Done, and a button that opens it in Training. With nothing planned it says so and shows the next planned day.
- **Coaches/admins** see everyone with a session today (not started first), plus anyone who trained without a plan.

## 3. Other website changes

- **Profile icon:** when logged in, the landing nav shows a round profile icon (picture or initial) instead of "Log in". In both headers it's the last item, locked top-right. Both headers are sticky and 76 px tall.
- **Account settings:** upload / change / remove your profile picture.
- **Buttons:** hand cursor and highlight on hover. Disabled buttons look faded.
- **Coach viewing an athlete's training:** the sensor panel is hidden (read-only view; a recording would be saved to the coach's account) and the tab reads "Anna's training".

## 4. Privacy rules (decided with the user)

- An athlete's own data (sets, last trained, readiness, activity) is visible only to **that athlete and the team's coaches/admins**. This is enforced by the existing database rules on `sessions`, `set_logs` and `workouts`; the website only asks for what you may see.
- Team-wide totals (weekly kg, team picture/colour) are visible to all members.
- **Exception, chosen deliberately:** Top PRs shows names to the whole team.
- **Team pictures are visible to team members only.** Team search doesn't return them.

## 5. Database changes (all applied to Supabase and tested)

| Migration | What it adds |
|---|---|
| `2026-10-14-team-stats.sql` | `team_weekly_volume(team, timezone, weeks)` and `team_top_lifts(team, zone limits, per zone)`. Read-only, `security definer`, answer only team members, return totals / top 3 only. The zone limits are passed in from `SPEED_ZONES`, so Top PRs follows zone changes. |
| `2026-10-14-team-identity.sql` | Bucket **`pictures`** (public link, random file names, no browsing) for profile pictures in `profiles/<id>/`. Private bucket **`team-pictures`** (members can read via 1-hour signed links; coaches/admins upload/delete) in `<team id>/`. Columns `profiles.avatar_path`, `teams.logo_path`, `teams.color`. `team_roster` and `team_top_lifts` also return `avatar_path`. Helpers `is_team_member_text`, `is_team_staff_text`. |
| `2026-10-14-keep-an-admin.sql` | Trigger `team_members_guard`: refuses removing/demoting a team's **last admin** and refuses moving a membership to another person or team (only the role may change). |

Tested with real accounts inside rolled-back transactions:
- Outsiders get nothing from the functions and can't read or upload team pictures.
- The last admin can't step down or be removed.
- Normal role changes and removals still work.

Pictures are cropped square and shrunk in the browser before upload (256 px profile, 512 px team), and the old file is deleted.

## 6. Local development

- **`python devserver.py`** serves the site on http://localhost:8080/vlo.html like `python -m http.server`, but with `Cache-Control: no-store`, so a normal reload always gets the newest JS/CSS. `.claude/launch.json` uses it.
- Script and style links in `vlo.html` carry **`?v=N`** (now 13). Bump it when changing JS/CSS so browsers that cached an older copy download the files again.

## Merging with main

Checked with `git merge-tree` against `main` at `dc00a2c`:

1. **Two conflicts**, both on the line that shows an exercise's zone:
   - `js/plans.js` (~line 1426, plan preview)
   - `js/training.js` (~line 642, athlete card)

   Keep both: `zoneLabel(item.zone)` for the display name, plus main's wording and its "No speed zone set by your coach" branch.
2. **Database:** `sessions_target_zone_check` (from main's `2026-10-13-session-target-zone.sql`) only allows the four old names, so recording a set with a zone from `greipur-dev` would be **rejected**. Change it to accept `'fast','medium','slow'` **and** the old names for now, so `main` keeps working. Convert the 5 existing `'Strength–speed'` rows to `'medium'`. Write it as a new migration file.
3. **`python/squats.py`:** the zone is now the Squats2 TYPE directly. Pass `fast/medium/slow` through and keep mapping the old names for older recordings. **Redeploy the Azure function.** Until then, sets with the new keys are processed as `medium`.
4. **Plan builder zone picker** (from main): show the three labels from `SPEED_ZONES`, save `zone.key`. Update the coach template's example rows and help text to the new names.
5. Bump `?v=` in `vlo.html`.

## Open items and ideas

- **Deadlift (and bench) analysis:** issue [#67](https://github.com/SportsTechVeloProject/VelocityMeasuringProject_Issues/issues/67) (Data team, under #25). Deadlift recordings wait with "No analysis for deadlift yet" and are processed automatically once the analysis exists.
- **Estimated 1RM per lift** (not built): the load–velocity profile method. Fit weight vs. speed across a person's sets and find the weight at the minimum velocity threshold (roughly 0.30 m/s squat, 0.15–0.20 bench, ~0.15 deadlift; check exact values and references before building). The literature (e.g. González-Badillo & Sánchez-Medina; Banyard et al.) shows it can over- or under-estimate, so show it as an estimate only with enough sets across light to heavy weights.
- **Readiness thresholds** (8% drop, 35% velocity loss) are first guesses; tune them with real data.
- **The weekly total counts test/simulated recordings for now** (the user's choice).
- `sessions.target_zone` holds 5 old `'Strength–speed'` values (see Merging, step 2).

## Key files touched today

| File | What changed |
|---|---|
| `js/core.js` | `SPEED_ZONES`, `zoneKey()`, `zoneLabel()`, `ZONE_INFO` |
| `js/team.js` | The team page: stats, Top PRs, roster status, readiness, activity feed, Today, progress charts, pictures, team look, roles, leave |
| `js/auth.js` | Loads the profile picture and team picture/colour; team badge with count, colour, picture |
| `js/plans.js` | Zone parsing, template text, block-type checks |
| `js/training.js` | Sensor panel hidden in an athlete's read-only training; zone display |
| `js/app.js`, `js/charts.js` | Zone popup and rep chips with display names |
| `vlo.html`, `css/vlo.css` | Layout for all of the above |
| `supabase/migrations/2026-10-14-*.sql` | The three database changes |
| `devserver.py` | No-cache local server |
