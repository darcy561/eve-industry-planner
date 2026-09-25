import { beforeEach, describe, expect, it, vi } from "vitest";

const toPersistPayload = vi.fn(() => ({ marketLocations: [] }));
vi.mock("../../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      applicationSettings: { actions: { toPersistPayload } },
      account: { actions: {} },
    }),
  },
}));

const request = vi.fn();
vi.mock("./applyPrivateHeaders.js", () => ({
  default: (...args) => request(...args),
}));

const refreshMarketLocationsAfterWrite = vi.fn(async () => {});
vi.mock("../../MarketData/registry/marketLocations", () => ({
  refreshMarketLocationsAfterWrite: () => refreshMarketLocationsAfterWrite(),
}));

const { saveApplicationSettings } = await import("./userDocument.js");

describe("saving the account's application settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue({ ok: true });
  });

  // The markets every surface offers are the set the server composed from this
  // document, so a market saved here is offered nowhere until that set has been
  // read again. Reading it is what makes a saved market appear at all.
  it("reads the composed markets again once the document has landed", async () => {
    await saveApplicationSettings();

    expect(refreshMarketLocationsAfterWrite).toHaveBeenCalledTimes(1);
  });

  // Reading it after a refused save would hold the set as it was before the
  // change and clear the record that anything is outstanding, so the next save
  // would have nothing left to tell it.
  it("does not read them again when the save was refused", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "",
    });

    expect(await saveApplicationSettings()).toBe(false);
    expect(refreshMarketLocationsAfterWrite).not.toHaveBeenCalled();
  });

  it("does not read them again when the request threw", async () => {
    request.mockRejectedValue(new Error("offline"));

    expect(await saveApplicationSettings()).toBe(false);
    expect(refreshMarketLocationsAfterWrite).not.toHaveBeenCalled();
  });
});
