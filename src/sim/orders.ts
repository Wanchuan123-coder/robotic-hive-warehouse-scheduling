import type { OrdersConfig } from './config';
import type { Rng } from './rng';
import type { Job, Order, Pod, World } from './types';

/**
 * Synthetic order generator. A configured load factor maintains a bounded
 * number of concurrent robot-work slots; null retains the legacy seeded
 * Poisson arrival process. Every order expands into one independent ready trip
 * job per line, each reserving a distinct available pod.
 */
export class OrderGenerator {
  private readonly world: World;
  private readonly config: OrdersConfig;
  private readonly rng: Rng;
  private nextArrivalMs: number;

  constructor(world: World, config: OrdersConfig, rng: Rng) {
    this.world = world;
    this.config = config;
    this.rng = rng;
    this.nextArrivalMs =
      config.loadFactor !== null || config.arrivalRatePerHour === 0
        ? Number.POSITIVE_INFINITY
        : world.simTimeMs + this.exponentialInterarrival();
  }

  generateDueOrders(): Order[] {
    if (this.config.loadFactor !== null) {
      return this.generateToLoad(this.config.loadFactor);
    }

    const created: Order[] = [];
    if (!Number.isFinite(this.nextArrivalMs)) {
      return created;
    }

    while (this.nextArrivalMs <= this.world.simTimeMs) {
      const arrivalMs = this.nextArrivalMs;
      this.nextArrivalMs += this.exponentialInterarrival();

      const desiredLines = this.sampleLineCount();

      // Snapshot the free pods once per arrival. Selections below reserve pods
      // immediately, so later arrivals in this batch see the updated flags.
      const candidates = this.world.pods.filter(
        (pod) => pod.available && pod.reservedByJobId === null,
      );
      if (candidates.length === 0) {
        continue;
      }

      created.push(this.createOrder(arrivalMs, candidates, desiredLines));
    }

    return created;
  }

  /**
   * Keeps demand close to loadFactor * robot count. A live job consumes one
   * slot through deposit; an unassigned robot that is still parking consumes a
   * slot until it becomes idle. This avoids double-counting assigned robots
   * while preserving the full robot work cycle.
   */
  private generateToLoad(loadFactor: number): Order[] {
    const targetSlots = Math.round(this.world.robots.length * loadFactor);
    let remainingSlots = Math.max(0, targetSlots - this.occupiedWorkSlots());
    if (remainingSlots === 0) return [];

    const candidates = this.freePods();
    const created: Order[] = [];

    while (remainingSlots > 0 && candidates.length > 0) {
      const lineCount = Math.min(this.sampleLineCount(), remainingSlots, candidates.length);
      created.push(this.createOrder(this.world.simTimeMs, candidates, lineCount));
      remainingSlots -= lineCount;
    }

    return created;
  }

  private occupiedWorkSlots(): number {
    let liveJobs = 0;
    for (const job of this.world.jobs.values()) {
      if (job.status !== 'complete') liveJobs += 1;
    }

    let repositioningRobots = 0;
    for (const robot of this.world.robots) {
      if (robot.jobId === null && robot.status !== 'idle') repositioningRobots += 1;
    }

    return liveJobs + repositioningRobots;
  }

  private freePods(): Pod[] {
    return this.world.pods.filter(
      (pod) => pod.available && pod.reservedByJobId === null,
    );
  }

  private sampleLineCount(): number {
    const { min, max } = this.config.linesPerOrder;
    return min + this.rng.int(max - min + 1);
  }

  /**
   * Removes lineCount pods from candidates and creates one order. The caller
   * owns the candidate pool, so several orders generated in one tick cannot
   * reserve the same pod.
   */
  private createOrder(createdAtMs: number, candidates: Pod[], lineCount: number): Order {
    const actualLineCount = Math.min(lineCount, candidates.length);
    const selected: Pod[] = [];
    for (let line = 0; line < actualLineCount; line++) {
      const index = this.rng.int(candidates.length);
      selected.push(candidates[index]!);
      candidates[index] = candidates[candidates.length - 1]!;
      candidates.pop();
    }

    const orderId = `O-${String(this.world.orders.size + 1).padStart(6, '0')}`;
    const candidateStations = this.world.stations
      .filter((station) => station.kind === 'delivery')
      .map((station) => station.id);
    const jobIds: string[] = [];

    for (const pod of selected) {
      const jobId = `J-${String(this.world.jobs.size + 1).padStart(7, '0')}`;
      const job: Job = {
        id: jobId,
        orderId,
        podId: pod.id,
        pickup: { x: pod.cell.x, y: pod.cell.y },
        candidateStations: [...candidateStations],
        dependsOn: [],
        priority: 0,
        createdAtMs,
        status: 'ready',
        stationId: null,
        robotId: null,
        completedAtMs: null,
      };
      pod.reservedByJobId = jobId;
      this.world.jobs.set(jobId, job);
      jobIds.push(jobId);
    }

    const order: Order = {
      id: orderId,
      createdAtMs,
      jobIds,
      stationId: null,
      podsTotal: actualLineCount,
      podsServiced: 0,
      packingRemainingMs: null,
      completedAtMs: null,
    };
    this.world.orders.set(orderId, order);
    return order;
  }

  /**
   * Exponential interarrival in ms for the configured hourly rate. Clamped to
   * at least 1 ms so a zero sample can never leave the arrival cursor fixed
   * (which would make `generateDueOrders` loop forever).
   */
  private exponentialInterarrival(): number {
    const rate = this.config.arrivalRatePerHour;
    if (rate === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(1, -Math.log(1 - this.rng.next()) * (3_600_000 / rate));
  }
}
