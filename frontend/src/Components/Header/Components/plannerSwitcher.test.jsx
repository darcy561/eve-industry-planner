import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { activePlannerStoreState } from "../../../tests/utils.js";
import { testQueryClient } from "../../../tests/queryClients.js";

const storeState = activePlannerStoreState();

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const ensurePlannerViaApi = vi.fn();
vi.mock("../../../Functions/Endpoints/Private/planners.js", () => ({
  ensurePlannerViaApi: (...args) => ensurePlannerViaApi(...args),
}));

const sendActivePlanner = vi.fn();
vi.mock("../../../WebSocket/websocketClient.js", () => ({
  sendActivePlanner: (...args) => sendActivePlanner(...args),
}));

const flushPendingJobDocumentsSave = vi.fn();
vi.mock("../../../Functions/Debounce/jobDocumentsPersistSchedule.js", () => ({
  flushPendingJobDocumentsSave: (...args) =>
    flushPendingJobDocumentsSave(...args),
}));

const flushPendingGroupSave = vi.fn();
vi.mock("../../../Functions/Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: (...args) => flushPendingGroupSave(...args),
}));

const flushPendingPlannerSettingsSaves = vi.fn();
vi.mock(
  "../../../Functions/Debounce/plannerSettingsPersistSchedule.js",
  () => ({
    flushPendingPlannerSettingsSaves: (...args) =>
      flushPendingPlannerSettingsSaves(...args),
  }),
);

const loadPlannerDocuments = vi.fn();
vi.mock("../../../Functions/DocumentLoad/loadPlannerDocuments.js", () => ({
  loadPlannerDocuments: (...args) => loadPlannerDocuments(...args),
}));

const planners = [
  { owner: "account:acct-1", kind: "account", name: "", named: true },
  {
    owner: "corporation:98000001",
    kind: "corporation",
    name: "Karkur",
    named: true,
  },
];
vi.mock("../../../Hooks/React Query/planners.js", () => ({
  usePlannersQuery: () => ({
    data: planners,
    isLoading: false,
    isError: false,
  }),
  plannerDisplayName: (planner) => planner.name || "My planner",
}));

const { PlannerSwitcher } = await import("./plannerSwitcher.jsx");

function renderSwitcher() {
  const client = testQueryClient();
  render(
    <QueryClientProvider client={client}>
      <PlannerSwitcher />
    </QueryClientProvider>,
  );
  return client;
}

function chooseKarkur() {
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Karkur" }));
}

beforeEach(() => {
  storeState.activePlanner.owner = null;
  ensurePlannerViaApi.mockReset().mockResolvedValue({});
  sendActivePlanner.mockReset().mockReturnValue(true);
  flushPendingPlannerSettingsSaves.mockReset().mockResolvedValue(undefined);
  loadPlannerDocuments.mockReset().mockResolvedValue(true);
  flushPendingJobDocumentsSave.mockReset().mockResolvedValue(undefined);
  flushPendingGroupSave.mockReset().mockResolvedValue(undefined);
  storeState.jobData.pendingJobDocumentWrites = [];
  storeState.jobData.pendingJobGroupWrites = [];
});

describe("the planner switcher", () => {
  // The app works in the account's own planner before anything is chosen, so the
  // control has to show that rather than opening blank.
  it("shows the account's own planner before one is chosen", () => {
    renderSwitcher();

    expect(screen.getByRole("combobox")).toHaveTextContent("My planner");
  });

  it("shows the planner that was switched to", () => {
    storeState.activePlanner.owner = "corporation:98000001";

    renderSwitcher();

    expect(screen.getByRole("combobox")).toHaveTextContent("Karkur");
  });

  // Naming precedes switching: a planner with no document gets one, which is
  // what turns a corporation the account is merely in into one somebody opened.
  it("names a planner before switching to it", async () => {
    renderSwitcher();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Karkur" }));

    await waitFor(() =>
      expect(sendActivePlanner).toHaveBeenCalledWith("corporation:98000001"),
    );
    expect(ensurePlannerViaApi).toHaveBeenCalledWith("corporation:98000001");
    expect(ensurePlannerViaApi.mock.invocationCallOrder[0]).toBeLessThan(
      sendActivePlanner.mock.invocationCallOrder[0],
    );
  });

  // A switch the connection never received would leave the client reading one
  // planner and receiving another, so it is reported rather than assumed.
  it("reports a switch the connection did not take", async () => {
    sendActivePlanner.mockReturnValue(false);
    renderSwitcher();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Karkur" }));

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    // Scoped reads must not move to a planner the connection is not delivering.
    expect(storeState.activePlanner.owner).toBeNull();
  });

  // A queued job or group write names its planner on the request when it goes,
  // not when it was queued, so an edit inside its debounce window would be
  // written into the planner being switched to.
  it("writes pending job and group edits before the planner moves", async () => {
    renderSwitcher();

    chooseKarkur();

    await waitFor(() => expect(sendActivePlanner).toHaveBeenCalled());
    expect(
      flushPendingJobDocumentsSave.mock.invocationCallOrder[0],
    ).toBeLessThan(sendActivePlanner.mock.invocationCallOrder[0]);
    expect(flushPendingGroupSave.mock.invocationCallOrder[0]).toBeLessThan(
      sendActivePlanner.mock.invocationCallOrder[0],
    );
  });

  // The write's ids are still queued when it failed, and loading the new planner
  // clears that queue — so moving would lose the edit rather than delay it.
  it("refuses to switch while an edit is still unsaved", async () => {
    storeState.jobData.pendingJobDocumentWrites = ["job-1"];
    renderSwitcher();

    chooseKarkur();

    expect(
      await screen.findByText("Unsaved changes could not be saved"),
    ).toBeInTheDocument();
    expect(sendActivePlanner).not.toHaveBeenCalled();
    expect(storeState.activePlanner.owner).toBeNull();
  });

  // The entries under the planner being left are dropped, so switching straight
  // back re-reads its settings. A settings edit still inside its debounce window
  // has to reach the server before that read can happen, or the read lands first
  // and the pending write saves the server's own copy back over the edit.
  it("writes pending settings edits before dropping the planner's cached reads", async () => {
    const client = renderSwitcher();
    const removeQueries = vi.spyOn(client, "removeQueries");

    chooseKarkur();

    await waitFor(() => expect(removeQueries).toHaveBeenCalled());
    expect(
      flushPendingPlannerSettingsSaves.mock.invocationCallOrder[0],
    ).toBeLessThan(removeQueries.mock.invocationCallOrder[0]);
  });

  // The job store holds one planner at a time: without this the reader is left
  // looking at the jobs and groups of the planner they just left.
  it("loads the planner it switched to", async () => {
    renderSwitcher();

    chooseKarkur();

    await waitFor(() =>
      expect(loadPlannerDocuments).toHaveBeenCalledWith("corporation:98000001"),
    );
  });

  it("drops nothing when the connection did not take the switch", async () => {
    sendActivePlanner.mockReturnValue(false);
    const client = renderSwitcher();
    const removeQueries = vi.spyOn(client, "removeQueries");

    chooseKarkur();

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(flushPendingPlannerSettingsSaves).not.toHaveBeenCalled();
    expect(removeQueries).not.toHaveBeenCalled();
    expect(loadPlannerDocuments).not.toHaveBeenCalled();
  });

  // The switch has already happened by the time the load runs, so "could not
  // switch" would be a lie: the planner moved and only its documents are missing.
  it("says the switch took when only the documents failed", async () => {
    loadPlannerDocuments.mockRejectedValue(new Error("Network down"));
    renderSwitcher();

    chooseKarkur();

    expect(
      await screen.findByText("Switched, but could not load this planner"),
    ).toBeInTheDocument();
  });

  // Choosing the planner again fires no change, because the control is already
  // showing it, so asking again has to be its own control.
  it("asks again for a planner whose documents failed", async () => {
    loadPlannerDocuments.mockRejectedValue(new Error("Network down"));
    renderSwitcher();

    chooseKarkur();
    const retry = await screen.findByRole("button", { name: "Retry" });
    // It is held while the load it offers is still running, and a click on a
    // disabled control is swallowed rather than reported.
    await waitFor(() => expect(retry).toBeEnabled());
    loadPlannerDocuments.mockResolvedValue(true);
    fireEvent.click(retry);

    await waitFor(() => expect(loadPlannerDocuments).toHaveBeenCalledTimes(2));
    expect(loadPlannerDocuments).toHaveBeenLastCalledWith(
      "corporation:98000001",
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull(),
    );
  });

  it("offers nothing to retry when the planner loaded", async () => {
    renderSwitcher();

    chooseKarkur();

    await waitFor(() => expect(loadPlannerDocuments).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("reports a planner it could not name", async () => {
    ensurePlannerViaApi.mockRejectedValue(new Error("Refused"));
    renderSwitcher();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Karkur" }));

    expect(await screen.findByText("Refused")).toBeInTheDocument();
    expect(sendActivePlanner).not.toHaveBeenCalled();
  });
});
