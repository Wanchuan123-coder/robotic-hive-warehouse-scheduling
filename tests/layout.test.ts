import { parseConfig } from '@/sim/config';
import { Simulation } from '@/sim/simulation';
import { cellKey } from '@/sim/world';

function structuredConfig() {
  return parseConfig({
    grid: { width: 12, height: 10 },
    robots: 4,
    pods: { count: 8, replenishDelayMs: 100 },
    stations: [
      {
        id: 'D-1',
        kind: 'delivery',
        docks: [[0, 4]],
        queueCapacity: 4,
        serviceTimeMs: 1000,
      },
    ],
    chargingStations: [{ id: 'C-1', docks: [[11, 4]] }],
    layout: {
      mode: 'structured',
      perimeterWidth: 1,
      storage: { insetX: 2, insetY: 2, blockWidth: 2, blockHeight: 2, aisleWidth: 1 },
    },
    orders: { loadFactor: null, arrivalRatePerHour: 0 },
    movement: { tickMs: 100 },
    seed: 11,
  });
}

test('replenishment returns a pod to its original storage slot when free', () => {
  const simulation = new Simulation(structuredConfig());
  const pod = simulation.world.pods[0]!;
  const original = { ...pod.cell };
  pod.available = false;
  pod.replenishAtMs = 0;

  simulation.tick();

  expect(pod.available).toBe(true);
  expect(pod.cell).toEqual(original);
});

test('replenishment uses another storage slot when the original is occupied', () => {
  const simulation = new Simulation(structuredConfig());
  const pod = simulation.world.pods[0]!;
  const original = { ...pod.cell };
  simulation.world.robots[0]!.cell = { ...original };
  pod.available = false;
  pod.replenishAtMs = 0;

  simulation.tick();

  const storageKeys = new Set(simulation.world.podStorageCells.map(cellKey));
  expect(pod.available).toBe(true);
  expect(pod.cell).not.toEqual(original);
  expect(storageKeys.has(cellKey(pod.cell))).toBe(true);
  expect(cellKey(pod.cell)).not.toBe('0,4');
  expect(cellKey(pod.cell)).not.toBe('11,4');
});
