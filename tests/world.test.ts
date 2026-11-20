import { parseConfig } from '@/sim/config';
import { deriveLayout } from '@/sim/layout';
import { cellKey } from '@/sim/world';
import { createWorld } from '@/sim/world';

const config = parseConfig({
  grid: { width: 10, height: 10 },
  robots: 5,
  pods: { count: 7 },
  stations: [{ id: 'S-1', docks: [[0, 5]], queueCapacity: 4, serviceTimeMs: 1000 }],
  chargingStations: [{ id: 'C-1', docks: [[9, 5]] }],
  seed: 42,
});

test('world placement is deterministic for a seed', () => {
  const a = createWorld(config);
  const b = createWorld(config);
  expect(a.robots.map((r) => r.cell)).toEqual(b.robots.map((r) => r.cell));
  expect(a.pods.map((p) => p.cell)).toEqual(b.pods.map((p) => p.cell));
});

test('random placement is joint and excludes fixed facility cells', () => {
  const world = createWorld(config);
  expect(new Set(world.robots.map((r) => cellKey(r.cell))).size).toBe(5);
  expect(new Set(world.pods.map((p) => cellKey(p.cell))).size).toBe(7);

  const occupied = [...world.robots, ...world.pods].map((entity) => cellKey(entity.cell));
  expect(new Set(occupied).size).toBe(12);
  expect(occupied).not.toContain('0,5');
  expect(occupied).not.toContain('9,5');
});

test('structured placement keeps pods in storage and robots in lanes', () => {
  const structured = parseConfig({
    grid: { width: 12, height: 10 },
    robots: 6,
    pods: { count: 18 },
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
    orders: { arrivalRatePerHour: 0 },
    seed: 7,
  });
  const layout = deriveLayout(structured);
  const world = createWorld(structured);
  const storageKeys = new Set(layout.storageCells.map(cellKey));
  const parkingKeys = new Set(layout.parkingCells.map(cellKey));

  expect(world.pods.every((pod) => storageKeys.has(cellKey(pod.cell)))).toBe(true);
  expect(world.robots.every((robot) => parkingKeys.has(cellKey(robot.cell)))).toBe(true);
  expect([...world.robots, ...world.pods].every(
    (entity) => !layout.reservedCells.has(cellKey(entity.cell)),
  )).toBe(true);
  expect(world.podStorageCells).toEqual(layout.storageCells);
  expect(world.stations[0]?.kind).toBe('delivery');
});
