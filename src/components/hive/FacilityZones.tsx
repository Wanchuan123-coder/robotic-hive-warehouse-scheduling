'use client';

import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import type { Cell, GridConfig, SimConfig } from '@/sim/config';
import { cellToWorld } from './render';

interface ZoneRect {
  center: { x: number; z: number };
  width: number;
  height: number;
}

function rectForCells(cells: Cell[], grid: GridConfig): ZoneRect {
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    center: cellToWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, grid),
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function ZonePlane({
  rect,
  color,
  label,
  labelClassName,
}: {
  rect: ZoneRect;
  color: string;
  label: string;
  labelClassName: string;
}) {
  return (
    <group position={[rect.center.x, 0, rect.center.z]}>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[rect.width, rect.height]} />
        <meshBasicMaterial color={color} transparent opacity={0.13} depthWrite={false} />
      </mesh>
      <Html position={[0, 0.12, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`facility-label ${labelClassName}`}>{label}</div>
      </Html>
    </group>
  );
}

/** Static functional zones: central storage and edge charging decks. */
export function FacilityZones({ config }: { config: SimConfig }) {
  const storageRect = useMemo(() => {
    if (config.layout.mode !== 'structured') return null;
    const { insetX, insetY } = config.layout.storage;
    const width = Math.max(1, config.grid.width - insetX * 2);
    const height = Math.max(1, config.grid.height - insetY * 2);
    return {
      center: cellToWorld(
        {
          x: insetX + (width - 1) / 2,
          y: insetY + (height - 1) / 2,
        },
        config.grid,
      ),
      width,
      height,
    } satisfies ZoneRect;
  }, [config.grid, config.layout]);

  const chargingRects = useMemo(
    () =>
      config.chargingStations.map((station) => ({
        id: station.id,
        rect: rectForCells(station.docks, config.grid),
      })),
    [config.chargingStations, config.grid],
  );

  return (
    <>
      {storageRect !== null ? (
        <ZonePlane
          rect={storageRect}
          color="#2d8066"
          label="STORAGE GRID"
          labelClassName="facility-label-storage"
        />
      ) : null}
      {chargingRects.map(({ id, rect }) => (
        <ZonePlane
          key={id}
          rect={rect}
          color="#e8b04a"
          label={`CHARGING DECK · ${id}`}
          labelClassName="facility-label-charging"
        />
      ))}
    </>
  );
}
