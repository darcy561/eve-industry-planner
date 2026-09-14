/**
 * A price from the wire to the screen, with nothing in between replaced.
 *
 * Every other test on this path stands something in: the endpoint client, the
 * loader, or the cache. Each is right to — they are testing one piece — but the
 * result is that no test says a price actually arrives. The pieces agree with
 * their own doubles and could still disagree with each other.
 *
 * So this mocks `fetch` and nothing else. The real client parses the response,
 * the real loader batches and settles it, the real cache holds it, the real
 * accessor reads it, and a component draws it the way every priced surface does
 * — synchronously, while rendering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const { queryClient } = await import("../../queryClient.js");
const { resetSourceClocks, readSourceClock } =
  await import("./sourceClocks.js");
const { resetPriceLoader } = await import("./priceLoader.js");
const { getMarketPriceForType, getPriceRefreshedAt } =
  await import("./marketPriceForType.js");
const { useMarketPricesQuery } =
  await import("../../Hooks/React Query/World/marketPrices.js");

const WALKED_AT = 1757000000000;

/**
 * Long enough for the shared retry layer to give up: four attempts at an
 * escalating 350ms base. A shorter wait reads a request still being retried as
 * one that hung.
 */
const RETRY_WAIT = { timeout: 6000 };

/** One market's answer, in the shape the API actually sends. */
function apiResponse(sources, adjusted = null) {
  return new Response(JSON.stringify({ sources, adjusted }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A refusal, as a real Response.
 *
 * A plain object is not enough here: the retry layer clones the response to read
 * it, so a stand-in without `clone` fails in a way that looks like the code under
 * test rather than like the double.
 */
function apiRefusal(status = 503) {
  return new Response(JSON.stringify({ error: "unavailable" }), { status });
}

const priced = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell - 2,
  sellP05: sell + 1,
});

/** Draws a figure the way a shopping list row or a cost panel does. */
function Subject({ wants }) {
  const { isLoading, isError } = useMarketPricesQuery(wants);
  if (isLoading) return <p>pricing</p>;
  // A surface draws what it has rather than waiting: a market that could not be
  // reached leaves its own figures unread, and the rest are still worth showing.
  if (isError) return <p>could not price</p>;

  return (
    <ul>
      {wants.map(({ typeID, sourceID }) => (
        <li key={`${sourceID}|${typeID}`}>
          {`${sourceID}/${typeID}: ${getMarketPriceForType(typeID, sourceID, "sell")}`}
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
  resetSourceClocks();
  resetPriceLoader();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
  resetSourceClocks();
  resetPriceLoader();
});

describe("a price from the wire to the screen", () => {
  it("reaches a surface that draws it", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, sourceID: "jita" }]);

    expect(await screen.findByText("jita/34: 10")).toBeTruthy();
  });

  // The whole point of the narrowed query: one request naming exactly what was
  // wanted, not a market list crossed with a type list.
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
      { typeID: 34, sourceID: "jita" },
      { typeID: 35, sourceID: "jita" },
      { typeID: 34, sourceID: "amarr" },
    ]);

    expect(await screen.findByText("jita/34: 10")).toBeTruthy();
    expect(screen.getByText("jita/35: 20")).toBeTruthy();
    expect(screen.getByText("amarr/34: 12")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // And it asked for each market only the types that market was wanted for.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sources).toEqual({ jita: ["34", "35"], amarr: ["34"] });
  });

  // The clock arrives with the rows and is what decides they are still current.
  it("records the market's clock on the way through", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, sourceID: "jita" }]);
    await screen.findByText("jita/34: 10");

    expect(readSourceClock("jita")).toBe(WALKED_AT);
    expect(getPriceRefreshedAt(34, "jita")).toBe(WALKED_AT);
  });

  // A type a market holds no order for is absent from the answer, and absence
  // must read as no price rather than as a price of nothing.
  it("draws zero for a type the market holds no order for", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({ jita: { refreshedAt: WALKED_AT, prices: {} } }),
    );

    show([{ typeID: 34, sourceID: "jita" }]);

    expect(await screen.findByText("jita/34: 0")).toBeTruthy();
    // Nothing was learned about when this type was priced, so no age is shown.
    expect(getPriceRefreshedAt(34, "jita")).toBeUndefined();
  });

  // A request that could not be made is not an answer of no orders, so nothing
  // is written and the next reader asks again rather than being told zero
  // forever.
  it("leaves nothing held when the request fails", async () => {
    fetchMock.mockImplementation(async () => apiRefusal());

    show([{ typeID: 34, sourceID: "jita" }]);
    // The shared retry layer makes four attempts with escalating backoff before
    // a refusal is final, so this waits on the outcome rather than a moment.
    expect(
      await screen.findByText("could not price", {}, RETRY_WAIT),
    ).toBeTruthy();

    // Nothing is written: a refusal is not an answer of no orders, so the next
    // reader asks again rather than being told zero for the rest of the session.
    expect(getMarketPriceForType(34, "jita", "sell")).toBe(0);
    expect(getPriceRefreshedAt(34, "jita")).toBeUndefined();
    expect(readSourceClock("jita")).toBeUndefined();
  });

  // The surface above reports the failure because it reads isError. One that
  // only reads isLoading sits on "pricing" for ever, which is worth knowing
  // before a panel is written that way.
  it("reports a failure rather than resolving as loaded", async () => {
    fetchMock.mockImplementation(async () => apiRefusal());

    show([{ typeID: 34, sourceID: "jita" }]);

    expect(
      await screen.findByText("could not price", {}, RETRY_WAIT),
    ).toBeTruthy();
    expect(screen.queryByText("pricing")).toBeNull();
  });

  // Two surfaces wanting the same material is one lookup, which is what the
  // cache beneath the accessor is for.
  it("does not ask again for a price it already holds", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        jita: { refreshedAt: WALKED_AT, prices: { 34: priced(10) } },
      }),
    );

    show([{ typeID: 34, sourceID: "jita" }]);
    await screen.findByText("jita/34: 10");

    show([{ typeID: 34, sourceID: "jita" }]);
    await screen.findAllByText("jita/34: 10");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
