import { useState } from "react";
import { Stack, Typography } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import { SegmentedChoice } from "../../Styled Components/Select/SegmentedChoice";
import {
  showSnackbarError,
  showSnackbarInfo,
} from "../../Events/snackbarEvents";
import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  getLocalAdditionalAccountsStorageKey,
  updateLocalRefreshTokens,
} from "../../Functions/Auth/buildAccountData";
import {
  buildTokenOverridesFromCharacters,
  submitCloudLinkedCharacterRefreshTokens,
} from "../../Functions/Auth/linkedCharacterTokens.js";
import { FigureCaption } from "../../Styled Components/Typography/figures";

const TOKEN_STORAGE_OPTIONS = [
  { value: "cloud", label: "Cloud" },
  { value: "local", label: "This browser" },
];

/** What the chosen mode means for the reader, rather than what the other one would mean. */
const WHAT_IT_MEANS = {
  cloud:
    "Linked characters' tokens are kept on the server, so signing in on another device keeps them.",
  local:
    "Linked characters' tokens are kept in this browser. Clearing its data, or signing in elsewhere, means linking them again.",
};

/**
 * Where the account's linked-character refresh tokens are kept, moving what is already held when it
 * changes; switching to this browser means linking the characters again.
 */
export function TokenStorageChoice() {
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts,
  );
  const { setCloudAccountsEnabled } =
    useUsersStore.getState().applicationSettings.actions;
  const [isChanging, setIsChanging] = useState(false);

  async function setCloudMode(nextCloudEnabled) {
    if (nextCloudEnabled === cloudAccounts || isChanging) return;
    setIsChanging(true);
    try {
      const mainCharacterHash = useUsersStore
        .getState()
        .account.actions.getMainCharacterHash();
      if (!mainCharacterHash) {
        setCloudAccountsEnabled(nextCloudEnabled);
        scheduleDebouncedUserAccountDocumentSave();
        return;
      }

      const localStorageKey =
        getLocalAdditionalAccountsStorageKey(mainCharacterHash);

      if (nextCloudEnabled) {
        const stored = JSON.parse(
          localStorage.getItem(localStorageKey) || "[]",
        );
        const overrides = new Map();
        for (const row of stored) {
          const hash = row?.CharacterHash || row?.characterHash;
          const token = row?.rToken || "";
          const characterHash = typeof hash === "string" ? hash.trim() : "";
          if (!characterHash || !token) continue;
          overrides.set(characterHash, token);
        }
        if (overrides.size === 0) {
          const held = buildTokenOverridesFromCharacters(
            useUsersStore.getState().account.characters,
          );
          for (const [hash, token] of held.entries()) {
            overrides.set(hash, token);
          }
        }
        if (overrides.size > 0) {
          await submitCloudLinkedCharacterRefreshTokens(overrides);
          localStorage.removeItem(localStorageKey);
        }
      } else {
        updateLocalRefreshTokens(useUsersStore.getState().account.characters);
        showSnackbarInfo(
          "Switched to local storage. Link additional accounts again if you want OAuth refresh tokens saved only in this browser.",
          5,
        );
      }

      setCloudAccountsEnabled(nextCloudEnabled);
      scheduleDebouncedUserAccountDocumentSave();
    } catch (err) {
      console.error(err);
      showSnackbarError(
        err instanceof Error ? err.message : "Could not change storage mode",
        4,
      );
    } finally {
      setIsChanging(false);
    }
  }

  return (
    <Stack spacing={0.5}>
      <FigureCaption>Token storage</FigureCaption>
      <SegmentedChoice
        label="Where linked character tokens are kept"
        options={TOKEN_STORAGE_OPTIONS}
        value={cloudAccounts ? "cloud" : "local"}
        onChange={(next) => void setCloudMode(next === "cloud")}
        disabled={isChanging}
        stretch
        sx={{ width: { xs: "100%", sm: "auto" } }}
      />
      <Typography variant="body2" color="text.secondary">
        {cloudAccounts ? WHAT_IT_MEANS.cloud : WHAT_IT_MEANS.local}
      </Typography>
    </Stack>
  );
}
