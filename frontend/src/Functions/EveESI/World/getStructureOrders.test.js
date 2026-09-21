import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, tokenMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  tokenMock: vi.fn(),
}));

vi.mock("../fetchWithCustomHeaders", () => ({
  default: (...args) => fetchMock(...args),
}));

vi.mock("../../Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: (...args) => tokenMock(...args),
}));

import { fetchStructureOrders, MAX_ORDER_PAGES } from "./getStructureOrders";
import { LocationResolutionError } from "./locationOutcome";
import { MARKET_STRUCTURE_SCOPE } from "../../Auth/esiCredentials/tokenScopes.js";
import { esiAccessToken } from "../../../tests/utils.js";

const RAITARU = 1035466617946;
const character = { CharacterHash: "hash-a" };

function order(overrides = {}) {
  return {
    order_id: 1,
    type_id: 34,
    location_id: RAITARU,
    price: 10,
    is_buy_order: false,
    volume_remain: 5,
    ...overrides,
  };
}

function page(orders, { totalPages = 1, headers = {} } = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: (name) =>
        ({ "x-pages": String(totalPages), ...headers })[name.toLowerCase()] ??
        null,
    },
    json: async () => orders,
  };
}

function refusal(status) {
  return {
    ok: false,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => ({}),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Carrying the scope, so the ordinary cases pass the gate by holding it
  // rather than by the unreadable-token fallback, which has its own test.
  tokenMock.mockReset().mockResolvedValue({
    accessToken: esiAccessToken({ scopes: [MARKET_STRUCTURE_SCOPE] }),
  });
});

describe("reading a structure's orders as one character", () => {
  it("asks the market endpoint for that structure, as that character", async () => {
    fetchMock.mockResolvedValue(page([order()]));

    const answer = await fetchStructureOrders(RAITARU, character);

    expect(tokenMock).toHaveBeenCalledWith("hash-a");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain(`/markets/structures/${RAITARU}/`);
    expect(options.headers.Authorization).toContain("Bearer ");
    expect(answer).toMatchObject({ refused: false });
    expect(answer.orders).toHaveLength(1);
  });

  // There is no per-type form of this endpoint, so every page is read and the
  // caller is handed one market rather than a walk to finish itself.
  it("reads every page and hands back one set of orders", async () => {
    fetchMock
      .mockResolvedValueOnce(page([order({ order_id: 1 })], { totalPages: 3 }))
      .mockResolvedValueOnce(page([order({ order_id: 2 })], { totalPages: 3 }))
      .mockResolvedValueOnce(page([order({ order_id: 3 })], { totalPages: 3 }));

    const answer = await fetchStructureOrders(RAITARU, character);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(answer.orders.map((row) => row.order_id)).toEqual([1, 2, 3]);
    expect(
      fetchMock.mock.calls.map(([url]) => url.match(/page=(\d+)/)[1]),
    ).toEqual(["1", "2", "3"]);
  });

  // When the orders were current, which is the clock a market moves by. When
  // ESI would next serve new ones is not read: a market is re-read on its turn.
  it("carries the moment ESI stated for the orders", async () => {
    fetchMock.mockResolvedValue(
      page([order()], {
        headers: { "last-modified": "Sat, 20 Sep 2026 12:00:00 GMT" },
      }),
    );

    const answer = await fetchStructureOrders(RAITARU, character);

    expect(answer.refreshedAt).toBe(Date.parse("2026-09-20T12:00:00Z"));
  });
});

// The whole reason this is asked per character: an answer about the structure,
// as against a request that did not work, as against a token that can never ask.
describe("the three answers a character can give", () => {
  it.each([[403], [404]])(
    "reports %s as a refusal, not a failure",
    async (status) => {
      fetchMock.mockResolvedValue(refusal(status));

      expect(await fetchStructureOrders(RAITARU, character)).toEqual({
        refused: true,
      });
    },
  );

  it.each([[420], [500], [503]])(
    "throws on %s, so nothing settles it as no access",
    async (status) => {
      fetchMock.mockResolvedValue(refusal(status));

      await expect(fetchStructureOrders(RAITARU, character)).rejects.toThrow(
        LocationResolutionError,
      );
    },
  );

  // A 403 spent to learn what the token already says costs five times a hit,
  // and arrives indistinguishable from a docking refusal.
  it("refuses to ask on a token that lacks the scope", async () => {
    tokenMock.mockResolvedValue({
      accessToken: esiAccessToken({
        scopes: ["esi-universe.read_structures.v1"],
      }),
    });

    await expect(
      fetchStructureOrders(RAITARU, character),
    ).rejects.toMatchObject({ needsReauthorisation: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks on a token that carries it", async () => {
    tokenMock.mockResolvedValue({
      accessToken: esiAccessToken({ scopes: [MARKET_STRUCTURE_SCOPE] }),
    });
    fetchMock.mockResolvedValue(page([order()]));

    await fetchStructureOrders(RAITARU, character);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws rather than refusing when no token can be had", async () => {
    tokenMock.mockRejectedValue(new Error("refresh failed"));

    await expect(fetchStructureOrders(RAITARU, character)).rejects.toThrow(
      /no access token/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Prices are derived from every order at the place, so a book cut short reports
// a best ask nobody is offering — and nothing downstream could tell that from a
// real figure.
describe("a market too large to read whole", () => {
  it("is refused rather than priced from the pages that fit", async () => {
    fetchMock.mockResolvedValue(
      page([order()], { totalPages: MAX_ORDER_PAGES + 1 }),
    );

    await expect(fetchStructureOrders(RAITARU, character)).rejects.toThrow(
      /exceeds/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads one exactly at the limit", async () => {
    fetchMock.mockResolvedValue(
      page([order()], { totalPages: MAX_ORDER_PAGES }),
    );

    const answer = await fetchStructureOrders(RAITARU, character);

    expect(answer.orders).toHaveLength(MAX_ORDER_PAGES);
  });

  it("fails the read when a later page is lost", async () => {
    fetchMock
      .mockResolvedValueOnce(page([order()], { totalPages: 2 }))
      .mockResolvedValueOnce(refusal(403));

    await expect(fetchStructureOrders(RAITARU, character)).rejects.toThrow(
      /mid-read/,
    );
  });

  // A count that cannot be read is not a count of one. Taking it as one would
  // settle the market as whatever the first page held, and nothing above could
  // tell that from a market that really is one page.
  it.each([["not a number"], ["0"], ["-3"], ["2.5"], ["0x10"], ["1e3"]])(
    "fails the read on an unreadable page count of %s",
    async (stated) => {
      fetchMock.mockResolvedValue(
        page([order()], { headers: { "x-pages": stated } }),
      );

      await expect(fetchStructureOrders(RAITARU, character)).rejects.toThrow(
        /unreadable page count/,
      );
    },
  );

  it("reads a structure whose response states no page count as one page", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => [order()],
    });

    const answer = await fetchStructureOrders(RAITARU, character);

    expect(answer.orders).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("asking for nothing", () => {
  it("throws without a structure", async () => {
    await expect(fetchStructureOrders(0, character)).rejects.toThrow(
      /no structure id/,
    );
  });

  it("throws without a character", async () => {
    await expect(fetchStructureOrders(RAITARU, null)).rejects.toThrow(
      /no character/,
    );
  });
});
