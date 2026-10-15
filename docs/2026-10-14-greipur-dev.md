# What was done on `greipur-dev`, 2026-10-14

*Written 2026-10-14 by greipur22 (with Claude), for whoever merges `main` into `greipur-dev`. Fold the relevant parts into `next-steps.md` during the merge. Each commit message also lists its changes in detail.*

**State:** all work is on `greipur-dev` (see the commit list on GitHub). **Not merged with `main` yet.** `main` has 7 newer commits (vbt-zones, Squats2, Azure processing). See [Merging with main](#merging-with-main) before merging.

---

## 1. Speed zones: five literature zones on the website, three groups in the code

*(Final version, 2026-10-15. The zones were renamed several times on 2026-10-14; this is what's in the code now.)*

**The website shows the five velocity zones from the VBT literature** (Bryan Mann, as published by GymAware: <https://gymaware.com/velocity_zones/>). **The code underneath has three groups**, the same words as the data team's `Squats2` TYPE: `fast` / `medium` / `slow`. Every zone belongs to exactly one group:

| Zone key | Shown on the website | Mean bar speed | % of 1RM (GymAware article text) | Code group |
|---|---|---|---|---|
| `starting_strength` | Starting strength | > 1.30 m/s | bodyweight / very light | `fast` |
| `speed_strength` | Speed-strength | 1.00–1.30 m/s | about 20–40% | `medium` |
| `strength_speed` | Strength-speed | 0.75–1.00 m/s | about 40–60% | `medium` |
| `accelerative_strength` | Accelerative strength | 0.50–0.75 m/s | about 65–80% | `medium` |
| `absolute_strength` | Absolute strength | < 0.50 m/s | about 80–100% | `slow` |

- The limits are the same for squat, bench and deadlift.
- **The zone is always decided by the measured bar speed.** The % of 1RM is descriptive text only. The article's numbers were chosen over GymAware's chart image, which gives slightly different percentages.
- **Code (`js/core.js`):**
  - `SPEED_ZONES`: the five `{ key, min, label, group }`, fastest first.
  - `SPEED_GROUPS`: the three groups and their limits.
  - `zoneFor(ex, v)` returns the zone key.
  - `zoneGroup(name)` returns fast/medium/slow. **Use this for the analysis and the database** (e.g. `sessions.target_zone`).
  - `zoneLabel(name)` gives the display name.
  - `zoneKey(name)` accepts any name: keys, labels, the group words, and every older name (Power, Traditional, Maximal strength, Explosivity…).
  - `ZONE_INFO` holds the description and % per zone.
- **Coaches target one of the five zones** in a plan (`Back squat 5x3 strength-speed`, `zone: accelerative`, `@absolute`), so weight suggestions aim at a narrow range (e.g. 0.75–1.00 m/s). Writing **`medium`** (or Power / Traditional) still works as a broad target for the whole 0.50–1.30 m/s, shown as "Speed-strength to accelerative strength". `fast`/`slow` map to starting/absolute strength.
- Single words only count as zones when marked (`zone:` / `@`), followed by "zone", or last on the line, so "Power clean 3x3" and "3x5 slow eccentric" stay plain text.
- **Shown in:**
  - the zone popup: all five zones with speed and %, the current one highlighted
  - the landing-page table
  - rep chips, history, chart colours (`--zone-1` … `--zone-5`)
  - the progress charts
  - Top PRs: one row per zone

## 2. Team page

Top to bottom:

- **Header:** the team picture (or initial on the team colour) next to the name. **Today's sessions** sits to the right of the name and descriptions, and drops below on phones.
- **Join requests** (coaches/admins, only while someone is waiting) at the top, with a red count also on the team badge in the header.
- **Stat tiles:**
  - **Athletes:** number of athletes, "plus N coaches · N admins".
  - **Total lifted.**
  - **Lifted this week:** kg (weight × reps) since Monday, with an arrow: ↑ more than 5% ahead / ↓ more than 5% behind the average of earlier weeks, scaled to how far into the week it is. Earlier weeks are counted from the team's first active week (`PACE_MARGIN`).
  - **Average bar speed per lift:** back squat, bench press and deadlift only, "no data yet" until recorded.
- **Top PRs:** per exercise, one row per zone (all five), the 3 heaviest sensor-recorded sets, **one per athlete** (their best), with picture, weight, average speed, date and time. Ties go to the faster set. Only analysed lifts, so test recordings are left out.
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
- **Athletes** see their plan for today: workout, plan, exercises like "Back squat 5×3 · Strength-speed", status Not started / In progress / ✓ Done, and a button that opens it in Training. With nothing planned it says so and shows the next planned day.
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
- Script and style links in `vlo.html` carry **`?v=N`** (now 14). Bump it when changing JS/CSS so browsers that cached an older copy download the files again.

## Merging with main

Checked with `git merge-tree` against `main` at `dc00a2c`:

1. **Two conflicts**, both on the line that shows an exercise's zone:
   - `js/plans.js` (~line 1426, plan preview)
   - `js/training.js` (~line 642, athlete card)

   Keep both: `zoneLabel(item.zone)` for the display name, plus main's wording and its "No speed zone set by your coach" branch.
2. **Database:** `sessions_target_zone_check` (from main's `2026-10-13-session-target-zone.sql`) only allows the four old names. Save the **group** there: `zoneGroup(item.zone)` gives `fast`/`medium`/`slow`. Change the check to accept `'fast','medium','slow'` **and** the old names for now, so `main` keeps working. Convert the 5 existing `'Strength–speed'` rows to `'medium'`. Write it as a new migration file.
3. **`python/squats.py`:** the saved zone is now the Squats2 TYPE directly (`fast/medium/slow`). Pass it through and keep mapping the old names for older recordings. **Redeploy the Azure function.**
4. **Plan builder zone picker** (from main): offer the five zones from `SPEED_ZONES` (show `label`, save `key`), plus "Medium (0.50–1.30)" if a broad target is wanted. Main's coach template example rows should use the five names.
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
| `js/core.js` | `SPEED_ZONES` (5 zones), `SPEED_GROUPS` (3), `zoneKey()`, `zoneGroup()`, `zoneLabel()`, `ZONE_INFO` |
| `js/team.js` | The team page: stats, Top PRs, roster status, readiness, activity feed, Today, progress charts, pictures, team look, roles, leave |
| `js/auth.js` | Loads the profile picture and team picture/colour; team badge with count, colour, picture |
| `js/plans.js` | Zone parsing, template text, block-type checks |
| `js/training.js` | Sensor panel hidden in an athlete's read-only training; zone display |
| `js/app.js`, `js/charts.js` | Zone popup and rep chips with display names |
| `vlo.html`, `css/vlo.css` | Layout for all of the above |
| `supabase/migrations/2026-10-14-*.sql` | The three database changes |
| `devserver.py` | No-cache local server |
