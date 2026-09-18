import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Two or more browsers against one websocket service.
 *
 * What a shared planner is for cannot be seen from one client: a change one
 * member makes is only interesting where it arrives, and whether the arriving
 * client writes anything back is the part no unit test can see. The store is a
 * module singleton, so each client is its own process — see `clientProcess.js`.
 *
 * Between them sits the Go integration fixture, standing in for the api and the
 * change stream. Everything above the two transports is the SPA's own.
 *
 * Needs a Go toolchain; no stack.
 */

const FRONTEND = path.resolve(import.meta.dirname, "../../..");

/**
 * Waits for something a client does asynchronously, without a fixed sleep.
 *
 * Throws naming what it was waiting for: a scenario that fails here is usually
 * failing because a change never arrived, and the wait is the only place that
 * knows what the change was. `what` may be a function, for a caller whose
 * message includes what it last saw — which it only knows once the wait is over.
 *
 * @param {() => boolean | Promise<boolean>} predicate
 * @param {string | (() => string)} what
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export async function until(predicate, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const said = typeof what === "function" ? what() : what;
  throw new Error(`timed out waiting for ${said}`);
}

/**
 * Points a client's two transports at the harness, and records what it sends.
 *
 * Returned rather than installed, because the caller decides what "global"
 * means: a test in this process assigns them onto `globalThis`, and a client
 * process assigns them before it loads the app at all.
 *
 * @param {{apiBase: string, wsBase: string, origin: string}} at
 * @returns {{requests: {url: string, method: string}[], fetch: typeof fetch, WebSocket: typeof WebSocket}}
 */
export function pointTransportsAt({ apiBase, wsBase, origin }) {
  /** Every request the client made, so a scenario can assert on what it wrote. */
  const requests = [];

  const realFetch = globalThis.fetch;
  const RealWebSocket = globalThis.WebSocket;

  return {
    requests,
    fetch: (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? "GET" });
      const sameOrigin = url.startsWith("/") || url.startsWith(origin);
      return realFetch(
        sameOrigin ? apiBase + new URL(url, origin).pathname : url,
        init,
      );
    },
    WebSocket: class extends RealWebSocket {
      constructor(url, protocols) {
        const target = new URL(String(url));
        const to = new URL(wsBase.replace(/^http/, "ws"));
        target.protocol = to.protocol;
        target.host = to.host;
        super(target.toString(), protocols);
      }
    },
  };
}
const SERVICES = path.resolve(FRONTEND, "../services");

/**
 * Starts the websocket service's integration fixture.
 *
 * @param {object} params
 * @param {{accountID: string, sessionID: string, corporationID: number}[]} params.sessions
 * @param {string} params.origin - the document origin the clients will send
 * @param {number} [params.ttlSeconds]
 * @returns {Promise<{ws: string, api: string, stop: () => Promise<void>}>}
 */
export function startWebsocketHarness({ sessions, origin, ttlSeconds = 180 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "go",
      [
        "test",
        "./websocket/server/",
        "-run",
        "TestHarnessServe",
        "-v",
        "-count=1",
      ],
      {
        cwd: SERVICES,
        env: {
          ...process.env,
          EIP_WS_HARNESS: "1",
          EIP_WS_HARNESS_SESSIONS: sessions
            .map((s) => `${s.accountID}:${s.sessionID}:${s.corporationID}`)
            .join(","),
          EIP_WS_HARNESS_TTL: String(ttlSeconds),
          // A browser sends its document origin and the server checks it.
          EIP_WS_HARNESS_ORIGINS: origin,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`harness did not start:\n${out}`)),
      60_000,
    );
    const seen = (chunk) => {
      out += String(chunk);
      const ws = out.match(/HARNESS_WS (\S+)/);
      const api = out.match(/HARNESS_API (\S+)/);
      if (!ws || !api) return;
      clearTimeout(timer);
      resolve({
        ws: ws[1],
        api: api[1],
        stop: async () => {
          await fetch(`${api[1]}/shutdown`, { method: "POST" }).catch(() => {});
          child.kill();
        },
      });
    };
    child.stdout.on("data", seen);
    child.stderr.on("data", seen);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`harness exited (${code}):\n${out}`));
    });
  });
}

/**
 * Opens one browser, connected and working in the planner it names.
 *
 * Resolves once the socket is open and the planner is taken, so a caller never
 * has to wait for either — naming a planner before the socket opens drops the
 * message silently, which leaves every scoped read on the account instead.
 *
 * @param {object} params
 * @param {string} params.accountID
 * @param {string} params.sessionID
 * @param {string} params.planner - an owner handle
 * @param {string} params.apiBase
 * @param {string} params.wsBase
 * @param {string} params.origin
 * @returns {Promise<Client>}
 */
export function openClient(params) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(FRONTEND, "src/tests/live/clientProcess.js"),
        JSON.stringify({ ...params, root: FRONTEND }),
      ],
      { cwd: FRONTEND, stdio: ["pipe", "pipe", "pipe"] },
    );

    const pending = new Map();
    let nextID = 0;
    let buffered = "";
    let stderr = "";

    const timer = setTimeout(
      () =>
        reject(
          new Error(`client ${params.accountID} did not start:\n${stderr}`),
        ),
      90_000,
    );

    child.stdout.on("data", (chunk) => {
      buffered += String(chunk);
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.ready) {
          clearTimeout(timer);
          resolve(client);
          continue;
        }
        const settle = pending.get(message.id);
        if (!settle) continue;
        pending.delete(message.id);
        if (message.ok) settle.resolve(message.value);
        else settle.reject(new Error(message.error));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const failed = new Error(
        `client ${params.accountID} exited (${code}):\n${stderr}`,
      );
      for (const settle of pending.values()) settle.reject(failed);
      pending.clear();
      reject(failed);
    });

    /** @param {string} op */
    const send = (op, body = {}) =>
      new Promise((resolveCall, rejectCall) => {
        const id = ++nextID;
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
        child.stdin.write(JSON.stringify({ id, op, ...body }) + "\n");
      });

    /**
     * @typedef {object} Client
     * @property {(path: string) => Promise<any>} read - a dotted path into the store
     * @property {(module: string, fn: string, ...args: any[]) => Promise<any>} call - an export of the app
     * @property {(slice: string, fn: string, ...args: any[]) => Promise<any>} action - a store action
     * @property {() => Promise<{url: string, method: string}[]>} requests - what this client sent
     * @property {() => Promise<null>} forgetRequests
     * @property {(path: string, predicate: (value: any) => boolean, what: string, timeoutMs?: number) => Promise<void>} until
     * @property {() => Promise<void>} close
     */
    const client = {
      read: (statePath) => send("read", { path: statePath }),
      call: (module, fn, ...args) => send("call", { module, fn, args }),
      action: (slice, fn, ...args) => send("action", { slice, fn, args }),
      requests: () => send("requests"),
      forgetRequests: () => send("forgetRequests"),
      until: async (statePath, predicate, what, timeoutMs = 10_000) => {
        let last;
        await until(
          async () =>
            predicate((last = await send("read", { path: statePath }))),
          // What the path held is the whole diagnosis when a wait gives up.
          () => `${what}; ${statePath} was ${JSON.stringify(last)}`,
          timeoutMs,
        );
      },
      close: async () => {
        await send("close").catch(() => {});
        child.kill();
      },
    };
  });
}
