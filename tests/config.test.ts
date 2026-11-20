import { ConfigError, defaultConfig, parseConfig } from '@/sim/config';

test('fills backward-compatible schema defaults for an empty object', () => {
  const config = parseConfig({});
  expect(config.grid).toEqual({ width: 30, height: 20 });
  expect(config.robots).toBe(25);
  expect(config.orders.loadFactor).toBeNull();
  expect(config.layout.mode).toBe('random');
});

test('live default is a small structured load-controlled scenario', () => {
  expect(defaultConfig.robots).toBe(25);
  expect(defaultConfig.orders.loadFactor).toBe(0.5);
  expect(defaultConfig.layout.mode).toBe('structured');
  expect(defaultConfig.chargingStations).toHaveLength(2);
  expect(
    defaultConfig.stations
      .filter((station) => station.kind === 'delivery')
      .map((station) => station.serviceTimeMs),
  ).toEqual([500, 500]);
  expect(defaultConfig.stations.find((station) => station.kind === 'fetch')?.serviceTimeMs).toBe(
    1000,
  );
});

test('rejects an empty stations array', () => {
  expect(() => parseConfig({ stations: [] })).toThrow(ConfigError);
});

test('rejects a dock outside the grid', () => {
  expect(() =>
    parseConfig({
      grid: { width: 10, height: 10 },
      stations: [{ id: 'S-1', docks: [[10, 1]], queueCapacity: 4, serviceTimeMs: 1000 }],
    }),
  ).toThrow(ConfigError);
});

test('rejects duplicate dock cells across stations', () => {
  expect(() =>
    parseConfig({
      stations: [
        { id: 'S-1', docks: [[0, 1]], queueCapacity: 4, serviceTimeMs: 1000 },
        { id: 'S-2', docks: [[0, 1]], queueCapacity: 4, serviceTimeMs: 1000 },
      ],
    }),
  ).toThrow(ConfigError);
});

test('rejects more robots than grid cells', () => {
  expect(() =>
    parseConfig({
      grid: { width: 2, height: 2 },
      robots: 5,
      stations: [{ id: 'S-1', docks: [[0, 0]], queueCapacity: 1, serviceTimeMs: 1000 }],
    }),
  ).toThrow(ConfigError);
});

test('rejects robots plus pods exceeding the grid cell count', () => {
  expect(() =>
    parseConfig({
      grid: { width: 2, height: 2 },
      robots: 3,
      pods: { count: 2 },
      stations: [{ id: 'S-1', docks: [[0, 0]], queueCapacity: 1, serviceTimeMs: 1000 }],
    }),
  ).toThrow(ConfigError);
});

test('station kind defaults to delivery for legacy configs', () => {
  const config = parseConfig({
    grid: { width: 5, height: 5 },
    robots: 1,
    pods: { count: 1 },
    stations: [{ id: 'S-1', docks: [[0, 0]], queueCapacity: 1, serviceTimeMs: 1000 }],
  });
  expect(config.stations[0]?.kind).toBe('delivery');
});

test.each([-0.01, 1.01])('rejects loadFactor %s outside 0..1', (loadFactor) => {
  expect(() => parseConfig({ orders: { loadFactor } })).toThrow(ConfigError);
});

test('requires at least one delivery station', () => {
  expect(() =>
    parseConfig({
      stations: [
        {
          id: 'F-1',
          kind: 'fetch',
          docks: [[0, 1]],
          queueCapacity: 1,
          serviceTimeMs: 1000,
        },
      ],
    }),
  ).toThrow(ConfigError);
});

test('rejects a charging dock that overlaps a station dock', () => {
  expect(() =>
    parseConfig({
      stations: [{ id: 'D-1', docks: [[0, 1]], queueCapacity: 1, serviceTimeMs: 1000 }],
      chargingStations: [{ id: 'C-1', docks: [[0, 1]] }],
    }),
  ).toThrow(ConfigError);
});

test('rejects structured layouts without enough storage slots', () => {
  expect(() =>
    parseConfig({
      grid: { width: 10, height: 10 },
      robots: 1,
      pods: { count: 20 },
      stations: [{ id: 'D-1', docks: [[0, 0]], queueCapacity: 1, serviceTimeMs: 1000 }],
      layout: {
        mode: 'structured',
        storage: {
          insetX: 4,
          insetY: 4,
          blockWidth: 1,
          blockHeight: 1,
          aisleWidth: 1,
        },
      },
    }),
  ).toThrow(ConfigError);
});
