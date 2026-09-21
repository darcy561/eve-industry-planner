import getUniverseNames from "./getUniverseNames";
import { fetchStructureName, communityNameOrRefusal } from "./getCitadelData";
import { LOCATION_OUTCOME } from "./locationOutcome";
import { askEachCharacter } from "./askEachCharacter";
import nameSource, { NAME_SOURCE } from "./nameSource";

/** ESI resolves up to a thousand ids in one `POST /universe/names`. */
const NAMES_BATCH_SIZE = 1000;

/**
 * Ids waiting to be asked about, and everyone waiting on each.
 *
 * @type {Map<number, {characters: Array<Object>, waiters: Array<{resolve: Function, reject: Function}>}>}
 */
const pending = new Map();
let flushScheduled = false;

/**
 * Asks for one location's name, batched with whatever else is asked for in the same tick.
 *
 * The cache above this is keyed by id, which is what makes two views wanting the same structure one
 * entry rather than two — but a request per id would be a request per name. Everything raised in one
 * tick is collected here and issued as ESI takes it: the public ids in one bulk call, each structure
 * as its own walk. Two callers wanting the same id in the same tick wait on one lookup.
 *
 * @param {number} id
 * @param {Array<Object>} characters - the account's characters, tried in order for a structure
 * @returns {Promise<{id: number, name?: string, resolutionStatus: string}>}
 * @throws {LocationResolutionError} the lookup did not settle; the caller retries
 */
export function requestName(id, characters = []) {
  return new Promise((resolve, reject) => {
    const waiting = pending.get(id);
    if (waiting) {
      waiting.waiters.push({ resolve, reject });
    } else {
      pending.set(id, { characters, waiters: [{ resolve, reject }] });
    }

    if (!flushScheduled) {
      flushScheduled = true;
      // A macrotask rather than a microtask: React renders the whole list of views wanting names
      // before yielding, and a microtask would flush after the first of them.
      setTimeout(flush, 0);
    }
  });
}

async function flush() {
  const batch = new Map(pending);
  pending.clear();
  flushScheduled = false;
  if (batch.size === 0) return;

  const publicIds = [];
  const structureIds = [];
  for (const id of batch.keys()) {
    switch (nameSource(id)) {
      case NAME_SOURCE.BULK:
        publicIds.push(id);
        break;
      case NAME_SOURCE.CHARACTER:
        structureIds.push(id);
        break;
      default:
        // Nothing can name it, so nothing is asked. Both paths would answer with an error, and the
        // bulk one would refuse the whole batch this id was carried in.
        settleWaiters(batch, id, {
          id,
          resolutionStatus: LOCATION_OUTCOME.UNNAMED,
        });
    }
  }

  await Promise.all([
    ...chunk(publicIds, NAMES_BATCH_SIZE).map((ids) =>
      settlePublicNames(ids, batch),
    ),
    ...structureIds.map((id) => settleStructureName(id, batch)),
  ]);
}

/**
 * ESI's answer to a batch holding an id it cannot resolve: the whole call is refused with this
 * status, naming nothing and saying nothing about which id was at fault.
 */
const INVALID_IDS_STATUS = 404;

async function settlePublicNames(ids, batch) {
  let named;
  try {
    named = await getUniverseNames(ids);
  } catch (err) {
    if (err?.permanent) {
      // Not a bad id among good ones: the call itself was refused, so nothing in it was looked at.
      // Splitting would narrow down to a single id and settle it as nameless on the strength of a
      // fault that was never about that id — and asking again would be refused identically.
      reportRefusedRequest(ids, err);
      for (const id of ids) rejectWaiters(batch, id, err);
      return;
    }
    if (err?.status === INVALID_IDS_STATUS && ids.length > 1) {
      // One unresolvable id refuses the batch it is in, so the ids beside it are not answered for.
      // Splitting the batch narrows down which id that is; every other id still gets its name.
      const half = Math.ceil(ids.length / 2);
      await Promise.all([
        settlePublicNames(ids.slice(0, half), batch),
        settlePublicNames(ids.slice(half), batch),
      ]);
      return;
    }
    if (err?.status === INVALID_IDS_STATUS) {
      // Alone and still refused: ESI has said this id resolves to nothing. That is an answer, and
      // keeping it is what stops the id being asked about on every render for the rest of the
      // session — and, more to the point, poisoning every batch it lands in.
      settleWaiters(batch, ids[0], {
        id: ids[0],
        resolutionStatus: LOCATION_OUTCOME.UNNAMED,
      });
      return;
    }
    for (const id of ids) rejectWaiters(batch, id, err);
    return;
  }

  const byId = new Map(named.map((entry) => [Number(entry.id), entry]));
  for (const id of ids) {
    const entry = byId.get(id);
    settleWaiters(
      batch,
      id,
      entry
        ? { ...entry, id, resolutionStatus: LOCATION_OUTCOME.NAMED }
        : // Kept though every id ESI rejects was measured as refusing the whole call rather than
          // being left out of a successful one: what an id that was valid once and has since gone
          // from ESI's data does is unmeasured, and this is what would catch it.
          { id, resolutionStatus: LOCATION_OUTCOME.UNNAMED },
    );
  }
}

async function settleStructureName(id, batch) {
  const { characters } = batch.get(id);

  let walk;
  try {
    walk = await askEachCharacter(
      characters,
      (character) => fetchStructureName(id, character),
      { locationID: id, reads: "structure names" },
    );
  } catch (err) {
    rejectWaiters(batch, id, err);
    return;
  }

  if (!walk.refused) {
    settleWaiters(batch, id, walk.answer.name);
    return;
  }

  try {
    settleWaiters(batch, id, await communityNameOrRefusal(id));
  } catch (err) {
    rejectWaiters(batch, id, err);
  }
}

/**
 * Requests already reported as refused outright.
 *
 * A permanent failure is never cached — it rejects, and the next view wanting those ids asks
 * again — so without this the same bad request is reported on every mount for the life of the
 * session.
 *
 * @type {Set<string>}
 */
const reportedRefusals = new Set();

function reportRefusedRequest(ids, err) {
  const seen = `${err.status}:${[...ids].sort((a, b) => a - b).join(",")}`;
  if (reportedRefusals.has(seen)) return;
  reportedRefusals.add(seen);
  console.error(
    `Location names: ESI refused a batch of ${ids.length} outright — ${err.message}`,
  );
}

function settleWaiters(batch, id, outcome) {
  for (const waiter of batch.get(id)?.waiters ?? []) waiter.resolve(outcome);
}

function rejectWaiters(batch, id, error) {
  for (const waiter of batch.get(id)?.waiters ?? []) waiter.reject(error);
}

function chunk(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}
