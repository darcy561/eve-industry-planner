import { beforeEach, describe, expect, it } from "vitest";

import enlistedFactionForSetup, {
  militiaHolding,
  militiasThatMatterFor,
  systemTakesAnUpgradeLevel,
} from "./enlistedFaction";
import useUsersStore from "../../Zustand/usersStore";
import {
  ZARZAKH_SYSTEM_ID,
  jobTypes,
  pirateFactions,
} from "../../Context/defaultValues";

const HASH = "character-hash";
const CALDARI = 500001;
const HELD_SYSTEM = 30045352;
const QUIET_SYSTEM = 30000142;

function seedWorld(militiaFactionID) {
  useUsersStore.setState((state) => ({
    worldData: {
      ...state.worldData,
      systemIndexes: {
        [HELD_SYSTEM]: { manufacturing: 0.05, militiaFactionID },
        [QUIET_SYSTEM]: { manufacturing: 0.05 },
      },
    },
  }));
}

function seedCharacter(faction_id) {
  useUsersStore.setState((state) => ({
    account: {
      ...state.account,
      characters: [
        {
          CharacterHash: HASH,
          CharacterID: 1,
          CharacterName: "Pilot",
          faction_id,
        },
      ],
    },
  }));
}

describe("which militia a setup is costed against", () => {
  beforeEach(() => {
    seedCharacter(null);
  });

  it("takes the character's own militia", () => {
    seedCharacter(pirateFactions.guristas);

    expect(enlistedFactionForSetup({ selectedCharacter: HASH })).toBe(
      pirateFactions.guristas,
    );
  });

  it("prefers the one the setup names over the character's", () => {
    seedCharacter(pirateFactions.guristas);

    expect(
      enlistedFactionForSetup({
        selectedCharacter: HASH,
        enlistedFaction: pirateFactions.angelCartel,
      }),
    ).toBe(pirateFactions.angelCartel);
  });

  it("answers none for a character flying for nobody", () => {
    expect(enlistedFactionForSetup({ selectedCharacter: HASH })).toBeNull();
  });

  it("answers none when the setup names a character nobody holds", () => {
    expect(enlistedFactionForSetup({ selectedCharacter: "gone" })).toBeNull();
  });

  it("answers none for a setup naming no character at all", () => {
    expect(enlistedFactionForSetup({})).toBeNull();
    expect(enlistedFactionForSetup(null)).toBeNull();
  });
});

describe("which systems a militia holds", () => {
  it("names the faction holding one", () => {
    seedWorld(CALDARI);

    expect(militiaHolding(HELD_SYSTEM)).toBe(CALDARI);
    expect(militiaHolding(QUIET_SYSTEM)).toBe(0);
    expect(militiaHolding(undefined)).toBe(0);
  });

  it("carries the holding faction in from the payload the index rides in", () => {
    useUsersStore.getState().worldData.actions.addSystemIndex({
      [HELD_SYSTEM]: { manufacturing: 0.05, militiaFactionID: CALDARI },
    });

    expect(militiaHolding(HELD_SYSTEM)).toBe(CALDARI);
  });

  it("takes an upgrade level only where a militia holds the system", () => {
    seedWorld(CALDARI);

    expect(systemTakesAnUpgradeLevel({ systemID: HELD_SYSTEM })).toBe(true);
    expect(systemTakesAnUpgradeLevel({ systemID: QUIET_SYSTEM })).toBe(false);
  });
});

describe("which militias would change what a setup costs", () => {
  beforeEach(() => {
    seedWorld(CALDARI);
  });

  it("names nobody for an ordinary place in a system no militia holds", () => {
    expect(
      militiasThatMatterFor({
        jobType: jobTypes.manufacturing,
        structureID: 1,
        systemID: QUIET_SYSTEM,
      }),
    ).toEqual([]);
  });

  it("names the militia holding the system", () => {
    expect(
      militiasThatMatterFor({
        jobType: jobTypes.manufacturing,
        structureID: 1,
        systemID: HELD_SYSTEM,
      }),
    ).toEqual([CALDARI]);
  });

  it("names both pirate militias at a place that gives them figures", () => {
    expect(
      militiasThatMatterFor({
        jobType: jobTypes.manufacturing,
        structureID: 4,
        systemID: ZARZAKH_SYSTEM_ID,
      }),
    ).toEqual([pirateFactions.angelCartel, pirateFactions.guristas]);
  });

  it("names each militia once when a place and a system agree", () => {
    seedWorld(pirateFactions.guristas);

    expect(
      militiasThatMatterFor({
        jobType: jobTypes.manufacturing,
        structureID: 4,
        systemID: HELD_SYSTEM,
      }),
    ).toEqual([pirateFactions.angelCartel, pirateFactions.guristas]);
  });
});
