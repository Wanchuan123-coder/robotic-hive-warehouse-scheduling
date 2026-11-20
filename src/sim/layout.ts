import type { Cell, SimConfig } from './config';

export interface DerivedLayout {
  /** Cells occupied by fixed facilities and unavailable to robots or pods. */
  reservedCells: Set<string>;
  /** Valid pod storage slots. */
  storageCells: Cell[];
  /** Valid robot spawn/parking cells, ordered with the perimeter first. */
  robotSpawnCells: Cell[];
  /** Dedicated low-interference parking cells on the outer service ring. */
  parkingCells: Cell[];
  /** Every non-facility cell, used by the legacy random layout. */
  freeCells: Cell[];
}

export function layoutCellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function isPerimeterCell(
  cell: Cell,
  width: number,
  height: number,
  perimeterWidth: number,
): boolean {
  return (
    cell.x < perimeterWidth ||
    cell.x >= width - perimeterWidth ||
    cell.y < perimeterWidth ||
    cell.y >= height - perimeterWidth
  );
}

function isStorageSlot(cell: Cell, config: SimConfig): boolean {
  const { width, height } = config.grid;
  const { insetX, insetY, blockWidth, blockHeight, aisleWidth } = config.layout.storage;
  if (
    cell.x < insetX ||
    cell.x >= width - insetX ||
    cell.y < insetY ||
    cell.y >= height - insetY
  ) {
    return false;
  }

  const localX = cell.x - insetX;
  const localY = cell.y - insetY;
  const xPeriod = blockWidth + aisleWidth;
  const yPeriod = blockHeight + aisleWidth;
  return localX % xPeriod < blockWidth && localY % yPeriod < blockHeight;
}

/**
 * Derives deterministic facility, storage and robot-spawn regions from config.
 * Structured layouts keep pods on a central rack pattern and robots in the
 * surrounding lanes. Random layouts retain the legacy whole-floor candidate
 * pool while still protecting fixed facility cells.
 */
export function deriveLayout(config: SimConfig): DerivedLayout {
  const reservedCells = new Set<string>();
  for (const station of config.stations) {
    for (const dock of station.docks) reservedCells.add(layoutCellKey(dock));
  }
  for (const station of config.chargingStations) {
    for (const dock of station.docks) reservedCells.add(layoutCellKey(dock));
  }

  const freeCells: Cell[] = [];
  const storageCells: Cell[] = [];
  const perimeterCells: Cell[] = [];
  const aisleCells: Cell[] = [];
  const { width, height } = config.grid;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = { x, y };
      if (reservedCells.has(layoutCellKey(cell))) continue;
      freeCells.push(cell);

      if (config.layout.mode === 'random') continue;
      if (isStorageSlot(cell, config)) {
        storageCells.push(cell);
      } else if (isPerimeterCell(cell, width, height, config.layout.perimeterWidth)) {
        perimeterCells.push(cell);
      } else {
        aisleCells.push(cell);
      }
    }
  }

  if (config.layout.mode === 'random') {
    return {
      reservedCells,
      storageCells: freeCells,
      robotSpawnCells: freeCells,
      parkingCells: freeCells,
      freeCells,
    };
  }

  return {
    reservedCells,
    storageCells,
    robotSpawnCells: [...perimeterCells, ...aisleCells],
    parkingCells: perimeterCells,
    freeCells,
  };
}
