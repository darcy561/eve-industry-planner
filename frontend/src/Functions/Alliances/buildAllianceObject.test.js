import { beforeEach, describe, expect, it, vi } from "vitest";

const getAlliancePublicInfo = vi.fn(async () => ({
  name: "Pandemic Horde",
  ticker: "REKTD",
}));

let alliances = [];

vi.mock("../EveESI/Alliance/getPublicData", () => ({
  default: (...args) => getAlliancePublicInfo(...args),
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        alliances,
        actions: {
          getAlliance: (id) =>
            alliances.find((a) => Number(a.alliance_id) === Number(id)) ?? null,
          addAlliance: (alliance) => {
            const idx = alliances.findIndex(
              (a) => Number(a.alliance_id) === Number(alliance.alliance_id),
            );
            if (idx >= 0) alliances[idx] = alliance;
            else alliances.push(alliance);
          },
        },
      },
    }),
  );
});

const { buildAllianceObjectFromCorporation } =
  await import("./buildAllianceObject.js");

function corporation(id, allianceID) {
  return { corporation_id: id, alliance_id: allianceID };
}

describe("building the alliance a corporation is in", () => {
  beforeEach(() => {
    alliances = [];
    getAlliancePublicInfo.mockClear();
  });

  it("asks EVE about an alliance the account has not met", async () => {
    await buildAllianceObjectFromCorporation(corporation(98000001, 99005338));

    expect(getAlliancePublicInfo).toHaveBeenCalledWith(99005338);
    expect(alliances[0].allianceName).toBe("Pandemic Horde");
    expect(alliances[0].corporations).toEqual([98000001]);
  });

  // Two corporations in one alliance is one alliance, asked about once.
  it("adds a second corporation to the alliance it already holds", async () => {
    await buildAllianceObjectFromCorporation(corporation(98000001, 99005338));
    await buildAllianceObjectFromCorporation(corporation(98000002, 99005338));

    expect(getAlliancePublicInfo).toHaveBeenCalledTimes(1);
    expect(alliances).toHaveLength(1);
    expect(alliances[0].corporations).toEqual([98000001, 98000002]);
  });

  it("has nothing to build for a corporation in no alliance", async () => {
    await buildAllianceObjectFromCorporation(corporation(98000001, null));

    expect(getAlliancePublicInfo).not.toHaveBeenCalled();
    expect(alliances).toEqual([]);
  });

  // A login that cannot describe an alliance is still a login.
  it("leaves the account without the alliance rather than failing", async () => {
    getAlliancePublicInfo.mockRejectedValueOnce(new Error("ESI unreachable"));
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});

    await buildAllianceObjectFromCorporation(corporation(98000001, 99005338));

    expect(alliances).toEqual([]);
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });
});
