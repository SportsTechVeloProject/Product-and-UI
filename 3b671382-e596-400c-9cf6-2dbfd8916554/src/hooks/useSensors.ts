import { useCallback, useState } from "react";

export const MOVESENSE_SERVICE = "34802252-7185-4d5d-b431-630e7050e8f0";
export const MAX_SENSORS = 2;
export const SAMPLE_RATE_HZ = 100;

type BleDevice = {
  id: string;
  name?: string | undefined;
  gatt?: { connect: () => Promise<unknown>; disconnect: () => void } | undefined;
  addEventListener: (type: string, listener: () => void) => void;
};

type BleRequest = {
  requestDevice: (options: {
    filters: { namePrefix: string }[];
    optionalServices: string[];
  }) => Promise<BleDevice>;
};

export type Sensor = {
  id: string;
  name: string;
  device: BleDevice;
};

function bluetooth(): BleRequest | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { bluetooth?: BleRequest }).bluetooth ?? null;
}

export function bluetoothAvailable() {
  return bluetooth() !== null;
}

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback((id: string) => {
    setSensors((prev) => {
      const target = prev.find((s) => s.id === id);
      try {
        target?.device.gatt?.disconnect();
      } catch {
        /* ignore */
      }
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const connect = useCallback(async () => {
    setError(null);

    const ble = bluetooth();
    if (!ble) {
      setError("Web Bluetooth isn't available here. Use Chrome or Edge on desktop or Android.");
      return;
    }

    setConnecting(true);
    try {
      const device = await ble.requestDevice({
        filters: [{ namePrefix: "Movesense" }],
        optionalServices: [MOVESENSE_SERVICE],
      });

      await device.gatt?.connect();

      const entry: Sensor = {
        id: device.id,
        name: device.name ?? "Movesense",
        device,
      };

      device.addEventListener("gattserverdisconnected", () => {
        setSensors((prev) => prev.filter((s) => s.id !== entry.id));
      });

      setSensors((prev) => {
        if (prev.some((s) => s.id === entry.id)) return prev;
        if (prev.length >= MAX_SENSORS) return prev;
        return [...prev, entry];
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      setConnecting(false);
    }
  }, []);

  return { sensors, connecting, error, connect, disconnect };
}
