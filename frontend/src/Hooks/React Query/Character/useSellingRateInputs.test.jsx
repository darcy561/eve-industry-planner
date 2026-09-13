import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const getCharacterSkills = vi.fn();
const getCharacterStandings = vi.fn();

vi.mock("../../../Functions/EveESI/Character/getSkills", () => ({
  default: (...args) => getCharacterSkills(...args),
}));
vi.mock("../../../Functions/EveESI/Character/getStandings", () => ({
  default: (...args) => getCharacterStandings(...args),
}));
vi.mock("../../../Functions/Shared/queryExecutionEnabled", () => ({
  isQueryExecutionEnabled: () => true,
}));
vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: {
      actions: {
        findCharacterByHash: (hash) => ({
          CharacterHash: hash,
          CharacterID: 1,
        }),
      },
    },
  });
});

const { useSellingRateInputs, ensureSellingRateInputs } =
  await import("./useSellingRateInputs");

const harness = () => {
  const client = testQueryClient();
  return {
    client,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
};

const charactersAsked = (mock) =>
  new Set(mock.mock.calls.map(([args]) => args.character.CharacterHash));

beforeEach(() => {
  vi.clearAllMocks();
  getCharacterSkills.mockResolvedValue({ data: {} });
  getCharacterStandings.mockResolvedValue({ data: [] });
});

/**
 * Both stages quote a fee from the same two reads, and both used to decide for
 * themselves whose reads to start. Planning asked for one seller; Selling asked
 * for the account's main and then costed each order against whoever placed it.
 */
describe("subscribing to what a fee is worked out from", () => {
  it("asks for both reads for the character given", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(() => useSellingRateInputs("hash-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCharacterSkills).toHaveBeenCalled();
    expect(getCharacterStandings).toHaveBeenCalled();
  });

  // The Selling stage costs an order against the character who placed it, so
  // every one of them has to be asked for — not just the account's main.
  it("covers every character it is given, not only the first", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(
      () => useSellingRateInputs(["main", "alt-1", "alt-2"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(charactersAsked(getCharacterStandings)).toEqual(
      new Set(["main", "alt-1", "alt-2"]),
    );
  });

  it("asks once for a character named twice", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(
      () => useSellingRateInputs(["main", "main"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCharacterStandings).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing when signed out", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(() => useSellingRateInputs(null), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCharacterSkills).not.toHaveBeenCalled();
  });
});

// A fee is worked out and stored the moment an order is linked, and the orders
// offered come from every character on the account — including ones no panel
// subscribed to. The figure that lands on the job cannot depend on that.
describe("making sure the reads are there before a fee is stored", () => {
  it("fetches both for a character nothing has asked about", async () => {
    const { client } = harness();

    await ensureSellingRateInputs(client, "never-seen");

    expect(charactersAsked(getCharacterSkills)).toEqual(
      new Set(["never-seen"]),
    );
    expect(charactersAsked(getCharacterStandings)).toEqual(
      new Set(["never-seen"]),
    );
  });

  it("uses what is already cached rather than fetching again", async () => {
    const { client } = harness();

    await ensureSellingRateInputs(client, "hash-1");
    await ensureSellingRateInputs(client, "hash-1");

    expect(getCharacterStandings).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a character", async () => {
    const { client } = harness();

    await ensureSellingRateInputs(client, null);

    expect(getCharacterSkills).not.toHaveBeenCalled();
  });

  // Error surfacing is asserted here rather than through the subscription: the
  // queries retry with backoff, so the same assertion up there costs seconds of
  // wall clock to reach the same fact.
  it("surfaces a failure rather than resolving to nothing", async () => {
    getCharacterStandings.mockRejectedValue(new Error("403"));
    const { client } = harness();

    await expect(ensureSellingRateInputs(client, "hash-1")).rejects.toThrow(
      "403",
    );
  });
});
