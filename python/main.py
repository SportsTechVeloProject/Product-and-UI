"""main.py — one recorded set, from "Stop pressed" to reps in the database.

Runs on a laptop, no website involved. Each step is its own function, so you
can put a breakpoint anywhere (VS Code: Run and Debug, with the arguments
below) and look at the data between steps.

  1. load_recording   CSV (from MoveSenseCode) or JSON -> list of samples
  2. store_session    "Stop pressed": upload the JSON to Storage, create the
                      sessions row -> session_id
  3. process_session  session_id -> download the raw JSON, pick the code for
                      the exercise (back_squat -> squats.py), calculate reps
  4. save_reps        write one reps row per rep, linked by session_id
  5. print_summary    what the website will show

Usage (needs numpy, scipy, pandas, matplotlib, imufusion):
  python main.py recording.csv --weight 100 --reps 11      # the whole chain
  python main.py recording.csv --dry-run                   # steps 1 and 3 only, nothing stored
  python main.py --session <id>                            # steps 3-5 for an existing session
  python main.py --session <id> --replace                  # same, replacing its reps
  add --plot to any of them to see the data team's plots

Login: you're asked for the athlete's V-Lo email and password (or set
VLO_EMAIL / VLO_PASSWORD). The set is saved under that athlete; their coach
sees it on the team page.
"""

import argparse
import csv
import datetime
import getpass
import json
import math
import os
import sys
import uuid

import supabase_api as db
import squats

# sessions.exercise -> the code that processes it
EXERCISES = {
    "back_squat": squats.analyze,
    # "deadlift": deadlift.analyze,
    # "bench_press": benchpress.analyze,
}

SAMPLE_FIELDS = ("sensor", "t", "recvAt", "x", "y", "z", "gx", "gy", "gz")


# ============================================================
# 1. Load the recording
# ============================================================

def load_recording(path):
    """CSV or JSON file -> [{sensor, t, recvAt, x, y, z, gx, gy, gz}, ...].
    Missing values ("undefined", empty) become None."""
    with open(path, encoding="utf-8") as f:
        if path.lower().endswith(".json"):
            rows = json.load(f)
        else:
            rows = list(csv.DictReader(f))

    samples = []
    for row in rows:
        sample = {"sensor": row.get("sensor")}
        for key in SAMPLE_FIELDS[1:]:
            sample[key] = to_number(row.get(key))
        samples.append(sample)
    print("1. Loaded %d samples from %s" % (len(samples), os.path.basename(path)))
    return samples


def to_number(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# ============================================================
# 2. Store it ("Stop pressed")
# ============================================================

def store_session(token, user_id, samples, exercise, weight_kg=None, reps=None):
    """Uploads the raw JSON to Storage and creates the sessions row. Returns session_id."""
    session_id = str(uuid.uuid4())
    raw_path = "%s/%s.json" % (user_id, session_id)

    db.upload_raw(token, raw_path, samples)
    try:
        db.insert(token, "sessions", [{
            "id": session_id,
            "user_id": user_id,
            "exercise": exercise,
            "weight_kg": weight_kg,
            "reported_rep_count": reps,
            "recorded_at": recorded_at(samples),
            "raw_data_path": raw_path,
        }])
    except db.SupabaseError:
        db.delete_raw(token, raw_path)  # don't leave an orphaned file behind
        raise
    print("2. Stored session %s (raw file %s/%s)" % (session_id, db.RAW_BUCKET, raw_path))
    return session_id


def recorded_at(samples):
    """When the set started: the first sample's receive time, else now."""
    stamps = [s["recvAt"] for s in samples if s.get("recvAt")]
    when = (datetime.datetime.fromtimestamp(min(stamps) / 1000, datetime.timezone.utc)
            if stamps else datetime.datetime.now(datetime.timezone.utc))
    return when.isoformat()


# ============================================================
# 3. Process it
# ============================================================

def process_session(token, session_id, plot=False):
    """Downloads the session's raw JSON and runs the code for its exercise."""
    found = db.select(token, "sessions",
                      "select=id,exercise,reported_rep_count,raw_data_path&id=eq." + session_id)
    if not found:
        raise SystemExit("No session %s, or this account can't see it." % session_id)
    session = found[0]
    samples = db.download_raw(token, session["raw_data_path"])
    print("3. Downloaded %d samples for session %s (%s)" % (len(samples), session_id, session["exercise"]))
    return analyze(samples, session["exercise"], session["reported_rep_count"], plot)


def analyze(samples, exercise, reps=None, plot=False):
    if exercise not in EXERCISES:
        raise SystemExit("No processing code for exercise %r yet (have: %s)."
                         % (exercise, ", ".join(EXERCISES)))
    results = EXERCISES[exercise](samples, reps=reps, plot=plot)
    print("   Processed with %s: %d reps" % (results["version"], len(results["reps"])))
    return results


# ============================================================
# 4. Save the reps
# ============================================================

def save_reps(token, session_id, results, replace=False):
    existing = db.select(token, "reps", "select=id&session_id=eq." + session_id)
    if existing and not replace:
        raise SystemExit("Session %s already has %d reps. Use --replace to redo them."
                         % (session_id, len(existing)))
    if existing:
        db.delete(token, "reps", "session_id=eq." + session_id)

    rows = []
    for r in results["reps"]:
        row = dict(r, session_id=session_id)
        row["metrics"] = dict(r.get("metrics", {}), version=results["version"])
        rows.append(row)
    if rows:
        db.insert(token, "reps", rows)
    print("4. Saved %d reps%s" % (len(rows), " (replaced %d)" % len(existing) if existing else ""))


# ============================================================
# 5. Summary
# ============================================================

def print_summary(results, session_id=None):
    print()
    if session_id:
        print("Session", session_id)
    print("rep   left mean  left peak   right mean  right peak   (m/s)")
    for r in results["reps"]:
        print("%3d   %9s  %9s   %10s  %10s" % (
            r["rep_index"],
            fmt(r.get("left_mean_velocity")), fmt(r.get("left_peak_velocity")),
            fmt(r.get("right_mean_velocity")), fmt(r.get("right_peak_velocity"))))
    for w in results["warnings"]:
        print("warning:", w)


def fmt(v):
    return "%.2f" % v if isinstance(v, float) else "-"


# ============================================================
# Main
# ============================================================

def log_in():
    email = os.environ.get("VLO_EMAIL") or input("V-Lo email: ")
    password = os.environ.get("VLO_PASSWORD") or getpass.getpass("Password: ")
    return db.log_in(email, password)


def main():
    parser = argparse.ArgumentParser(description="Store a recorded set, process it, and save its reps.")
    parser.add_argument("recording", nargs="?", help="CSV or JSON recording (not needed with --session)")
    parser.add_argument("--exercise", default="back_squat", help="sessions.exercise (default: back_squat)")
    parser.add_argument("--weight", type=float, help="weight in kg")
    parser.add_argument("--reps", type=int, help="the rep count the lifter reports")
    parser.add_argument("--session", help="process an existing session instead of storing a new one")
    parser.add_argument("--replace", action="store_true", help="replace reps that already exist")
    parser.add_argument("--dry-run", action="store_true", help="load and process only; nothing stored")
    parser.add_argument("--plot", action="store_true", help="show the data team's plots")
    args = parser.parse_args()

    if not args.recording and not args.session:
        parser.error("give a recording file, or --session <id>")

    if args.dry_run:
        samples = load_recording(args.recording)
        print_summary(analyze(samples, args.exercise, args.reps, args.plot))
        print("\nDry run: nothing was stored.")
        return

    try:
        token, user_id = log_in()
        session_id = args.session
        if not session_id:
            samples = load_recording(args.recording)
            session_id = store_session(token, user_id, samples, args.exercise, args.weight, args.reps)
        results = process_session(token, session_id, args.plot)
        save_reps(token, session_id, results, args.replace)
        print_summary(results, session_id)
    except db.SupabaseError as err:
        sys.exit("Supabase error: %s" % err)


if __name__ == "__main__":
    main()
