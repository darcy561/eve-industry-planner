/**
 * One browser, in its own process.
 *
 * The SPA's store is a module singleton and a module-registry reset hands back
 * the same instance, so two clients cannot exist in one process however the
 * modules are loaded. A second client therefore needs a second process, and this
 * is it: a shim for the browser globals the app reaches for, Vite's SSR loader
 * for the transforms its graph needs, and a line-delimited command channel on
 * stdin.
 *
 * Nothing here decides what a scenario does. It loads the app, points both
 * transports at the harness, and runs what the test asks of it — so a new
 * scenario needs no change to this file.
 *
 * Driven by `crossClientHarness.js`; not run directly.
 */

import { createServer } from "vite";
import { pointTransportsAt, until } from "./crossClientHarness.js";

const config = JSON.parse(process.argv[2]);

// stdout is the command channel, so anything the app says goes to stderr. A log
// line written between two replies would otherwise arrive as an unparseable
// message and lose whichever call was in flight.
for (const level of ["log", "info", "warn", "error", "debug", "trace"]) {
  console[level] = (...parts) => process.stderr.write(parts.join(" ") + "\n");
}

/**
 * The browser surface the app's own graph touches, on Node's event classes.
 *
 * Node's WebSocket dispatches Node's Event, and an event target from another
 * implementation refuses it — so the window the app dispatches its own events on
 * has to be Node's too. That rules out jsdom here, and what is left is small:
 * the app's store and socket client reach for a location, two storages, a
 * document to watch for visibility, and somewhere to raise a CustomEvent.
 */
class Storage {
  #held = new Map();
  getItem(key) {
    return this.#held.has(String(key)) ? this.#held.get(String(key)) : null;
  }
  setItem(key, value) {
    this.#held.set(String(key), String(value));
  }
  removeItem(key) {
    this.#held.delete(String(key));
  }
  clear() {
    this.#held.clear();
  }
  key(index) {
    return [...this.#held.keys()][index] ?? null;
  }
  get length() {
    return this.#held.size;
  }
}

const windowTarget = new EventTarget();
const documentTarget = new EventTarget();
const origin = new URL(config.origin);

const browser = {
  window: Object.assign(windowTarget, {
    location: {
      origin: origin.origin,
      href: origin.href,
      protocol: origin.protocol,
      host: origin.host,
      hostname: origin.hostname,
      pathname: origin.pathname,
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    requestAnimationFrame: (fn) => globalThis.setTimeout(fn, 0),
    cancelAnimationFrame: globalThis.clearTimeout,
  }),
  document: Object.assign(documentTarget, {
    visibilityState: "visible",
    hidden: false,
  }),
  sessionStorage: new Storage(),
  localStorage: new Storage(),
};

for (const [key, value] of Object.entries(browser)) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}
globalThis.window.window = globalThis.window;
globalThis.window.document = globalThis.document;
globalThis.window.sessionStorage = globalThis.sessionStorage;
globalThis.window.localStorage = globalThis.localStorage;
for (const name of [
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
]) {
  globalThis[name] = windowTarget[name].bind(windowTarget);
}

const transports = pointTransportsAt(config);
const requests = transports.requests;
globalThis.fetch = transports.fetch;
globalThis.WebSocket = transports.WebSocket;

const vite = await createServer({
  root: config.root,
  // No hot-module socket: it binds a fixed port, so a second client would
  // collide with the first rather than start.
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

// Seeded through the app's own writer rather than onto the shim directly: the
// app reads its tab session through this module, and a value written past it is
// a value it may never see.
const tabSession = await vite.ssrLoadModule(
  "/src/Functions/Auth/tabSessionStorage.js",
);
tabSession.persistTabPlannerSession({ sessionID: config.sessionID });
if (tabSession.getTabPlannerSessionID() !== config.sessionID) {
  throw new Error(`the tab session ${config.sessionID} did not stick`);
}

const store = (await vite.ssrLoadModule("/src/Zustand/usersStore.js")).default;
const client = await vite.ssrLoadModule("/src/WebSocket/websocketClient.js");

store.setState((state) => ({
  account: {
    ...state.account,
    accountID: config.accountID,
    sessionID: config.sessionID,
    isLoggedIn: true,
    // A tab that has just validated its session, which is what a signed-in
    // browser is. Without it the app tries to rotate on the first private
    // request, fails to fetch an ESI token for the placeholder character the
    // store starts with, reads that as a demand to sign in again, and throws
    // this tab's session away before any scenario has run.
    lastPlannerSessionValidatedAt: Date.now(),
  },
}));

client.connectWebsocket({ accountId: config.accountID });
await until(() => client.isWebsocketOpen(), "the socket to open");
// Named once the socket is open, because the message goes over it: a planner
// named before then is dropped and the client works in the account's own.
if (config.planner && !client.sendActivePlanner(config.planner)) {
  throw new Error(`the socket did not take the planner ${config.planner}`);
}

/** Reads a dotted path out of the store, as something JSON can carry. */
function readPath(path) {
  let value = store.getState();
  for (const step of String(path).split(".")) {
    if (value == null) return null;
    value = value[step];
  }
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * What a scenario can ask this client.
 *
 * Every answer crosses the channel as JSON, which is not what the app holds: a
 * `Job` arrives as its own fields and none of its derived ones, because those
 * are getters on the prototype and `JSON.stringify` takes own enumerable
 * properties only. A `Map` or a `Set` arrives as `{}` for the same reason. So a
 * scenario asserting on `totalCost`, `isReadyToBuild` or any other derived value
 * is asserting on `undefined` and will pass whatever the getter would compute —
 * assert on stored fields here, and pin derived values where the class lives.
 */
const operations = {
  read: ({ path }) => readPath(path),
  requests: () => requests.slice(),
  forgetRequests: () => {
    requests.length = 0;
    return null;
  },
  /** Calls an export of the app, by module path and name. */
  call: async ({ module, fn, args = [] }) => {
    const loaded = await vite.ssrLoadModule(module);
    const result = await loaded[fn](...args);
    if (result === undefined) return null;
    // A Response carries nothing JSON can hold, and its status is the whole
    // answer for the endpoints a scenario calls directly.
    if (result instanceof Response) {
      return { status: result.status, body: await result.text() };
    }
    return JSON.parse(JSON.stringify(result));
  },
  /** Calls a store action, which is where most of the app's state moves. */
  action: async ({ slice, fn, args = [] }) => {
    const result = await store.getState()[slice].actions[fn](...args);
    return result === undefined ? null : JSON.parse(JSON.stringify(result));
  },
};

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

let buffered = "";
process.stdin.on("data", async (chunk) => {
  buffered += String(chunk);
  const lines = buffered.split("\n");
  buffered = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const command = JSON.parse(line);
    if (command.op === "close") {
      await vite.close();
      send({ id: command.id, ok: true, value: null });
      process.exit(0);
    }
    try {
      const run = operations[command.op];
      if (!run) throw new Error(`unknown operation ${command.op}`);
      send({ id: command.id, ok: true, value: await run(command) });
    } catch (err) {
      send({ id: command.id, ok: false, error: String(err?.message ?? err) });
    }
  }
});

send({ ready: true, clientID: client.getWsClientID?.() ?? null });
