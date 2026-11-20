import { parseConfig } from '@/sim/config';
import { OrderGenerator } from '@/sim/orders';
import type { Rng } from '@/sim/rng';
import { createWorld } from '@/sim/world';

const config = parseConfig({
  grid: { width: 20, height: 20 },
  robots: 4,
  pods: { count: 50 },
  stations: [
    { id: 'S-1', docks: [[0, 5]], queueCapacity: 4, serviceTimeMs: 1000 },
    { id: 'S-2', docks: [[19, 5]], queueCapacity: 4, serviceTimeMs: 1000 },
  ],
  orders: { arrivalRatePerHour: 3600, linesPerOrder: { min: 2, max: 2 } },
  seed: 42,
});

test('each order expands into one ready trip per line', () => {
  const world = createWorld(config);
  const generator = new OrderGenerator(world, config.orders, world.rng);
  world.simTimeMs = 60_000;
  const orders = generator.generateDueOrders();
  expect(orders.length).toBeGreaterThan(0);
  for (const order of orders) {
    expect(order.jobIds).toHaveLength(2);
    for (const jobId of order.jobIds) {
      const job = world.jobs.get(jobId)!;
      expect(job.orderId).toBe(order.id);
      expect(job.status).toBe('ready');
      expect(job.dependsOn).toEqual([]);
      expect(job.candidateStations).toEqual(['S-1', 'S-2']);
    }
  }
});

test('a pod is never reserved by two live jobs', () => {
  const world = createWorld(config);
  const generator = new OrderGenerator(world, config.orders, world.rng);
  world.simTimeMs = 60_000;
  generator.generateDueOrders();
  const reserved = [...world.jobs.values()].map((job) => job.podId);
  expect(new Set(reserved).size).toBe(reserved.length);
});

test('a zero interarrival sample is clamped so generation always advances', () => {
  const world = createWorld(
    parseConfig({
      grid: { width: 3, height: 3 },
      robots: 1,
      pods: { count: 1 },
      stations: [{ id: 'S-1', docks: [[0, 0]], queueCapacity: 1, serviceTimeMs: 1000 }],
      orders: { arrivalRatePerHour: 3600, linesPerOrder: { min: 1, max: 1 } },
      seed: 1,
    }),
  );
  const zeroRng: Rng = {
    next: () => 0,
    int: () => 0,
    pick: <T>(items: readonly T[]) => items[0]!,
  };
  const generator = new OrderGenerator(world, world.config.orders, zeroRng);

  expect(generator.generateDueOrders()).toEqual([]);

  world.simTimeMs = 1;
  const orders = generator.generateDueOrders();
  expect(orders).toHaveLength(1);
});

function loadConfig(loadFactor: number, robots = 10) {
  return parseConfig({
    grid: { width: 20, height: 20 },
    robots,
    pods: { count: 50 },
    stations: [
      {
        id: 'F-1', kind: 'fetch', docks: [[0, 4]],
        queueCapacity: 4, serviceTimeMs: 1000,
      },
      {
        id: 'D-1', kind: 'delivery', docks: [[19, 4]],
        queueCapacity: 4, serviceTimeMs: 1000,
      },
    ],
    orders: {
      loadFactor,
      arrivalRatePerHour: 0,
      linesPerOrder: { min: 2, max: 2 },
    },
    seed: 42,
  });
}

test('load zero creates no work', () => {
  const configured = loadConfig(0);
  const world = createWorld(configured);
  const generator = new OrderGenerator(world, configured.orders, world.rng);

  world.simTimeMs = 60_000;
  expect(generator.generateDueOrders()).toEqual([]);
  expect(world.jobs.size).toBe(0);
});

test('load mode fills but does not exceed the target robot-work slots', () => {
  const configured = loadConfig(0.5);
  const world = createWorld(configured);
  const generator = new OrderGenerator(world, configured.orders, world.rng);

  const created = generator.generateDueOrders();
  expect(created.map((order) => order.jobIds.length)).toEqual([2, 2, 1]);
  expect(world.jobs.size).toBe(5);
  expect(generator.generateDueOrders()).toEqual([]);
});

test('load mode replenishes work after a trip and parking cycle finish', () => {
  const configured = loadConfig(0.5, 4);
  const world = createWorld(configured);
  const generator = new OrderGenerator(world, configured.orders, world.rng);

  generator.generateDueOrders();
  const completed = [...world.jobs.values()][0]!;
  completed.status = 'complete';
  const completedPod = world.pods.find((pod) => pod.id === completed.podId)!;
  completedPod.reservedByJobId = null;

  // A robot still returning to a parking cell occupies the released slot.
  world.robots[0]!.status = 'moving_empty';
  world.robots[0]!.jobId = null;
  expect(generator.generateDueOrders()).toEqual([]);

  world.robots[0]!.status = 'idle';
  expect(generator.generateDueOrders()).toHaveLength(1);
  expect([...world.jobs.values()].filter((job) => job.status !== 'complete')).toHaveLength(2);
});

test('jobs only target delivery stations', () => {
  const configured = loadConfig(0.2);
  const world = createWorld(configured);
  const generator = new OrderGenerator(world, configured.orders, world.rng);

  generator.generateDueOrders();
  for (const job of world.jobs.values()) {
    expect(job.candidateStations).toEqual(['D-1']);
  }
});
