import { beforeEach, describe, expect, it } from "vitest";

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function watchlist() {
  return useUsersStore.getState().jobData.userWatchlist;
}

const ITEM = { id: "item-1", typeID: 34 };
const GROUP = { id: "group-1", name: "Ships" };

describe("the user watchlist", () => {
  beforeEach(() => {
    actions().resetJobDataStore();
  });

  it("takes items and groups together", () => {
    actions().setUserWatchlist([ITEM], [GROUP]);
    expect(watchlist()).toEqual({ items: [ITEM], groups: [GROUP] });
  });

  it("replaces the items without disturbing the groups", () => {
    actions().setUserWatchlist([ITEM], [GROUP]);
    actions().setUserWatchlistItems([]);
    expect(watchlist()).toEqual({ items: [], groups: [GROUP] });
  });

  it("replaces the groups without disturbing the items", () => {
    actions().setUserWatchlist([ITEM], [GROUP]);
    actions().setUserWatchlistGroups([]);
    expect(watchlist()).toEqual({ items: [ITEM], groups: [] });
  });

  /*
   * A read that returned nothing arrives as undefined, and the watchlist is
   * walked on render — an absent side has to become an empty list rather than
   * reach a component.
   */
  it("reads a missing side as empty", () => {
    actions().setUserWatchlist(undefined, undefined);
    expect(watchlist()).toEqual({ items: [], groups: [] });

    actions().setUserWatchlistItems(undefined);
    actions().setUserWatchlistGroups(undefined);
    expect(watchlist()).toEqual({ items: [], groups: [] });
  });
});
