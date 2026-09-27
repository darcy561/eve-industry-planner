import { beforeEach, describe, expect, it, vi } from "vitest";

const getStationData = vi.fn();
const getSystemData = vi.fn();
const getConstellationData = vi.fn();

vi.mock("../EveESI/World/getStationData", () => ({
  default: (...args) => getStationData(...args),
}));
vi.mock("../EveESI/World/getSystemData", () => ({
  default: (...args) => getSystemData(...args),
}));
vi.mock("../EveESI/World/getConstellationData", () => ({
  default: (...args) => getConstellationData(...args),
}));

const { default: describeMarketLocation } =
  await import("./describeMarketLocation");

const JITA_STATION = 60003760;
const JITA_SYSTEM = 30000142;
const KIMOTORO = 20000020;
const THE_FORGE = 10000002;
const A_CITADEL = 1035466617946;

beforeEach(() => {
  getStationData.mockReset().mockResolvedValue({
    system_id: JITA_SYSTEM,
    race_id: 1,
    owner: 1000035,
  });
  getSystemData.mockReset().mockResolvedValue({ constellation_id: KIMOTORO });
  getConstellationData.mockReset().mockResolvedValue({ region_id: THE_FORGE });
});

describe("what a saved market is asked about the place it is", () => {
  it("walks a station to its region", async () => {
    const facts = await describeMarketLocation(JITA_STATION);

    expect(facts).toEqual({ regionID: THE_FORGE, raceID: 1, ownerID: 1000035 });
    expect(getSystemData).toHaveBeenCalledWith(JITA_SYSTEM);
    expect(getConstellationData).toHaveBeenCalledWith(KIMOTORO);
  });

  it("asks a citadel for a region only, from the system it sits in", async () => {
    const facts = await describeMarketLocation(A_CITADEL, JITA_SYSTEM);

    expect(facts).toEqual({ regionID: THE_FORGE });
    expect(getStationData).not.toHaveBeenCalled();
  });

  it("answers nothing when a hop could not be read", async () => {
    getConstellationData.mockResolvedValue(null);
    expect(await describeMarketLocation(JITA_STATION)).toBeNull();

    getSystemData.mockResolvedValue(null);
    expect(await describeMarketLocation(JITA_STATION)).toBeNull();

    getStationData.mockResolvedValue(null);
    expect(await describeMarketLocation(JITA_STATION)).toBeNull();
  });

  it("answers nothing for a citadel whose system is not known", async () => {
    expect(await describeMarketLocation(A_CITADEL, undefined)).toBeNull();
  });
});
