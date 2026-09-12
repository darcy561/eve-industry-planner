import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTheme, ThemeProvider } from "@mui/material/styles";

const { calls } = vi.hoisted(() => ({
  calls: {
    jobDocuments: vi.fn(),
    jobGroups: vi.fn(),
    watchlist: vi.fn(),
  },
}));

// Only the three fetches are stood in for: rendering the real component reaches
// the realtime layer, which reads other exports of these same modules.
vi.mock(
  "../../../Functions/Endpoints/Private/jobDocuments.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    fetchPlannerJobDocumentsFromApi: (...args) => calls.jobDocuments(...args),
  }),
);
vi.mock(
  "../../../Functions/Endpoints/Private/groups",
  async (importOriginal) => ({
    ...(await importOriginal()),
    fetchJobGroupsFromApi: (...args) => calls.jobGroups(...args),
  }),
);
vi.mock(
  "../../../Functions/Endpoints/Private/watchlistDeprecated.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    fetchWatchlistDeprecatedFromApi: (...args) => calls.watchlist(...args),
  }),
);

const { LOGIN_STEPS, emitLoginError, emitLoginStepComplete } =
  await import("../../../Events/loginEvents.js");
const { startLogin } = await import("../../../Functions/Auth/loginProgress.js");
const { UserLogInUI } = await import("./LoginUI.jsx");

const theme = createTheme();

function renderLogin() {
  return render(
    <ThemeProvider theme={theme}>
      <UserLogInUI />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.jobDocuments.mockResolvedValue(undefined);
  calls.jobGroups.mockResolvedValue(undefined);
  calls.watchlist.mockResolvedValue(undefined);
  startLogin();
});

describe("a login step that failed", () => {
  it("offers a retry the reader can press", async () => {
    renderLogin();
    emitLoginError(LOGIN_STEPS.GROUP_DATA, new Error("api down"));

    const retry = await screen.findByRole("button", {
      name: /Retry Building Group Data/i,
    });
    await userEvent.click(retry);

    await waitFor(() => expect(calls.jobGroups).toHaveBeenCalledTimes(1));
  });

  // The other steps' data is already in the store; re-fetching it is what the
  // page reload used to cost.
  it("re-runs only the step that failed", async () => {
    renderLogin();
    emitLoginError(LOGIN_STEPS.WATCHLIST_DATA, new Error("api down"));

    await userEvent.click(
      await screen.findByRole("button", {
        name: /Retry Building Watchlist Data/i,
      }),
    );

    await waitFor(() => expect(calls.watchlist).toHaveBeenCalledTimes(1));
    expect(calls.jobGroups).not.toHaveBeenCalled();
    expect(calls.jobDocuments).not.toHaveBeenCalled();
  });

  it("shows the step as done once the retry works", async () => {
    renderLogin();
    emitLoginError(LOGIN_STEPS.JOB_PLANNER, new Error("api down"));

    await userEvent.click(
      await screen.findByRole("button", {
        name: /Retry Building Job Planner/i,
      }),
    );

    // The step reports itself on success, which clears the error the alert reads.
    await waitFor(() =>
      expect(
        screen.queryByText(/Error in Job Planner/),
      ).not.toBeInTheDocument(),
    );
  });

  // A failed character step cannot be re-run on its own — the login response it
  // needs is gone — so it must not pretend to offer one.
  it("offers no per-step retry for character data", async () => {
    renderLogin();
    emitLoginError(LOGIN_STEPS.CHARACTER_DATA, new Error("api down"));

    expect(
      await screen.findByText(/Error in Character Data/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Retry Retrieving Character Data/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows no retry while every step is still running", () => {
    renderLogin();

    expect(screen.queryByRole("button", { name: /Retry/i })).toBeNull();
  });

  it("shows no retry on a step that completed", () => {
    renderLogin();
    emitLoginStepComplete(LOGIN_STEPS.GROUP_DATA);

    expect(
      screen.queryByRole("button", { name: /Retry Building Group Data/i }),
    ).toBeNull();
  });
});
