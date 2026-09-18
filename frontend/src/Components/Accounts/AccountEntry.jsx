import { useState } from "react";
import { Typography } from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents";
import refreshAccountSessionGrants from "../../Functions/Auth/refreshAccountSessionGrants.js";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { updateLocalRefreshTokens } from "../../Functions/Auth/buildAccountData.js";
import { deleteCloudStoredEsiRefreshTokens } from "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js";
import { reacquireEsiAccessToken } from "../../Functions/Auth/esiCredentials/provider.js";
import { CREDENTIAL_HEALTH } from "../../Functions/Auth/esiCredentials/health.js";
import { isReauthRequired } from "../../Functions/Auth/esiCredentials/errors.js";
import { clearCharacterEsiCache } from "../../Functions/EveESI/characterEsiCache.js";
import { useCredentialHealth } from "../Auth/Hooks/useCredentialHealth.jsx";
import { useLinkCharacter } from "./useLinkCharacter";
import { useCurrentTime } from "../../Hooks/useCurrentTime";
import { formatTimeSince } from "../../Functions/Helper/numberParser";
import CharacterEsiStatus from "./CharacterEsiStatus";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import EntityRow from "../../Styled Components/Paper/EntityRow";
import ActionMenu from "../../Styled Components/Menu/ActionMenu";
import { Disclosure } from "../../Styled Components/Typography/figures";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";

/**
 * What the row says about a character's credentials, and how it says it.
 *
 * `dated` marks a state that will not correct itself and will not be retried either: nothing
 * acquires a token on a schedule, so a failure seen once is shown until something asks again. Left
 * undated it reads as a broken token rather than as an old observation. A spent refresh secret is
 * not dated — it cannot recover however long ago it was seen — and a working one is not either,
 * because that is the state a reader expects to find.
 */
const HEALTH_MARKER = {
  [CREDENTIAL_HEALTH.OK]: { label: "ESI connected", tone: STATUS_TONE.GOOD },
  [CREDENTIAL_HEALTH.DEGRADED]: {
    label: "ESI unavailable",
    tone: STATUS_TONE.WARN,
    dated: true,
  },
  [CREDENTIAL_HEALTH.REAUTH_REQUIRED]: {
    label: "Needs re-authorising",
    tone: STATUS_TONE.WARN,
  },
};

/**
 * A character the account holds, main or linked.
 *
 * @param {object} props
 * @param {object} props.character
 * @param {boolean} [props.isMain] - the character the account signs in as, which it cannot remove
 */
export function AccountEntry({ character, isMain = false }) {
  const cloudAccounts = useUsersStore(
    (state) => state.applicationSettings.userCloudAccounts,
  );
  const getCorporation = useUsersStore(
    (state) => state.account.actions.getCorporation,
  );
  const { removeCharacter } = useUsersStore.getState().account.actions;
  const { removeCharacterFromCorporations } =
    useUsersStore.getState().account.actions;
  const queryClient = useQueryClient();
  const characterHash = character?.CharacterHash || "";
  const { state: healthState, at: healthSeenAt } =
    useCredentialHealth(characterHash);
  const now = useCurrentTime();
  const { linkCharacter, isLinking } = useLinkCharacter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRemoveUser(character) {
    const characterName = character?.CharacterName || "Character";
    removeCharacter(character);
    removeCharacterFromCorporations(characterHash);

    clearCharacterEsiCache(queryClient, characterHash);

    if (cloudAccounts) {
      const saved = await deleteCloudStoredEsiRefreshTokens([characterHash]);
      if (!saved) {
        showSnackbarError("Failed to update linked character tokens on server");
      }
      scheduleDebouncedUserAccountDocumentSave();
    } else {
      updateLocalRefreshTokens(useUsersStore.getState().account.characters);
    }
    await refreshAccountSessionGrants();

    showSnackbarError(`${characterName} Removed`);
  }

  async function handleRefreshToken() {
    setIsRefreshing(true);
    try {
      await reacquireEsiAccessToken(characterHash);
      showSnackbarSuccess(`${character.CharacterName}'s ESI access renewed`);
    } catch (error) {
      showSnackbarError(
        isReauthRequired(error)
          ? `${character.CharacterName} must be linked again to restore ESI access`
          : `Could not renew ${character.CharacterName}'s ESI access`,
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleClearEsiData() {
    clearCharacterEsiCache(queryClient, characterHash);
    showSnackbarSuccess(`${character.CharacterName}'s ESI data cleared`);
  }

  const corporation =
    getCorporation(character?.corporation_id ?? character?.CorporationID) ??
    null;
  const corporationName = corporation?.corporationName || "No corporation";
  const corporationId = corporation?.corporation_id;
  const marker = HEALTH_MARKER[healthState];
  const markerLabel =
    marker?.dated && healthSeenAt
      ? `${marker.label} · ${formatTimeSince(healthSeenAt, { now })}`
      : marker?.label;

  const isSpent = healthState === CREDENTIAL_HEALTH.REAUTH_REQUIRED;

  const actions = [
    // Renewing cannot mend a spent refresh secret — only signing in as the character again can, so
    // that is what the row offers once its credentials are past renewing.
    isSpent
      ? {
          label: "Link character again",
          onClick: () => linkCharacter({ relinkHash: characterHash }),
          disabled: isLinking,
          disabledReason: "Waiting for EVE sign-in…",
        }
      : {
          label: "Renew ESI access",
          onClick: handleRefreshToken,
          disabled: isRefreshing,
          disabledReason: "Renewing…",
        },
    {
      label: "Clear ESI data",
      onClick: handleClearEsiData,
    },
    // The account signs in as its main character, so unlinking it is not something this row offers.
    ...(isMain
      ? []
      : [
          {
            label: "Remove character",
            onClick: () => handleRemoveUser(character),
            destructive: true,
          },
        ]),
  ];

  return (
    <EntityRow
      avatar={
        <EveImageAvatar
          alt={`${character.CharacterName} portrait`}
          character={character.CharacterID}
          size={42}
          variant="rounded"
        />
      }
      name={character.CharacterName}
      context={
        <>
          {corporationId ? (
            <EveImageAvatar
              alt={`${corporationName} logo`}
              corporation={corporationId}
              size={18}
              variant="rounded"
            />
          ) : (
            <BusinessIcon sx={{ fontSize: 17, color: "text.disabled" }} />
          )}
          <Typography variant="body2" color="text.secondary" noWrap>
            {corporationName}
          </Typography>
        </>
      }
      status={
        <>
          {isMain && <StatusChip label="main" tone={STATUS_TONE.FACT} />}
          {marker && <StatusChip label={markerLabel} tone={marker.tone} />}
        </>
      }
      actions={
        <ActionMenu
          items={actions}
          label={`${character.CharacterName} actions`}
        />
      }
    >
      <Disclosure label="ESI data">
        <CharacterEsiStatus characterHash={characterHash} />
      </Disclosure>
    </EntityRow>
  );
}
