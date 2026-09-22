import { LocationResolutionError } from "./locationOutcome";

/**
 * Asking an account's characters about a player structure, one after another,
 * and turning what they each say into the account's one answer.
 */

/**
 * The first answer an account's characters give, or the account's refusal.
 *
 * The caller supplies `ask`, which takes one character and answers the way
 * `fetchStructureName` and `fetchStructureOrders` do: `{refused: true}` where
 * that character was told no, the answer itself otherwise, and a thrown error
 * carrying `needsReauthorisation` where the token was never granted the scope.
 *
 * Characters are asked in the order given, so a caller that knows which one to
 * try first puts it first.
 *
 * @template T
 * @param {Array<object>} characters - The account's characters, in ask order
 * @param {(character: object) => Promise<{refused: true}|T>} ask
 * @param {{locationID: number, reads: string}} about - The structure being
 *   asked about, and a noun phrase for what a character cannot read without the
 *   scope, used where one has to be told
 * @returns {Promise<{refused: true}|{refused: false, answer: T, character: object}>}
 *   The character that answered is named, so a caller that can remember it for
 *   next time does not have to work out which one it was
 * @throws {LocationResolutionError} nothing was established: some character
 *   failed rather than answering, nobody was in a position to ask, or the
 *   account has no characters
 */
export async function askEachCharacter(characters, ask, { locationID, reads }) {
  const asked = characters ?? [];
  let refusals = 0;
  let unaskable = 0;
  let lastFailure = null;

  for (const character of asked) {
    let answer;
    try {
      answer = await ask(character);
    } catch (err) {
      if (err?.needsReauthorisation) {
        unaskable += 1;
        reportCharacterNeedsReauthorisation(character, reads);
        continue;
      }
      lastFailure = err;
      continue;
    }

    if (!answer.refused) return { refused: false, answer, character };
    refusals += 1;
  }

  // A character that could not ask might have been the one that could see it,
  // so the account has not established that it cannot.
  if (lastFailure && refusals + unaskable < asked.length) throw lastFailure;

  if (unaskable > 0 && refusals === 0) {
    throw new LocationResolutionError(
      `${reads}: no character is authorised to ask`,
      { locationId: locationID, needsReauthorisation: true },
    );
  }

  if (asked.length === 0) {
    throw new LocationResolutionError(`${reads}: no characters`, {
      locationId: locationID,
    });
  }

  return { refused: true };
}

/**
 * Characters already named as needing re-authorisation, by what they cannot
 * read — so one un-scoped character is reported once for names and once for
 * prices, rather than once per structure it could not be asked about.
 *
 * @type {Set<string>}
 */
const reported = new Set();

function reportCharacterNeedsReauthorisation(character, reads) {
  const hash = character?.CharacterHash;
  if (!hash || reported.has(`${hash}|${reads}`)) return;
  reported.add(`${hash}|${reads}`);

  console.warn(
    `${character?.CharacterName ?? hash} cannot read ${reads}: its ESI authorisation predates that permission. Link the character again to restore ${reads}.`,
  );
}

/** Lets a test see the warning again. */
export function resetReauthorisationReports() {
  reported.clear();
}

/**
 * The account's characters, the ones likely to be able to answer first.
 *
 * A structure refuses every character without docking rights, and ESI charges a
 * refusal at five times what an answer costs, so a walk that starts with a
 * character known to have seen the place is the difference between one request
 * and one per character. What "known" means is the caller's: the market rotation
 * records who last read a citadel, while a name lookup knows whose assets, jobs
 * or orders the structure turned up in.
 *
 * The rest follow rather than being dropped, because the knowledge can be stale
 * — a character no longer linked, docking rights lost — and stopping at it would
 * let a structure go quiet with nothing saying why.
 *
 * @param {Array<object>} characters - The account's characters
 * @param {Iterable<string>} [likely] - Character hashes to ask first, in the
 *   account's own order among themselves
 * @returns {Array<object>} `characters`, reordered
 */
export function askOrder(characters, likely = []) {
  const first = new Set(likely);
  const asked = characters ?? [];
  if (first.size === 0) return asked;

  const isLikely = (character) => first.has(character?.CharacterHash);
  return [...asked.filter(isLikely), ...asked.filter((c) => !isLikely(c))];
}
