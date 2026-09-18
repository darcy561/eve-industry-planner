import { describe, expect, it } from "vitest";
import Alliance from "../../Classes/alliance.js";
import { alliancesActions } from "./alliancesActions.js";

function actionsOver(alliances) {
  const state = { account: { alliances, actions: {} } };
  const get = () => state;
  const set = (updater) => {
    Object.assign(state, updater(state));
  };
  state.account.actions = alliancesActions(set, get);
  return { actions: state.account.actions, state };
}

function alliance(id, corporationID) {
  return new Alliance(
    { corporation_id: corporationID, alliance_id: id },
    { name: `Alliance ${id}` },
  );
}

describe("the alliances an account can see", () => {
  it("finds one by id and answers null for a miss", () => {
    const { actions } = actionsOver([alliance(99005338, 98000001)]);

    expect(actions.getAlliance("99005338").allianceName).toBe(
      "Alliance 99005338",
    );
    expect(actions.getAlliance(99009999)).toBeNull();
  });

  it("replaces the one it holds rather than listing it twice", () => {
    const { actions, state } = actionsOver([alliance(99005338, 98000001)]);
    const rebuilt = alliance(99005338, 98000002);

    actions.addAlliance(rebuilt);

    expect(state.account.alliances).toEqual([rebuilt]);
  });

  // An account reaches an alliance only through a corporation it is in, so the last corporation
  // leaving takes the alliance with it.
  it("drops an alliance once its last corporation has gone", () => {
    const horde = alliance(99005338, 98000001);
    horde.addCorporation(98000002);
    const { actions, state } = actionsOver([horde]);

    actions.removeCorporationFromAlliances(98000001);
    expect(state.account.alliances).toHaveLength(1);
    expect(horde.corporations).toEqual([98000002]);

    actions.removeCorporationFromAlliances("98000002");
    expect(state.account.alliances).toEqual([]);
  });
});
