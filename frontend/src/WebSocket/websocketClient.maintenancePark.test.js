import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const requestAppConfigRecheck = vi.fn();
vi.mock("../Events/appConfigEvents.js", () => ({
  requestAppConfigRecheck: (...args) => requestAppConfigRecheck(...args),
  subscribeToAppConfigRecheck: () => () => {},
}));

const {
  connectWebsocket,
  parkWebsocketForMaintenance,
  resumeWebsocketAfterMaintenance,
  isWebsocketParkedForMaintenance,
  disconnectWebsocket,
} = await import("./websocketClient.js");

describe("websocket maintenance park", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    // disconnect clears the park so one test cannot leak into the next.
    disconnectWebsocket();
    vi.restoreAllMocks();
  });

  test("starts unparked", () => {
    expect(isWebsocketParkedForMaintenance()).toBe(false);
  });

  test("parking is what stops the retry schedule", () => {
    parkWebsocketForMaintenance();
    expect(isWebsocketParkedForMaintenance()).toBe(true);
  });

  test("resuming lifts the park", () => {
    parkWebsocketForMaintenance();
    resumeWebsocketAfterMaintenance();
    expect(isWebsocketParkedForMaintenance()).toBe(false);
  });

  // Resuming when never parked is a no-op rather than a stray reconnect.
  test("resuming when not parked does nothing", () => {
    expect(isWebsocketParkedForMaintenance()).toBe(false);
    resumeWebsocketAfterMaintenance();
    expect(isWebsocketParkedForMaintenance()).toBe(false);
  });

  // Logging out during a window must not leave the next session parked.
  test("disconnecting clears the park", () => {
    parkWebsocketForMaintenance();
    disconnectWebsocket();
    expect(isWebsocketParkedForMaintenance()).toBe(false);
  });

  // Parking twice is what a repeated announce or a re-render would do.
  test("parking is idempotent", () => {
    parkWebsocketForMaintenance();
    parkWebsocketForMaintenance();
    expect(isWebsocketParkedForMaintenance()).toBe(true);
    resumeWebsocketAfterMaintenance();
    expect(isWebsocketParkedForMaintenance()).toBe(false);
  });
});

// The browser gives a refused handshake no status, so the only thing the client
// can do is ask app-config why the socket would not open.
describe("a socket that will not open", () => {
  class FakeSocket {
    static OPEN = 1;
    static last = null;
    constructor() {
      this.listeners = {};
      this.readyState = 0;
      FakeSocket.last = this;
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    dispatch(type) {
      for (const fn of this.listeners[type] || []) fn({});
    }
    close() {}
    send() {}
  }

  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.spyOn(console, "info").mockImplementation(() => {});
    requestAppConfigRecheck.mockClear();
  });

  afterEach(() => {
    disconnectWebsocket();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("closing before it opened asks app-config to recheck", () => {
    connectWebsocket({ accountId: "acct-1" });
    FakeSocket.last.dispatch("close");
    expect(requestAppConfigRecheck).toHaveBeenCalledTimes(1);
  });

  test("a deliberate disconnect asks nothing", () => {
    connectWebsocket({ accountId: "acct-1" });
    const sock = FakeSocket.last;
    disconnectWebsocket();
    sock.dispatch("close");
    expect(requestAppConfigRecheck).not.toHaveBeenCalled();
  });
});
