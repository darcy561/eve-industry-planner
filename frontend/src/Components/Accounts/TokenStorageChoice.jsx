import { useState } from "react";
import {
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
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

/** What the chosen mode means for the reader, rather than what the other one would mean. */
const WHAT_IT_MEANS = {
  cloud:
    "Linked characters' tokens are kept on the server, so signing in on another device keeps them.",
  local:
    "Linked characters' tokens are kept in this browser. Clearing its data, or signing in elsewhere, means linking them again.",
};

/**
 * Where the account's linked-character refresh tokens are kept.
 *
 * An account-wide choice made once, which is why it sits with the account rather than at the head
 * of the roster it governs. Changing it moves what is already held: to the cloud, whatever the
 * browser was storing; back, whatever the roster holds in memory — the server's copies cannot be
 * read back, so a reader switching to local is told the linked characters need adding again.
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
        // The server holds the OAuth refresh secrets in cloud mode and does not hand them back, so
        // what the browser can keep is only what the roster is already carrying.
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
      <ToggleButtonGroup
        exclusive
        size="small"
        disabled={isChanging}
        sx={{ width: { xs: "100%", sm: "auto" } }}
        value={cloudAccounts ? "cloud" : "local"}
        aria-label="Where linked character tokens are kept"
        onChange={(_event, next) => {
          if (next === null) return;
          void setCloudMode(next === "cloud");
        }}
      >
        <ToggleButton
          value="cloud"
          sx={{ textTransform: "none", px: 2, flex: 1 }}
        >
          Cloud
        </ToggleButton>
        <ToggleButton
          value="local"
          sx={{ textTransform: "none", px: 2, flex: 1 }}
        >
          This browser
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary">
        {cloudAccounts ? WHAT_IT_MEANS.cloud : WHAT_IT_MEANS.local}
      </Typography>
    </Stack>
  );
}
