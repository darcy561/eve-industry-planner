import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAdditionalAccountState,
  parseAdditionalAccountState,
  subscribeToAdditionalUserAuthCode,
  tryCompleteAdditionalAccountImportWindow,
  watchForClosedImportPopup,
} from "./additionalAccountImport.js";

const NONCE = "11111111-2222-3333-4444-555555555555";

function flush(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("parseAdditionalAccountState", () => {
  it("round-trips a nonce", () => {
    expect(parseAdditionalAccountState(buildAdditionalAccountState(NONCE))).toBe(
      NONCE
    );
  });

  it("returns null for main login states", () => {
    expect(parseAdditionalAccountState("main")).toBeNull();
    expect(parseAdditionalAccountState("/job-planner")).toBeNull();
    expect(parseAdditionalAccountState(null)).toBeNull();
  });

  it("returns null when the nonce is missing", () => {
    expect(parseAdditionalAccountState("additional")).toBeNull();
    expect(parseAdditionalAccountState("additional:")).toBeNull();
  });
});

describe("additional account import handshake", () => {
  let closeWindow;

  beforeEach(() => {
    closeWindow = vi.fn();
    vi.stubGlobal("window", { ...globalThis.window, close: closeWindow });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("delivers the code to the tab holding the nonce, and acks it", async () => {
    const onAuthCode = vi.fn();
    subscribeToAdditionalUserAuthCode({ nonce: NONCE, onAuthCode });

    const handled = await tryCompleteAdditionalAccountImportWindow(
      buildAdditionalAccountState(NONCE),
      "auth-code-value"
    );

    expect(handled).toBe(true);
    expect(onAuthCode).toHaveBeenCalledWith("auth-code-value");
    expect(closeWindow).toHaveBeenCalled();
  });

  it("ignores a code raised for another tab's import", async () => {
    const onAuthCode = vi.fn();
    const detach = subscribeToAdditionalUserAuthCode({
      nonce: NONCE,
      onAuthCode,
    });

    await tryCompleteAdditionalAccountImportWindow(
      buildAdditionalAccountState("a-different-nonce"),
      "auth-code-value"
    );

    expect(onAuthCode).not.toHaveBeenCalled();
    detach();
  });

  it("closes the callback window when nobody acks", async () => {
    const handled = await tryCompleteAdditionalAccountImportWindow(
      buildAdditionalAccountState(NONCE),
      "auth-code-value"
    );

    expect(handled).toBe(true);
    expect(closeWindow).toHaveBeenCalled();
  });

  it("leaves a main-login callback alone", async () => {
    expect(
      await tryCompleteAdditionalAccountImportWindow("main", "auth-code-value")
    ).toBe(false);
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("times out and stops listening", async () => {
    const onAuthCode = vi.fn();
    const onTimeout = vi.fn();
    subscribeToAdditionalUserAuthCode({
      nonce: NONCE,
      onAuthCode,
      onTimeout,
      timeoutMs: 5,
    });

    await flush(20);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    await tryCompleteAdditionalAccountImportWindow(
      buildAdditionalAccountState(NONCE),
      "auth-code-value"
    );
    expect(onAuthCode).not.toHaveBeenCalled();
  });
});

describe("watchForClosedImportPopup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a closed popup once the grace period has passed", () => {
    const popup = { closed: false };
    const onClosed = vi.fn();
    watchForClosedImportPopup(popup, onClosed);

    vi.advanceTimersByTime(2_000);
    expect(onClosed).not.toHaveBeenCalled();

    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(onClosed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_500);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("stays silent for a popup still open", () => {
    const onClosed = vi.fn();
    watchForClosedImportPopup({ closed: false }, onClosed);

    vi.advanceTimersByTime(60_000);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("cancels a grace period a code arrived during", () => {
    const popup = { closed: true };
    const onClosed = vi.fn();
    const cancel = watchForClosedImportPopup(popup, onClosed);

    vi.advanceTimersByTime(500);
    cancel();
    vi.advanceTimersByTime(60_000);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("stops polling once cancelled", () => {
    const popup = { closed: false };
    const onClosed = vi.fn();
    const cancel = watchForClosedImportPopup(popup, onClosed);

    cancel();
    popup.closed = true;
    vi.advanceTimersByTime(60_000);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("is a no-op when the popup was blocked", () => {
    const onClosed = vi.fn();
    expect(() => watchForClosedImportPopup(null, onClosed)()).not.toThrow();

    vi.advanceTimersByTime(60_000);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
