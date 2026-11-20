'use client';

import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { HudClient, HudState } from '@/lib/hudStore';

export interface TransportDockProps {
  client: HudClient;
  state: StoreApi<HudState>;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

/** Achieved speed is considered lagging below this fraction of the target. */
const LAG_WARNING_RATIO = 0.75;

function formatMultiplier(value: number): string {
  return `${Math.round(value * 100) / 100}×`;
}

export function TransportDock({ client, state }: TransportDockProps) {
  const running = useStore(state, (s) => s.running);
  const speed = useStore(state, (s) => s.speed);
  const achievedSpeed = useStore(state, (s) => s.achievedSpeed);
  const lagging =
    running && achievedSpeed !== null && achievedSpeed < speed * LAG_WARNING_RATIO;

  return (
    <div className="hud-panel hud-dock">
      <button
        type="button"
        className="hud-button hud-button-primary"
        onClick={() => (running ? client.pause() : client.play())}
      >
        {running ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="hud-button" onClick={() => client.step()}>
        Step
      </button>
      <button
        type="button"
        className="hud-button"
        onClick={() => client.restartCurrent?.()}
        disabled={client.restartCurrent === undefined}
      >
        Restart
      </button>
      <label className="hud-control">
        <span>Speed</span>
        <select
          aria-label="Speed"
          value={String(speed)}
          onChange={(event) => client.setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((option) => (
            <option key={option} value={String(option)}>
              {option}×
            </option>
          ))}
        </select>
      </label>
      <span
        className={`hud-achieved ${lagging ? 'hud-achieved-lagging' : ''}`}
        aria-label="Achieved speed"
      >
        {running
          ? achievedSpeed === null
            ? 'achieved —'
            : `achieved ${formatMultiplier(achievedSpeed)}`
          : 'achieved —'}
      </span>
    </div>
  );
}
