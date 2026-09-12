import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { calls } = vi.hoisted(() => ({
  calls: {
    fullEveLogin: vi.fn(),
    runAppLogin: vi.fn(),
    resume: vi.fn(),
    importWindow: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));

vi.mock("../../../Functions/Auth/plannerSessionRedirect.js", () => ({
  redirectToFullEveLogin: (...args) => calls.fullEveLogin(...args),
}));

vi.mock("../../../Functions/Auth/appLoginFlow.js", () => ({
  runAppLogin: (...args) => calls.runAppLogin(...args),
}));

vi.mock("../../../Functions/Auth/resumeStoredSession.js", () => ({
  resumeStoredSession: (...args) => calls.resume(...args),
}));

vi.mock("../additionalAccountImport.js", () => ({
  tryCompleteAdditionalAccountImportWindow: (...args) =>
    calls.importWindow(...args),
}));

const { useAuthUrlLogin } = await import("./useAuthUrlLogin.js");

function Mounted() {
  useAuthUrlLogin();
  return null;
}

function arriveAt(search) {
  window.history.pushState({}, "", `/auth${search}`);
  return render(<Mounted />);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.importWindow.mockResolvedValue(false);
  calls.resume.mockResolvedValue("no-session");
  calls.runAppLogin.mockResolvedValue(undefined);
});

describe("arriving at the callback", () => {
  it("completes a login when EVE returned a code", async () => {
    arriveAt("?code=abc123&state=/jobplanner");

    await waitFor(() =>
      expect(calls.runAppLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: { type: "oauthCode", authCode: "abc123" },
        }),
      ),
    );
    expect(calls.fullEveLogin).not.toHaveBeenCalled();
  });

  it("rebuilds a stored session when there is no code", async () => {
    calls.resume.mockResolvedValue("rebuilt");

    arriveAt("?state=/jobplanner");

    await waitFor(() => expect(calls.resume).toHaveBeenCalled());
    expect(calls.fullEveLogin).not.toHaveBeenCalled();
  });

  // Only a rebuilt session means the reader is in. Every other outcome has to reach
  // EVE, which is what a truthiness check on the outcome quietly stops happening.
  it.each(["no-session", "failed"])(
    "sends them to EVE when the resume answers %s",
    async (outcome) => {
      calls.resume.mockResolvedValue(outcome);

      arriveAt("?state=/jobplanner");

      await waitFor(() =>
        expect(calls.fullEveLogin).toHaveBeenCalledWith("/jobplanner"),
      );
    },
  );

  // The guard sends a reader here from the page they actually asked for, and names it
  // in `state`. Leaving without it would carry `/auth`, which is nowhere to be put
  // back, so signing in would land them on the default.
  it("carries where they were headed into the sign-in", async () => {
    arriveAt(`?state=${encodeURIComponent("/settings?tab=alerts")}`);

    await waitFor(() =>
      expect(calls.fullEveLogin).toHaveBeenCalledWith("/settings?tab=alerts"),
    );
  });

  it("hands an additional-account window its own handling", async () => {
    calls.importWindow.mockResolvedValue(true);

    arriveAt("?code=abc123&state=additional:nonce-1");

    await waitFor(() =>
      expect(calls.importWindow).toHaveBeenCalledWith(
        "additional:nonce-1",
        "abc123",
      ),
    );
    expect(calls.runAppLogin).not.toHaveBeenCalled();
    expect(calls.fullEveLogin).not.toHaveBeenCalled();
  });
});
