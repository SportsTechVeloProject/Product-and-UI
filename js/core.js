/* core.js — Shared data model and helpers. Loaded first; everything else leans on it.
   Part of V-Lo. Loaded as a plain script; see vlo.html for the order. */
"use strict";

/* ---------------- data model ---------------- */
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
    zones: [
      { min: 0.75, label: "Speed–strength" },
      { min: 0.50, label: "Strength–speed" },
      { min: 0.30, label: "Accelerative strength" },
      { min: 0,    label: "Maximal strength" }
    ],
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
    zones: [
      { min: 0.75, label: "Speed–strength" },
      { min: 0.50, label: "Strength–speed" },
      { min: 0.30, label: "Accelerative strength" },
      { min: 0,    label: "Maximal strength" }
    ],
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
    zones: [
      { min: 0.50, label: "Speed–strength" },
      { min: 0.30, label: "Strength–speed" },
      { min: 0.15, label: "Accelerative strength" },
      { min: 0,    label: "Maximal strength" }
    ],
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
  "Speed–strength": {
    desc: "Light-to-moderate loads, roughly 30–60% of 1RM, moved with maximum intended acceleration.",
    benefit: "Trains the nervous system to produce force fast — improves rate of force development and bar acceleration off the bottom. It carries over to explosiveness, but does little on its own to raise your 1RM."
  },
  "Strength–speed": {
    desc: "Moderate loads, roughly 60–80% of 1RM — heavier than speed-strength work, still lifted with intent to move fast even though the bar itself moves slower.",
    benefit: "The bridge between raw strength and speed: builds the ability to move genuinely heavy weight quickly. Typical territory for hypertrophy-strength blocks and the bulk of a training cycle's volume."
  },
  "Accelerative strength": {
    desc: "Heavy loads, roughly 80–90% of 1RM, usually doubles and triples — bar speed drops, but the intent to accelerate stays.",
    benefit: "The main zone for competition-lift strength work. Builds maximal strength and grooves technical consistency under a load close to what you'll actually face on the platform."
  },
  "Maximal strength": {
    desc: "Near-1RM loads, 90%+, typically singles — competition-style attempts.",
    benefit: "Trains maximum motor-unit recruitment and the ability to produce force at very slow bar speeds. Essential for peaking toward a meet, but taxing on the nervous system — used sparingly, not as everyday volume."
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
