import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PlatePicker, BAR_WEIGHT, totalWeight, type PlateCounts } from "@/components/PlatePicker";
import { SensorPanel } from "@/components/SensorPanel";
import { useAuth } from "@/hooks/useAuth";
import { useSensors, MAX_SENSORS, SAMPLE_RATE_HZ } from "@/hooks/useSensors";
import { supabase } from "@/integrations/supabase/client";
import { exportCsv, exportJson, shareSet, type ExportPayload } from "@/lib/export-set";
import {
  avgPower,
  consistency,
  exerciseSets,
  exercises,
  meanDeviation,
  meanVelocity,
  peakRep,
  sessionHistory,
  velocityLoss,
  type Rep,
} from "@/lib/session-data";

type SavedSet = {
  id: string;
  exercise: string;
  set_label: string;
  load_kg: number;
  mean_velocity: number;
  peak_velocity: number;
  consistency: number;
  performed_at: string;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VelocityLab — Barbell IMU Rep Telemetry" },
      {
        name: "description",
        content:
          "Read barbell IMU data rep by rep: peak and mean velocity, power, bar path deviation, consistency and velocity loss across every set.",
      },
      { property: "og:title", content: "VelocityLab — Barbell IMU Rep Telemetry" },
      {
        property: "og:description",
        content:
          "Velocity-based training readouts from barbell IMU sensors: per-rep velocity, power, consistency and fatigue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [exercise, setExercise] = useState(exercises[0]!);
  const set = exerciseSets[exercise]!;
  const reps = set.reps;
  const peak = peakRep(reps);
  const setConsistency = consistency(reps);

  const [sensorOpen, setSensorOpen] = useState(false);
  const { sensors, connecting, error: sensorError, connect, disconnect } = useSensors();

  const [plates, setPlates] = useState<PlateCounts>({});
  const load = totalWeight(plates, BAR_WEIGHT);

  const [saved, setSaved] = useState<SavedSet[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payload: ExportPayload = useMemo(
    () => ({
      exercise,
      setLabel: set.setLabel,
      load,
      performedAt: new Date().toISOString(),
      metrics: {
        meanVelocity: meanVelocity(reps),
        peakVelocity: peak?.peakVelocity ?? 0,
        avgPower: avgPower(reps),
        consistency: setConsistency,
        velocityLoss: velocityLoss(reps),
      },
      reps,
    }),
    [exercise, set.setLabel, load, reps, peak, setConsistency],
  );

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from("workout_sets")
      .select("id, exercise, set_label, load_kg, mean_velocity, peak_velocity, consistency, performed_at")
      .order("performed_at", { ascending: false })
      .limit(10);
    setSaved((data ?? []) as SavedSet[]);
  }, []);

  useEffect(() => {
    if (user) void loadSaved();
    else setSaved([]);
  }, [user, loadSaved]);

  async function saveSet() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSaving(true);
    setStatus(null);
    const { error } = await supabase.from("workout_sets").insert({
      user_id: user.id,
      exercise,
      set_label: set.setLabel,
      load_kg: load,
      reps: reps as unknown as never,
      mean_velocity: payload.metrics.meanVelocity,
      peak_velocity: payload.metrics.peakVelocity,
      avg_power: payload.metrics.avgPower,
      consistency: payload.metrics.consistency,
      velocity_loss: payload.metrics.velocityLoss,
    });
    setSaving(false);
    if (error) {
      setStatus("Could not save this set. Try again.");
      return;
    }
    setStatus("Set saved to your account.");
    void loadSaved();
  }

  async function deleteSet(id: string) {
    await supabase.from("workout_sets").delete().eq("id", id);
    void loadSaved();
  }

  async function share() {
    const result = await shareSet(payload);
    setStatus(
      result === "copied"
        ? "Set summary copied — paste it to your coach."
        : result === "shared"
          ? "Set shared."
          : "Sharing isn't available on this device.",
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="flex min-h-screen flex-col">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-6 py-4 sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink font-mono text-sm font-bold text-ink-foreground">
              V
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-none tracking-tight">
                V-LO
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-mut">
                Barbell IMU telemetry
              </p>
            </div>
          </div>

          <button
            onClick={() => setSensorOpen(true)}
            className="order-3 flex w-full flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 text-left panel-ring hover:text-foreground sm:order-none sm:ml-auto sm:w-auto"
          >
            <span
              className={`size-2 rounded-full ${
                sensors.length > 0 ? "pulse-dot bg-steady" : "bg-line"
              }`}
            />
            <span className="font-mono text-xs font-medium">
              {sensors.length > 0 ? "SENSOR LINKED" : "NO SENSOR"}
            </span>
            <span className="font-mono text-[10px] text-mut">
              {sensors.length}/{MAX_SENSORS} Movesense
            </span>
            <span className="text-mut">·</span>
            <span className="font-mono text-xs">{SAMPLE_RATE_HZ} Hz</span>
          </button>

          {loading ? null : user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="order-2 max-w-full shrink-0 truncate rounded-xl bg-card px-3 py-2 font-mono text-xs text-mut panel-ring hover:text-foreground sm:order-none"
            >
              {user.email} · Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="order-2 shrink-0 rounded-xl bg-ink px-3 py-2 font-mono text-xs font-medium text-ink-foreground sm:order-none"
            >
              Sign in
            </Link>
          )}
        </header>

        <SensorPanel
          open={sensorOpen}
          onClose={() => setSensorOpen(false)}
          sensors={sensors}
          connecting={connecting}
          error={sensorError}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        <div className="flex flex-wrap items-center gap-2 px-6 pt-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mut">
            Exercise
          </span>
          {exercises.map((name) => (
            <button
              key={name}
              onClick={() => setExercise(name)}
              className={`rounded-full px-3.5 py-1.5 font-mono text-xs font-medium transition-colors ${
                name === exercise
                  ? "bg-ink text-ink-foreground"
                  : "bg-card text-mut panel-ring hover:text-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <main className="grid flex-1 grid-cols-1 gap-5 p-6 xl:grid-cols-2">
          <section className="min-h-[320px] xl:col-span-1">
            <div className="h-full rounded-[28px] bg-ink p-5 text-ink-foreground sm:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-foreground/50">
                  {set.lift} · {set.setLabel}
                </p>
                <p className="font-mono text-xs text-ink-foreground/60">
                  Bar {load} kg · {reps.length} reps
                </p>
              </div>
              <div className="mt-5 flex items-end gap-2 sm:mt-6 sm:gap-3">
                <span className="font-mono text-[64px] font-bold leading-none tracking-tighter text-signal sm:text-[104px]">
                  {peak?.peakVelocity.toFixed(2)}
                </span>
                <span className="mb-2 font-mono text-lg text-ink-foreground/50 sm:mb-4 sm:text-2xl">m/s</span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-foreground/60 sm:mt-1 sm:text-xs">
                PEAK VELOCITY · REP {peak?.index}
              </p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <Metric
                  label="Mean vel"
                  value={meanVelocity(reps).toFixed(2)}
                  info={{
                    title: "Mean velocity",
                    body: "Average bar speed across every rep in this set. A steady mean usually means controlled, repeatable effort.",
                  }}
                />
                <Metric
                  label="Consistency"
                  value={`${setConsistency}%`}
                  tone="steady"
                  info={{
                    title: "Consistency",
                    body: "100 minus the coefficient of variation of your rep peak velocities. Higher values mean your reps were more uniform.",
                  }}
                />
                <Metric
                  label="Avg power"
                  value={`${avgPower(reps).toFixed(2)} kW`}
                  info={{
                    title: "Average power",
                    body: "Mean power output across the set. Combines bar speed and load to show how much work you produced per rep.",
                  }}
                />
                <Metric
                  label="Velocity loss"
                  value={`${velocityLoss(reps).toFixed(1)}%`}
                  tone="signal"
                  info={{
                    title: "Velocity loss",
                    body: "How much your last rep slowed compared to your fastest rep. A large drop is a sign of fatigue.",
                  }}
                />
              </div>
            </div>
          </section>

          <section className="min-h-[320px] xl:col-span-1">
            <div className="flex h-full flex-col rounded-[28px] bg-card p-5 panel-ring">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Rep velocity curve</h2>
                <span className="rounded-full bg-steady/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-steady">
                  Consistency {setConsistency}%
                </span>
              </div>
              <div className="flex min-h-0 flex-1 items-center">
                <VelocityGraph key={exercise} reps={reps} />
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-mut">
                Rep 1 → {reps.length} · bar path deviation {meanDeviation(reps).toFixed(1)} mm
              </p>
            </div>
          </section>

          <section className="xl:col-span-1">
            <PlatePicker counts={plates} onChange={setPlates} bar={BAR_WEIGHT} />
          </section>

          <section className="xl:col-span-1">
            <div className="flex h-full flex-col rounded-[28px] bg-card p-5 panel-ring">
              <h2 className="text-sm font-semibold">Save or send this set</h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-mut">
                {exercise} · {set.setLabel} · {load} kg
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={saveSet}
                  disabled={saving}
                  className="rounded-2xl bg-ink px-4 py-2.5 font-mono text-xs font-semibold text-ink-foreground disabled:opacity-60"
                >
                  {saving ? "Saving…" : user ? "Save to my account" : "Sign in to save"}
                </button>
                <button
                  onClick={() => exportCsv(payload)}
                  className="rounded-2xl bg-panel px-4 py-2.5 font-mono text-xs font-medium panel-ring hover:bg-panel/70"
                >
                  Download CSV
                </button>
                <button
                  onClick={() => exportJson(payload)}
                  className="rounded-2xl bg-panel px-4 py-2.5 font-mono text-xs font-medium panel-ring hover:bg-panel/70"
                >
                  Download JSON
                </button>
                <button
                  onClick={share}
                  className="rounded-2xl bg-signal px-4 py-2.5 font-mono text-xs font-semibold text-ink-foreground"
                >
                  Send summary
                </button>
              </div>
              {status ? (
                <p className="mt-3 font-mono text-[11px] text-steady">{status}</p>
              ) : null}
            </div>
          </section>

          <section className="xl:col-span-2">
            <div className="rounded-[28px] bg-card p-5 panel-ring">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Rep-by-rep readout</h2>
                <p className="font-mono text-[10px] uppercase tracking-widest text-mut">
                  Velocity · Power · Deviation
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                {reps.map((rep) => (
                  <RepCard key={rep.index} rep={rep} />
                ))}
              </div>
            </div>
          </section>

          {user ? (
            <section className="xl:col-span-2">
              <div className="rounded-[28px] bg-card p-5 panel-ring">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Your saved sets</h2>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-mut">
                    {saved.length} stored
                  </p>
                </div>
                {saved.length === 0 ? (
                  <p className="mt-3 font-mono text-[11px] text-mut">
                    Nothing saved yet — log a set above.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-line">
                    {saved.map((row) => (
                      <div key={row.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">
                            {row.exercise} · {row.set_label}
                          </p>
                          <p className="font-mono text-[10px] text-mut">
                            {new Date(row.performed_at).toLocaleString()} · {row.load_kg} kg
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm font-semibold">
                            {Number(row.peak_velocity).toFixed(2)}
                          </span>
                          <span className="rounded-full bg-steady/10 px-2.5 py-1 font-mono text-[10px] font-medium text-steady">
                            {Math.round(Number(row.consistency))}%
                          </span>
                          <button
                            onClick={() => deleteSet(row.id)}
                            className="font-mono text-[10px] text-mut hover:text-signal"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <section className="xl:col-span-2">
            <div className="rounded-[28px] bg-card p-5 panel-ring">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Session history</h2>
                <p className="font-mono text-[10px] uppercase tracking-widest text-mut">
                  Last {sessionHistory.length} sessions
                </p>
              </div>
              <div className="mt-3 flex flex-col divide-y divide-line">
                {sessionHistory.map((session) => (
                  <div key={session.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {session.lift} · {session.scheme}
                      </p>
                      <p className="font-mono text-[10px] text-mut">
                        {session.when} · {session.load} kg
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-semibold">
                        {session.meanVelocity.toFixed(2)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium ${
                          session.consistency >= 90
                            ? "bg-steady/10 text-steady"
                            : "bg-signal/10 text-signal"
                        }`}
                      >
                        {session.consistency}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function VelocityGraph({ reps }: { reps: Rep[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 220 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    kind: "peak" | "fatigue" | "normal";
  } | null>(null);

  const tooltipCopy = {
    peak: {
      title: "Peak rep",
      body: "The fastest rep in this set. Use it to estimate 1RM or compare explosive output across sessions.",
    },
    fatigue: {
      title: "Fatigue drop",
      body: "Velocity fell below 85% of your best rep, signalling rep-to-rep fatigue.",
    },
    normal: {
      title: "Normal rep",
      body: "Within 85% of your best rep. No major fatigue flag on this one.",
    },
  };

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(320, Math.floor(rect.width)), h: Math.max(180, Math.floor(rect.height)) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w;
  const H = Math.min(size.h, Math.round(size.w * 0.45));
  const BASE_W = 520;
  const s = Math.max(W / BASE_W, 0.9);
  const PAD_X = 40 * s;
  const PAD_TOP = 34 * s;
  const PAD_BOTTOM = 62 * s;
  const values = reps.map((r) => r.peakVelocity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const x = (i: number) =>
    PAD_X + (i / Math.max(reps.length - 1, 1)) * (W - PAD_X * 2);
  const y = (v: number) =>
    PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const points = reps.map((r, i) => [x(i), y(r.peakVelocity)] as const);
  const path = points
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={ref} className="min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        {[0, 0.5, 1].map((t) => {
          const gy = PAD_TOP + t * (H - PAD_TOP - PAD_BOTTOM);
          const val = max - t * span;
          return (
            <g key={t}>
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={gy}
                y2={gy}
                className="stroke-line"
                strokeDasharray={`${3 * s} ${5 * s}`}
                strokeWidth={1 * s}
              />
              <text x={4} y={gy + 3 * s} className="fill-mut font-mono" fontSize={9 * s}>
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          className="stroke-signal"
          strokeWidth={2.5 * s}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map(([px, py], i) => {
          const rep = reps[i]!;
          const r = (rep.isPeak ? 6 : 4.5) * s;
          const kind = rep.isPeak ? "peak" : rep.fatigue ? "fatigue" : "normal";
          return (
            <g
              key={rep.index}
              style={{ cursor: "pointer", pointerEvents: "all" }}
              onMouseEnter={(e) =>
                setTooltip({ x: e.clientX, y: e.clientY, kind })
              }
              onMouseMove={(e) =>
                setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <circle
                cx={px}
                cy={py}
                r={r}
                className={rep.isPeak ? "fill-signal" : rep.fatigue ? "fill-signal/40" : "fill-steady"}
              />
              <text
                x={px}
                y={py - 12 * s}
                textAnchor="middle"
                className={`font-mono ${rep.isPeak ? "fill-signal" : "fill-foreground"}`}
                fontSize={10 * s}
                fontWeight={rep.isPeak ? 700 : 400}
                pointerEvents="none"
              >
                {rep.peakVelocity.toFixed(2)}
              </text>
              <text
                x={px}
                y={H - 12 * s}
                textAnchor="middle"
                className="fill-mut font-mono"
                fontSize={9 * s}
                pointerEvents="none"
              >
                R{rep.index}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      {tooltip ? (
        <div
          className="fixed z-50 max-w-[220px] rounded-2xl bg-ink p-3 text-ink-foreground shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p
            className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
              tooltip.kind === "peak"
                ? "text-signal"
                : tooltip.kind === "fatigue"
                  ? "text-signal/70"
                  : "text-steady"
            }`}
          >
            {tooltipCopy[tooltip.kind].title}
          </p>
          <p className="mt-1 text-xs leading-snug text-ink-foreground/80">
            {tooltipCopy[tooltip.kind].body}
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-[10px] text-mut">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-signal" /> Peak rep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-steady" /> Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-signal/40" /> Fatigue drop
        </span>
      </div>
    </div>
  );
}

type MetricInfo = {
  title: string;
  body: string;
};

function MetricTooltip({
  children,
  info,
  tone,
}: {
  children: ReactNode;
  info: MetricInfo;
  tone?: "signal" | "steady" | undefined;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const titleColor =
    tone === "signal"
      ? "text-signal"
      : tone === "steady"
        ? "text-steady"
        : "text-ink-foreground";
  return (
    <div
      className="relative"
      onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTooltip(null)}
    >
      {children}
      {tooltip ? (
        <div
          className="pointer-events-none fixed z-50 max-w-[220px] rounded-2xl bg-ink p-3 text-ink-foreground shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p className={`font-mono text-[10px] font-bold uppercase tracking-widest ${titleColor}`}>
            {info.title}
          </p>
          <p className="mt-1 text-xs leading-snug text-ink-foreground/80">
            {info.body}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  info,
}: {
  label: string;
  value: string;
  tone?: "signal" | "steady";
  info: MetricInfo;
}) {
  return (
    <MetricTooltip info={info} tone={tone}>
      <div className="cursor-pointer rounded-2xl bg-ink-foreground/5 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-foreground/45">
          {label}
        </p>
        <p
          className={`mt-1 font-mono text-2xl font-semibold ${
            tone === "signal" ? "text-signal" : tone === "steady" ? "text-steady" : "text-ink-foreground"
          }`}
        >
          {value}
        </p>
      </div>
    </MetricTooltip>
  );
}

function RepCard({ rep }: { rep: Rep }) {
  if (rep.isPeak) {
    return (
      <div className="rounded-2xl bg-ink p-3 text-ink-foreground">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-semibold">R{rep.index} · PEAK</span>
          <span className="size-2 rounded-full bg-signal" />
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold text-signal">
          {rep.peakVelocity.toFixed(2)}
        </p>
        <p className="font-mono text-[10px] text-ink-foreground/50">
          {rep.power.toFixed(2)} kW · {rep.deviation.toFixed(1)} mm
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-panel p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold">R{rep.index}</span>
        <span
          className={`size-2 rounded-full ${rep.fatigue ? "bg-signal" : "bg-steady"}`}
        />
      </div>
      <p className="mt-2 font-mono text-3xl font-semibold">{rep.peakVelocity.toFixed(2)}</p>
      <p className="font-mono text-[10px] text-mut">
        {rep.power.toFixed(2)} kW · {rep.deviation.toFixed(1)} mm
      </p>
    </div>
  );
}
