import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { LOGIN_STEPS } from "../../../Events/loginEvents";

const { account } = vi.hoisted(() => ({
  account: { requiresFirstLogin: false },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        actions: {
          getRequiresFirstLoginFlow: () => account.requiresFirstLogin,
        },
      },
    }),
  );
});

const { useAfterLoginStepNavigation } =
  await import("./useAfterLoginStepNavigation.js");

const navigate = vi.fn();

function Mounted({ completedSteps }) {
  useAfterLoginStepNavigation({ completedSteps, navigate });
  return null;
}

function finishLoginAt(search, steps = Object.values(LOGIN_STEPS)) {
  window.history.pushState({}, "", `/auth${search}`);
  return render(<Mounted completedSteps={new Set(steps)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  account.requiresFirstLogin = false;
});

describe("once every login step has reported", () => {
  // The callback URL is the only thing that survived the trip to EVE, so it is where
  // the page the reader asked for is read back from.
  it("sends the reader back to what the callback named", async () => {
    finishLoginAt(
      `?code=abc&state=${encodeURIComponent("/editjob/job-1?activeGroup=g1")}`,
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/editjob/job-1?activeGroup=g1",
      }),
    );
  });

  // EVE echoes whatever it was given, so a damaged value is worth the default and no
  // more.
  it.each(["main", "/nonsense", "//evil.example"])(
    "sends them to the dashboard when the callback named %s",
    async (state) => {
      finishLoginAt(`?code=abc&state=${encodeURIComponent(state)}`);

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" }),
      );
    },
  );

  it("sends an account that has not finished its guided flow to finish it", async () => {
    account.requiresFirstLogin = true;

    finishLoginAt(`?code=abc&state=${encodeURIComponent("/jobplanner")}`);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/first-login" }),
    );
  });

  it("waits while a step is still outstanding", async () => {
    finishLoginAt("?code=abc&state=/jobplanner", [LOGIN_STEPS.CHARACTER_DATA]);

    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });
});
