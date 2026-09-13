import { useEffect, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import useUsersStore from "../../../Zustand/usersStore";
import AssetLocations_AssetDialogueWindow from "./assetLocations";
import ContentDialogue, {
  DialogueCloseAction,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import AssetScopePicker, {
  ASSET_OWNER,
  readScopeValue,
} from "../../Assets/assetScopePicker";
import { useItemRecord } from "../../../Hooks/Static/useItems";
import useAssetsOfType from "../../../Hooks/EveEsi/useAssetsOfType";
import { ASSET_SCOPE } from "../../../Hooks/EveEsi/useAssetIndex";
import { officeLocationIds } from "../../../Functions/Assets/assetTree";

/** What the picker's owner kinds ask the collection for. */
const SCOPE_FOR_OWNER = Object.freeze({
  [ASSET_OWNER.CHARACTER]: ASSET_SCOPE.CHARACTER,
  [ASSET_OWNER.CHARACTERS]: ASSET_SCOPE.CHARACTERS,
  [ASSET_OWNER.CORPORATION]: ASSET_SCOPE.CORPORATION,
});

export default function AssetsDialogueContent({ state, actions }) {
  const characters = useUsersStore((store) => store.account.characters);
  const corporations = useUsersStore((store) => store.account.corporations);
  const defaultAssetLocation = useUsersStore(
    (store) => store.applicationSettings.defaultStationIDForAssets,
  );

  const { kind, id } = useMemo(
    () => readScopeValue(state.scope),
    [state.scope],
  );
  const isCorporation = kind === ASSET_OWNER.CORPORATION;

  const corporation = corporations.find(
    (c) => Number(c.corporation_id) === Number(id),
  );

  const assets = useMemo(
    () => ({
      scope: SCOPE_FOR_OWNER[kind] ?? ASSET_SCOPE.CHARACTERS,
      id: kind === ASSET_OWNER.CHARACTERS ? undefined : id,
    }),
    [kind, id],
  );

  // Container names are read with one character's token. For a corporation that must be a member;
  // for every character at once, any of them will do.
  const namesCharacter = isCorporation
    ? characters.find((c) => Number(c.corporation_id) === Number(id))
    : (characters.find((c) => c.CharacterHash === id) ?? characters[0]);

  const compartmentNames = useMemo(() => {
    if (!isCorporation) return undefined;
    return new Map(
      (corporation?.hangars ?? []).map(({ assetLocationRef, name }) => [
        assetLocationRef,
        name,
      ]),
    );
  }, [isCorporation, corporation]);

  const { locations, collection, containerNames, isLoading, isError, error } =
    useAssetsOfType({
      assets,
      typeId: state.selectedTypeID,
      namesCharacter,
      namesScope: isCorporation ? "corporation" : "character",
    });

  // The office selects elsewhere read the corporation's offices from the store, and a member's
  // assets are the only place they are stated.
  useEffect(() => {
    if (!isCorporation || !id) return;

    useUsersStore
      .getState()
      .account.actions.setCorporationOffices(id, officeLocationIds(collection));
  }, [isCorporation, id, collection]);

  // The default asset location is what the player works from, so it leads.
  const ordered = useMemo(() => {
    const index = locations.findIndex(
      ({ locationId }) => locationId === defaultAssetLocation,
    );
    if (index < 1) return locations;
    return [
      locations[index],
      ...locations.slice(0, index),
      ...locations.slice(index + 1),
    ];
  }, [locations, defaultAssetLocation]);

  const itemName = useItemRecord(state.selectedTypeID)?.name;

  function handleClose() {
    actions.resetState();
  }

  return (
    <ContentDialogue
      open={state.isOpen}
      onClose={handleClose}
      title={itemName ? `Where ${itemName} is held` : "Material Assets"}
      dialogueTitleProps={{ id: "AssetsDialogue" }}
      componentName="AssetsDialogue"
      useAppShellDesign
      loadingVariant="dense"
      maxWidth="lg"
      fullWidth
      asyncState={{
        isLoading,
        isError,
        error,
        loadingMessage: "Loading assets and locations…",
      }}
      helperArea={
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <AssetScopePicker
            value={state.scope}
            onChange={actions.setScope}
            includeEveryCharacter
          />
        </Box>
      }
      actions={<DialogueCloseAction onClose={handleClose} />}
      dialogueSx={{
        "& .MuiDialog-paper": {
          height: "100vh",
          width: "90vw",
        },
      }}
      dialogueContentSx={{
        overflow: "auto",
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      {ordered.length > 0 ? (
        <AssetLocations_AssetDialogueWindow
          locations={ordered}
          containerNames={containerNames}
          compartmentNames={compartmentNames}
          // One owner's holdings need no owner said against every stack; several do.
          showOwner={kind === ASSET_OWNER.CHARACTERS}
        />
      ) : (
        <Typography
          align="center"
          variant="body2"
          color="text.secondary"
          sx={{ paddingY: 4 }}
        >
          Nothing held by this owner
        </Typography>
      )}
    </ContentDialogue>
  );
}
