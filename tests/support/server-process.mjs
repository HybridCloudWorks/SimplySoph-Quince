// Starting server/start.mjs from a test (tests/start-config.test.mjs,
// tests/server.test.mjs). Each start loads the whole server (Cloud Storage,
// Twilio, sharp…): about a second of CPU on an idle machine, several on a busy
// one. So the waits here follow the process, not a fixed time:
//   - `listening` resolves with the server's URL once it prints it, or null
//     if the process ends first;
//   - `closed` resolves once the process has exited AND its output has been
//     read to the end ('close', not 'exit', which can come before the last of
//     stderr).
// `deadline` is only a backstop for a process that hangs: it is killed then,
// and the test sees it as not exiting on its own (code null, a signal).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const listeningLine = /http:\/\/127\.0\.0\.1:\d+\//;

export function startServer(env, { deadline = 120_000 } = {}) {
  const child = spawn(process.execPath, ["server/start.mjs"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "",
    stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data) => (stderr += data));
  const backstop = setTimeout(() => child.kill("SIGKILL"), deadline);
  const closed = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(backstop);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(backstop);
      resolve({ code, signal, stdout, stderr });
    });
  });
  const listening = new Promise((resolve) => {
    child.stdout.on("data", (data) => {
      stdout += data;
      const url = stdout.match(listeningLine);
      if (url) resolve(url[0]);
    });
    closed.then(
      () => resolve(null),
      () => resolve(null),
    );
  });
  return {
    child,
    listening,
    closed,
    // Ends the server (SIGTERM: it closes and exits) and waits until it has.
    stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      return closed;
    },
  };
}

// A start that must be refused: waits for the process to end by itself. One
// that starts listening instead is stopped at once (no waiting for the
// deadline) and returned as it was, so the test's own assertions say why.
export async function runToExit(env, options) {
  const server = startServer(env, options);
  if (await server.listening) await server.stop();
  return server.closed;
}
