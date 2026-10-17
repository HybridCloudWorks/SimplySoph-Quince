// Runs `npm run check` (the pinned build, the page checks and the unit tests)
// with the wall clock moved to other instants, so a test that reads the real
// clock for the app's time fails today instead of on the night the calendar
// reaches that date (R-008).
//
//   node scripts/test-at.mjs                       every instant below, in turn
//   node scripts/test-at.mjs 2027-01-16T10:00:00-06:00 [more…]
//   FAKE_NOW=2027-01-16T10:00:00-06:00 node scripts/test-at.mjs
//
// Each run gets tests/support/fake-now.mjs through NODE_OPTIONS, so every
// process it starts (the build, each test file, the servers some tests spawn)
// sees the same shifted date. CI runs some of these instants on every push
// (.github/workflows/check.yml, job "clock"); docs/publishing.md has the
// owner's step.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The phases the site goes through, at the times the owner re-publishes and
// past every date the tests' fixtures use.
const instants = [
  "2026-11-16T10:00:00-06:00", // RSVPs closed: the first re-publish
  "2027-01-15T15:30:00-06:00", // the day itself, before the ceremony and the upload window
  "2027-01-15T21:15:00-06:00", // party night, inside the upload window
  "2027-01-16T10:00:00-06:00", // the morning after: the second re-publish, still in the window
  "2027-02-15T12:00:00-06:00", // after the party and the upload window
  "2028-01-20T12:00:00-06:00", // a year on, past the data retention date
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preload = pathToFileURL(path.join(root, "tests/support/fake-now.mjs")).href;

const run = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = args.length ? spawn(command, args, { cwd: root, ...options }) : spawn(command, { cwd: root, ...options });
    let out = "";
    child.stdout?.on("data", (data) => (out += data));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), out }));
  });

// One instant: exactly what `npm run check` runs, under the shifted clock.
async function checkAt(at) {
  const env = {
    ...process.env,
    FAKE_NOW: at,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${preload}`].filter(Boolean).join(" "),
  };
  // First make sure a child really sees that date: a run that silently kept
  // the real clock would pass and prove nothing.
  const seen = await run(process.execPath, ["-e", "process.stdout.write(String(Date.now()))"], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (seen.code !== 0 || !(Math.abs(Number(seen.out) - Date.parse(at)) < 60_000))
    throw new Error(`The clock did not move to ${at} (a child saw ${seen.out || "nothing"})`);
  const { scripts } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  return (await run(scripts.check, [], { shell: true, stdio: "inherit", env })).code;
}

const asked = process.argv.slice(2);
const list = asked.length ? asked : process.env.FAKE_NOW ? [process.env.FAKE_NOW] : instants;
for (const at of list)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) {
    console.error(`Not an ISO time with an offset: ${at}`);
    process.exit(2);
  }
const results = [];
for (const at of list) {
  console.log(`\n=== npm run check with the clock at ${at}\n`);
  results.push([at, await checkAt(at)]);
}
console.log("\n=== Results");
for (const [at, code] of results) console.log(`${code === 0 ? "pass" : "FAIL"}  ${at}`);
process.exit(results.every(([, code]) => code === 0) ? 0 : 1);
