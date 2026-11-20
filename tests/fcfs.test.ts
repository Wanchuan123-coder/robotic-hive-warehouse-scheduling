import { FcfsAllocator } from '@/sim/fcfs';
import type { AllocationObservation } from '@/sim/allocation';

const observation: AllocationObservation = {
  simTimeMs: 10_000,
  allocationSeq: 1,
  robots: [
    { id: 'R-0001', cell: { x: 0, y: 0 }, status: 'idle', battery: 1, jobId: null },
    { id: 'R-0002', cell: { x: 9, y: 0 }, status: 'idle', battery: 1, jobId: null },
  ],
  jobs: [
    { id: 'J-2', orderId: 'O-2', podId: 'P-2', pickup: { x: 5, y: 0 },
      candidateStations: ['S-1', 'S-2'], priority: 2, createdAtMs: 9000,
      dependsOn: [] },
    { id: 'J-1', orderId: 'O-1', podId: 'P-1', pickup: { x: 5, y: 0 },
      candidateStations: ['S-1', 'S-2'], priority: 1, createdAtMs: 8000,
      dependsOn: [] },
  ],
  stations: [
    { id: 'S-1', queueLength: 3, queueCapacity: 8, serviceTimeMs: 1000, busy: true },
    { id: 'S-2', queueLength: 0, queueCapacity: 8, serviceTimeMs: 1000, busy: false },
  ],
};

test('assigns oldest job to nearest robot and least-penalised station', () => {
  const result = new FcfsAllocator().allocate(observation);
  expect(result[0]).toEqual({ jobId: 'J-1', robotId: 'R-0002', stationId: 'S-2' });
});

test('routes around incoming trips and includes fresh assignments in the same batch', () => {
  const stations = observation.stations.map((station, index) => ({
    ...station, queueLength: 0, incomingTrips: index === 0 ? 1 : 0,
  }));
  const result = new FcfsAllocator().allocate({ ...observation, stations });
  // S-1 already has a robot en route. After the first assignment both stations
  // have one incoming trip, so the second job uses the stable id tie-break.
  expect(result.map((assignment) => assignment.stationId)).toEqual(['S-2', 'S-1']);
});

test('keeps every trip from one order on the station chosen by its first trip', () => {
  const result = new FcfsAllocator().allocate({
    ...observation,
    jobs: [
      {
        id: 'J-1', orderId: 'O-1', podId: 'P-1', pickup: { x: 0, y: 0 },
        candidateStations: ['S-1', 'S-2'], priority: 0, createdAtMs: 8000,
        dependsOn: [],
      },
      {
        id: 'J-2', orderId: 'O-1', podId: 'P-2', pickup: { x: 9, y: 0 },
        candidateStations: ['S-1', 'S-2'], priority: 0, createdAtMs: 8000,
        dependsOn: [],
      },
    ],
    stations: [
      {
        id: 'S-1', queueLength: 0, queueCapacity: 8, serviceTimeMs: 1000,
        busy: false, docks: [{ x: 0, y: 0 }],
      },
      {
        id: 'S-2', queueLength: 0, queueCapacity: 8, serviceTimeMs: 1000,
        busy: false, docks: [{ x: 9, y: 0 }],
      },
    ],
  });

  expect(result).toHaveLength(2);
  expect(result.map((assignment) => assignment.stationId)).toEqual(['S-1', 'S-1']);
});
