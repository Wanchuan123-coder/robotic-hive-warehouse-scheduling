'use client';

import { useState } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { HudClient, HudState } from '@/lib/hudStore';
import type { SimConfig } from '@/sim/config';

export interface WorkloadPanelProps {
  client: HudClient;
  state: StoreApi<HudState>;
  config: SimConfig | null;
}

const DEFAULT_LOAD_FACTOR = 0.5;

function currentLoad(config: SimConfig): number {
  return config.orders.loadFactor ?? DEFAULT_LOAD_FACTOR;
}

/** Experiment controls that change scenario configuration and restart the run. */
export function WorkloadPanel({ client, state, config }: WorkloadPanelProps) {
  const [draftLoad, setDraftLoad] = useState(() =>
    config === null ? DEFAULT_LOAD_FACTOR : currentLoad(config),
  );
  const strategies = useStore(state, (s) => s.strategies);
  const strategy = useStore(state, (s) => s.strategy);
  const scenarios = useStore(state, (s) => s.scenarios);
  const scenarioName = useStore(state, (s) => s.scenarioName);
  const configuredLoad = config?.orders.loadFactor ?? null;
  const hasScenarioOption = scenarios.some((scenario) => scenario.name === scenarioName);
  const changed =
    config !== null &&
    (configuredLoad === null || Math.abs(draftLoad - configuredLoad) > 0.0001);

  const applyLoad = (): void => {
    if (client.restart === undefined || config === null) return;
    const nextConfig: SimConfig = {
      ...config,
      orders: {
        ...config.orders,
        loadFactor: draftLoad,
      },
    };
    state.getState().setScenario('custom');
    client.restart(nextConfig);
  };

  return (
    <section className="hud-panel hud-workload" aria-label="Experiment setup">
      <div className="hud-section-heading">
        <div>
          <h2 className="hud-panel-title">Experiment setup</h2>
          <p className="hud-section-caption">
            {config === null ? 'Loading scenario' : `${config.grid.width} × ${config.grid.height} · ${config.layout.mode} layout`}
          </p>
        </div>
        {config !== null ? <span className="hud-robot-count">{config.robots} robots</span> : null}
      </div>

      {config !== null ? (
        <label className="hud-load-control">
          <span>
            Demand load
            <output htmlFor="target-load">
              {Math.round(draftLoad * 100)}% · {Math.round(config.robots * draftLoad)} slots
            </output>
          </span>
          <input
            id="target-load"
            aria-label="Demand load"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={draftLoad}
            onChange={(event) => setDraftLoad(Number(event.target.value))}
          />
          <span className="hud-range-ends" aria-hidden="true">
            <span>Idle</span>
            <span>Full load</span>
          </span>
        </label>
      ) : null}

      {config !== null && configuredLoad === null ? (
        <p className="hud-mode-note">Legacy arrival-rate mode; applying enables load control.</p>
      ) : null}

      <div className="hud-setup-selects">
        <label className="hud-control hud-control-stacked">
          <span>Algorithm</span>
          <select
            aria-label="Algorithm"
            value={strategy}
            onChange={(event) => client.selectStrategy(event.target.value)}
          >
            {strategies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="hud-control hud-control-stacked">
          <span>Scenario</span>
          <select
            aria-label="Scenario"
            value={scenarioName}
            disabled={scenarios.length === 0}
            onChange={(event) => {
              const next = event.target.value;
              const scenario = state.getState().scenarios.find((entry) => entry.name === next);
              if (scenario === undefined) return;
              client.restart?.(scenario.config);
              state.getState().setScenario(next);
            }}
          >
            {hasScenarioOption ? null : (
              <option value={scenarioName}>{scenarioName || 'default'}</option>
            )}
            {scenarios.map((scenario) => (
              <option key={scenario.name} value={scenario.name}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {config !== null ? (
        <button
          type="button"
          className="hud-button hud-button-apply"
          disabled={!changed || client.restart === undefined}
          onClick={applyLoad}
        >
          Apply load &amp; restart
        </button>
      ) : null}
    </section>
  );
}
