import type { Rep } from "@/lib/session-data";

export type ExportPayload = {
  exercise: string;
  setLabel: string;
  load: number;
  performedAt: string;
  metrics: {
    meanVelocity: number;
    peakVelocity: number;
    avgPower: number;
    consistency: number;
    velocityLoss: number;
  };
  reps: Rep[];
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function exportJson(payload: ExportPayload) {
  download(
    `${slug(payload.exercise)}-${payload.performedAt.slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

export function exportCsv(payload: ExportPayload) {
  const header = "exercise,set,load_kg,rep,peak_velocity,mean_velocity,power_kw,deviation_mm";
  const rows = payload.reps.map((r) =>
    [
      payload.exercise,
      payload.setLabel,
      payload.load,
      r.index,
      r.peakVelocity,
      r.meanVelocity,
      r.power,
      r.deviation,
    ].join(","),
  );
  download(
    `${slug(payload.exercise)}-${payload.performedAt.slice(0, 10)}.csv`,
    [header, ...rows].join("\n"),
    "text/csv",
  );
}

export async function shareSet(payload: ExportPayload) {
  const text = [
    `${payload.exercise} · ${payload.setLabel} · ${payload.load} kg`,
    `Peak ${payload.metrics.peakVelocity.toFixed(2)} m/s · Mean ${payload.metrics.meanVelocity.toFixed(2)} m/s`,
    `Consistency ${payload.metrics.consistency}% · Velocity loss ${payload.metrics.velocityLoss.toFixed(1)}%`,
  ].join("\n");

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ title: "VelocityLab set", text });
    return "shared" as const;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied" as const;
  }
  return "unavailable" as const;
}
