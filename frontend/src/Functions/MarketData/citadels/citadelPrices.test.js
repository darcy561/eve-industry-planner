import { beforeEach, describe, expect, it, vi } from "vitest";

const { characters, fetchMock, readCharacter, writeCharacter } = vi.hoisted(
  () => ({
    characters: { list: [] },
    fetchMock: vi.fn(),
    readCharacter: vi.fn(),
    writeCharacter: vi.fn(),
  }),
);

vi.mock("../prices/priceStore.js", () => ({
  readMarketCharacter: (...args) => readCharacter(...args),
  writeMarketCharacter: (...args) => writeCharacter(...args),
}));

vi.mock("../../EveESI/World/getStructureOrders", () => ({
  fetchStructureOrders: (...args) => fetchMock(...args),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account: { characters: characters.list } }),
  );
});

const { readCitadelPrices, PRICE_ROTATION_MS } =
  await import("./citadelPrices.js");
const { resetReauthorisationReports } =
  await import("../../EveESI/World/askEachCharacter.js");
const { LocationResolutionError } =
  await import("../../EveESI/World/locationOutcome.js");

const AZBEL = 1035466617946;
const main = { CharacterHash: "hash-main", CharacterName: "Main" };
const alt = { CharacterHash: "hash-alt", CharacterName: "Alt" };

const source = {
  id: "citadelMarket-1",
  name: "Perimeter Azbel",
  regionID: 10000002,
  structureID: AZBEL,
  kind: "citadel",
};

function order(overrides = {}) {
  return {
    order_id: 1,
    type_id: 34,
    location_id: AZBEL,
    price: 10,
    is_buy_order: false,
    ...overrides,
  };
}

function read(orders, extra = {}) {
  return { refused: false, orders, refreshedAt: 1757000000000, ...extra };
}

beforeEach(() => {
  characters.list = [main, alt];
  resetReauthorisationReports();
  fetchMock.mockReset().mockResolvedValue(read([order()]));
  readCharacter.mockReset().mockResolvedValue("hash-alt");
  writeCharacter.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("what one read of a citadel gives", () => {
  it("is a price for every type on the market", async () => {
    fetchMock.mockResolvedValue(
      read([
        order({ order_id: 1, type_id: 34, price: 10, is_buy_order: false }),
        order({ order_id: 2, type_id: 34, price: 8, is_buy_order: true }),
        order({ order_id: 3, type_id: 35, price: 50, is_buy_order: false }),
      ]),
    );

    const { typePrices } = await readCitadelPrices(source);

    expect([...typePrices.keys()].sort()).toEqual(["34", "35"]);
    expect(typePrices.get("34")).toMatchObject({ sell: 10, buy: 8 });
    expect(typePrices.get("35")).toMatchObject({ sell: 50, buy: 0 });
  });

  it("carries the moment the orders were current, and its own next turn", async () => {
    fetchMock.mockResolvedValue(
      read([order()], { refreshedAt: 42, expiresAt: 99 }),
    );

    const before = Date.now();
    const prices = await readCitadelPrices(source);

    expect(prices.refreshedAt).toBe(42);
    expect(prices.expiresAt).toBeGreaterThanOrEqual(before + PRICE_ROTATION_MS);
  });

  it("counts only the orders at this market", async () => {
    fetchMock.mockResolvedValue(
      read([
        order({ order_id: 1, price: 10 }),
        order({ order_id: 2, price: 1, location_id: 60003760 }),
      ]),
    );

    const { typePrices } = await readCitadelPrices(source);

    expect(typePrices.get("34").sell).toBe(10);
  });

  it("holds nothing for a market with no orders on it", async () => {
    fetchMock.mockResolvedValue(read([]));

    expect((await readCitadelPrices(source)).typePrices.size).toBe(0);
  });
});

describe("which character reads it", () => {
  it("is the one the device recorded for that market", async () => {
    await readCitadelPrices(source);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toBe(alt);
  });

  it("falls back to the others when the recorded one is refused", async () => {
    fetchMock.mockImplementation(async (_id, character) =>
      character === alt ? { refused: true } : read([order()]),
    );

    const { typePrices } = await readCitadelPrices(source);

    expect(fetchMock.mock.calls.map(([, character]) => character)).toEqual([
      alt,
      main,
    ]);
    expect(typePrices.get("34").sell).toBe(10);
  });

  it("tries every character when nothing is recorded for the market", async () => {
    readCharacter.mockResolvedValue(undefined);

    await readCitadelPrices(source);

    expect(fetchMock.mock.calls[0][1]).toBe(main);
  });

  it("tries every character when the recorded one is no longer linked", async () => {
    readCharacter.mockResolvedValue("hash-of-a-character-since-removed");
    fetchMock.mockImplementation(async (_id, character) =>
      character === main ? { refused: true } : read([order()]),
    );

    await readCitadelPrices(source);

    expect(fetchMock.mock.calls.map(([, character]) => character)).toEqual([
      main,
      alt,
    ]);
  });
});

describe("recording who could read it", () => {
  it("keeps the character a fallback found", async () => {
    fetchMock.mockImplementation(async (_id, character) =>
      character === alt ? { refused: true } : read([order()]),
    );

    await readCitadelPrices(source);

    expect(writeCharacter).toHaveBeenCalledWith(source.id, "hash-main");
  });

  it("writes nothing when the recorded character is the one that answered", async () => {
    await readCitadelPrices(source);

    expect(writeCharacter).not.toHaveBeenCalled();
  });

  it("keeps the first character to answer a market with nothing recorded", async () => {
    readCharacter.mockResolvedValue(undefined);

    await readCitadelPrices(source);

    expect(writeCharacter).toHaveBeenCalledWith(source.id, "hash-main");
  });

  it("reads the market anyway when the device remembers nothing", async () => {
    readCharacter.mockResolvedValue(undefined);
    characters.list = [main];

    expect((await readCitadelPrices(source)).typePrices.get("34").sell).toBe(
      10,
    );
  });

  it("still answers when the record cannot be saved", async () => {
    writeCharacter.mockRejectedValue(new Error("storage is blocked"));
    characters.list = [main];

    const { typePrices } = await readCitadelPrices(source);

    expect(typePrices.get("34").sell).toBe(10);
  });

  it("records nothing for a market nobody could read", async () => {
    fetchMock.mockResolvedValue({ refused: true });

    await expect(readCitadelPrices(source)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
    expect(writeCharacter).not.toHaveBeenCalled();
  });
});

describe("a market the account cannot see", () => {
  it("fails rather than pricing every type at nothing", async () => {
    fetchMock.mockResolvedValue({ refused: true });

    await expect(readCitadelPrices(source)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
  });

  it("fails when the read itself could not be made", async () => {
    fetchMock.mockRejectedValue(new Error("ESI is down"));

    await expect(readCitadelPrices(source)).rejects.toThrow(/ESI is down/);
  });

  it("fails when the account has no characters at all", async () => {
    characters.list = [];

    await expect(readCitadelPrices(source)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
