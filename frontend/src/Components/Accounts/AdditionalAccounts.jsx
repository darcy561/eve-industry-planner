import { Button, Grid, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";
import { AccountEntry } from "./AccountEntry";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import {
  showSnackbarSuccess,
  showSnackbarError,
  showSnackbarInfo,
} from "../../Events/snackbarEvents";
import refreshAccountSessionGrants from "../../Functions/Auth/refreshAccountSessionGrants.js";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchCollections } from "../../Functions/EveESI/prefetch/scheduler";
import { buildCorporationObjectFromUserObject } from "../../Functions/Corporations/buildCorporationObject";
import {
  flushPendingUserDocumentSaves,
  scheduleDebouncedUserAccountDocumentSave,
} from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { upsertCloudStoredEsiRefreshTokens } from "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js";
import {
  buildAdditionalAccountState,
  subscribeToAdditionalUserAuthCode,
  watchForClosedImportPopup,
} from "../Auth/additionalAccountImport.js";
import { getEveSsoAuthorizeUrl } from "../Auth/Functions/eveSSORedirect";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import {
  canonicalCharacterHashKey,
  isCharacterInListByHash,
} from "../../Functions/Auth/characterHashCanonical.js";
import {
  getLocalAdditionalAccountsStorageKey,
  updateLocalRefreshTokens,
} from "../../Functions/Auth/buildAccountData";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import SelectableCard from "../../Styled Components/Paper/SelectableCard";

export function AdditionalAccounts() {
  const characters = useUsersStore((state) => state.account.characters);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cloudModeChanging, setCloudModeChanging] = useState(false);

  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts,
  );
  const { setCloudAccountsEnabled } =
    useUsersStore.getState().applicationSettings.actions;
  const { addCharacter } = useUsersStore((state) => state.account.actions);

  const [skeletonVisible, toggleSkeleton] = useState(false);
  const queryClient = useQueryClient();
  const detachImportListenerRef = useRef(null);

  useEffect(
    () => () => {
      const d = detachImportListenerRef.current;
      if (typeof d === "function") d();
    },
    [],
  );

  const submitCloudLinkedCharacterRefreshTokens = async (
    tokenOverrides = new Map(),
  ) => {
    const payload = [];
    for (const [hash, token] of tokenOverrides.entries()) {
      const characterHash = typeof hash === "string" ? hash.trim() : "";
      if (!characterHash || !token) continue;
      payload.push({
        CharacterHash: characterHash,
        rToken: token,
      });
    }
    if (payload.length === 0) return;
    const ok = await upsertCloudStoredEsiRefreshTokens(payload);
    if (!ok) {
      throw new Error("Failed to submit linked character token to server");
    }
  };

  const buildTokenOverridesFromCharacters = (characterRows = []) => {
    const overrides = new Map();
    for (const row of characterRows) {
      if (!row || row.isMainCharacter) continue;
      const characterHash =
        typeof row.CharacterHash === "string" ? row.CharacterHash.trim() : "";
      const token =
        typeof row.esiRefreshToken === "string"
          ? row.esiRefreshToken.trim()
          : "";
      if (!characterHash || !token) continue;
      overrides.set(characterHash, token);
    }
    return overrides;
  };

  const applyImportedAdditionalUser = async (newUser) => {
    const cloudNow =
      !!useUsersStore.getState().applicationSettings.userCloudAccounts;

    if (cloudNow) {
      const overrides = new Map([
        [newUser.CharacterHash, newUser.esiRefreshToken],
      ]);
      await submitCloudLinkedCharacterRefreshTokens(overrides);
    } else {
      const characters = useUsersStore.getState().account.characters;
      const toPersist = isCharacterInListByHash(
        characters,
        newUser.CharacterHash,
      )
        ? characters
        : [...characters, newUser];
      updateLocalRefreshTokens(toPersist);
    }

    await refreshAccountSessionGrants();
    if (cloudNow) {
      scheduleDebouncedUserAccountDocumentSave();
      await flushPendingUserDocumentSaves();
    }
    trackAppEvent(
      cloudNow
        ? AppEvent.ADD_ADDITIONAL_CHARACTER_CLOUD
        : AppEvent.ADD_ADDITIONAL_CHARACTER_LOCAL,
    );
    prefetchCollections(queryClient, [newUser.CharacterHash]).catch((error) => {
      console.error("Error during character data prefetch:", error);
    });
    showSnackbarSuccess(`${newUser.CharacterName} Imported`, 3);
  };

  const importAdditionalAccountFromAuthCode = async (authCode) => {
    try {
      const newUser = await getEveOauthToken(authCode, false);
      if (newUser instanceof Error) {
        throw newUser;
      }

      if (
        isCharacterInListByHash(
          useUsersStore.getState().account.characters,
          newUser.CharacterHash,
        )
      ) {
        showSnackbarError("Duplicate Account", 3);
        return;
      }

      await newUser.getPublicCharacterData();
      await buildCorporationObjectFromUserObject(newUser);
      addCharacter(newUser);

      await applyImportedAdditionalUser(newUser);
    } catch (err) {
      console.error(err);
      showSnackbarError(`${err.message}`, 3);
    } finally {
      detachImportListenerRef.current = null;
      toggleSkeleton(false);
      setIsProcessing(false);
    }
  };

  const handleAdd = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    toggleSkeleton(true);

    const prevDetach = detachImportListenerRef.current;
    if (typeof prevDetach === "function") {
      prevDetach();
    }

    const nonce = crypto.randomUUID();
    let cancelPopupWatch = () => {};
    const stopWaiting = () => {
      cancelPopupWatch();
      detachImportListenerRef.current = null;
      toggleSkeleton(false);
      setIsProcessing(false);
    };

    const detach = subscribeToAdditionalUserAuthCode({
      nonce,
      onAuthCode: (code) => {
        cancelPopupWatch();
        void importAdditionalAccountFromAuthCode(code);
      },
      onTimeout: stopWaiting,
    });
    detachImportListenerRef.current = detach;

    const popup = window.open(
      getEveSsoAuthorizeUrl(buildAdditionalAccountState(nonce)),
      "_blank",
    );
    cancelPopupWatch = watchForClosedImportPopup(popup, () => {
      detach();
      stopWaiting();
      showSnackbarInfo("Import Cancelled", 3);
    });
  };

  const setCloudMode = async (nextCloudEnabled) => {
    if (nextCloudEnabled === cloudAccounts) return;
    if (cloudModeChanging) return;
    setCloudModeChanging(true);
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
        const storedAccounts = JSON.parse(
          localStorage.getItem(localStorageKey) || "[]",
        );
        const overrides = new Map();
        for (const row of storedAccounts) {
          const hash = row?.CharacterHash || row?.characterHash;
          const token = row?.rToken || "";
          const characterHash = typeof hash === "string" ? hash.trim() : "";
          if (!characterHash || !token) continue;
          overrides.set(characterHash, token);
        }
        if (overrides.size === 0) {
          const fallbackOverrides = buildTokenOverridesFromCharacters(
            useUsersStore.getState().account.characters,
          );
          for (const [hash, token] of fallbackOverrides.entries()) {
            overrides.set(hash, token);
          }
        }
        if (overrides.size > 0) {
          await submitCloudLinkedCharacterRefreshTokens(overrides);
          localStorage.removeItem(localStorageKey);
        }
      } else {
        // OAuth refresh secrets remain server-side in cloud mode; we cannot copy them into localStorage.
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
      setCloudModeChanging(false);
    }
  };

  return (
    <SectionPanel
      title="Linked characters"
      subtitle="Linking a character imports its ESI data alongside your main account's. Characters can be added and removed at any time."
      componentName="Linked characters"
    >
      <Grid container>
        <Grid container size={12}>
          <Grid size={12}>
            <Stack spacing={1.5}>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <Typography variant="body2" color="text.secondary">
                  Storage mode
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={skeletonVisible}
                  onClick={handleAdd}
                  sx={{
                    borderRadius: 2,
                    minWidth: 132,
                    textTransform: "none",
                    fontWeight: 600,
                    borderColor: (theme) =>
                      alpha(theme.palette.primary.main, 0.35),
                    bgcolor: (theme) =>
                      alpha(theme.palette.background.paper, 0.55),
                    "&:hover": {
                      borderColor: "primary.main",
                      bgcolor: (theme) =>
                        alpha(theme.palette.primary.main, 0.08),
                    },
                  }}
                >
                  Add Account
                </Button>
              </Stack>
              <Grid
                container
                spacing={1.25}
                role="radiogroup"
                aria-label="Additional account storage mode"
              >
                <Grid size={{ xs: 12, md: 6 }}>
                  <SelectableCard
                    selected={!cloudAccounts}
                    disabled={cloudModeChanging}
                    onSelect={() => {
                      void setCloudMode(false);
                    }}
                    title="Local"
                    body="Stores additional character tokens locally in the browser. Tokens will be removed if the browsers cache is cleared. Logging into this account on another device will require re adding the characters again."
                    sx={{ height: "100%" }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <SelectableCard
                    selected={cloudAccounts}
                    disabled={cloudModeChanging}
                    onSelect={() => {
                      void setCloudMode(true);
                    }}
                    title="Cloud"
                    body="Stores the additional character tokens in the cloud. This allows you to login to this account on another device without having to re add the characters again."
                    sx={{ height: "100%" }}
                  />
                </Grid>
              </Grid>
            </Stack>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: 2 }} size={12}>
          {skeletonVisible ? (
            <Grid
              container
              align="center"
              size={12}
              sx={{
                alignItems: "center",
                marginTop: 1,
                marginLeft: 1,
              }}
            >
              <Grid
                align="left"
                size={{
                  xs: 2,
                  sm: 1,
                }}
              >
                <Skeleton variant="circular" width={40} height={40} />
              </Grid>
              <Grid
                size={{
                  xs: 8,
                  sm: 9,
                }}
              >
                <Skeleton variant="text" />
              </Grid>
              <Grid size={1}>
                <Skeleton
                  variant="circular"
                  width={30}
                  height={30}
                  align="center"
                />
              </Grid>
              <Grid size={1}>
                <Skeleton
                  variant="circular"
                  width={30}
                  height={30}
                  align="center"
                />
              </Grid>
            </Grid>
          ) : (
            characters.map((character, index) => {
              if (character.isMainCharacter) return null;
              return (
                <AccountEntry
                  key={`${canonicalCharacterHashKey(character.CharacterHash)}-${index}`}
                  character={character}
                />
              );
            })
          )}
        </Grid>
      </Grid>
    </SectionPanel>
  );
}
