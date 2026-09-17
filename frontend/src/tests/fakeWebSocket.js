/**
 * A stand-in for the browser's WebSocket, for tests that drive
 * `WebSocket/websocketClient.js` without a server.
 *
 * Stub it over the global before the client connects:
 *
 * ```js
 * const sent = [];
 * vi.stubGlobal("WebSocket", makeFakeWebSocket({ sent }));
 * ```
 *
 * @param {object} [opts]
 * @param {object[]} [opts.sent] - every frame sent, parsed from JSON
 * @param {number} [opts.readyState] - what the socket reports on construction;
 *   `FakeWebSocket.OPEN` for a connection the client may write to
 * @returns {typeof WebSocket} a class, as `stubGlobal` wants
 */
export function makeFakeWebSocket({ sent, readyState = 1 } = {}) {
  return class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    /** The socket the client built most recently, for a test that drives it. */
    static last = null;

    constructor() {
      this.listeners = {};
      this.readyState = readyState;
      FakeWebSocket.last = this;
    }
    addEventListener(type, handler) {
      (this.listeners[type] ||= []).push(handler);
    }
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] ?? []).filter(
        (h) => h !== handler,
      );
    }
    /** Fires what the browser would fire, for a test acting as the server. */
    dispatch(type, event = {}) {
      for (const handler of this.listeners[type] ?? []) handler(event);
    }
    send(raw) {
      sent?.push(JSON.parse(raw));
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED;
    }
  };
}
