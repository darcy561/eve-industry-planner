import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

/**
 * Switching planner, from the click to what the store is left holding.
 *
 * The pieces either side are covered — the endpoints by Go tests, the loader's
 * races by unit tests — while the chain between them is not, and it is where
 * this has gone wrong twice: which planner a queued write names when it finally
 * goes, and whether the jobs left in the store belong to the planner on screen.
 * Only the network is faked here; the header, the endpoint modules, the store
 * actions and the merge are all the real ones.
 */

const OWN = "account:acct-1";
const CORP = "corporation:98000001";

/** Every request the app made, in order, with the planner it named. */
const sent = [];

const state = await buildState();

vi.mock("../../../Zustand/usersStore.js", () => storeModule());
vi.mock("../../../Zustand/usersStore", () => storeModule());

vi.mock("../../../WebSocket/websocketClient.js", () => ({
  // Stands in for the socket only: the real one writes the planner into the
  // store exactly like this once the connection has taken it.
  sendActivePlanner: (owner) => {
    state.activePlanner.actions.setActivePlannerOwner(owner);
    return true;
  },
}));
vi.mock("../../../WebSocket/wsClientIdentity.js", () => ({
  getWsClientID: () => null,
}));
vi.mock(
  "../../../Functions/Auth/tabSessionStorage.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    getTabPlannerSessionID: () => "session-1",
    tabPlannerSessionRequestHeaders: () => ({ "X-Session-ID": "session-1" }),
  }),
);
vi.mock("../../../Hooks/React Query/planners.js", () => ({
  usePlannersQuery: () => ({
    data: [
      { owner: OWN, kind: "account", name: "", named: true },
      { owner: CORP, kind: "corporation", name: "Karkur", named: true },
    ],
    isLoading: false,
    isError: false,
  }),
  plannerDisplayName: (planner) => planner.name || "My planner",
}));

function storeModule() {
  const read = () => state;
  return {
    default: Object.assign(
      (selector) =>
        typeof selector === "function" ? selector(read()) : read(),
      { getState: read },
    ),
  };
}

/** The harness state, with the real job-store actions wired onto it. */
async function buildState() {
  const { usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  const { coreActions, groupManagementActions, jobDocumentPersistenceActions } =
    await import("../../../Zustand/jobsSlice/index.js");
  const { activePlannerActions } =
    await import("../../../Zustand/activePlanner/actions.js");

  const built = usersStoreState({
    account: { isLoggedIn: true, accountID: "acct-1" },
  });
  const set = (updater) => {
    Object.assign(
      built,
      typeof updater === "function" ? updater(built) : updater,
    );
  };
  const get = () => built;
  // The harness wires the planner actions to a `set` that goes nowhere, which is
  // right for a test that only reads them and wrong here: naming the planner has
  // to actually move the store, or every scoped read after it is for the old one.
  built.activePlanner.actions = activePlannerActions(set, get);
  built.jobData.actions = {
    ...built.jobData.actions,
    ...coreActions(set, get),
    ...groupManagementActions(set, get),
    ...jobDocumentPersistenceActions(set, get),
  };
  return built;
}

function jobRow(jobID) {
  return { jobID, name: jobID, displayOnPlanner: true, itemID: 34 };
}

/** A real Response: the transport clones and reads it before the caller sees it. */
function respond(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const { PlannerSwitcher } = await import("./plannerSwitcher.jsx");

beforeEach(() => {
  sent.length = 0;
  state.activePlanner.owner = null;
  state.jobData.owner = OWN;
  state.jobData.jobArray = [];
  state.jobData.groupArray = [];
  state.jobData.pendingJobDocumentWrites = [];
  state.jobData.pendingJobGroupWrites = [];

  global.fetch = vi.fn(async (url, options = {}) => {
    const path = String(url).replace(window.location.origin, "");
    sent.push({
      path,
      method: options.method ?? "GET",
      owner: options.headers?.["X-Planner-Owner"],
    });
    if (path.startsWith("/api/v1/job-documents/planner")) {
      return respond([jobRow("corp-job")]);
    }
    if (path.startsWith("/api/v1/groups")) return respond([]);
    return respond({});
  });
});

function renderSwitcher() {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <PlannerSwitcher />
    </QueryClientProvider>,
  );
}

function chooseKarkur() {
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Karkur" }));
}

describe("switching planner, end to end", () => {
  it("leaves the store holding the planner that was chosen", async () => {
    state.jobData.jobArray = [
      { jobID: "own-job", displayOnPlanner: true },
      { jobID: "own-grouped", displayOnPlanner: false },
    ];

    renderSwitcher();
    chooseKarkur();

    await waitFor(() => expect(state.jobData.owner).toBe(CORP));
    expect(state.jobData.jobArray.map((j) => j.jobID)).toEqual(["corp-job"]);
  });

  it("asks for the documents under the planner it switched to", async () => {
    renderSwitcher();
    chooseKarkur();

    await waitFor(() => expect(state.jobData.owner).toBe(CORP));
    const documents = sent.filter(
      (r) =>
        r.path.startsWith("/api/v1/job-documents/planner") ||
        r.path.startsWith("/api/v1/groups"),
    );
    expect(documents).toHaveLength(2);
    for (const request of documents) expect(request.owner).toBe(CORP);
  });

  // The write names its planner when it goes, not when it was queued, so this is
  // the one that catches a flush moved to the wrong side of the switch.
  it("sends a queued edit under the planner it was made in", async () => {
    state.jobData.jobArray = [{ jobID: "own-job", displayOnPlanner: true }];
    state.jobData.actions.queueJobDocumentWrites(["own-job"]);

    renderSwitcher();
    chooseKarkur();

    await waitFor(() => expect(state.jobData.owner).toBe(CORP));
    const put = sent.find(
      (r) => r.path === "/api/v1/job-documents" && r.method === "PUT",
    );
    expect(put).toBeDefined();
    expect(put.owner).toBe(OWN);
  });
});
