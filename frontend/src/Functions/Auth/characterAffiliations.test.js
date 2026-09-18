import { beforeEach, describe, expect, it, vi } from "vitest";

const order = [];
const buildCorporation = vi.fn(async (character) => {
  order.push("corporation");
  return character.corporation_id
    ? { corporation_id: character.corporation_id }
    : null;
});
const buildAlliance = vi.fn(async () => {
  order.push("alliance");
});

vi.mock("../Corporations/buildCorporationObject", () => ({
  buildCorporationObjectFromUserObject: (...args) => buildCorporation(...args),
}));

vi.mock("../Alliances/buildAllianceObject", () => ({
  buildAllianceObjectFromCorporation: (...args) => buildAlliance(...args),
}));

const { buildCharacterAffiliations } =
  await import("./characterAffiliations.js");

function character(corporationID = 98000001) {
  return {
    CharacterHash: "hash-1",
    corporation_id: null,
    getPublicCharacterData: vi.fn(async function () {
      order.push("public data");
      this.corporation_id = corporationID;
    }),
  };
}

describe("resolving who a character is affiliated with", () => {
  beforeEach(() => {
    order.length = 0;
    buildCorporation.mockClear();
    buildAlliance.mockClear();
  });

  // The order is the point: a character's public data carries its corporation id, and the
  // corporation's carries its alliance id. Neither later step has anything to ask about until the
  // one before it has answered.
  it("asks in the order each answer becomes available", async () => {
    const ch = character();

    await buildCharacterAffiliations(ch);

    expect(order).toEqual(["public data", "corporation", "alliance"]);
    expect(buildCorporation).toHaveBeenCalledWith(ch);
    expect(buildAlliance).toHaveBeenCalledWith({ corporation_id: 98000001 });
  });

  it("stops after the corporation when there was none to build", async () => {
    const ch = character(null);

    await buildCharacterAffiliations(ch);

    expect(order).toEqual(["public data", "corporation"]);
    expect(buildAlliance).not.toHaveBeenCalled();
  });
});
