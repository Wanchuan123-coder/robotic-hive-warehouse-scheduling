import type {
  AllocationObservation,
  Allocator,
  Assignment,
  JobObservation,
  RobotObservation,
  StationObservation,
} from './allocation';
import type { Cell } from './config';
import { manhattan } from './movement';

/** Distance-equivalent surcharge per queued or incoming pod. */
const QUEUE_PENALTY = 5;

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareJobs(a: JobObservation, b: JobObservation): number {
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return compareIds(a.id, b.id);
}

/**
 * Manhattan distance from the pickup to the station's closest dock. The brief's
 * `StationObservation` has no dock cells; when they are absent (as in the
 * brief's fixture) the distance term is treated as zero and the queue penalty
 * decides.
 */
function pickupToStation(pickup: Cell, station: StationObservation): number {
  const docks = station.docks;
  if (docks === undefined || docks.length === 0) return 0;

  let best = Number.POSITIVE_INFINITY;
  for (const dock of docks) {
    const distance = manhattan(pickup, dock);
    if (distance < best) best = distance;
  }
  return best;
}

/**
 * First-come-first-served reference allocator: jobs are served in creation
 * order, each taking the nearest free idle robot (ties by id) and the station
 * with the lowest pickup distance plus the cost of committed station work
 * (ties by station id).
 */
export class FcfsAllocator implements Allocator {
  allocate(observation: AllocationObservation): Assignment[] {
    const availableRobots: RobotObservation[] = observation.robots
      .filter((robot) => robot.status === 'idle' && robot.jobId === null)
      .sort((a, b) => compareIds(a.id, b.id));

    const stationsById = new Map<string, StationObservation>();
    const committedTrips = new Map<string, number>();
    for (const station of observation.stations) {
      stationsById.set(station.id, station);
      committedTrips.set(station.id, station.queueLength + (station.incomingTrips ?? 0));
    }

    const jobs = [...observation.jobs].sort(compareJobs);
    const assignments: Assignment[] = [];
    // Simulation freezes an order to the station selected by its first
    // accepted trip. Observations are immutable within a batch, so remember
    // that choice here to keep later trips from the same order consistent.
    const stationByOrder = new Map<string, string>();

    for (const job of jobs) {
      if (availableRobots.length === 0) break;

      let robotIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < availableRobots.length; index++) {
        const distance = manhattan(availableRobots[index]!.cell, job.pickup);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          robotIndex = index;
        }
      }
      if (robotIndex === -1) break;

      const robot = availableRobots[robotIndex]!;

      let chosenStationId = stationByOrder.get(job.orderId);
      if (
        chosenStationId === undefined ||
        !job.candidateStations.includes(chosenStationId) ||
        !stationsById.has(chosenStationId)
      ) {
        chosenStationId = undefined;
        let chosenCost = Number.POSITIVE_INFINITY;
        for (const stationId of job.candidateStations) {
          const station = stationsById.get(stationId);
          if (station === undefined) continue;
          const cost = pickupToStation(job.pickup, station) + committedTrips.get(stationId)! * QUEUE_PENALTY;
          if (
            cost < chosenCost ||
            (cost === chosenCost &&
              (chosenStationId === undefined || compareIds(stationId, chosenStationId) < 0))
          ) {
            chosenCost = cost;
            chosenStationId = stationId;
          }
        }
      }
      if (chosenStationId === undefined) continue;

      availableRobots.splice(robotIndex, 1);
      stationByOrder.set(job.orderId, chosenStationId);
      committedTrips.set(chosenStationId, committedTrips.get(chosenStationId)! + 1);
      assignments.push({
        jobId: job.id,
        robotId: robot.id,
        stationId: chosenStationId,
      });
    }

    return assignments;
  }
}
