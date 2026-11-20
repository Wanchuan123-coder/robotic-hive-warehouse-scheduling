import { z } from 'zod';
import { deriveLayout } from './layout';

export interface Cell {
  x: number;
  y: number;
}

export interface GridConfig {
  width: number;
  height: number;
}

export type StationKind = 'fetch' | 'delivery';

export interface StationConfig {
  id: string;
  kind: StationKind;
  docks: Cell[];
  queueCapacity: number;
  serviceTimeMs: number;
}

export interface ChargingStationConfig {
  id: string;
  docks: Cell[];
}

export interface StorageLayoutConfig {
  insetX: number;
  insetY: number;
  blockWidth: number;
  blockHeight: number;
  aisleWidth: number;
}

export interface LayoutConfig {
  mode: 'random' | 'structured';
  perimeterWidth: number;
  storage: StorageLayoutConfig;
}

export interface PodsConfig {
  count: number;
  replenishDelayMs: number;
}

export interface OrdersConfig {
  /**
   * Target concurrent work slots divided by the robot count. null keeps the
   * legacy Poisson arrival-rate mode for existing experiments.
   */
  loadFactor: number | null;
  arrivalRatePerHour: number;
  linesPerOrder: { min: number; max: number };
  packingTimeMs: number;
}

export interface AllocationConfig {
  intervalMs: number;
  strategy: string;
  timeoutMs: number;
  onFailure: 'fallback-fcfs' | 'wait';
}

export interface MovementConfig {
  tickMs: number;
}

export interface SimConfig {
  grid: GridConfig;
  robots: number;
  pods: PodsConfig;
  stations: StationConfig[];
  chargingStations: ChargingStationConfig[];
  layout: LayoutConfig;
  orders: OrdersConfig;
  allocation: AllocationConfig;
  movement: MovementConfig;
  seed: number;
}

export class ConfigError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(issues: readonly z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => {
        const path = issue.path.map((part) => String(part)).join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    super(details || 'Invalid simulation configuration');
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().min(0);
const nonNegative = z.number().min(0);
const cellTuple = z.tuple([z.number().int(), z.number().int()]);

const defaultStations = [
  {
    id: 'F-1',
    kind: 'fetch',
    docks: [[0, 9], [0, 10]],
    queueCapacity: 4,
    serviceTimeMs: 1000,
  },
  {
    id: 'D-1',
    kind: 'delivery',
    docks: [[29, 5], [29, 6]],
    queueCapacity: 6,
    serviceTimeMs: 500,
  },
  {
    id: 'D-2',
    kind: 'delivery',
    docks: [[29, 13], [29, 14]],
    queueCapacity: 6,
    serviceTimeMs: 500,
  },
] as const;

const stationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['fetch', 'delivery']).default('delivery'),
  docks: z.array(cellTuple).min(1),
  queueCapacity: positiveInt,
  serviceTimeMs: positiveInt,
});

const chargingStationSchema = z.object({
  id: z.string().min(1),
  docks: z.array(cellTuple).min(1),
});

const defaultStorageLayout = {
  insetX: 4,
  insetY: 3,
  blockWidth: 3,
  blockHeight: 3,
  aisleWidth: 1,
} as const;

const layoutSchema = z
  .object({
    mode: z.enum(['random', 'structured']).default('random'),
    perimeterWidth: positiveInt.default(2),
    storage: z
      .object({
        insetX: nonNegativeInt.default(defaultStorageLayout.insetX),
        insetY: nonNegativeInt.default(defaultStorageLayout.insetY),
        blockWidth: positiveInt.default(defaultStorageLayout.blockWidth),
        blockHeight: positiveInt.default(defaultStorageLayout.blockHeight),
        aisleWidth: positiveInt.default(defaultStorageLayout.aisleWidth),
      })
      .default({ ...defaultStorageLayout }),
  })
  .default({
    mode: 'random',
    perimeterWidth: 2,
    storage: { ...defaultStorageLayout },
  });

const rawConfigSchema = z.object({
  grid: z
    .object({
      width: positiveInt.default(30),
      height: positiveInt.default(20),
    })
    .default({ width: 30, height: 20 }),
  robots: positiveInt.default(25),
  pods: z
    .object({
      count: positiveInt.default(120),
      replenishDelayMs: positiveInt.default(5000),
    })
    .default({ count: 120, replenishDelayMs: 5000 }),
  stations: z.array(stationSchema).min(1).default(defaultStations.map((station) => ({
    ...station,
    docks: station.docks.map(([x, y]) => [x, y] as [number, number]),
  }))),
  chargingStations: z.array(chargingStationSchema).default([]),
  layout: layoutSchema,
  orders: z
    .object({
      loadFactor: z.number().min(0).max(1).nullable().default(null),
      arrivalRatePerHour: nonNegative.default(1600),
      linesPerOrder: z
        .object({
          min: positiveInt.default(1),
          max: positiveInt.default(3),
        })
        .default({ min: 1, max: 3 }),
      packingTimeMs: positiveInt.default(5000),
    })
    .default({
      loadFactor: null,
      arrivalRatePerHour: 1600,
      linesPerOrder: { min: 1, max: 3 },
      packingTimeMs: 5000,
    }),
  allocation: z
    .object({
      intervalMs: positiveInt.default(1000),
      strategy: z.string().min(1).default('builtin:fcfs'),
      timeoutMs: positiveInt.default(2000),
      onFailure: z.enum(['fallback-fcfs', 'wait']).default('fallback-fcfs'),
    })
    .default({
      intervalMs: 1000,
      strategy: 'builtin:fcfs',
      timeoutMs: 2000,
      onFailure: 'fallback-fcfs',
    }),
  movement: z
    .object({ tickMs: positiveInt.default(100) })
    .default({ tickMs: 100 }),
  seed: z.number().int().default(42),
});

type RawSimConfig = z.infer<typeof rawConfigSchema>;

const configSchema = rawConfigSchema
  .superRefine((config, ctx) => {
    const { width, height } = config.grid;
    const totalCells = width * height;

    if (config.robots > totalCells) {
      ctx.addIssue({
        code: 'custom',
        path: ['robots'],
        message: `robots (${config.robots}) exceeds grid cell count (${totalCells})`,
      });
    }

    if (config.pods.count > totalCells) {
      ctx.addIssue({
        code: 'custom',
        path: ['pods', 'count'],
        message: `pods.count (${config.pods.count}) exceeds grid cell count (${totalCells})`,
      });
    }

    if (config.orders.linesPerOrder.min > config.orders.linesPerOrder.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['orders', 'linesPerOrder'],
        message: 'linesPerOrder.min must be less than or equal to linesPerOrder.max',
      });
    }

    if (!config.stations.some((station) => station.kind === 'delivery')) {
      ctx.addIssue({
        code: 'custom',
        path: ['stations'],
        message: 'at least one delivery station is required',
      });
    }

    const stationIds = new Set<string>();
    const chargingIds = new Set<string>();
    const facilityCells = new Set<string>();

    const checkDock = (
      x: number,
      y: number,
      path: (string | number)[],
    ): void => {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `dock (${x}, ${y}) is outside the ${width}x${height} grid`,
        });
        return;
      }

      const key = `${x},${y}`;
      if (facilityCells.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `duplicate facility dock cell (${x}, ${y})`,
        });
      }
      facilityCells.add(key);
    };

    for (let index = 0; index < config.stations.length; index += 1) {
      const station = config.stations[index]!;
      if (stationIds.has(station.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stations', index, 'id'],
          message: `duplicate station id "${station.id}"`,
        });
      }
      stationIds.add(station.id);
      for (let dockIndex = 0; dockIndex < station.docks.length; dockIndex += 1) {
        const [x, y] = station.docks[dockIndex]!;
        checkDock(x, y, ['stations', index, 'docks', dockIndex]);
      }
    }

    for (let index = 0; index < config.chargingStations.length; index += 1) {
      const station = config.chargingStations[index]!;
      if (chargingIds.has(station.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['chargingStations', index, 'id'],
          message: `duplicate charging station id "${station.id}"`,
        });
      }
      chargingIds.add(station.id);
      for (let dockIndex = 0; dockIndex < station.docks.length; dockIndex += 1) {
        const [x, y] = station.docks[dockIndex]!;
        checkDock(x, y, ['chargingStations', index, 'docks', dockIndex]);
      }
    }
  })
  .transform((config: RawSimConfig): SimConfig => ({
    ...config,
    stations: config.stations.map((station) => ({
      ...station,
      docks: station.docks.map(([x, y]) => ({ x, y })),
    })),
    chargingStations: config.chargingStations.map((station) => ({
      ...station,
      docks: station.docks.map(([x, y]) => ({ x, y })),
    })),
  }));

function capacityIssue(path: (string | number)[], message: string): z.core.$ZodIssue {
  return { code: 'custom', path, message } as z.core.$ZodIssue;
}

function validateLayoutCapacity(config: SimConfig): void {
  const layout = deriveLayout(config);
  const issues: z.core.$ZodIssue[] = [];

  if (config.layout.mode === 'random') {
    const requested = config.robots + config.pods.count;
    if (requested > layout.freeCells.length) {
      issues.push(
        capacityIssue(
          ['pods', 'count'],
          `robots (${config.robots}) + pods.count (${config.pods.count}) exceeds non-facility cell count (${layout.freeCells.length})`,
        ),
      );
    }
  } else {
    if (config.pods.count > layout.storageCells.length) {
      issues.push(
        capacityIssue(
          ['pods', 'count'],
          `pods.count (${config.pods.count}) exceeds structured storage capacity (${layout.storageCells.length})`,
        ),
      );
    }
    if (config.robots > layout.robotSpawnCells.length) {
      issues.push(
        capacityIssue(
          ['robots'],
          `robots (${config.robots}) exceeds structured robot-lane capacity (${layout.robotSpawnCells.length})`,
        ),
      );
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);
}

export function parseConfig(input: unknown): SimConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(result.error.issues);
  }
  validateLayoutCapacity(result.data);
  return result.data;
}

/** Small structured scenario used by the live UI on first load. */
export const defaultConfig: SimConfig = parseConfig({
  layout: {
    mode: 'structured',
    perimeterWidth: 2,
    storage: { ...defaultStorageLayout },
  },
  chargingStations: [
    { id: 'C-1', docks: [[4, 19], [5, 19], [6, 19], [7, 19], [8, 19]] },
    { id: 'C-2', docks: [[21, 19], [22, 19], [23, 19], [24, 19], [25, 19]] },
  ],
  orders: {
    loadFactor: 0.5,
    arrivalRatePerHour: 0,
    linesPerOrder: { min: 1, max: 3 },
    packingTimeMs: 5000,
  },
});
