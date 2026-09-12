import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import useUsersStore from "../../../Zustand/usersStore";
import CorporationSelect from "../../../Styled Components/Select/corporations";
import CorporationOfficesSelect from "../../../Styled Components/Select/corporationOffices";
import CorporationHangarsSelect from "../../../Styled Components/Select/corporationHangars";
import { locationPickerLabel } from "../../../Functions/Assets/assetPresentation";
import { locationOptions } from "../../../Functions/Assets/assetTree";
import useLocationNames from "../../../Hooks/EveEsi/useLocationNames";
import { useMemo } from "react";

export default function SelectAssetLocation_ShoppingListDialogue({
  state,
  actions,
  assetLocationsLoading,
  assetLocationsError,
}) {
  const characters = useUsersStore((state) => state.account.characters);
  const locationIds = useMemo(
    () => state.assetLocations ?? [],
    [state.assetLocations],
  );
  const { names, failed } = useLocationNames(locationIds);
  // A place whose lookup did not settle is offered saying so: the chosen one is held in the reducer,
  // and a place missing from this list renders as a blank row while it is still selected.
  const locations = useMemo(
    () => locationOptions(locationIds, names, failed),
    [locationIds, names, failed],
  );

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
                <MenuItem
                  key={character.CharacterHash}
                  value={character.CharacterHash}
                >
                  {character.CharacterName}
                </MenuItem>
              );
            })}
          </Select>
          <FormHelperText variant="standard">
            Character Selection
          </FormHelperText>
        </FormControl>
        {/* The dropdown holds its place rather than appearing once the locations are in. */}
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
            displayEmpty
            disabled={locations.length === 0}
            renderValue={(selected) =>
              selected
                ? (locations.find((loc) => loc.locationId === selected)?.name ??
                  "")
                : locationPickerLabel({
                    count: locations.length,
                    isLoading: assetLocationsLoading,
                    isError: assetLocationsError,
                  })
            }
            onChange={(e) => {
              actions.setSelectedAssetLocation(e.target.value);
            }}
          >
            {locations.map(({ locationId, name }) => (
              <MenuItem key={locationId} value={locationId}>
                {name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText variant="standard">Asset Location</FormHelperText>
        </FormControl>
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
