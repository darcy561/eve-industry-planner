import { describe, expect, it } from "vitest";
import Alliance from "./alliance.js";

function alliance(publicData = {}) {
  return new Alliance(
    { corporation_id: 98000001, alliance_id: 99005338 },
    { name: "Pandemic Horde", ticker: "REKTD", ...publicData },
  );
}

describe("an alliance the account can see", () => {
  it("is named and tickered from EVE's own description of it", () => {
    const horde = alliance({ executor_corporation_id: 98000001 });

    expect(horde.alliance_id).toBe(99005338);
    expect(horde.allianceName).toBe("Pandemic Horde");
    expect(horde.allianceTicker).toBe("REKTD");
    expect(horde.executorCorporationID).toBe(98000001);
  });

  // ESI answering with nothing must not leave a row with no name at all; the account still reaches
  // the alliance, it just cannot say what it is called.
  it("reads as unknown rather than blank when ESI said nothing", () => {
    const unnamed = new Alliance(
      { corporation_id: 98000001, alliance_id: 99005338 },
      {},
    );

    expect(unnamed.allianceName).toBe("Unknown Alliance");
    expect(unnamed.allianceTicker).toBe("UNKNOWN");
    expect(unnamed.executorCorporationID).toBeNull();
  });

  // The membership EVE models: an account reaches an alliance through the corporations it is in.
  it("holds the corporations it was reached through", () => {
    const horde = alliance();

    horde.addCorporation(98000002);
    horde.addCorporation("98000002");

    expect(horde.corporations).toEqual([98000001, 98000002]);
    expect(horde.hasCorporation("98000001")).toBe(true);
  });

  it("lets a corporation go", () => {
    const horde = alliance();
    horde.addCorporation(98000002);

    horde.removeCorporation("98000001");

    expect(horde.corporations).toEqual([98000002]);
    expect(horde.hasCorporation(98000001)).toBe(false);
  });
});
