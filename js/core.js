/* core.js — Shared data model and helpers. Loaded first; everything else leans on it.
   Part of V-Lo. Loaded as a plain script; see vlo.html for the order. */
"use strict";

/* ---------------- data model ---------------- */
// Speed zones, fastest first, by a set's mean bar speed. The same limits for
// every lift for now; give a lift its own list in EXERCISES if that changes.
var SPEED_ZONES = [
  { min: 1.30, label: "Explosivity" },
  { min: 0.50, label: "Traditional" },
  { min: 0,    label: "Maximal Strength" }
];

// Fictional lifter, fictional load-velocity profile per lift.
// V(%1RM) = a - b * (%1RM/100), calibrated so V(100%) = v1RM (approx. published VBT anchors).
var EXERCISES = {
  squat: {
    name: "Back Squat",
    oneRM: 140,
    a: 1.05, b: 0.73,
    cyclePath: "down-up",           // top -> bottom -> top
    cycleLabels: ["Top", "Bottom (depth)", "Top"],
    driftCenters: [50],             // forward drift risk is at depth
    driftCaption: "Positive = the bar drifts forward, toward your toes; negative = back toward your heels.",
    zones: SPEED_ZONES,
    history: [
      { date: "Aug 9",  time: "6:10 PM", weight: 100 },
      { date: "Aug 16", time: "6:05 PM", weight: 105 },
      { date: "Aug 23", time: "5:50 PM", weight: 110 },
      { date: "Aug 30", time: "6:20 PM", weight: 112.5 },
      { date: "Sep 6",  time: "6:00 PM", weight: 115 },
      { date: "Sep 12", time: "6:15 PM", weight: 117.5 }
    ]
  },
  bench: {
    name: "Bench Press",
    oneRM: 100,
    a: 0.90, b: 0.73,
    cyclePath: "down-up",           // lockout -> chest -> lockout
    cycleLabels: ["Top (lockout)", "Bottom (chest)", "Top (lockout)"],
    driftCenters: [50],             // drift risk is off the chest
    driftCaption: "Positive = the bar drifts toward the rack, over your face; negative = back toward your hips.",
    zones: SPEED_ZONES,
    history: [
      { date: "Aug 9",  time: "5:40 PM", weight: 75 },
      { date: "Aug 16", time: "5:35 PM", weight: 77.5 },
      { date: "Aug 23", time: "5:50 PM", weight: 80 },
      { date: "Aug 30", time: "5:45 PM", weight: 82.5 },
      { date: "Sep 6",  time: "5:55 PM", weight: 82.5 },
      { date: "Sep 12", time: "5:50 PM", weight: 85 }
    ]
  },
  deadlift: {
    name: "Deadlift",
    oneRM: 170,
    a: 0.85, b: 0.70,
    cyclePath: "up-down",           // floor -> lockout -> floor
    cycleLabels: ["Bottom (floor)", "Top (lockout)", "Bottom (floor)"],
    driftCenters: [15, 85],         // drift risk is breaking the floor and re-setting
    driftCaption: "Positive = the bar drifts away from your shins, out in front; negative = back into your shins.",
    zones: SPEED_ZONES,
    history: [
      { date: "Aug 9",  time: "7:05 PM", weight: 130 },
      { date: "Aug 16", time: "7:00 PM", weight: 135 },
      { date: "Aug 23", time: "7:10 PM", weight: 140 },
      { date: "Aug 30", time: "6:55 PM", weight: 142.5 },
      { date: "Sep 6",  time: "7:15 PM", weight: 145 },
      { date: "Sep 12", time: "7:05 PM", weight: 150 }
    ]
  }
};

var ZONE_INFO = {
  "Explosivity": {
    desc: "Light loads, roughly under 40% of 1RM, moved as fast as possible: speed work, jumps and explosive reps.",
    benefit: "Trains the nervous system to produce force quickly. Builds explosiveness and bar acceleration, but does little on its own to raise your 1RM."
  },
  "Traditional": {
    desc: "Light-to-moderately heavy loads, roughly 40–80% of 1RM, still lifted with intent to move fast.",
    benefit: "Where most of a training block's volume lives. Builds strength and muscle and the ability to move heavy weight quickly."
  },
  "Maximal Strength": {
    desc: "Heavy loads, roughly 80% of 1RM and up: triples, doubles and near-maximal singles. The bar slows down, but the intent to accelerate stays.",
    benefit: "Builds maximal strength and grooves technique under competition-like loads. Essential for peaking, but taxing on the nervous system, so use it with care."
  }
};

function zoneRangeLabel(ex, idx) {
  var z = ex.zones[idx];
  if (idx === 0) return "> " + z.min.toFixed(2) + " m/s";
  var upper = ex.zones[idx - 1].min;
  if (z.min === 0) return "< " + upper.toFixed(2) + " m/s";
  return z.min.toFixed(2) + "–" + upper.toFixed(2) + " m/s";
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Colour token for a speed's zone: --zone-1 (fastest zone) to --zone-3.
function zoneColor(ex, v) {
  for (var i = 0; i < ex.zones.length; i++) {
    if (v >= ex.zones[i].min) return "var(--zone-" + (i + 1) + ")";
  }
  return "var(--zone-" + ex.zones.length + ")";
}

// The speed range of a training zone for a lift, { lo, hi, mid } in m/s, for
// aiming a set's average speed. Zones are listed fastest first and the top
// zone has no upper limit (nor the bottom one a lower), so those two get a
// band of ZONE_OPEN_BAND for aiming. Zone limits live in EXERCISES above.
var ZONE_OPEN_BAND = 0.2;
function zoneRange(ex, label) {
  var idx = -1;
  ex.zones.forEach(function (z, i) { if (z.label === label) idx = i; });
  if (idx === -1) return null;
  var lo = ex.zones[idx].min;
  var hi = idx === 0 ? lo + ZONE_OPEN_BAND : ex.zones[idx - 1].min;
  if (lo === 0) lo = Math.max(0.05, hi - ZONE_OPEN_BAND);
  return { lo: lo, hi: hi, mid: (lo + hi) / 2 };
}

// Uneven rep: left and right mean speeds differ by more than this share of
// the rep's speed. 0.22 (22%) is a placeholder chosen so only the most uneven
// rep in the first recorded set gets flagged; change it here once there's
// enough clean data to pick a real threshold.
var LR_MISMATCH_LIMIT = 0.22;
// Share by which left and right differ (0.25 = 25%), or null without both sides.
function lrMismatch(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return null;
  var mean = (Number(left) + Number(right)) / 2;
  return mean > 0 ? Math.abs(Number(left) - Number(right)) / mean : null;
}
function isUneven(left, right) {
  var m = lrMismatch(left, right);
  return m !== null && m > LR_MISMATCH_LIMIT;
}

function zoneFor(ex, v) {
  for (var i = 0; i < ex.zones.length; i++) {
    if (v >= ex.zones[i].min) return ex.zones[i].label;
  }
  return ex.zones[ex.zones.length - 1].label;
}

// Deterministic set simulator: given a load, derive first-rep velocity from
// the load-velocity profile, estimate reps-to-near-failure (Brzycki-style),
// and taper velocity across the reps actually performed.
function simulateSet(weight, ex) {
  var pct = clamp((weight / ex.oneRM) * 100, 30, 105);
  var v1 = Math.max(0.05, ex.a - ex.b * (pct / 100));
  var maxReps = clamp((102.78 - pct) / 2.78, 1, 20);
  var reps = clamp(Math.round(maxReps) - 1, 1, 15);
  var lossFraction = clamp((reps / maxReps) * 0.38, 0, 0.55);
  var vLast = v1 * (1 - lossFraction);
  var velocities = [];
  for (var i = 0; i < reps; i++) {
    var t = reps === 1 ? 0 : i / (reps - 1);
    var tc = Math.pow(t, 1.15);
    velocities.push(+(v1 - (v1 - vLast) * tc).toFixed(3));
  }
  return { pct: pct, v1: v1, reps: reps, velocities: velocities, lossPct: lossFraction * 100 };
}

// The numbers behind one history row. A recorded set brings its own
// (row.sim, built from the database in mysets.js); demo rows are simulated
// from their load.
function setData(ex, row) {
  return row.sim || simulateSet(row.weight, ex);
}
