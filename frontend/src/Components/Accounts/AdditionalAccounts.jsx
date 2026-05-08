import {
  Button,
  FormControlLabel,
  FormGroup,
  Grid,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";
import { AccountEntry } from "./AccountEntry";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import {
  showSnackbarSuccess,
  showSnackbarError,
  showSnackbarInfo,
} from "../../Events/snackbarEvents";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../Hooks/React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../../Functions/Corporations/buildCorporationObject";
import {
  flushPendingUserDocumentSaves,
  scheduleDebouncedUserAccountDocumentSave,
} from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  upsertCloudStoredEsiRefreshTokens,
} from "../../Functions/Endpoints/Pirivate/cloudStoredEsiRefreshTokens.js";
import {
  clearAdditionalUserAuthCode,
  EVE_SSO_ADDITIONAL_ACCOUNT_STATE,
  subscribeToAdditionalUserAuthCodeFromStorage,
} from "../Auth/authCallbackParams.js";
import { getEveSsoAuthorizeUrl } from "../Auth/Functions/eveSSORedirect";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../Context/defaultValues";
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
import { FirstLoginChoiceRow } from "../First Login/shared/FirstLoginChoiceRow";

const firstLoginPanelSx = {
  p: { xs: 2, sm: 2.5 },
  borderRadius: 2,
  border: "1px solid",
  borderColor: (theme) => alpha(theme.palette.primary.main, 0.14),
  bgcolor: (theme) =>
    alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.5 : 0.88,
    ),
  width: "100%",
};

/**
 * @param {{ appearance?: "default" | "firstLogin" }} [props]
 */
export function AdditionalAccounts({ appearance = "default" } = {}) {
  const isFirstLogin = appearance === "firstLogin";
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
  const { triggerCharacterDataPrefetch } = useCharacterHooks();
  const detachStorageListenerRef = useRef(null);

  useEffect(
    () => () => {
      const d = detachStorageListenerRef.current;
      if (typeof d === "function") d();
    },
    [],
  );

  const submitCloudLinkedCharacterRefreshTokens = async (tokenOverrides = new Map()) => {
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
      const characterHash = typeof row.CharacterHash === "string"
        ? row.CharacterHash.trim()
        : "";
      const token = typeof row.esiRefreshToken === "string"
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

    await checkUserClaims();
    if (cloudNow) {
      scheduleDebouncedUserAccountDocumentSave();
      await flushPendingUserDocumentSaves();
    }
    trackAppEvent(
      cloudNow
        ? AppEvent.ADD_ADDITIONAL_CHARACTER_CLOUD
        : AppEvent.ADD_ADDITIONAL_CHARACTER_LOCAL,
    );
    triggerCharacterDataPrefetch(queryClient, newUser.CharacterHash);
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
        clearAdditionalUserAuthCode();
        showSnackbarError("Duplicate Account", 3);
        return;
      }

      await newUser.getPublicCharacterData();
      await buildCorporationObjectFromUserObject(newUser);
      addCharacter(newUser);
      clearAdditionalUserAuthCode();

      await applyImportedAdditionalUser(newUser);
    } catch (err) {
      clearAdditionalUserAuthCode();
      console.error(err);
      showSnackbarError(`${err.message}`, 3);
    } finally {
      toggleSkeleton(false);
      setIsProcessing(false);
    }
  };

  const handleAdd = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    toggleSkeleton(true);
    const prevDetach = detachStorageListenerRef.current;
    if (typeof prevDetach === "function") {
      prevDetach();
    }
    detachStorageListenerRef.current =
      subscribeToAdditionalUserAuthCodeFromStorage({
        onAuthCode: (code) => {
          void importAdditionalAccountFromAuthCode(code);
        },
        onTimeout: () => {
          toggleSkeleton(false);
          setIsProcessing(false);
        },
      });
    window.open(
      getEveSsoAuthorizeUrl(EVE_SSO_ADDITIONAL_ACCOUNT_STATE),
      "_blank",
    );
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

  const inner = (
    <Grid container>
      {appearance !== "firstLogin" ? (
        <Grid sx={{ marginTop: 1, marginBottom: 2 }} size={12}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Additional accounts can be linked allowing you to import the ESI
            data in alongside your main accounts data. Additional accounts can
            be added and removed at any time.{<br />}
            {<br />}
            By default the additional accounts that you choose to link are only
            stored in the browser where they were added. If you wanted to make
            these accounts available on all other devices then you will need to
            enable the option to store the accounts in the cloud. Accounts that
            are stored locally will be removed if the browsers cache is cleared.
          </Typography>
        </Grid>
      ) : null}
      <Grid container size={12}>
        {isFirstLogin ? (
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
                  <FirstLoginChoiceRow
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
                  <FirstLoginChoiceRow
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
        ) : (
          <>
            <Grid
              size={{
                xs: 0,
                sm: 3,
                md: 7,
              }}
            />
            <Grid
              size={{
                xs: 6,
                sm: 5,
                md: 3,
              }}
            >
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={cloudAccounts}
                      color="primary"
                      disabled={cloudModeChanging || skeletonVisible}
                      onChange={(e) => {
                        void setCloudMode(e.target.checked);
                      }}
                    />
                  }
                  label={
                    <Typography
                      sx={{
                        typography: STANDARD_TEXT_FORMAT,
                      }}
                    >
                      Store Accounts In Cloud
                    </Typography>
                  }
                  labelPlacement="start"
                />
              </FormGroup>
            </Grid>
            <Grid
              container
              size={{
                xs: 6,
                sm: 4,
                md: 2,
              }}
              sx={{
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Button
                variant="contained"
                size="small"
                disabled={skeletonVisible}
                onClick={handleAdd}
              >
                Add Account
              </Button>
            </Grid>
          </>
        )}
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
                appearance={appearance}
              />
            );
          })
        )}
      </Grid>
    </Grid>
  );

  if (appearance === "firstLogin") {
    return (
      <Paper variant="outlined" sx={firstLoginPanelSx}>
        <Stack spacing={2}>
          <Typography variant="subtitle2" color="primary">
            Linked characters
          </Typography>
          {inner}
        </Stack>
      </Paper>
    );
  }

  return (
    <ContentPanel
      title="Additional Accounts"
      componentName="Additional Accounts"
      paperSx={{ overflow: "hidden" }}
    >
      {inner}
    </ContentPanel>
  );
}
