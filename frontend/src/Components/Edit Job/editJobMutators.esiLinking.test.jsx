import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import Group from "../../Classes/group";
import {
  editJobStore,
  esiIndustryJob,
  esiMarketOrder,
  editJobLocationNames,
  JITA_IV,
  linkedIndustryJob,
} from "../../tests/editJobFixtures";

const { store, readOnly } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
  useSiblingLinkLock: () => ({ readOnly: readOnly.current, reason: "" }),
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

/* What a sale costs in fees is worked out from skills, standings and the
 * structure's own rate; none of that is what these tests are about. */
vi.mock("../../Functions/MarketOrders/calcSellingCharges", () => ({
  default: vi.fn(async () => ({ brokersFee: 100, salesTax: 50 })),
}));

vi.mock("../../Functions/MarketOrders/findBrokersFeeEntry", () => ({
  default: vi.fn(() => ({ order_id: 700001, complete: true, amount: 100 })),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { AvailableJobsTab } =
  await import("./Edit Job Components/Building/StandardLayout/Tab Panel/availableJobs.jsx");
const { LinkedJobsTab } =
  await import("./Edit Job Components/Building/StandardLayout/Tab Panel/linkedJobs.jsx");
const { AvailableMarketOrdersTab } =
  await import("./Edit Job Components/Selling/Standard Layout/Market Order Panel/availableOrdersTab.jsx");
const { LinkedMarketOrdersTab } =
  await import("./Edit Job Components/Selling/Standard Layout/Market Order Panel/linkedMarketOrdersTab.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

// A job with room for one industry run, so the panel offers what ESI reported.
function jobWithOneSlot({ linkedJobs = [] } = {}) {
  return storedJob({
    jobStatus: 2,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: {},
        },
      },
      materials: [],
      childJobs: {},
      costs: { linkedJobs },
    },
  });
}

describe("linking the industry jobs ESI reported, end to end", () => {
  // Both panels link on a delay, so the whole block runs on fake timers rather
  // than each test turning them on and hoping it reaches the line that turns
  // them off.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links a job the reader picked, and remembers it to save", async () => {
    const { editJob } = renderOverEditJob(
      jobWithOneSlot(),
      ({ state, actions }) => (
        <AvailableJobsTab
          state={state}
          actions={actions}
          jobMatches={[esiIndustryJob(500001, { runs: 3 })]}
          isLoading={false}
          isError={false}
        />
      ),
    );

    expect(editJob.current.activeJob.esiJobIDs.has(500001)).toBe(false);

    // The card carries no name of its own; the runs it reports identify it.
    fireEvent.click(screen.getByText("3 Runs").closest(".MuiCard-root"));
    await act(async () => vi.advanceTimersByTime(1000));

    expect(editJob.current.activeJob.esiJobIDs.has(500001)).toBe(true);
    expect(editJob.current.esiDataToLink.industryJobs.add).toContain(500001);
  });

  it("unlinks a job the reader takes back off", async () => {
    const { editJob } = renderOverEditJob(
      jobWithOneSlot({ linkedJobs: [linkedIndustryJob(500001)] }),
      ({ state, actions }) => (
        <LinkedJobsTab
          state={state}
          actions={actions}
          isLoading={false}
          isError={false}
        />
      ),
    );
    expect(editJob.current.activeJob.esiJobIDs.has(500001)).toBe(true);

    // Unlinking is the same gesture as linking: the card itself.
    fireEvent.click(screen.getByText("3 Runs").closest(".MuiCard-root"));
    await act(async () => vi.advanceTimersByTime(1000));

    expect(editJob.current.activeJob.esiJobIDs.has(500001)).toBe(false);
    expect(editJob.current.esiDataToLink.industryJobs.remove).toContain(500001);
  });
});

describe("linking the market orders ESI reported, end to end", () => {
  it("links an order the reader picked, and remembers it to save", async () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => (
        <AvailableMarketOrdersTab
          state={state}
          actions={actions}
          itemOrderMatch={[esiMarketOrder(700001)]}
        />
      ),
    );

    fireEvent.click(screen.getByTestId("AddLinkIcon").closest("button"));

    // The fees are worked out before the order is linked, so the link lands a
    // tick later than the press.
    await waitFor(() =>
      expect(editJob.current.esiDataToLink.marketOrders.add).toContain(700001),
    );
    const orders = editJob.current.activeJob.build.sale.marketOrders;
    expect(orders.map((order) => order.order_id)).toContain(700001);
  });

  // The fee a sale was charged is linked with the order it belongs to, because
  // nothing else can work it out again afterwards.
  it("keeps the fee the order was charged", async () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => (
        <AvailableMarketOrdersTab
          state={state}
          actions={actions}
          itemOrderMatch={[esiMarketOrder(700001)]}
        />
      ),
    );

    fireEvent.click(screen.getByTestId("AddLinkIcon").closest("button"));

    await waitFor(() =>
      expect(editJob.current.activeJob.build.sale.brokersFee).toHaveLength(1),
    );
    // Which order it belongs to is the whole point of keeping it: nothing else
    // could work out afterwards what this sale was charged.
    const [fee] = editJob.current.activeJob.build.sale.brokersFee;
    expect(fee.belongsToOrder(700001)).toBe(true);
  });
});

/** The unlink control carries its tooltip's name on the span around it. */
function unlinkOrderButton() {
  return screen
    .getByLabelText("Unlink Order From Job.")
    .querySelector("button");
}

/** A job already selling through one linked market order. */
function sellingThroughOrder(order_id) {
  return storedJob({
    jobStatus: 4,
    build: {
      setup: {},
      materials: [],
      childJobs: {},
      sale: {
        marketOrders: [esiMarketOrder(order_id)],
        brokersFee: [{ order_id, complete: true, amount: 100 }],
        transactions: [],
      },
    },
  });
}

// A row used to read the names the store held at the moment it rendered, so a name that resolved
// afterwards never reached it. Both panels resolve through the names hook now.
describe("the places these panels name", () => {
  it("names where an offered order sits", () => {
    renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => (
        <AvailableMarketOrdersTab
          state={state}
          actions={actions}
          itemOrderMatch={[esiMarketOrder(700001)]}
        />
      ),
      { locationNames: editJobLocationNames },
    );

    expect(screen.getByText("Jita IV")).toBeTruthy();
  });

  it("names where a linked order sits", () => {
    renderOverEditJob(
      sellingThroughOrder(700001),
      ({ state, actions }) => (
        <LinkedMarketOrdersTab
          state={state}
          actions={actions}
          activeOrder={700001}
          updateActiveOrder={() => {}}
        />
      ),
      { locationNames: editJobLocationNames },
    );

    expect(screen.getByText("Jita IV")).toBeTruthy();
  });

  // The facility, not the station holding it: ESI reports both, and they are different places.
  it("names the facility an offered industry job is running in", () => {
    renderOverEditJob(
      jobWithOneSlot(),
      ({ state, actions }) => (
        <AvailableJobsTab
          state={state}
          actions={actions}
          jobMatches={[esiIndustryJob(500001, { runs: 3 })]}
          isLoading={false}
          isError={false}
        />
      ),
      { locationNames: editJobLocationNames },
    );

    expect(screen.getByText("Abbey Raitaru")).toBeTruthy();
  });

  // The names map carries an id ESI answered about and had no name for, and such an entry has no
  // `name` at all. A row testing the entry rather than the name renders nothing at all.
  it("says a linked job's facility is unknown when nothing could name it", () => {
    renderOverEditJob(
      jobWithOneSlot({ linkedJobs: [linkedIndustryJob(500001)] }),
      ({ state, actions }) => (
        <LinkedJobsTab
          state={state}
          actions={actions}
          isLoading={false}
          isError={false}
        />
      ),
      // ESI answered about the facility and had no name for it, so the entry carries no `name`.
      { locationNames: { [JITA_IV]: { resolutionStatus: "unnamed" } } },
    );

    expect(screen.getByText("Unknown Location")).toBeTruthy();
  });

  it("names where a linked industry job is running", () => {
    renderOverEditJob(
      jobWithOneSlot({ linkedJobs: [linkedIndustryJob(500001)] }),
      ({ state, actions }) => (
        <LinkedJobsTab
          state={state}
          actions={actions}
          isLoading={false}
          isError={false}
        />
      ),
      { locationNames: editJobLocationNames },
    );

    expect(screen.getByText("Jita IV")).toBeTruthy();
  });
});

describe("unlinking a market order, end to end", () => {
  it("takes the order off the job and remembers it to save", () => {
    const { editJob } = renderOverEditJob(
      sellingThroughOrder(700001),
      ({ state, actions }) => (
        <LinkedMarketOrdersTab
          state={state}
          actions={actions}
          activeOrder={700001}
          updateActiveOrder={() => {}}
        />
      ),
    );
    expect(editJob.current.activeJob.build.sale.marketOrders).toHaveLength(1);

    fireEvent.click(unlinkOrderButton());

    expect(editJob.current.activeJob.build.sale.marketOrders).toHaveLength(0);
    expect(editJob.current.esiDataToLink.marketOrders.remove).toContain(700001);
  });

  // The fee belonged to that order, so it goes with it — nothing else would
  // ever clear it.
  it("takes the order's fee with it", () => {
    const { editJob } = renderOverEditJob(
      sellingThroughOrder(700001),
      ({ state, actions }) => (
        <LinkedMarketOrdersTab
          state={state}
          actions={actions}
          activeOrder={700001}
          updateActiveOrder={() => {}}
        />
      ),
    );

    fireEvent.click(unlinkOrderButton());

    expect(editJob.current.activeJob.build.sale.brokersFee).toHaveLength(0);
  });
});
