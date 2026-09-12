import { describe, expect, it, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../../../Events/loginEvents.js";
import { startLogin } from "../../../Functions/Auth/loginProgress.js";
import { useLoginState } from "./useLoginState.jsx";

// The state lives outside React so steps landing before anything mounts are
// still counted. That is the property worth covering: a component mounting late
// into a login must see what it missed, which a hook holding its own state
// could not do.

/** Renders the hook and hands back its latest value. */
function mountHook() {
  const seen = { current: null };
  function Probe() {
    seen.current = useLoginState();
    return null;
  }
  const rendered = render(<Probe />);
  return { seen, ...rendered };
}

beforeEach(() => {
  startLogin();
});

describe("useLoginState", () => {
  it("reports steps that completed before it mounted", () => {
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);

    const { seen } = mountHook();

    expect(seen.current.isStepComplete(LOGIN_STEPS.CHARACTER_DATA)).toBe(true);
    expect(seen.current.isStepComplete(LOGIN_STEPS.JOB_PLANNER)).toBe(false);
  });

  it("re-renders as later steps land", () => {
    const { seen } = mountHook();

    expect(seen.current.isStepComplete(LOGIN_STEPS.JOB_PLANNER)).toBe(false);

    act(() => {
      emitLoginStepComplete(LOGIN_STEPS.JOB_PLANNER);
    });

    expect(seen.current.isStepComplete(LOGIN_STEPS.JOB_PLANNER)).toBe(true);
    expect(seen.current.currentStep).toBe(LOGIN_STEPS.JOB_PLANNER);
  });

  it("is complete only once every step has landed", () => {
    const { seen } = mountHook();
    const steps = Object.values(LOGIN_STEPS);

    for (const step of steps.slice(0, -1)) {
      act(() => {
        emitLoginStepComplete(step);
      });
      expect(seen.current.isLoginComplete()).toBe(false);
    }

    act(() => {
      emitLoginStepComplete(steps.at(-1));
    });

    expect(seen.current.isLoginComplete()).toBe(true);
  });

  it("carries the step an error belongs to, so a screen can mark that row", () => {
    const { seen } = mountHook();

    act(() => {
      emitLoginError(LOGIN_STEPS.GROUP_DATA, new Error("api down"));
    });

    expect(seen.current.error).toMatchObject({
      step: LOGIN_STEPS.GROUP_DATA,
      message: "api down",
    });
    expect(seen.current.isStepComplete(LOGIN_STEPS.GROUP_DATA)).toBe(false);
  });

  // A second login in the same tab must not read the first one's steps.
  it("forgets the previous login's steps when a new one starts", () => {
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
    const { seen } = mountHook();

    act(() => {
      startLogin();
    });

    expect(seen.current.isStepComplete(LOGIN_STEPS.CHARACTER_DATA)).toBe(false);
    expect(seen.current.error).toBeNull();
  });
});
