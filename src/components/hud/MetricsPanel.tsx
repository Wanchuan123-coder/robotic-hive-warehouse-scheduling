'use client';

import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { HudState } from '@/lib/hudStore';
import type { SimConfig } from '@/sim/config';
import { Sparkline } from './Sparkline';

export interface MetricsPanelProps {
  state: StoreApi<HudState>;
  config?: SimConfig | null;
}

const throughputFormat = new Intl.NumberFormat('en-US');

function formatThroughput(value: number): string {
  return `${throughputFormat.format(value)}/h`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MetricsPanel({ state, config = null }: MetricsPanelProps) {
  const metrics = useStore(state, (s) => s.metrics);
  const history = useStore(state, (s) => s.throughputHistory);
  const deliveryIds = new Set(
    config?.stations
      .filter((station) => station.kind === 'delivery')
      .map((station) => station.id) ?? [],
  );
  const deliveryStations =
    metrics?.stations.filter((station) => deliveryIds.has(station.id)) ?? [];
  const avgDeliveryQueue =
    deliveryStations.length > 0
      ? deliveryStations.reduce((sum, station) => sum + station.avgQueueLength, 0) /
        deliveryStations.length
      : null;
  const avgDeliveryBusy =
    deliveryStations.length > 0
      ? deliveryStations.reduce((sum, station) => sum + station.busyFraction, 0) /
        deliveryStations.length
      : null;

  return (
    <section className="hud-panel hud-metrics" aria-label="Metrics">
      <h2 className="hud-panel-title">Metrics</h2>
      <dl className="hud-metrics-grid">
        <div className="hud-metric hud-metric-primary">
          <dt>Demand load</dt>
          <dd>
            {config === null
              ? '—'
              : config.orders.loadFactor === null
                ? 'Legacy'
                : formatPercent(config.orders.loadFactor)}
          </dd>
        </div>
        <div className="hud-metric hud-metric-primary">
          <dt>Robot utilisation</dt>
          <dd>{metrics ? formatPercent(metrics.utilisation.overall) : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>Delivery busy</dt>
          <dd>{avgDeliveryBusy === null ? '—' : formatPercent(avgDeliveryBusy)}</dd>
        </div>
        <div className="hud-metric">
          <dt title="Share of total robot time spent blocked while moving">Traffic wait</dt>
          <dd>{metrics ? `${(100 * metrics.utilisation.waiting).toFixed(1)}%` : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>Jobs pending</dt>
          <dd>{metrics ? metrics.jobsPending : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>Throughput</dt>
          <dd>{metrics ? formatThroughput(metrics.throughputPerHour) : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>Orders done</dt>
          <dd>{metrics ? metrics.ordersCompleted : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>Station queue</dt>
          <dd>{avgDeliveryQueue === null ? '—' : avgDeliveryQueue.toFixed(1)}</dd>
        </div>
        <div className="hud-metric">
          <dt>Traffic recoveries</dt>
          <dd>{metrics ? metrics.deadlockEvents : '—'}</dd>
        </div>
        <div className="hud-metric">
          <dt>p95</dt>
          <dd>{metrics ? formatSeconds(metrics.completionTimeMs.p95) : '—'}</dd>
        </div>
      </dl>
      <Sparkline values={history} />
    </section>
  );
}
