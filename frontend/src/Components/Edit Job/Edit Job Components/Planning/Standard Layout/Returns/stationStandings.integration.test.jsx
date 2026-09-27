import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

const fetched = [];

vi.mock("../../../../../../Functions/EveESI/fetchWithCustomHeaders", () => ({
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
              ? { race_id: 4, owner: 1000086, station_id: 60008494 }
              : url.includes("/universe/stations/")
                ? { race_id: 1, owner: 1000035, station_id: 60003760 }
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
      marketLocations: [
        {
          id: "citadelMarket-1",
          name: "Perimeter Azbel",
          structureID: 1035466617946,
          brokerFee: 1.5,
        },
      ],

      defaultPricing: { selling: { market: "citadelMarket-1" } },
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

/* eslint-disable testing-library/prefer-screen-queries */

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

describe("choosing an NPC station other than the pricing hub", () => {
  it("quotes the chosen station's standings, not the pricing hub's", async () => {
    const block = show("amarr");

    expect(await block.findByText("1.44%")).toBeInTheDocument();
    expect(block.getByText("2.00 with Amarr Empire")).toBeInTheDocument();

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
