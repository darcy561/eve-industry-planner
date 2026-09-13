import { beforeEach, describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../../../tests/queryClients.js";

const getRaces = vi.fn();

vi.mock("../../../Functions/EveESI/World/getRaces", () => ({
  default: (...args) => getRaces(...args),
}));

const { raceFactionsQuery } = await import("./raceFactions");

const client = () => testQueryClient();

beforeEach(() => vi.clearAllMocks());

// A station names the race that built it; a standing is held against that race's
// faction. This map is the only thing joining the two, and a broker fee worked
// out without it quotes every seller as having no faction standing at all.
describe("the race to faction map", () => {
  it("keys each race by its id and gives the faction behind it", async () => {
    getRaces.mockResolvedValue([
      { race_id: 1, alliance_id: 500001, name: "Caldari" },
      { race_id: 4, alliance_id: 500003, name: "Amarr" },
    ]);

    const map = await client().fetchQuery(raceFactionsQuery());

    expect(map.get(1)).toBe(500001);
    expect(map.get(4)).toBe(500003);
  });

  it("drops a race carrying no faction rather than mapping it to nothing", async () => {
    getRaces.mockResolvedValue([
      { race_id: 1, alliance_id: 500001, name: "Caldari" },
      { race_id: 135, name: "Triglavian" },
    ]);

    const map = await client().fetchQuery(raceFactionsQuery());

    expect(map.has(135)).toBe(false);
    expect(map.size).toBe(1);
  });

  // Races change with an expansion, not with play, so a second reader gets the
  // map that is already there rather than spending another ESI call on it.
  it("fetches once for the session", async () => {
    getRaces.mockResolvedValue([{ race_id: 1, alliance_id: 500001 }]);
    const shared = client();

    await shared.fetchQuery(raceFactionsQuery());
    await shared.fetchQuery(raceFactionsQuery());

    expect(getRaces).toHaveBeenCalledTimes(1);
  });

  // A failed lookup must not be remembered as an empty map: that would quote
  // every station's fee without faction standing for the rest of the session.
  // Retries are off here so the failure is the one being asserted rather than
  // the config's own recovery.
  it("does not cache a failure", async () => {
    const shared = client();
    const once = { ...raceFactionsQuery(), retry: false };
    getRaces.mockRejectedValue(new Error("ESI is down"));

    await expect(shared.fetchQuery(once)).rejects.toThrow("ESI is down");

    getRaces.mockResolvedValue([{ race_id: 1, alliance_id: 500001 }]);
    const map = await shared.fetchQuery(once);

    expect(map.get(1)).toBe(500001);
  });

  // ESI adds a race and the shape gains a field before the app knows about it;
  // that must not take the whole map down with it.
  it("survives a race the shape does not expect", async () => {
    getRaces.mockResolvedValue([
      { race_id: 1, alliance_id: 500001 },
      null,
      { name: "nameless" },
    ]);

    const map = await client().fetchQuery(raceFactionsQuery());

    expect(map.size).toBe(1);
  });
});
