import { useEffect } from "react";

import {
  MAX_SENSORS,
  SAMPLE_RATE_HZ,
  bluetoothAvailable,
  type Sensor,
} from "@/hooks/useSensors";

type Props = {
  open: boolean;
  onClose: () => void;
  sensors: Sensor[];
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
};

export function SensorPanel({
  open,
  onClose,
  sensors,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const supported = bluetoothAvailable();
  const slots = Array.from({ length: MAX_SENSORS }, (_, i) => sensors[i]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sensor connection"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[28px] bg-card p-6 panel-ring"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Sensors</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-mut">
              Movesense · {SAMPLE_RATE_HZ} Hz · up to {MAX_SENSORS}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-background px-3 py-1.5 font-mono text-xs text-mut panel-ring hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {slots.map((sensor, i) => (
            <div
              key={sensor?.id ?? `slot-${i}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3 panel-ring"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    sensor ? "pulse-dot bg-steady" : "bg-line"
                  }`}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium">
                    {sensor ? sensor.name : `Sensor ${i + 1}`}
                  </p>
                  <p className="font-mono text-[10px] text-mut">
                    {sensor ? `Connected · ${SAMPLE_RATE_HZ} Hz` : "Not connected"}
                  </p>
                </div>
              </div>
              {sensor ? (
                <button
                  onClick={() => onDisconnect(sensor.id)}
                  className="shrink-0 rounded-xl bg-card px-3 py-1.5 font-mono text-xs text-mut panel-ring hover:text-foreground"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-4 font-mono text-[11px] text-signal">{error}</p>
        ) : null}

        {!supported ? (
          <p className="mt-4 font-mono text-[11px] text-mut">
            Bluetooth pairing needs Chrome or Edge on desktop or Android.
          </p>
        ) : null}

        <button
          onClick={onConnect}
          disabled={connecting || sensors.length >= MAX_SENSORS || !supported}
          className="mt-5 w-full rounded-2xl bg-ink px-4 py-3 font-mono text-xs font-medium text-ink-foreground disabled:opacity-40"
        >
          {connecting
            ? "Searching…"
            : sensors.length >= MAX_SENSORS
              ? "Both sensors connected"
              : "Connect a sensor"}
        </button>
      </div>
    </div>
  );
}
