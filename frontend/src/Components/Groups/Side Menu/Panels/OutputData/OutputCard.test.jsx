import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../../../../tests/routerHarness";

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
          buying: { market: "jita", basis: "sell" },
          selling: { market: 60003760, basis: "sell" },
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
  totalQuantityProduced: 10,
  build: { materials: [], costs: {} },
};

function showCard(pageView) {
  return renderWithRouter(
    <OutputJobCard
      inputJob={job}
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
