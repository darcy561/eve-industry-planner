import { useCallback } from "react";

import { marketLocationsChanged } from "../../../../Functions/MarketData/marketLocations";
import useUsersStore from "../../../../Zustand/usersStore";
import {
  flushPendingUserDocumentSaves,
  scheduleDebouncedApplicationSettingsSave,
} from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  flushPendingPlannerSettingsSaves,
  scheduleDebouncedPlannerSettingsSave,
} from "../../../../Functions/Debounce/plannerSettingsPersistSchedule.js";

/**
 * Saves a market.
 *
 * Saving one says nothing about where a job is priced: which market the account
 * buys and sells at is its own setting, so adding a market never quietly answers
 * it. A reader who wants this one used picks it there.
 *
 * @param {Array<object>} lane
 * @param {object} market
 * @returns {Array<object>}
 */
export function addMarket(lane, market) {
  if (!market?.id) return lane;
  return [...lane, market];
}

/**
 * Changes what an owner recorded about one of their markets.
 *
 * The place it names is not among them: a market somewhere else is a different
 * market, and the prices, the character that read it and its turn on the
 * rotation are all held under this one's id.
 *
 * @param {Array<object>} lane
 * @param {string} marketID
 * @param {{name?: string, brokerFee?: number, sharedWithMembers?: boolean}} changes
 * @returns {Array<object>}
 */
export function updateMarket(lane, marketID, changes) {
  if (!marketID || !changes) return lane;

  return lane.map((market) =>
    market.id === marketID
      ? {
          ...market,
          name: changes.name ?? market.name,
          ...onlyGiven(changes, "brokerFee"),
          ...onlyGiven(changes, "sharedWithMembers"),
        }
      : market,
  );
}

/**
 * Forgets a market.
 *
 * An account still pointing at it for its buying or selling default is left
 * pointing at nothing, which resolves back to the trading hub — the same answer
 * a reader gets before they have chosen anything.
 *
 * @param {Array<object>} lane
 * @param {string} marketID
 * @returns {Array<object>}
 */
export function removeMarket(lane, marketID) {
  if (!marketID) return lane;
  return lane.filter((market) => market.id !== marketID);
}

/** A field only where one was given, so an absent change leaves it alone. */
function onlyGiven(changes, field) {
  return changes[field] === undefined ? {} : { [field]: changes[field] };
}

/**
 * Where a change to one market goes.
 *
 * A market is stored on the settings document of whoever saved it, so the same
 * edit reaches a different document depending on the row it was made on. One
 * place decides which, rather than each control asking — and it is the one place
 * a permission check goes when there is a roles model to check against.
 *
 * @param {string} [sharedBy] - The owner key a composed row came from, absent on
 *   one the reader saved themselves
 * @returns {(transform: (lane: object[]) => object[]) => void}
 */
export function marketWriter(sharedBy) {
  const store = useUsersStore.getState();

  if (!sharedBy) {
    return (transform) => {
      store.applicationSettings.actions.writeMarketLocations(transform);
      marketLocationsChanged();
      scheduleDebouncedApplicationSettingsSave();
      saved(flushPendingUserDocumentSaves());
    };
  }

  return (transform) => {
    store.plannerSettings.actions.writePlannerMarketLocations(
      sharedBy,
      transform,
    );
    marketLocationsChanged();
    scheduleDebouncedPlannerSettingsSave(sharedBy);
    saved(flushPendingPlannerSettingsSaves());
  };
}

/**
 * Saved now rather than on the debounce's trailing edge.
 *
 * Every surface reads the markets the server composed, so one just saved is
 * offered nowhere until that set has been read again — and it cannot be read
 * again until the document reaches the server. Waiting out the debounce would
 * leave a reader looking at a panel their new market is missing from.
 *
 * **Scheduled and then flushed, not flushed alone.** A flush writes whatever is
 * already waiting; it does not make a write out of nothing. Flushing without
 * scheduling first sends no request at all, which loses the change rather than
 * hurrying it.
 *
 * The failure is already reported by the save itself; what must not happen is an
 * unhandled rejection from a control that has no answer to give.
 */
function saved(write) {
  write.catch(() => {});
}

/**
 * Whether this reader can change a row, asked per row.
 *
 * An organisation's markets are editable once that organisation's settings have
 * been read: the composed row carries what a panel shows, and the write needs
 * the owner's own lane to apply a change to.
 *
 * A hook, because the answer changes while a panel is open — the settings of
 * every owner in the list are read as it mounts, and a row decided before they
 * arrived would stay uneditable until the reader left the tab and came back.
 *
 * @returns {(sharedBy?: string) => boolean}
 */
export function useMarketIsEditable() {
  const seededByOwner = useUsersStore(
    (state) => state.plannerSettings.seededByOwner,
  );

  return useCallback(
    (sharedBy) => !sharedBy || Boolean(seededByOwner[sharedBy]),
    [seededByOwner],
  );
}

/**
 * The edits a panel makes, against whichever document the row lives on.
 *
 * The composed set is read again once the write lands rather than folded into:
 * the union collapses two rows naming one place and settles which owner wins,
 * and applying that rule here would be it written twice, in two languages, free
 * to disagree.
 *
 * @param {string} [sharedBy]
 */
export function marketEdits(sharedBy) {
  const write = marketWriter(sharedBy);

  return {
    add: (market) => write((lane) => addMarket(lane, market)),
    update: (marketID, changes) =>
      write((lane) => updateMarket(lane, marketID, changes)),
    remove: (marketID) => write((lane) => removeMarket(lane, marketID)),
  };
}
