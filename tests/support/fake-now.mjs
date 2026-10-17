// Preload that moves this process's wall clock to FAKE_NOW (an ISO time with
// an offset), then lets it run on from there: Date.now() and new Date() read
// FAKE_NOW plus the time elapsed since the process started. Timers and
// performance.now() are untouched, so waits and timeouts behave as usual.
//
// scripts/test-at.mjs loads it through NODE_OPTIONS, so every process the unit
// tests start (the build, each test file, the servers some tests spawn) sees
// the same shifted date. A test that reads the real clock for the app's time
// then fails at once, instead of on the night the calendar reaches that date
// (R-008: the upload limit test failed only during the party upload window).
const raw = process.env.FAKE_NOW;
const target = Date.parse(raw ?? "");
if (!raw || !/(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(target))
  throw new Error(`tests/support/fake-now.mjs needs FAKE_NOW as an ISO time with an offset, got ${JSON.stringify(raw)}`);
const RealDate = Date,
  realNow = RealDate.now.bind(RealDate),
  shift = target - realNow(),
  now = () => realNow() + shift;
// A function, not a class, so Date() without `new` still returns a string,
// and every Date (made here or inside Node) is still `instanceof Date`.
function FakeDate(...args) {
  if (!new.target) return new RealDate(now()).toString();
  return Reflect.construct(RealDate, args.length ? args : [now()], new.target);
}
Object.setPrototypeOf(FakeDate, RealDate);
FakeDate.prototype = RealDate.prototype;
RealDate.prototype.constructor = FakeDate;
FakeDate.now = now;
globalThis.Date = FakeDate;
