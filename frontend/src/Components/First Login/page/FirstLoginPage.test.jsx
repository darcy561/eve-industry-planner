import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FirstLoginPage from "./FirstLoginPage";
import { FIRST_LOGIN_STEPS } from "./firstLoginConstants";

const navigate = vi.fn();
const setHasCompletedFirstLoginFlow = vi.fn();
const setIsFirstTimeLogin = vi.fn();
const flushPendingUserDocumentSaves = vi.fn(async () => {});
const saveUserAccountDocument = vi.fn(async () => true);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: {
        actions: {
          setHasCompletedFirstLoginFlow,
          setIsFirstTimeLogin,
        },
      },
    }),
  },
}));

vi.mock("../../../Functions/Debounce/userDocumentsPersistSchedule", () => ({
  flushPendingUserDocumentSaves: (...args) =>
    flushPendingUserDocumentSaves(...args),
}));

vi.mock("../../../Functions/Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: (...args) => saveUserAccountDocument(...args),
}));

// The three steps stand in for themselves: this file covers the shell that
// moves between them, and each step is tested beside its own component.
vi.mock("../planner-setup/FirstLoginPlannerSetupStep", () => ({
  FirstLoginPlannerSetupStep: () => <div>planner setup step</div>,
}));
vi.mock("../accounts/FirstLoginAccountsStep", () => ({
  FirstLoginAccountsStep: () => <div>accounts step</div>,
}));
vi.mock("../support/FirstLoginSupportStep", () => ({
  FirstLoginSupportStep: () => <div>support step</div>,
}));

/** Steps swap through a CSSTransition, so the arriving one is awaited. */
async function expectStep(text) {
  expect(await screen.findByText(text)).toBeInTheDocument();
}

describe("the first login page shell", () => {
  beforeEach(() => {
    saveUserAccountDocument.mockResolvedValue(true);
  });

  it("welcomes the player and names every step of the flow", () => {
    render(<FirstLoginPage />);

    expect(
      screen.getByText("Welcome to Eve Industry Planner"),
    ).toBeInTheDocument();
    for (const label of FIRST_LOGIN_STEPS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("opens on the first step, with no way back from it", () => {
    render(<FirstLoginPage />);

    expect(screen.getByText("planner setup step")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  // eslint-disable-next-line vitest/expect-expect -- asserts through expectStep
  it("walks forward through the steps and back again", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPage />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await expectStep("accounts step");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await expectStep("support step");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await expectStep("accounts step");
  });

  it("offers Finish Setup only on the last step", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPage />);

    expect(
      screen.queryByRole("button", { name: "Finish Setup" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await expectStep("support step");

    expect(
      screen.getByRole("button", { name: "Finish Setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  async function reachFinish(user) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await expectStep("support step");
    return screen.getByRole("button", { name: "Finish Setup" });
  }

  it("marks the flow complete, flushes pending saves and leaves for the dashboard", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPage />);

    await user.click(await reachFinish(user));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" }),
    );
    expect(setHasCompletedFirstLoginFlow).toHaveBeenCalledWith(true);
    expect(setIsFirstTimeLogin).toHaveBeenCalledWith(false);
    expect(flushPendingUserDocumentSaves).toHaveBeenCalled();
  });

  it("keeps the player on the flow when the save fails, and lets them try again", async () => {
    const user = userEvent.setup();
    saveUserAccountDocument.mockResolvedValue(false);
    render(<FirstLoginPage />);

    const finish = await reachFinish(user);
    await user.click(finish);

    await waitFor(() => expect(finish).toBeEnabled());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("support step")).toBeInTheDocument();
  });
});
