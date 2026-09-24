// The only reader of the time. Everything that needs the time (a transaction's timestamp, coalescing) takes a
// Clock, so tests pass a clock they control. A lint rule forbids Date.now and new Date() anywhere else.

export interface Clock {
  // milliseconds since the Unix epoch
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

// A clock for tests: it starts at `start` and moves only when advanced.
export function manualClock(start = 0): ManualClock {
  let time = start;
  return {
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
  };
}
