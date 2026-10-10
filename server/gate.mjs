import { error } from "./auth.mjs";

// Bounds memory-heavy work per instance (SEC-13): at most `max` tasks run at
// once, up to `queue` more wait their turn, and anything beyond that is refused
// with a retryable 503 before any work is done. A finishing task hands its slot
// straight to the next waiter, so the limit is never exceeded.
export function createGate({ max = 2, queue = 6, code = "PHOTO_BUSY" } = {}) {
  let active = 0;
  const waiting = [];
  return async function run(task) {
    if (active < max) active++;
    else if (waiting.length < queue) await new Promise((resolve) => waiting.push(resolve));
    else throw error(503, code);
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

// One gate for every sharp decode on this instance (guest photos and admin documents).
export const imageGate = createGate();
