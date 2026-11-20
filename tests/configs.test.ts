import { readdirSync, readFileSync } from 'node:fs';
import { parseConfig } from '@/sim/config';

test('every config parses and the default is the small structured prototype', () => {
  const files = readdirSync('configs').filter((f) => f.endsWith('.json'));
  expect(files).toContain('default.json');
  for (const file of files) {
    expect(() => parseConfig(JSON.parse(readFileSync(`configs/${file}`, 'utf8')))).not.toThrow();
  }
  const config = parseConfig(JSON.parse(readFileSync('configs/default.json', 'utf8')));
  expect(config.grid).toEqual({ width: 30, height: 20 });
  expect(config.robots).toBe(25);
  expect(config.pods.count).toBe(120);
  expect(config.layout.mode).toBe('structured');
  expect(config.orders.loadFactor).toBe(0.5);
  expect(
    config.stations
      .filter((station) => station.kind === 'delivery')
      .map((station) => station.serviceTimeMs),
  ).toEqual([500, 500]);
});
