import type { Cell, SimConfig } from './config';
import { deriveLayout } from './layout';
import { createRng } from './rng';
import type { Pod, Robot, Station, World } from './types';

/** Stable string key for a grid cell. */
export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function shuffle<T>(values: T[], rng: ReturnType<typeof createRng>): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1);
    const current = values[index]!;
    values[index] = values[swapIndex]!;
    values[swapIndex] = current;
  }
}

/**
 * Builds a deterministic world for a config seed. Structured layouts keep pods
 * in rack slots and robots in the surrounding lanes; random layouts retain the
 * legacy joint shuffle while excluding every fixed facility dock.
 */
export function createWorld(config: SimConfig): World {
  const rng = createRng(config.seed);
  const layout = deriveLayout(config);

  let robotCells: Cell[];
  let podCells: Cell[];

  if (config.layout.mode === 'structured') {
    const spawnPool =
      layout.parkingCells.length >= config.robots
        ? layout.parkingCells
        : layout.robotSpawnCells;
    const robotCandidates = spawnPool.map((cell) => ({ ...cell }));
    const podCandidates = layout.storageCells.map((cell) => ({ ...cell }));
    shuffle(robotCandidates, rng);
    shuffle(podCandidates, rng);
    robotCells = robotCandidates.slice(0, config.robots);
    podCells = podCandidates.slice(0, config.pods.count);
  } else {
    const candidates = layout.freeCells.map((cell) => ({ ...cell }));
    shuffle(candidates, rng);
    robotCells = candidates.slice(0, config.robots);
    podCells = candidates.slice(config.robots, config.robots + config.pods.count);
  }

  if (robotCells.length !== config.robots || podCells.length !== config.pods.count) {
    throw new Error('Layout does not have enough eligible cells for the configured robots and pods');
  }

  const robots: Robot[] = Array.from({ length: config.robots }, (_, index) => ({
    id: `R-${String(index + 1).padStart(4, '0')}`,
    cell: robotCells[index]!,
    status: 'idle',
    battery: 1,
    jobId: null,
    carrying: false,
    path: [],
    assignedAtMs: 0,
    blockedTicks: 0,
  }));

  const pods: Pod[] = Array.from({ length: config.pods.count }, (_, index) => ({
    id: `P-${String(index + 1).padStart(5, '0')}`,
    cell: podCells[index]!,
    available: true,
    reservedByJobId: null,
    replenishAtMs: null,
  }));

  const stations: Station[] = config.stations.map((station) => ({
    id: station.id,
    kind: station.kind,
    docks: station.docks.map((dock) => ({ x: dock.x, y: dock.y })),
    queueCapacity: station.queueCapacity,
    serviceTimeMs: station.serviceTimeMs,
    queue: [],
    serviceRemainingMs: 0,
  }));

  return {
    config,
    simTimeMs: 0,
    tick: 0,
    robots,
    pods,
    stations,
    podStorageCells: layout.storageCells.map((cell) => ({ ...cell })),
    jobs: new Map(),
    orders: new Map(),
    rng,
  };
}
