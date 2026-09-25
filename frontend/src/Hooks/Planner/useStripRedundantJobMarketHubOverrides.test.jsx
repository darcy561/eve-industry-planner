import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { store } = vi.hoisted(() => ({ store: { defaultPricing: {} } }));

vi.mock("../../Zustand/usersStore.js", () => ({
  default: (selector) => selector({ applicationSettings: store }),
}));

const { useStripRedundantJobMarketHubOverrides } =
  await import("./useStripRedundantJobMarketHubOverrides.js");

const update = vi.fn();

const empty = { market: null, orderType: null };

/** A job's override always carries both sides, as `jobPricingOverride` builds it. */
const strip = (jobPricing) =>
  renderHook(() =>
    useStripRedundantJobMarketHubOverrides(
      jobPricing && { buying: empty, selling: empty, ...jobPricing },
      update,
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.defaultPricing = {
    buying: { market: "jita", orderType: "sell" },
    selling: { market: "jita", exit: "listed" },
  };
});

describe("dropping a job override that says what the account already says", () => {
  it("leaves a job that has chosen nothing alone", () => {
    strip(undefined);

    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a choice that differs from the account", () => {
    strip({ buying: { market: "amarr", orderType: null } });

    expect(update).not.toHaveBeenCalled();
  });

  it("drops a choice that matches the account", () => {
    strip({ buying: { market: "jita", orderType: null } });

    expect(update).toHaveBeenCalledWith({ localPricing: null });
  });

  // Every run of the effect would otherwise write the same values back.
  it("writes nothing when there is nothing to drop", () => {
    strip({ buying: { market: "amarr", orderType: null } });

    expect(update).not.toHaveBeenCalled();
  });

  it("judges each side against its own default", () => {
    store.defaultPricing.selling = { market: "amarr", exit: "listed" };

    strip({
      buying: { market: "jita", orderType: null },
      selling: { market: "hek", orderType: null },
    });

    expect(update).toHaveBeenCalledWith({
      localPricing: {
        buying: { market: null, orderType: null },
        selling: { market: "hek", orderType: null },
      },
    });
  });

  // The selling side stores a route and derives its order type from it, so an
  // account answering `exit` alone must not read as answering nothing. Taking
  // the default order type instead would strip a reader's deliberate choice and
  // silently price the sale from the other side of the market.
  it("derives the selling default from the route the account named", () => {
    store.defaultPricing.selling = { market: "jita", exit: "immediate" };

    strip({ selling: { market: null, orderType: "sell" } });

    expect(update).not.toHaveBeenCalled();
  });

  it("drops a selling order type the account's route already implies", () => {
    store.defaultPricing.selling = { market: "jita", exit: "immediate" };

    strip({ selling: { market: null, orderType: "buy" } });

    expect(update).toHaveBeenCalledWith({ localPricing: null });
  });
});
