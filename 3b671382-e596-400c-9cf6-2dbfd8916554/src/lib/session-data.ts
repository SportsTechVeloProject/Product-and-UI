export type Rep = {
  index: number;
  peakVelocity: number;
  meanVelocity: number;
  power: number;
  deviation: number;
  isPeak?: boolean;
  fatigue?: boolean;
};

export type SetData = {
  id: string;
  lift: string;
  setLabel: string;
  load: number;
  reps: Rep[];
};

export type SessionSummary = {
  id: string;
  lift: string;
  scheme: string;
  when: string;
  load: number;
  meanVelocity: number;
  consistency: number;
};

function withFlags(reps: Rep[]): Rep[] {
  const best = reps.reduce<Rep | undefined>(
    (acc, r) => (!acc || r.peakVelocity > acc.peakVelocity ? r : acc),
    undefined,
  );
  return reps.map((r, i) => ({
    ...r,
    isPeak: r === best,
    fatigue: i > 0 && best ? r.peakVelocity < best.peakVelocity * 0.85 : false,
  }));
}

/** Current working set per barbell exercise */
export const exerciseSets: Record<string, SetData> = {
  "Back Squat": {
    id: "set-3",
    lift: "Back Squat",
    setLabel: "Set 3",
    load: 140,
    reps: withFlags([
      { index: 1, peakVelocity: 1.2, meanVelocity: 1.02, power: 1.62, deviation: 3.2 },
      { index: 2, peakVelocity: 1.26, meanVelocity: 1.08, power: 1.71, deviation: 2.8 },
      { index: 3, peakVelocity: 1.34, meanVelocity: 1.14, power: 1.88, deviation: 5.1 },
      { index: 4, peakVelocity: 1.42, meanVelocity: 1.21, power: 2.06, deviation: 3.9 },
      { index: 5, peakVelocity: 1.12, meanVelocity: 0.94, power: 1.54, deviation: 6.3 },
    ]),
  },
  "Bench Press": {
    id: "set-2",
    lift: "Bench Press",
    setLabel: "Set 2",
    load: 100,
    reps: withFlags([
      { index: 1, peakVelocity: 0.92, meanVelocity: 0.78, power: 1.04, deviation: 2.4 },
      { index: 2, peakVelocity: 0.97, meanVelocity: 0.82, power: 1.12, deviation: 2.1 },
      { index: 3, peakVelocity: 1.01, meanVelocity: 0.86, power: 1.19, deviation: 3.0 },
      { index: 4, peakVelocity: 0.88, meanVelocity: 0.74, power: 0.98, deviation: 3.6 },
      { index: 5, peakVelocity: 0.79, meanVelocity: 0.66, power: 0.87, deviation: 4.4 },
      { index: 6, peakVelocity: 0.71, meanVelocity: 0.58, power: 0.76, deviation: 5.2 },
    ]),
  },
  Deadlift: {
    id: "set-4",
    lift: "Deadlift",
    setLabel: "Set 4",
    load: 180,
    reps: withFlags([
      { index: 1, peakVelocity: 0.68, meanVelocity: 0.55, power: 1.94, deviation: 4.1 },
      { index: 2, peakVelocity: 0.72, meanVelocity: 0.58, power: 2.08, deviation: 3.6 },
      { index: 3, peakVelocity: 0.63, meanVelocity: 0.5, power: 1.81, deviation: 5.0 },
    ]),
  },
};

export const exercises = Object.keys(exerciseSets);

export const currentSet: SetData = exerciseSets["Back Squat"]!;

export const sessionHistory: SessionSummary[] = [
  { id: "s1", lift: "Back Squat", scheme: "5×5", when: "Today", load: 140, meanVelocity: 1.18, consistency: 94 },
  { id: "s2", lift: "Front Squat", scheme: "4×6", when: "Yesterday", load: 100, meanVelocity: 1.02, consistency: 91 },
  { id: "s3", lift: "High Pull", scheme: "6×4", when: "2 days ago", load: 80, meanVelocity: 2.31, consistency: 88 },
];

export function meanVelocity(reps: Rep[]) {
  return reps.reduce((sum, r) => sum + r.meanVelocity, 0) / reps.length;
}

export function peakRep(reps: Rep[]): Rep | undefined {
  return reps.reduce<Rep | undefined>(
    (best, r) => (!best || r.peakVelocity > best.peakVelocity ? r : best),
    undefined,
  );
}

export function avgPower(reps: Rep[]) {
  return reps.reduce((sum, r) => sum + r.power, 0) / reps.length;
}

/** Consistency = 100 − coefficient of variation of peak velocity (%) */
export function consistency(reps: Rep[]) {
  const values = reps.map((r) => r.peakVelocity);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const cv = (Math.sqrt(variance) / mean) * 100;
  return Math.round(100 - cv);
}

/** Velocity loss from best rep to last rep (%) */
export function velocityLoss(reps: Rep[]) {
  const best = peakRep(reps)?.peakVelocity ?? 0;
  const last = reps[reps.length - 1]?.peakVelocity ?? 0;
  if (!best) return 0;
  return ((last - best) / best) * 100;
}

export function meanDeviation(reps: Rep[]) {
  return reps.reduce((sum, r) => sum + r.deviation, 0) / reps.length;
}
