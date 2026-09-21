import type { CSSProperties } from "react";

export const BAR_WEIGHT = 20;
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export type PlateCounts = Record<string, number>;

export function totalWeight(counts: PlateCounts, bar = BAR_WEIGHT) {
  return PLATES.reduce((sum, p) => sum + (counts[String(p)] ?? 0) * p * 2, bar);
}

// Visual size + color per plate — heavier plates render taller and thicker
const PLATE_STYLE: Record<string, { h: number; w: number; fill: string }> = {
  "25": { h: 92, w: 16, fill: "var(--color-signal)" },
  "20": { h: 80, w: 14, fill: "var(--color-steady)" },
  "15": { h: 68, w: 12, fill: "var(--color-signal)" },
  "10": { h: 56, w: 10, fill: "var(--color-steady)" },
  "5": { h: 44, w: 8, fill: "var(--color-ink)" },
  "2.5": { h: 32, w: 6, fill: "var(--color-mut)" },
  "1.25": { h: 24, w: 5, fill: "var(--color-line)" },
};

type PlateInstance = { key: string; plate: number };

function expandPlates(counts: PlateCounts): PlateInstance[] {
  const out: PlateInstance[] = [];
  for (const p of PLATES) {
    const n = counts[String(p)] ?? 0;
    for (let i = 0; i < n; i++) out.push({ key: `${p}#${i}`, plate: p });
  }
  return out; // already heaviest-first, so plates sit heaviest against the collar
}

function BarbellVisual({ counts }: { counts: PlateCounts }) {
  const plates = expandPlates(counts);
  const midX = 170;
  const midY = 55;
  const collar = 8;

  // Lay plates out from the collar outward, tracking cumulative x per side
  const right: { inst: PlateInstance; x: number }[] = [];
  const left: { inst: PlateInstance; x: number }[] = [];
  let rx = midX + collar;
  let lx = midX - collar;
  for (const inst of plates) {
    const { w } = PLATE_STYLE[String(inst.plate)]!;
    rx += w;
    right.push({ inst, x: rx });
    rx += 1.5;
    lx -= w;
    left.push({ inst, x: lx });
    lx -= 1.5;
  }

  const isEmpty = plates.length === 0;

  return (
    <div className="mt-4 rounded-2xl bg-panel p-3 panel-ring">
      <svg viewBox="0 0 340 110" className="w-full" role="img" aria-label="Loaded barbell">
        {/* bar */}
        <rect x={14} y={midY - 3} width={312} height={6} rx={3} fill="var(--color-ink)" />
        {/* sleeve texture lines */}
        {[40, 52, 64].map((x) => (
          <rect key={x} x={x} y={midY - 3} width={1.5} height={6} fill="var(--color-panel)" />
        ))}
        {[300, 288, 276].map((x) => (
          <rect key={x} x={x} y={midY - 3} width={1.5} height={6} fill="var(--color-panel)" />
        ))}
        {/* collars */}
        <rect x={midX - collar - 2} y={midY - 9} width={4} height={18} rx={1.5} fill="var(--color-ink)" />
        <rect x={midX + collar - 2} y={midY - 9} width={4} height={18} rx={1.5} fill="var(--color-ink)" />

        {right.map(({ inst, x }) => {
          const s = PLATE_STYLE[String(inst.plate)]!;
          return (
            <rect
              key={inst.key}
              className="plate-load"
              style={{ "--slide": "18px" } as CSSProperties}
              x={x - s.w}
              y={midY - s.h / 2}
              width={s.w}
              height={s.h}
              rx={Math.min(3, s.w / 2)}
              fill={s.fill}
            />
          );
        })}
        {left.map(({ inst, x }) => {
          const s = PLATE_STYLE[String(inst.plate)]!;
          return (
            <rect
              key={inst.key}
              className="plate-load"
              style={{ "--slide": "-18px" } as CSSProperties}
              x={x}
              y={midY - s.h / 2}
              width={s.w}
              height={s.h}
              rx={Math.min(3, s.w / 2)}
              fill={s.fill}
            />
          );
        })}

        {isEmpty && (
          <text
            x={midX}
            y={midY + 26}
            textAnchor="middle"
            className="fill-mut"
            fontSize={9}
            fontFamily="var(--font-mono)"
            letterSpacing={2}
          >
            EMPTY BAR
          </text>
        )}
      </svg>
    </div>
  );
}

export function PlatePicker({
  counts,
  onChange,
  bar,
}: {
  counts: PlateCounts;
  onChange: (next: PlateCounts) => void;
  bar: number;
}) {
  const bump = (plate: number, delta: number) => {
    const key = String(plate);
    const next = Math.max(0, (counts[key] ?? 0) + delta);
    onChange({ ...counts, [key]: next });
  };

  return (
    <div className="rounded-[28px] bg-card p-5 panel-ring">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Bar load</h2>
        <p className="font-mono text-[10px] uppercase tracking-widest text-mut">
          Bar {bar} kg · per side
        </p>
      </div>

      <BarbellVisual counts={counts} />

      <div className="mt-4 flex flex-wrap gap-2">
        {PLATES.map((plate) => {
          const count = counts[String(plate)] ?? 0;
          return (
            <div
              key={plate}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${
                count > 0 ? "bg-ink text-ink-foreground" : "bg-panel"
              }`}
            >
              <button
                onClick={() => bump(plate, -1)}
                aria-label={`Remove ${plate} kg plate`}
                className="grid size-6 place-items-center rounded-full bg-background/20 font-mono text-sm leading-none"
              >
                −
              </button>
              <span className="min-w-14 text-center font-mono text-xs font-semibold">
                {plate} kg{count > 0 ? ` ×${count}` : ""}
              </span>
              <button
                onClick={() => bump(plate, 1)}
                aria-label={`Add ${plate} kg plate`}
                className="grid size-6 place-items-center rounded-full bg-signal font-mono text-sm leading-none text-ink-foreground"
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-mut">
            Total load
          </p>
          <p className="font-mono text-4xl font-bold tracking-tight">
            {totalWeight(counts, bar)}
            <span className="ml-1 text-lg text-mut">kg</span>
          </p>
        </div>
        <button
          onClick={() => onChange({})}
          className="rounded-full bg-panel px-3.5 py-1.5 font-mono text-xs text-mut panel-ring hover:text-foreground"
        >
          Strip bar
        </button>
      </div>
    </div>
  );
}
