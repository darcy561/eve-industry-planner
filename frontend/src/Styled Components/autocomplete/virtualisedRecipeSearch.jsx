import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Autocomplete, {
  createFilterOptions,
} from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material";
import { getAvailableBlueprintByBlueprintID } from "../../Functions/Helper/getAvailableBlueprints";
import { useCachedData } from "../../Hooks/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useQueryEnabled } from "../../Hooks/useQueryEnabled";
import { useGetAllCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { useGetAllCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import PanelFallBack from "../Paper/panelStates";

const defaultAutocompleteFilter = createFilterOptions();

const ListboxComponent = React.forwardRef(function ListboxComponent(
  props,
  ref
) {
  const { children, virtualizerControlRef, ...other } = props;
  const itemCount = Array.isArray(children) ? children.length : 0;

  const parentRef = React.useRef();

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  useLayoutEffect(() => {
    if (!virtualizerControlRef) return;
    virtualizerControlRef.current = {
      scrollToIndex: (index) => {
        if (
          typeof index !== "number" ||
          !Number.isFinite(index) ||
          index < 0 ||
          index >= itemCount
        ) {
          return;
        }
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
    };
    return () => {
      virtualizerControlRef.current = null;
    };
  }, [virtualizer, virtualizerControlRef, itemCount]);

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
});

/**
 * @param {Object} props
 * @param {Function} props.onSelect
 * @param {Array} props.listToDisplay
 * @param {boolean} props.isLoadingItemList
 * @param {boolean} props.itemListError
 * @param {boolean} props.esiLoading
 * @param {boolean} props.esiError
 * @param {boolean} props.isListFiltered
 */
function RecipeSearchAutocomplete({
  onSelect,
  listToDisplay,
  isLoadingItemList,
  itemListError,
  esiLoading,
  esiError,
  isListFiltered,
}) {
  const [selectedValue, setSelectedValue] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const theme = useTheme();
  const virtualizerControlRef = useRef(null);
  /** Indices in the listbox match MUI's filtered options, not full `listToDisplay`. */
  const filteredOptionsSnapshotRef = useRef([]);

  const filterOptions = useMemo(
    () => (options, params) => {
      const filtered = defaultAutocompleteFilter(options, params);
      filteredOptionsSnapshotRef.current = filtered;
      return filtered;
    },
    []
  );

  const handleHighlightChange = (event, option) => {
    if (option == null) return;
    const index = filteredOptionsSnapshotRef.current.findIndex(
      (o) => o.itemID === option.itemID
    );
    if (index < 0) return;
    requestAnimationFrame(() => {
      virtualizerControlRef.current?.scrollToIndex?.(index);
    });
  };

  const handleChange = (event, newValue) => {
    if (newValue) {
      onSelect(newValue);
      setSelectedValue(null);
      setInputValue("");
    }
  };

  const isLoading = isLoadingItemList || esiLoading;
  const isError = itemListError || esiError;

  if (isLoading || isError) {
    return <PanelFallBack isLoading={isLoading} isError={isError} />;
  }

  return (
    <Autocomplete
      fullWidth
      id="Recipe Search"
      value={selectedValue}
      options={listToDisplay}
      filterOptions={filterOptions}
      clearOnBlur
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
      onHighlightChange={handleHighlightChange}
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
          virtualizerControlRef,
        },
      }}
    />
  );
}

function VirtualisedRecipeSearchWithEsiFiltering({
  onSelect,
  itemList,
  isLoadingItemList,
  itemListError,
}) {
  const queryClient = useQueryClient();
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
    if (itemListError) return [];

    const idSet = getAvailableBlueprintByBlueprintID(queryClient);
    return itemList.filter(({ blueprintID }) => idSet.has(blueprintID));
  }, [itemList, isLoadingItemList, itemListError, queryClient]);

  return (
    <RecipeSearchAutocomplete
      onSelect={onSelect}
      listToDisplay={listToDisplay}
      isLoadingItemList={isLoadingItemList}
      itemListError={itemListError}
      esiLoading={
        isLoadingCharacterBlueprints || isLoadingCorporationBlueprints
      }
      esiError={isErrorCharacterBlueprints || isErrorCorporationBlueprints}
      isListFiltered
    />
  );
}

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
    (state) => state.applicationSettings.enableSkipMissingBlueprints
  );
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const queryEnabled = useQueryEnabled();

  const {
    data: itemList,
    loading: isLoadingItemList,
    error: itemListError,
  } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  const useEsiBlueprintFilter =
    !ignoreSelectionOverides &&
    ignoreItemsWithoutBlueprints &&
    isLoggedIn &&
    queryEnabled;

  const listToDisplay = useMemo(() => {
    if (isLoadingItemList) return [];
    if (itemListError) return [];
    if (ignoreSelectionOverides) return itemList;
    return itemList;
  }, [itemList, isLoadingItemList, itemListError, ignoreSelectionOverides]);

  if (useEsiBlueprintFilter) {
    return (
      <VirtualisedRecipeSearchWithEsiFiltering
        onSelect={onSelect}
        itemList={itemList}
        isLoadingItemList={isLoadingItemList}
        itemListError={itemListError}
      />
    );
  }

  return (
    <RecipeSearchAutocomplete
      onSelect={onSelect}
      listToDisplay={listToDisplay}
      isLoadingItemList={isLoadingItemList}
      itemListError={itemListError}
      esiLoading={false}
      esiError={false}
      isListFiltered={false}
    />
  );
}

export default VirtualisedRecipeSearch;
