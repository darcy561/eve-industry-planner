import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_STATE_ENDPOINT,
  startSignIn,
  takeSignInState,
} from "./signInState.js";

function issued(state) {
  return new Response(JSON.stringify({ state }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("starting a sign in", () => {
  it("asks the API for a state and keeps it for the callback", async () => {
    fetchMock.mockResolvedValue(issued("a-state"));

    await expect(startSignIn()).resolves.toBe("a-state");

    expect(fetchMock.mock.calls[0][0]).toBe(SIGN_IN_STATE_ENDPOINT);
    expect(takeSignInState()).toBe("a-state");
  });

  it("lets the API set the cookie that binds it", async () => {
    fetchMock.mockResolvedValue(issued("a-state"));

    await startSignIn();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
  });

  it.each([
    ["the API refuses", new Response("", { status: 400 })],
    ["the API issues nothing", issued("")],
  ])("fails when %s", async (_name, response) => {
    fetchMock.mockResolvedValue(response);

    await expect(startSignIn()).rejects.toThrow(/Unable to start sign in/);
    expect(takeSignInState()).toBe("");
  });
});

describe("completing a sign in", () => {
  it("spends the state on reading it", async () => {
    fetchMock.mockResolvedValue(issued("a-state"));
    await startSignIn();

    expect(takeSignInState()).toBe("a-state");
    expect(takeSignInState()).toBe("");
  });

  it("has nothing to present when this tab did not start one", () => {
    expect(takeSignInState()).toBe("");
  });
});
