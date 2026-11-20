'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import type { SnapshotSource } from '@/lib/snapshotSource';
import type { GridConfig, SimConfig } from '@/sim/config';
import type { InspectionTarget } from '@/worker/protocol';
import { FacilityZones } from './FacilityZones';
import { GridFloor } from './GridFloor';
import { PodInstances } from './PodInstances';
import { RobotInstances } from './RobotInstances';
import { StationMeshes } from './StationMeshes';

export interface HiveCanvasProps {
  source: SnapshotSource;
  config: SimConfig;
  onSelect(target: InspectionTarget): void;
}

export interface CameraPose {
  position: [number, number, number];
  far: number;
}

/** Camera framing scales with the current small or large grid. */
export function cameraPoseForGrid(grid: GridConfig): CameraPose {
  const span = Math.max(grid.width, grid.height);
  return {
    position: [span * 0.72, span * 1.18, span * 0.9],
    far: Math.max(300, span * 8),
  };
}

/** Live 3D hive view; mounted client-side only by the page. */
export default function HiveCanvas({ source, config, onSelect }: HiveCanvasProps) {
  const cameraPose = useMemo(() => cameraPoseForGrid(config.grid), [config.grid]);

  return (
    <div className="hive-canvas">
      <Canvas
        key={`${config.grid.width}x${config.grid.height}`}
        camera={{ position: cameraPose.position, far: cameraPose.far, fov: 42 }}
        frameloop="always"
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#070b0a']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[60, 120, 40]} intensity={1.4} />
        <Suspense fallback={null}>
          <GridFloor grid={config.grid} />
          <FacilityZones config={config} />
          <PodInstances source={source} config={config} />
          <StationMeshes source={source} config={config} onSelect={onSelect} />
          <RobotInstances source={source} config={config} onSelect={onSelect} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          target={[0, 0, 0]}
          minDistance={Math.max(8, Math.min(config.grid.width, config.grid.height) * 0.45)}
          maxDistance={Math.max(config.grid.width, config.grid.height) * 4}
          maxPolarAngle={Math.PI * 0.48}
        />
      </Canvas>
    </div>
  );
}
