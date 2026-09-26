import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const SAVED_STATION = 60004588;

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedStation } =
    await import("../../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    savedStation({ id: "saved-market", stationID: SAVED_STATION }),
  );
});

const { queryClient } = await import("../../../queryClient.js");
const { resetPriceLoader } = await import("./priceLoader.js");
const { readMarketPriceForType, readPriceRefreshedAt } =
  await import("./marketPriceForType.js");
const { readHeldRefreshTime, revalidateMarketRefreshTimes } =
  await import("./priceCache.js");
const { useMarketPricesQuery } =
  await import("../../../Hooks/React Query/World/marketPrices.js");

const WALKED_AT = 1757000000000;

const RETRY_WAIT = { timeout: 6000 };

function apiResponse(sources, adjusted = null) {
  return new Response(JSON.stringify({ sources, adjusted }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function apiRefusal(status = 503) {
  return new Response(JSON.stringify({ error: "unavailable" }), { status });
}

const priced = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell - 2,
  sellP05: sell + 1,
});

function Subject({ wants }) {
  const { isLoading, isError } = useMarketPricesQuery(wants);
  if (isLoading) return <p>pricing</p>;
  if (isError) return <p>could not price</p>;

  return (
    <ul>
      {wants.map(({ typeID, marketLocation }) => (
        <li key={`${marketLocation}|${typeID}`}>
          {`${marketLocation}/${typeID}: ${readMarketPriceForType(typeID, marketLocation, "sell")}`}
        </li>
      ))}
    </ul>
  );
}

function show(wants) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Subject wants={wants} />
    </QueryClientProvider>,
  );
}

let fetchMock;

beforeEach(() => {
  queryClient.clear();
  resetPriceLoader();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
  resetPriceLoader();
});

describe("a price from the wire to the screen", () => {
  it("reaches a surface that draws it", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, marketLocation: "jita" }]);

    expect(await screen.findByText("jita/34: 10")).toBeTruthy();
  });

  it("asks once for everything a tick wanted", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: {
          refreshedAt: WALKED_AT,
          prices: { 34: priced(10), 35: priced(20) },
        },
        amarr: { refreshedAt: WALKED_AT, prices: { 34: priced(12) } },
      }),
    );

    show([
      { typeID: 34, marketLocation: "jita" },
      { typeID: 35, marketLocation: "jita" },
      { typeID: 34, marketLocation: "amarr" },
    ]);

    expect(await screen.findByText("jita/34: 10")).toBeTruthy();
    expect(screen.getByText("jita/35: 20")).toBeTruthy();
    expect(screen.getByText("amarr/34: 12")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sources).toEqual({ jita: ["34", "35"], amarr: ["34"] });
  });

  it("keeps the market's refresh time on the prices it answered", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, marketLocation: "jita" }]);
    await screen.findByText("jita/34: 10");

    expect(readHeldRefreshTime("jita")).toBe(WALKED_AT);
    expect(readPriceRefreshedAt(34, "jita")).toBe(WALKED_AT);
  });

  it("draws zero for a type the market holds no order for", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({ jita: { refreshedAt: WALKED_AT, prices: {} } }),
    );

    show([{ typeID: 34, marketLocation: "jita" }]);

    expect(await screen.findByText("jita/34: 0")).toBeTruthy();
    expect(readPriceRefreshedAt(34, "jita")).toBeUndefined();
  });

  it("leaves nothing held when the request fails", async () => {
    fetchMock.mockImplementation(async () => apiRefusal());

    show([{ typeID: 34, marketLocation: "jita" }]);
    expect(
      await screen.findByText("could not price", {}, RETRY_WAIT),
    ).toBeTruthy();

    expect(readMarketPriceForType(34, "jita", "sell")).toBe(0);
    expect(readPriceRefreshedAt(34, "jita")).toBeUndefined();
    expect(readHeldRefreshTime("jita")).toBeUndefined();
  });

  it("reports a failure rather than resolving as loaded", async () => {
    fetchMock.mockImplementation(async () => apiRefusal());

    show([{ typeID: 34, marketLocation: "jita" }]);

    expect(
      await screen.findByText("could not price", {}, RETRY_WAIT),
    ).toBeTruthy();
    expect(screen.queryByText("pricing")).toBeNull();
  });

  it("draws a saved market's price, asked for by its station", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        [SAVED_STATION]: { refreshedAt: WALKED_AT, prices: { 34: priced(12) } },
      }),
    );

    show([{ typeID: 34, marketLocation: "saved-market" }]);

    expect(await screen.findByText("saved-market/34: 12")).toBeTruthy();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sources).toEqual({ [SAVED_STATION]: ["34"] });
  });

  it("holds a saved market's refresh time under the id the reader asked with", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        [SAVED_STATION]: { refreshedAt: WALKED_AT, prices: { 34: priced(12) } },
      }),
    );

    show([{ typeID: 34, marketLocation: "saved-market" }]);
    await screen.findByText("saved-market/34: 12");

    expect(readHeldRefreshTime("saved-market")).toBe(WALKED_AT);
    expect(readPriceRefreshedAt(34, "saved-market")).toBe(WALKED_AT);
  });

  it("asks for a hub and a saved market together", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
        [SAVED_STATION]: { refreshedAt: WALKED_AT, prices: { 34: priced(12) } },
      }),
    );

    show([
      { typeID: 34, marketLocation: "jita" },
      { typeID: 34, marketLocation: "saved-market" },
    ]);

    expect(await screen.findByText("jita/34: 10")).toBeTruthy();
    expect(screen.getByText("saved-market/34: 12")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a newly registered market's price once its first walk lands", async () => {
    fetchMock.mockImplementation(async () =>
      apiResponse({ [SAVED_STATION]: { refreshedAt: 0, prices: {} } }),
    );

    show([{ typeID: 34, marketLocation: "saved-market" }]);
    expect(await screen.findByText("saved-market/34: 0")).toBeTruthy();

    fetchMock.mockImplementation(async () =>
      apiResponse({
        [SAVED_STATION]: { refreshedAt: WALKED_AT, prices: { 34: priced(12) } },
      }),
    );
    await revalidateMarketRefreshTimes();

    expect(await screen.findByText("saved-market/34: 12")).toBeTruthy();
  });

  it("does not ask again for a price it already holds", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, marketLocation: "jita" }]);
    await screen.findByText("jita/34: 10");

    show([{ typeID: 34, marketLocation: "jita" }]);
    await screen.findAllByText("jita/34: 10");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
