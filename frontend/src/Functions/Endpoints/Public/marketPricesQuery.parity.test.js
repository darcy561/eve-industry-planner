/**
 * Holds this client and the server's wire types together.
 *
 * The fixture is written from the Go request and response types by
 * `services/api/v1endpoints/market_prices_surface_test.go`, so what is checked
 * here is what the running server sends and expects rather than what this side
 * believes. A field moved on either side without the other fails here.
 *
 * Both directions matter: this client authors the request body and reads the
 * answer through it, so a key it invents asks for nothing and a key it expects
 * that nothing sends prices an item at nothing. The kinds are checked as well
 * as the paths, because a figure that arrives as a string keeps its key and
 * turns every sum downstream into concatenation.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fetchWithPublicHeaders = vi.fn();
vi.mock("./applyPublicHeaders.js", () => ({
  fetchWithPublicHeaders: (...args) => fetchWithPublicHeaders(...args),
}));

const { fetchMarketPricesQuery } = await import("./marketPricesQuery.js");

// Resolved from the working directory, as the derivation parity test does: the
// suite runs from frontend/, and the fixture is the repo's rather than the SPA's.
const FIXTURE = resolve(
  process.cwd(),
  "../testing/fixtures/market-prices/surface.json",
);

const REGENERATE =
  "EIP_UPDATE_MARKET_PRICES_SURFACE=1 go test ./api/v1endpoints/ -run TestTheMarketPricesSurfaceIsCurrent";

const surface = JSON.parse(readFileSync(FIXTURE, "utf8"));
const request = surface.types.MarketPricesQueryBody;
const answer = surface.types.MarketPricesQueryResponse;

/**
 * Every JSON path a value carries against the kind it holds, in the shape the Go
 * surface writes them: a container is a path of its own as well as everything
 * beneath it, which is what `modelparity.JSONKinds` records on the other side.
 *
 * An empty array yields its own path and nothing beneath it. Go walks the
 * declared element type and would name the fields of a row that is not there, so
 * a list is given a row here rather than left empty.
 */
function kindsOf(value, prefix = "", into = {}) {
  if (prefix) into[prefix] = kindName(value);
  if (Array.isArray(value)) {
    if (value.length > 0) kindsOf(value[0], `${prefix}[]`, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, held] of Object.entries(value)) {
      kindsOf(held, prefix ? `${prefix}.${key}` : key, into);
    }
  }
  return into;
}

const kindName = (value) => {
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return "any";
};

/** The same, with map keys written as the surface writes them. */
const asMapKinds = (kinds, mapKeys) =>
  Object.fromEntries(
    Object.entries(kinds).map(([path, kind]) => [
      mapKeys.reduce((held, key) => held.replaceAll(`.${key}`, ".{id}"), path),
      kind,
    ]),
  );

const ok = (body) => ({ ok: true, json: async () => body });

describe("the request this client sends", () => {
  it("has a surface to check against", () => {
    expect(
      Object.keys(request).length,
      `Regenerate with: ${REGENERATE}`,
    ).toBeGreaterThan(0);
  });

  // Built by the real endpoint module, not restated here: a parity test
  // checking a body written beside the client proves nothing about the client.
  const bodySent = async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok({ sources: {} }));
    await fetchMarketPricesQuery({
      wants: [{ typeID: 34, marketLocation: "jita" }],
      adjustedTypeIDs: [34],
    });
    const body = JSON.parse(fetchWithPublicHeaders.mock.calls[0][1].body);
    return asMapKinds(kindsOf(body), ["jita"]);
  };

  it("sends nothing the server's request type does not carry", async () => {
    const sent = await bodySent();

    for (const [path, kind] of Object.entries(sent)) {
      expect(
        request[path],
        `this client sends ${path} as ${kind}, which the server's request type does not carry.\nFix marketPricesQuery.js, or move the Go type and regenerate: ${REGENERATE}`,
      ).toBe(kind);
    }
  });

  it("sends every path the server's request type carries", async () => {
    const sent = await bodySent();

    for (const [path, kind] of Object.entries(request)) {
      expect(
        sent[path],
        `the server's request type carries ${path} as ${kind}, which this client never sends.\nFix marketPricesQuery.js to send it.`,
      ).toBe(kind);
    }
  });
});

describe("the answer this client reads", () => {
  // An answer built to the server's surface rather than to this client's
  // expectations, run through the real parse. A field renamed on the Go side
  // moves the surface, which moves this answer, which fails the read below.
  const answerFromSurface = () => {
    expect(answer["sources.{id}.prices.{id}.buy"]).toBe("number");
    return {
      sources: {
        jita: {
          refreshedAt: 1700000000000,
          prices: { 34: { buy: 5, sell: 9, buyP95: 6, sellP05: 8 } },
        },
      },
      adjusted: { refreshedAt: 1699999999000, prices: { 34: 7 } },
    };
  };

  it("is the answer the server's response type describes, path and kind alike", () => {
    const built = asMapKinds(kindsOf(answerFromSurface()), ["jita", "34"]);

    for (const [path, kind] of Object.entries(built)) {
      expect(
        answer[path],
        `this test's answer holds ${path} as ${kind}, which the server's response type does not carry.\nDrop it from answerFromSurface(), or move the Go type and regenerate: ${REGENERATE}`,
      ).toBe(kind);
    }
    for (const [path, kind] of Object.entries(answer)) {
      expect(
        built[path],
        `the server's response type carries ${path} as ${kind}, which this test's answer does not.\nAdd it to answerFromSurface() — and check this client actually reads it.`,
      ).toBe(kind);
    }
  });

  it("reads a market's row and its refresh time out of it", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok(answerFromSurface()));

    const result = await fetchMarketPricesQuery({
      wants: [{ typeID: 34, marketLocation: "jita" }],
    });

    expect(result.sources.jita.refreshedAt).toBe(1700000000000);
    expect(result.sources.jita.prices["34"]).toEqual({
      buy: 5,
      sell: 9,
      buyP95: 6,
      sellP05: 8,
    });
  });

  it("reads the adjusted block, which belongs to no market", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok(answerFromSurface()));

    const result = await fetchMarketPricesQuery({
      wants: [],
      adjustedTypeIDs: [34],
    });

    expect(result.adjusted.prices["34"]).toBe(7);
    expect(result.adjusted.refreshedAt).toBe(1699999999000);
  });
});
