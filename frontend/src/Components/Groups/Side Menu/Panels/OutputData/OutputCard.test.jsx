import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../../../../tests/routerHarness";
import seedPrices, {
  clearSeededPrices,
} from "../../../../../tests/seedPrices.js";

vi.mock("../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        activeGroupID: "group-1",
        actions: { findJobInJobArray: () => undefined },
      },
      applicationSettings: {
        defaultPricing: {
          buying: { market: "jita", orderType: "sell" },
          selling: { market: 60003760, orderType: "sell" },
        },
        actions: { getCurrentLocale: () => "en-GB" },
      },
      worldData: { marketData: {} },
    }),
  );
});

vi.mock("../../../../../Styled Components/Item/marketActions", () => ({
  default: () => null,
}));

const { default: OutputJobCard } = await import("./OutputCard.jsx");

const job = {
  jobID: "job-9",
  itemID: 587,
  name: "Rifter",
  itemsProducedPerRun: 10,
  build: {
    setup: { one: { id: "one", runCount: 1, jobCount: 1 } },
    materials: {},
    costs: {},
  },
};

function showCard(pageView, inputJob = job) {
  return renderWithRouter(
    <OutputJobCard
      inputJob={inputJob}
      state={{ highlightedItems: new Set(), pageView }}
      actions={{ setHighlightedItems: vi.fn() }}
    />,
  );
}

describe("a group's output card", () => {
  it("opens the job as a link carrying the group it was reached from", async () => {
    await showCard();

    expect(screen.getByRole("link", { name: /Rifter/ })).toHaveAttribute(
      "href",
      "/editjob/job-9?activeGroup=group-1",
    );
  });

  // The reader came from a particular view of the group and should land back in
  // it, so the view rides along in the link rather than being set on arrival.
  it("carries the group view the reader is looking at", async () => {
    await showCard("outputs");

    expect(screen.getByRole("link", { name: /Rifter/ })).toHaveAttribute(
      "href",
      "/editjob/job-9?activeGroup=group-1&pageView=outputs",
    );
  });
});

// The card prices the output through the same resolution every other surface
// uses, so a job that named its own market or overrode its own output's price
// has to be read at what it chose. Reading the account's market instead shows a
// figure from a market the job was never priced against, and nothing says so.
describe("what the card prices the output at", () => {
  afterEach(() => clearSeededPrices());

  const pricedAt = (build) => ({ ...job, build: { ...job.build, ...build } });

  beforeEach(() => {
    seedPrices({
      60003760: { 587: { sell: 100 } },
      amarr: { 587: { sell: 250 } },
    });
  });

  it("reads the account's market when the job chose nothing", async () => {
    await showCard(undefined, job);

    expect(
      screen.getByText(/Current Market Price: 100.00/),
    ).toBeInTheDocument();
  });

  it("reads the market the job chose for its selling side", async () => {
    await showCard(
      undefined,
      pricedAt({ localPricing: { selling: { market: "amarr" } } }),
    );

    expect(
      screen.getByText(/Current Market Price: 250.00/),
    ).toBeInTheDocument();
  });

  it("reads the output's own price override above either", async () => {
    await showCard(
      undefined,
      pricedAt({ materialPriceOverrides: { 587: { marketDisplay: "amarr" } } }),
    );

    expect(
      screen.getByText(/Current Market Price: 250.00/),
    ).toBeInTheDocument();
  });
});
