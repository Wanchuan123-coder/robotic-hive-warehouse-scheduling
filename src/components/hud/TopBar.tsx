'use client';

import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { HudState } from '@/lib/hudStore';

export interface TopBarProps {
  state: StoreApi<HudState>;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats simulation milliseconds as `HH:MM:SS`. */
export function formatSimClock(simTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(simTimeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function TopBar({ state }: TopBarProps) {
  const scenarioName = useStore(state, (s) => s.scenarioName);
  const running = useStore(state, (s) => s.running);
  const simTimeMs = useStore(state, (s) => s.simTimeMs);
  const pythonOnline = useStore(state, (s) => s.pythonOnline);
  const error = useStore(state, (s) => s.error);

  return (
    <header className="hud-panel hud-topbar">
      <span className="hud-brand">HIVE LAB</span>
      <span className={`hud-run-state ${running ? 'hud-run-state-active' : ''}`}>
        {running ? 'Running' : 'Paused'}
      </span>
      <span className="hud-topbar-item">Scenario · {scenarioName || '—'}</span>
      <span
        className={`hud-python ${pythonOnline ? 'hud-python-online' : 'hud-python-offline'}`}
      >
        {pythonOnline ? 'Python online' : 'Python offline — FCFS only'}
      </span>
      {error !== null ? (
        <span className="hud-error" role="alert" title={error}>
          {error}
        </span>
      ) : null}
      <span className="hud-clock">Sim {formatSimClock(simTimeMs)}</span>
    </header>
  );
}
