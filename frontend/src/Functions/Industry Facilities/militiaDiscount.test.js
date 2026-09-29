import { afterEach, describe, expect, it, vi } from "vitest";

import militiaDiscountForSetup from "./militiaDiscount";
import useUsersStore from "../../Zustand/usersStore";
import { jobTypes } from "../../Context/defaultValues";

const CALDARI = 500001;
const GALLENTE = 500004;
const HELD_SYSTEM = 30045352;
const QUIET_SYSTEM = 30000142;
const HASH = "pilot";

function world(militiaFactionID) {
  useUsersStore.setState((state) => ({
    worldData: {
      ...state.worldData,
      systemIndexes: {
        [HELD_SYSTEM]: { manufacturing: 0.05, militiaFactionID },
        [QUIET_SYSTEM]: { manufacturing: 0.05 },
      },
    },
    account: {
      ...state.account,
      characters: [{ CharacterHash: HASH, faction_id: CALDARI }],
    },
  }));
}

function setup(overrides = {}) {
  return {
    jobType: jobTypes.manufacturing,
    structureID: 0,
    systemID: HELD_SYSTEM,
    selectedCharacter: HASH,
    militiaUpgradeLevel: 3,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what a holding faction's upgrades take off a job", () => {
  it("takes a tenth per level for its own militia in its own NPC station", () => {
    world(CALDARI);

    for (const [level, discount] of [
      [0, 0],
      [1, 0.1],
      [3, 0.30000000000000004],
      [5, 0.5],
    ]) {
      expect(
        militiaDiscountForSetup(setup({ militiaUpgradeLevel: level })),
      ).toBeCloseTo(discount, 10);
    }
  });

  it("takes nothing for a character flying for another militia", () => {
    world(GALLENTE);

    expect(militiaDiscountForSetup(setup())).toBe(0);
  });

  it("takes nothing for a character flying for nobody", () => {
    world(CALDARI);
    useUsersStore.setState((state) => ({
      account: {
        ...state.account,
        characters: [{ CharacterHash: HASH, faction_id: null }],
      },
    }));

    expect(militiaDiscountForSetup(setup())).toBe(0);
  });

  it("takes nothing in a player structure, however far it is upgraded", () => {
    world(CALDARI);

    expect(militiaDiscountForSetup(setup({ structureID: 2 }))).toBe(0);
  });

  it("takes nothing in a system no militia holds", () => {
    world(CALDARI);

    expect(militiaDiscountForSetup(setup({ systemID: QUIET_SYSTEM }))).toBe(0);
  });

  it("never takes more than five levels' worth", () => {
    world(CALDARI);

    expect(militiaDiscountForSetup(setup({ militiaUpgradeLevel: 9 }))).toBe(
      0.5,
    );
    expect(militiaDiscountForSetup(setup({ militiaUpgradeLevel: -2 }))).toBe(0);
  });

  it("honours the militia a setup names over the character's own", () => {
    world(GALLENTE);

    expect(
      militiaDiscountForSetup(setup({ enlistedFaction: GALLENTE })),
    ).toBeCloseTo(0.3, 10);
  });
});
