import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

let sources = [];

vi.mock("../../../../Hooks/Static/useMarketSources", () => ({
  useMarketSources: () => sources,
}));

const summariseMarket = vi.fn();
// Only the summarising is stood in for. `visibleBrokerFee` is the rule about
// which markets have a rate of their own, and the frame is meant to draw the
// same answer as the summary rather than a stub of it.
vi.mock("./marketSummary", async (original) => ({
  ...(await original()),
  summariseMarket: (...args) => summariseMarket(...args),
}));

vi.mock("../../../../Hooks/React Query/plannerSettings", () => ({
  usePlannerSettingsForOwners: () => ({ isLoading: false }),
}));

const { testQueryClient } = await import("../../../../tests/queryClients.js");
const { default: useUsersStore } =
  await import("../../../../Zustand/usersStore.js");
const { default: MarketLocationsFrame } =
  await import("./marketLocationsFrame.jsx");

const jita = {
  id: "jita",
  name: "Jita",
  stationID: 60003760,
  kind: "hub",
};

const azbel = {
  id: "market-1",
  name: "Perimeter Azbel",
  structureID: 1035466617946,
  brokerFee: 2.5,
  kind: "citadel",
};

const CORPORATION = "corporation:98000001";

const shared = { ...azbel, sharedBy: CORPORATION, sharedWithMembers: true };

/** Holds an organisation's settings, as a completed read does. */
function holdSettingsFor(owner) {
  act(() => {
    useUsersStore
      .getState()
      .plannerSettings.actions.setPlannerSettings(owner, {}, true);
  });
}

function show() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MarketLocationsFrame />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sources = [];
  useUsersStore.getState().plannerSettings.actions.resetPlannerSettingsStore();
  summariseMarket.mockReset().mockResolvedValue({
    id: "market-1",
    name: "Perimeter Azbel",
    lastReadAt: undefined,
    readHere: true,
    brokerFee: 2.5,
  });
});

describe("managing the markets a reader prices against", () => {
  // Saying nothing would read as a panel that failed to load. Saying what
  // happens instead tells them they need do nothing.
  it("says what pricing does when a reader has saved none", () => {
    // The hubs are always there and are not a reader's to manage, so a reader
    // with only those has saved none.
    sources = [jita];

    show();

    expect(
      screen.getByText(/no markets saved, so jobs are priced against/i),
    ).toBeTruthy();
  });

  // The moment a market was last read is a disk read away. A panel that waited
  // for it would show nothing at all while it settled.
  it("shows a market before it has been asked when it was last read", () => {
    sources = [jita, azbel];

    show();

    expect(screen.getByText("Perimeter Azbel")).toBeTruthy();
    expect(screen.getByText("Citadel")).toBeTruthy();
  });

  it("fills the moment in once it has been asked", async () => {
    sources = [jita, azbel];
    summariseMarket.mockResolvedValue({
      id: "market-1",
      name: "Perimeter Azbel",
      lastReadAt: Date.now() - 20 * 60 * 1000,
      readHere: true,
      brokerFee: 2.5,
    });

    show();

    expect(await screen.findByText(/20 minutes ago/)).toBeTruthy();
  });

  // Nothing a reader can act on is missing, so a disk that will not answer is
  // not worth a panel saying so.
  it("stands without the moments when they cannot be read", async () => {
    sources = [jita, azbel];
    summariseMarket.mockRejectedValue(new Error("storage is blocked"));

    show();

    expect(await screen.findByText("Not read on this device")).toBeTruthy();
  });

  // The write needs the owner's own lane to apply a change to, and the composed
  // row is not it.
  it("offers nothing to open on an organisation's market it has not read", () => {
    sources = [jita, shared];
    summariseMarket.mockResolvedValue({
      id: "market-1",
      name: "Perimeter Azbel",
      readHere: true,
      brokerFee: 2.5,
      sharedBy: CORPORATION,
    });

    show();

    expect(
      screen.queryByRole("button", { name: /settings for Perimeter Azbel/ }),
    ).toBeNull();
  });

  // The settings of every owner in the list are read as the panel mounts, and
  // they land after the rows have been summarised. Whether a row can be changed
  // is therefore decided as the panel draws rather than fixed when the summary
  // is taken — one fixed then would stay uneditable until the reader left the
  // tab and came back.
  it("opens an organisation's market once its settings arrive", async () => {
    sources = [jita, shared];
    summariseMarket.mockResolvedValue({
      id: "market-1",
      name: "Perimeter Azbel",
      lastReadAt: Date.now() - 20 * 60 * 1000,
      readHere: true,
      brokerFee: 2.5,
      sharedBy: CORPORATION,
    });

    show();
    // The moment only appears once the summary has been taken, so waiting for
    // it is what puts the settings strictly after it.
    expect(await screen.findByText(/20 minutes ago/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /settings for Perimeter Azbel/ }),
    ).toBeNull();

    holdSettingsFor(CORPORATION);

    expect(
      await screen.findByRole("button", {
        name: /settings for Perimeter Azbel/,
      }),
    ).toBeTruthy();
  });
});
