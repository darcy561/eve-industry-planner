import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import {
  showSnackbarError,
  showSnackbarInfo,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents";
import refreshAccountSessionGrants from "../../Functions/Auth/refreshAccountSessionGrants.js";
import useUsersStore from "../../Zustand/usersStore";
import { buildCharacterAffiliations } from "../../Functions/Auth/characterAffiliations";
import {
  flushPendingUserDocumentSaves,
  scheduleDebouncedUserAccountDocumentSave,
} from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { submitCloudLinkedCharacterRefreshTokens } from "../../Functions/Auth/linkedCharacterTokens.js";
import { writeClientSecret } from "../../Functions/Auth/esiCredentials/provider.js";
import {
  buildAdditionalAccountState,
  subscribeToAdditionalUserAuthCode,
  watchForClosedImportPopup,
} from "../Auth/additionalAccountImport.js";
import { getEveSsoAuthorizeUrl } from "../Auth/Functions/eveSSORedirect";
import {
  canonicalCharacterHashKey,
  isCharacterInListByHash,
} from "../../Functions/Auth/characterHashCanonical.js";
import { updateLocalRefreshTokens } from "../../Functions/Auth/buildAccountData";
import { prefetchCollections } from "../../Functions/EveESI/prefetch/scheduler";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";

/** Whether a sign-in is in flight for this account, wherever it was started from. */
let linkInFlight = false;
const linkingListeners = new Set();

/** @param {() => void} listener */
function subscribeToLinking(listener) {
  linkingListeners.add(listener);
  return () => linkingListeners.delete(listener);
}

/** @param {boolean} next */
function setLinkInFlight(next) {
  if (linkInFlight === next) return;
  linkInFlight = next;
  for (const listener of linkingListeners) listener();
}

/**
 * Sends a character through EVE SSO in a popup and does what the account needs with what comes
 * back.
 *
 * Two callers, one mechanism: the roster links a character the account does not have, and a
 * character whose refresh secret is spent links again to replace it. Both open the same popup and
 * exchange the same code; what differs is whether a character already in the roster is a mistake
 * or the whole point.
 *
 * @returns {{linkCharacter: (options?: {relinkHash?: string}) => void, isLinking: boolean}}
 */
export function useLinkCharacter() {
  // Shared rather than per-row: every character row calls this hook and so does the roster's own
  // button, and two EVE sign-ins at once is two popups the reader has to tell apart.
  const isLinking = useSyncExternalStore(
    subscribeToLinking,
    () => linkInFlight,
  );
  const { addCharacter } = useUsersStore((state) => state.account.actions);
  const queryClient = useQueryClient();
  const detachListenerRef = useRef(null);

  useEffect(
    () => () => {
      const detach = detachListenerRef.current;
      if (typeof detach === "function") detach();
    },
    [],
  );

  /**
   * Puts a character's refresh secret where this account keeps them, and tells the server the
   * account's grants may have changed.
   *
   * @param {object} character
   * @returns {Promise<boolean>} whether the account keeps its secrets in the cloud
   */
  async function persistLinkedCharacter(character) {
    const cloudNow =
      !!useUsersStore.getState().applicationSettings.userCloudAccounts;

    if (cloudNow) {
      await submitCloudLinkedCharacterRefreshTokens(
        new Map([[character.CharacterHash, character.esiRefreshToken]]),
      );
    } else {
      const characters = useUsersStore.getState().account.characters;
      const toPersist = isCharacterInListByHash(
        characters,
        character.CharacterHash,
      )
        ? characters
        : [...characters, character];
      updateLocalRefreshTokens(toPersist);
    }

    await refreshAccountSessionGrants();
    if (cloudNow) {
      scheduleDebouncedUserAccountDocumentSave();
      await flushPendingUserDocumentSaves();
    }
    return cloudNow;
  }

  /**
   * Warms what the planner needs from a character whose credentials just changed hands.
   *
   * Not awaited: the roster shows the character immediately and its collections arrive behind it.
   *
   * @param {object} character
   */
  function warmCollections(character) {
    prefetchCollections(queryClient, [character.CharacterHash]).catch(
      (error) => {
        console.error("Error during character data prefetch:", error);
      },
    );
  }

  /**
   * Replaces the refresh secret of a character the account already holds.
   *
   * The roster entry is mutated rather than rebuilt, the way a rotated secret is: the secret is not
   * rendered, so writing it through the store would re-render every subscriber for a value none of
   * them display, and rebuilding the character would throw away what it has already loaded.
   *
   * @param {object} character - the character SSO returned
   * @param {string} relinkHash - the character the reader asked to link again
   */
  async function relinkCharacter(character, relinkHash) {
    const held = useUsersStore
      .getState()
      .account.characters.find(
        (entry) =>
          canonicalCharacterHashKey(entry?.CharacterHash) ===
          canonicalCharacterHashKey(relinkHash),
      );

    if (
      canonicalCharacterHashKey(character.CharacterHash) !==
      canonicalCharacterHashKey(relinkHash)
    ) {
      showSnackbarError(
        `Signed in as ${character.CharacterName}, which is not the character being linked again`,
        4,
      );
      return;
    }

    if (held) {
      // Writes the roster entry and, for the main character, `localStorage["Auth"]` — which is
      // what a cold reload resumes from, and where `updateLocalRefreshTokens` never writes.
      writeClientSecret(held.CharacterHash, character.esiRefreshToken);
    }
    await persistLinkedCharacter(held ?? character);
    // The character's collections are still whatever it last fetched, and its credentials work
    // again, so what it could not load while they were spent is worth asking for now.
    warmCollections(character);
    showSnackbarSuccess(`${character.CharacterName} linked again`, 3);
  }

  /**
   * @param {string} authCode
   * @param {string|null} relinkHash
   */
  async function applyAuthCode(authCode, relinkHash) {
    try {
      const character = await getEveOauthToken(authCode, false);
      if (character instanceof Error) {
        throw character;
      }

      if (relinkHash) {
        await relinkCharacter(character, relinkHash);
        return;
      }

      if (
        isCharacterInListByHash(
          useUsersStore.getState().account.characters,
          character.CharacterHash,
        )
      ) {
        showSnackbarError("Duplicate Account", 3);
        return;
      }

      await buildCharacterAffiliations(character);
      addCharacter(character);
      const cloudNow = await persistLinkedCharacter(character);
      // Only the add path: a character being linked again was already counted when it arrived.
      trackAppEvent(
        cloudNow
          ? AppEvent.ADD_ADDITIONAL_CHARACTER_CLOUD
          : AppEvent.ADD_ADDITIONAL_CHARACTER_LOCAL,
      );
      warmCollections(character);
      showSnackbarSuccess(`${character.CharacterName} Imported`, 3);
    } catch (err) {
      console.error(err);
      showSnackbarError(`${err.message}`, 3);
    } finally {
      detachListenerRef.current = null;
      setLinkInFlight(false);
    }
  }

  /**
   * @param {object} [options]
   * @param {string} [options.relinkHash] - a character already in the roster, whose refresh secret
   *   this is replacing rather than adding a new character
   */
  function linkCharacter(options = {}) {
    if (isLinking) return;
    setLinkInFlight(true);

    const previousDetach = detachListenerRef.current;
    if (typeof previousDetach === "function") previousDetach();

    const relinkHash = options.relinkHash ?? null;
    const nonce = crypto.randomUUID();
    let cancelPopupWatch = () => {};
    const stopWaiting = () => {
      cancelPopupWatch();
      detachListenerRef.current = null;
      setLinkInFlight(false);
    };

    const detach = subscribeToAdditionalUserAuthCode({
      nonce,
      onAuthCode: (code) => {
        cancelPopupWatch();
        void applyAuthCode(code, relinkHash);
      },
      onTimeout: stopWaiting,
    });
    detachListenerRef.current = detach;

    const popup = window.open(
      getEveSsoAuthorizeUrl(buildAdditionalAccountState(nonce)),
      "_blank",
    );
    cancelPopupWatch = watchForClosedImportPopup(popup, () => {
      detach();
      stopWaiting();
      showSnackbarInfo("Import Cancelled", 3);
    });
  }

  return { linkCharacter, isLinking };
}
