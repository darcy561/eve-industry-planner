import {
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
} from "@mui/material";
import useUsersStore from "../../../Zustand/usersStore";
import CorporationSelect from "../../../Styled Components/Select/corporations";
import CorporationOfficesSelect from "../../../Styled Components/Select/corporationOffices";
import CorporationHangarsSelect from "../../../Styled Components/Select/coporationHangars";

export default function SelectAssetLocation_ShoppingListDialog({
  state,
  actions
}) {
  const characters = useUsersStore((state) => state.account.characters);

  // Don't render if loading
  if (state.isLoading) return null;

  // Show character asset dropdowns when assetType is "character"
  if (state.assetType === "character") {
    return (
      <>
        <FormControl
          fullWidth
          sx={{
            "& .MuiFormHelperText-root": {
              color: (theme) => theme.palette.secondary.main,
            },
          }}
        >
          <Select
            value={state.selectedCharacter || ""}
            size="small"
            onChange={(e) => {
              actions.setSelectedCharacter(e.target.value);
            }}
          >
            {characters.length > 1 && (
              <MenuItem key={"allUsers"} value={"allUsers"}>
                All
              </MenuItem>
            )}
            {characters.map((character) => {
              return (
                <MenuItem key={character.CharacterHash} value={character.CharacterHash}>
                  {character.CharacterName}
                </MenuItem>
              );
            })}
          </Select>
          <FormHelperText variant="standard">
            Character Selection
          </FormHelperText>
        </FormControl>
        {/* Only show location dropdown if assetLocations are loaded */}
        {state.assetLocations && state.assetLocations.length > 0 && (
          <FormControl
            fullWidth
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
            }}
          >
            <Select
              value={state.selectedAssetLocation || ""}
              size="small"
              onChange={(e) => {
                actions.setSelectedAssetLocation(e.target.value);
              }}
            >
              {state.assetLocations.map((entry) => {
                const locationNameData = useUsersStore
                  .getState()
                  .worldData.actions.findUniverseData(entry);

                if (
                  !locationNameData ||
                  locationNameData.name === "No Access To Location"
                ) {
                  return null;
                }
                return (
                  <MenuItem key={entry} value={entry}>
                    {locationNameData.name}
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText variant="standard">Asset Location</FormHelperText>
          </FormControl>
        )}
      </>
    );
  }

  // Show corporation select and location dropdown when assetType is "corporation"
  if (state.assetType === "corporation") {
    return (
      <>
        <CorporationSelect
          value={state.selectedCorporation || ""}
          onChange={(corporationId) => {
            actions.setSelectedCorporation(corporationId);
          }}
          formHelperText="Corporation Selection"
        />
        {state.selectedCorporation && (
          <CorporationOfficesSelect
            selectedCorporation={state.selectedCorporation || ""}
            value={state.selectedCorporationOffice || ""}
            onChange={(locationID) => {
              actions.setSelectedCorporationOffice(locationID);
            }}
          />
        )}

        {state.selectedCorporation && state.selectedCorporationOffice && (
          <CorporationHangarsSelect
            selectedCorporation={state.selectedCorporation || ""}
            value={state.selectedCorporationHangar || ""}
            onChange={(locationID) => {
              actions.setSelectedCorporationHangar(locationID);
            }}
          />
        )}
      </>
    );
  }

  return null;
}
