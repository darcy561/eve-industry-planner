/**
 * Holds this client and the server's composed market set together.
 *
 * The fixture is written from the Go response type by
 * `services/api/v1endpoints/user/market_locations_surface_test.go`, so what is
 * checked here is the shape the running server sends rather than what this side
 * believes. A field moved on either side without the other fails here.
 *
 * Kinds as well as paths: a row whose `regionID` arrived as a string still looks
 * whole and still reaches the registry, and the market it names is then asked
 * for at a region nothing matches.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const requestWithPrivateHeaders = vi.fn();
vi.mock("./applyPrivateHeaders.js", () => ({
  default: (...args) => requestWithPrivateHeaders(...args),
}));

const { fetchMarketLocations } = await import("./marketLocations.js");

// Resolved from the working directory, as the other parity tests do: the suite
// runs from frontend/, and the fixture is the repo's rather than the SPA's.
const FIXTURE = resolve(
  process.cwd(),
  "../testing/fixtures/market-locations/surface.json",
);

const REGENERATE =
  "EIP_UPDATE_MARKET_LOCATIONS_SURFACE=1 go test ./api/v1endpoints/user/ -run TestTheMarketLocationsSurfaceIsCurrent";

const surface = JSON.parse(readFileSync(FIXTURE, "utf8"));
const answer = surface.types.MarketLocationsResponse;

/**
 * Every JSON path a value carries against the kind it holds, in the shape the Go
 * surface writes them: a container is a path of its own as well as everything
 * beneath it, which is what `modelparity.JSONKinds` records on the other side.
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

const ok = (body) => ({ ok: true, json: async () => body });

// A row built to the server's surface rather than to this client's
// expectations. Both kinds of market are here because which one a row is
// follows from the place it names, and the two carry different facts: a station
// has what its broker fee is derived from, a citadel has the rate itself.
const answerFromSurface = () => ({
  marketLocations: [
    {
      id: "own-jita",
      name: "Jita IV - Moon 4",
      regionID: 10000002,
      stationID: 60003760,
      structureID: 0,
      raceID: 1,
      ownerID: 1000035,
      brokerFee: 0,
      sharedBy: "",
      sharedWithMembers: false,
      pricedAt: 1700000000000,
    },
  ],
});

describe("the composed market set this client reads", () => {
  it("has a surface to check against", () => {
    expect(
      Object.keys(answer).length,
      `Regenerate with: ${REGENERATE}`,
    ).toBeGreaterThan(0);
  });

  it("is the answer the server's response type describes, path and kind alike", () => {
    const built = kindsOf(answerFromSurface());

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

  // Through the real client, not a parse written beside it.
  it("hands the rows on as they arrived", async () => {
    requestWithPrivateHeaders.mockResolvedValue(ok(answerFromSurface()));

    const rows = await fetchMarketLocations();

    expect(rows).toEqual(answerFromSurface().marketLocations);
  });

  // An account with no markets and an answer that did not arrive are different
  // facts, and a caller has to be able to tell them apart.
  it("reads an account with no markets as none, and a refusal as a throw", async () => {
    requestWithPrivateHeaders.mockResolvedValue(ok({ marketLocations: [] }));
    await expect(fetchMarketLocations()).resolves.toEqual([]);

    requestWithPrivateHeaders.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    await expect(fetchMarketLocations()).rejects.toThrow("503");
  });
});
