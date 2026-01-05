import React, { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material";
import { getAvailableBlueprintByBlueprintID } from "../../Functions/Helper/getAvailableBlueprints";
import { useCachedData } from "../../Hooks/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAllCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { useGetAllCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import PanelFallBack from "../Paper/panelStates";
import { characterBlueprintsQueryKey } from "../../Hooks/React Query/Character/blueprints";

/**
 * A virtualized autocomplete component for searching EVE Online recipes/blueprints.
 * Uses TanStack Virtual for performance with large datasets and filters results based on available blueprints.
 *
 * @param {Object} props - Component props
 * @param {Function} props.onSelect - Callback function called when a recipe is selected. Receives the selected recipe object.
 * @param {boolean} [props.ignoreSelectionOverides=false] - If true, ignores blueprint availability filtering and shows all items
 * @returns {JSX.Element} Virtualized recipe search autocomplete component
 *
 * @example
 * <VirtualisedRecipeSearch
 *   onSelect={(recipe) => console.log('Selected:', recipe.name)}
 *   ignoreSelectionOverides={false}
 * />
 */
function VirtualisedRecipeSearch({
  onSelect,
  ignoreSelectionOverides = false,
}) {
  const ignoreItemsWithoutBlueprints = useUsersStore(
    (state) => state.applicationSettings.ignoreItemsWithoutBlueprints
  );
  const [selectedValue, setSelectedValue] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const queryClient = useQueryClient();
  const theme = useTheme();

  // Use the custom hook to load the search index
  const {
    data: itemList,
    loading: isLoadingItemList,
    error,
  } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  const {
    isLoading: isLoadingCharacterBlueprints,
    isError: isErrorCharacterBlueprints,
  } = useGetAllCharacterBlueprints();
  const {
    isLoading: isLoadingCorporationBlueprints,
    isError: isErrorCorporationBlueprints,
  } = useGetAllCorporationBlueprints();

  const listToDisplay = useMemo(() => {
    if (isLoadingItemList) return [];
    if (error) return [];
    if (ignoreSelectionOverides) return itemList;
    if (!ignoreItemsWithoutBlueprints) return itemList;

    const idSet = getAvailableBlueprintByBlueprintID(queryClient);

    return itemList.filter(({ blueprintID }) => idSet.has(blueprintID));
  }, [
    ignoreItemsWithoutBlueprints,
    ignoreSelectionOverides,
    itemList,
    isLoadingItemList,
    error,
  ]);

  const ListboxComponent = React.forwardRef(
    function ListboxComponent(props, ref) {
      const { children, ...other } = props;
      const itemCount = Array.isArray(children) ? children.length : 0;

      const parentRef = React.useRef();

      const virtualizer = useVirtualizer({
        count: itemCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 50,
        overscan: 5,
      });

      return (
        <div ref={ref} {...other}>
          <div
            ref={parentRef}
            style={{
              height: 250,
              overflow: "auto",
              width: "100%",
            }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualItem.size,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {React.cloneElement(children[virtualItem.index], {
                    style: { height: virtualItem.size },
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  );

  const handleChange = (event, newValue) => {
    if (newValue) {
      onSelect(newValue);
      setSelectedValue(null);
      setInputValue("");
    }
  };

  const isListFiltered =
    !ignoreSelectionOverides && ignoreItemsWithoutBlueprints;

  const isLoading =
    isLoadingItemList ||
    isLoadingCharacterBlueprints ||
    isLoadingCorporationBlueprints;

  const isError =
    error || isErrorCharacterBlueprints || isErrorCorporationBlueprints;

  if (isLoading || isError) {
    return <PanelFallBack isLoading={isLoading} isError={isError} />;
  }

  return (
    <Autocomplete
      fullWidth
      id="Recipe Search"
      value={selectedValue}
      options={listToDisplay}
      clearOnBlur
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
      onClose={() => setSelectedValue(null)}
      onChange={handleChange}
      getOptionLabel={(option) => option.name}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        return (
          <li key={key} {...optionProps}>
            {option.name}
          </li>
        );
      }}
      style={{ width: "100%" }}
      renderInput={(params) => (
        <TextField
          {...params}
          fullWidth
          label="Search"
          placeholder="Select an item"
          margin="none"
          variant="standard"
          helperText={isListFiltered ? "Filtered By Available Blueprints" : ""}
          sx={{
            "& .MuiFormHelperText-root": {
              color: isListFiltered ? theme.palette.primary.main : "inherit",
            },
          }}
        />
      )}
      slotProps={{
        listbox: {
          component: ListboxComponent,
        },
      }}
    />
  );
}

export default VirtualisedRecipeSearch;
