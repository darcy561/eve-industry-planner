import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

/**
 * A station's broker fee, from the ESI reads through to the figure on screen.
 *
 * Every other test on this path fakes one of the layers: the cached accessors,
 * the rate hooks, or the queries. Standings have now been reported wrong twice
 * for reasons no unit test could see — a lookup keyed on the wrong id, then a
 * subscription that started for the wrong character — so this fakes only what
 * leaves the browser and runs the real query layer, the real enable gate, and
 * the real rate arithmetic.
 */

const fetched = [];

vi.mock("../../../../../../Functions/EveESI/fetchWithCustomHeaders", () => ({
  // The queries read the rate-limit bucket from this module before fetching, so
  // the mock has to carry it as well as the fetch itself.
  getESIRateLimitStatus: () => null,
  default: async (url) => {
    fetched.push(url);

    const body = url.includes("/universe/names/")
      ? [
          { id: 500001, name: "Caldari State", category: "faction" },
          { id: 1000035, name: "Caldari Navy", category: "corporation" },
          { id: 500003, name: "Amarr Empire", category: "faction" },
          { id: 1000086, name: "Emperor Family", category: "corporation" },
        ]
      : url.includes("/standings/")
        ? [
            { from_id: 500001, from_type: "faction", standing: 8 },
            { from_id: 1000035, from_type: "npc_corp", standing: 5 },
            { from_id: 500003, from_type: "faction", standing: 2 },
          ]
        : url.includes("/skills/")
          ? {
              skills: [
                {
                  skill_id: 3446,
                  active_skill_level: 5,
                  trained_skill_level: 5,
                },
              ],
            }
          : url.includes("/universe/races/")
            ? [
                { race_id: 1, alliance_id: 500001, name: "Caldari" },
                { race_id: 4, alliance_id: 500003, name: "Amarr" },
              ]
            : url.includes("/universe/stations/60008494")
              ? // Amarr VIII: built by Amarr (race 4), owned by Emperor Family.
                { race_id: 4, owner: 1000086, station_id: 60008494 }
              : url.includes("/universe/stations/")
                ? // Jita 4-4: built by Caldari (race 1), owned by Caldari Navy.
                  { race_id: 1, owner: 1000035, station_id: 60003760 }
                : {};

    return {
      ok: true,
      status: 200,
      headers: { get: () => "etag" },
      json: async () => body,
    };
  },
}));

vi.mock("../../../../../../Functions/Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: async () => ({ accessToken: "token" }),
}));

const SELLER = {
  CharacterHash: "seller-hash",
  CharacterID: 90000001,
  CharacterName: "Market Alt",
};

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: {
      isLoggedIn: true,
      characters: [SELLER],
      actions: {
        findCharacterByHash: () => SELLER,
        getMainCharacter: () => SELLER,
      },
    },
    applicationSettings: {
      defaultMarketCharacter: SELLER.CharacterHash,
      actions: { getCurrentLocale: () => "en-GB" },
    },
  });
});

const { queryClient } = await import("../../../../../../queryClient");
const { TRANQUILITY_SERVER_STATUS_QUERY_KEY } =
  await import("../../../../../../Hooks/React Query/tranquilityServerStatus");
const { useSellingRates } =
  await import("../../../../../../Hooks/React Query/Character/useSellingRates");
const { resolveSaleLocation, getDefaultSaleStructure } =
  await import("../../../../../../Functions/MarketOrders/saleLocations");
const { default: SaleLocationRates } = await import("./saleLocationRates");

function Block({ locationID }) {
  const saleLocation = resolveSaleLocation(locationID, "jita");
  const { data: rates, isLoading } = useSellingRates(
    saleLocation,
    SELLER.CharacterHash,
  );

  return (
    <SaleLocationRates
      saleLocation={saleLocation}
      rates={rates}
      isLoading={isLoading}
      seller={{
        hash: SELLER.CharacterHash,
        name: SELLER.CharacterName,
        isDefault: false,
      }}
    />
  );
}

/* eslint-disable testing-library/prefer-screen-queries -- see below: these
   queries are scoped on purpose, and `screen` is the thing being avoided. */
// Scoped to its own container: two renders in one file otherwise both answer a
// document-wide query, and a figure from the previous case reads as this one's.
const show = (locationID) =>
  within(
    render(
      <QueryClientProvider client={queryClient}>
        <Block locationID={locationID} />
      </QueryClientProvider>,
    ).container,
  );

beforeEach(() => {
  fetched.length = 0;
  queryClient.clear();
  // The gate every ESI query passes: signed in, and Tranquility known to be up.
  queryClient.setQueryData(TRANQUILITY_SERVER_STATUS_QUERY_KEY, {
    online: true,
    playerCount: 1,
  });
});

describe("a station's broker fee, end to end", () => {
  it("asks ESI for the seller's standings", async () => {
    show("jita");

    show("jita");

    await waitFor(() =>
      expect(fetched.some((url) => url.includes("/standings/"))).toBe(true),
    );
  });

  it("takes both standings off the rate", async () => {
    const block = show("jita");

    // 3% base, less 1.5 for Broker Relations V, less 0.03x8 of faction standing
    // and 0.02x5 of corporation standing.
    expect(await block.findByText("1.16%")).toBeInTheDocument();
  });

  it("names the standings behind the reduction rather than saying there are none", async () => {
    const block = show("jita");

    expect(
      await block.findByText("8.00 with Caldari State"),
    ).toBeInTheDocument();
    expect(block.getByText("5.00 with Caldari Navy")).toBeInTheDocument();
    expect(block.queryByText(/could not be read/)).not.toBeInTheDocument();
  });
});

// The list offers NPC stations as well as citadels, and the one chosen is not
// always the hub the materials are priced against. The fee has to come from the
// station picked — its own faction and its own owner.
describe("choosing an NPC station other than the pricing hub", () => {
  it("quotes the chosen station's standings, not the pricing hub's", async () => {
    const block = show("amarr");

    // Amarr Empire standing 2 at 0.03, and nothing with Emperor Family:
    // 3 - 1.5 - 0.06 = 1.44%.
    expect(await block.findByText("1.44%")).toBeInTheDocument();
    expect(block.getByText("2.00 with Amarr Empire")).toBeInTheDocument();
    // Named and stated as the zero it read, so a reader can tell this from a
    // lookup pointed at the wrong entity, and from one that failed.
    expect(block.getByText("0.00 with Emperor Family")).toBeInTheDocument();
    expect(block.queryByText("could not be read")).not.toBeInTheDocument();
  });

  it("asks for the chosen station rather than the hub", async () => {
    show("amarr");

    await waitFor(() =>
      expect(
        fetched.some((url) => url.includes("/universe/stations/60008494")),
      ).toBe(true),
    );
    expect(fetched.some((url) => url.includes("60003760"))).toBe(false);
  });
});

// The reported flow: the block opens on the account's default citadel, whose fee
// is a flat rate with no working, and the player changes it to an NPC station.
// A citadel's terms are empty, so the switch has to produce a fresh set — a
// stale empty one reads as a seller with no standings anywhere.
describe("switching from the default citadel to an NPC station", () => {
  function Switchable() {
    const [plan, setPlan] = useState({ saleLocationID: null });
    const saleLocation = resolveSaleLocation(
      plan.saleLocationID ?? getDefaultSaleStructure()?.id,
      "jita",
    );
    const { data: rates, isLoading } = useSellingRates(
      saleLocation,
      SELLER.CharacterHash,
    );

    return (
      <SaleLocationRates
        saleLocation={saleLocation}
        rates={rates}
        isLoading={isLoading}
        plan={plan}
        onPlanChange={(next) => setPlan((p) => ({ ...p, ...next }))}
        seller={{
          hash: SELLER.CharacterHash,
          name: SELLER.CharacterName,
          isDefault: false,
        }}
      />
    );
  }

  it("shows the station's standings once it is chosen", async () => {
    const block = within(
      render(
        <QueryClientProvider client={queryClient}>
          <Switchable />
        </QueryClientProvider>,
      ).container,
    );

    // Opens on the citadel: its owner's rate, with no working behind it.
    expect(await block.findByText("1.50%")).toBeInTheDocument();

    await userEvent.click(block.getByLabelText("Where this job sells from"));
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Jita"),
    );

    expect(
      await block.findByText("8.00 with Caldari State"),
    ).toBeInTheDocument();
    expect(block.getByText("5.00 with Caldari Navy")).toBeInTheDocument();
  });
});
