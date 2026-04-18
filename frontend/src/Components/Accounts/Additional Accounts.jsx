import {
  Button,
  FormControlLabel,
  FormGroup,
  Grid,
  Skeleton,
  Switch,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { AccountEntry } from "./AccountEntry";
import getEveOauthToken from "../../Functions/EveESI/Character/getEveSSOToken";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../Events/snackbarEvents";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserAccountAndApplicationSettings } from "../../Functions/Endpoints/Pirivate/userDocument";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../Hooks/React Query/useCharacterHooks";
import { buildCorporationObjectFromUserObject } from "../../Functions/Corporations/buildCorporationObject";
import { useGlobalDebounce } from "../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../Context/debounceKeys";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../Context/defaultValues";
import { updateLocalRefreshTokens } from "../../Functions/Auth/buildAccountData";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";

export function AdditionalAccounts() {
  const characters = useUsersStore((state) => state.account.characters);
  const [isProcessing, setIsProcessing] = useState(false);

  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts
  );
  const { toggleCloudAccounts } =
    useUsersStore.getState().applicationSettings.actions;
  const { addCharacter } = useUsersStore((state) => state.account.actions);
  const { setLinkedCharacterRefreshTokens, addLinkedCharacterRefreshToken } =
    useUsersStore((state) => state.account.actions);

  const [skeletonVisible, toggleSkeleton] = useState(false);
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch } = useCharacterHooks();

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveUserAccountAndApplicationSettings();
    },
    2000
  );

  const handleAdd = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    toggleSkeleton(true);

    // Remove any existing listener first
    window.removeEventListener("storage", importNewAccount);

    // Add new listener
    window.addEventListener("storage", importNewAccount);

    const { getRuntimeEnv } = await import("../../utils/runtime-config");
    window.open(
      `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(
        getRuntimeEnv("EVE_CALLBACK_URL")
      )}&client_id=${getRuntimeEnv("EVE_CLIENT_ID")}&scope=${getRuntimeEnv("EVE_SCOPE")
      }&state=additional`,
      "_blank"
    );

    // Set a timeout to clean up if no response
    setTimeout(() => {
      if (!localStorage.getItem("AdditionalUser")) {
        window.removeEventListener("storage", importNewAccount);
        toggleSkeleton(false);
        setIsProcessing(false);
      }
    }, 180000);
  };

  const importNewAccount = async (event) => {
    // Only proceed if the event is for AdditionalUser
    if (event.key !== "AdditionalUser") return;
    if (isProcessing) return;

    try {
      const authCode = localStorage.getItem("AdditionalUser");
      if (!authCode) return;

      // Remove the listener immediately to prevent multiple executions
      window.removeEventListener("storage", importNewAccount);

      const newUser = await getEveOauthToken(authCode, false);

      if (newUser instanceof Error) {
        throw newUser;
      }

      if (characters.some((u) => u.CharacterHash === newUser.CharacterHash)) {
        localStorage.removeItem("AdditionalUser");
        showSnackbarError(`Duplicate Account`, 3);
        toggleSkeleton(false);
        setIsProcessing(false);
        return;
      }

      await newUser.getPublicCharacterData();
      await buildCorporationObjectFromUserObject(newUser);
      addCharacter(newUser);

      localStorage.removeItem("AdditionalUser");

      if (cloudAccounts) {
        addLinkedCharacterRefreshToken({
          CharacterHash: newUser.CharacterHash,
          rToken: newUser.esiRefreshToken,
        });
      } else {
        updateLocalRefreshTokens(characters);
      }

      await checkUserClaims(characters);
      if (cloudAccounts) {
        debouncedSaveSettings();
      }
      trackAppEvent(
        cloudAccounts
          ? AppEvent.ADD_ADDITIONAL_CHARACTER_CLOUD
          : AppEvent.ADD_ADDITIONAL_CHARACTER_LOCAL
      );
      triggerCharacterDataPrefetch(queryClient, newUser.CharacterHash);
      showSnackbarSuccess(`${newUser.CharacterName} Imported`, 3);
      toggleSkeleton(false);
      setIsProcessing(false);
    } catch (err) {
      localStorage.removeItem("AdditionalUser");
      console.error(err);
      showSnackbarError(`${err.message}`, 3);
      toggleSkeleton(false);
      setIsProcessing(false);
    }
  };

  return (
    <ContentPanel title="Additional Accounts" componentName="Additional Accounts"
      paperSx={{ overflow: "hidden" }}
    >
      <Grid container>
        <Grid sx={{ marginTop: 1, marginBottom: 2 }} size={12}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Additional accounts can be linked allowing you to import the ESI
            data in alongside your main accounts data. Additional accounts can
            be added and removed at any time.{<br />}
            {<br />}
            By default the additional accounts that you choose to link are only
            stored in the browser where they were added. If you wanted to make
            these accounts available on all other devices then you will need to
            enable the option to store the accounts in the cloud. Accounts that are stored locally will be removed if the browsers cache is cleared.
          </Typography>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 0,
              sm: 3,
              md: 7
            }} />
          <Grid
            size={{
              xs: 6,
              sm: 5,
              md: 3
            }}>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={cloudAccounts}
                    color="primary"
                    onChange={async (e) => {
                      const mainCharacterHash = useUsersStore
                        .getState()
                        .account.actions.getMainCharacterHash();
                      if (!mainCharacterHash) {
                        toggleCloudAccounts();
                        debouncedSaveSettings();
                        return;
                      }
                      const localStorageKey = `${mainCharacterHash} AdditionalAccounts`;
                      if (e.target.checked) {
                        const storedAccounts = JSON.parse(
                          localStorage.getItem(localStorageKey) || "[]"
                        );
                        localStorage.removeItem(localStorageKey);
                        setLinkedCharacterRefreshTokens(storedAccounts);
                      } else {
                        updateLocalRefreshTokens(characters);
                        setLinkedCharacterRefreshTokens([]);
                      }
                      toggleCloudAccounts();
                      debouncedSaveSettings();
                    }}
                  />
                }
                label={
                  <Typography
                    sx={{ typography: STANDARD_TEXT_FORMAT }}
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
              md: 2
            }}
            sx={{
              justifyContent: "center",
              alignItems: "center"
            }}>
            <Button
              variant="contained"
              size="small"
              disabled={skeletonVisible}
              onClick={handleAdd}
            >
              Add Account
            </Button>
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
                marginLeft: 1
              }}>
              <Grid
                align="left"
                size={{
                  xs: 2,
                  sm: 1
                }}>
                <Skeleton variant="circular" width={40} height={40} />
              </Grid>
              <Grid
                size={{
                  xs: 8,
                  sm: 9
                }}>
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
            characters.map((character) => {
              if (character.isMainCharacter) return null;
              return (
                <AccountEntry
                  key={character.CharacterHash}
                  character={character}
                />
              );
            })
          )}
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
