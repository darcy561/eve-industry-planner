import { useMemo, useRef, useState } from "react";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { FormControl, useTheme } from "@mui/material";
import {
  appShellAutocompleteListboxSx,
  appShellOutlinedFormControl,
  appShellSelectMenuPaperSx,
  appShellTextFieldOutlinedSx,
} from "../../Context/appShell";
import { useItemSearchIndex } from "../../Hooks/Static/useItems";
import useUsersStore from "../../Zustand/usersStore";
import { useTranquilityServerStatusQuery } from "../../Hooks/React Query/tranquilityServerStatus.js";
import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
} from "../../Hooks/EveEsi/useBlueprintIndex";
import PanelFallBack from "../Paper/panelStates";
import VirtualisedListbox from "./virtualisedListbox";

const defaultAutocompleteFilter = createFilterOptions();

/**
 * @param {Object} props
 * @param {Function} props.onSelect
 * @param {Array} props.listToDisplay
 * @param {boolean} props.isLoadingItemList
 * @param {boolean} props.itemListError
 * @param {boolean} props.esiLoading
 * @param {boolean} props.esiError
 * @param {boolean} props.isListFiltered
 * @param {boolean} [props.appShellStyled=false]
 */
function RecipeSearchAutocomplete({
  onSelect,
  listToDisplay,
  isLoadingItemList,
  itemListError,
  esiLoading,
  esiError,
  isListFiltered,
  appShellStyled = false,
}) {
  const skipMissingBpSetting = useUsersStore(
    (state) => state.applicationSettings.enableSkipMissingBlueprints,
  );
  const [selectedValue, setSelectedValue] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const theme = useTheme();
  const virtualizerControlRef = useRef(null);
  const filteredOptionsSnapshotRef = useRef([]);

  const filterOptions = useMemo(
    () => (options, params) => {
      const filtered = defaultAutocompleteFilter(options, params);
      filteredOptionsSnapshotRef.current = filtered;
      return filtered;
    },
    [],
  );

  const handleHighlightChange = (event, option) => {
    if (option == null) return;
    const index = filteredOptionsSnapshotRef.current.findIndex(
      (o) => o.itemID === option.itemID,
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

  const autocompleteSlotProps = {
    listbox: {
      component: VirtualisedListbox,
      virtualizerControlRef,
      ...(appShellStyled ? { sx: appShellAutocompleteListboxSx(theme) } : {}),
    },
    ...(appShellStyled
      ? {
          paper: {
            sx: appShellSelectMenuPaperSx(theme),
          },
          popper: {
            placement: "bottom-start",
            sx: { mt: 0.5 },
          },
        }
      : {}),
  };

  const autocomplete = (
    <Autocomplete
      key={`recipe-search-${skipMissingBpSetting}-${isListFiltered}`}
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
          label="Search recipes"
          placeholder="Select an item"
          margin="none"
          variant={appShellStyled ? "outlined" : "standard"}
          helperText={isListFiltered ? "Filtered by available blueprints" : ""}
          sx={
            appShellStyled
              ? (t) => ({
                  ...appShellTextFieldOutlinedSx(t),
                  "& .MuiFormHelperText-root": {
                    color: isListFiltered
                      ? theme.palette.primary.main
                      : t.palette.text.secondary,
                    mt: 0.75,
                  },
                })
              : {
                  "& .MuiFormHelperText-root": {
                    color: isListFiltered
                      ? theme.palette.primary.main
                      : "inherit",
                  },
                }
          }
        />
      )}
      slotProps={autocompleteSlotProps}
    />
  );

  if (!appShellStyled) {
    return autocomplete;
  }

  return (
    <FormControl
      fullWidth
      sx={(t) => ({
        ...appShellOutlinedFormControl(t),
        paddingX: 0,
      })}
    >
      {autocomplete}
    </FormControl>
  );
}

/**
 * Only mounted when blueprint filtering is required — subscribes to ESI blueprint queries.
 * When "ignore items without blueprints" is off, this tree is not mounted so blueprint refetches
 * do not drive loading spinners or extra work.
 */
function RecipeSearchWithBlueprintQueries({
  onSelect,
  itemList,
  isLoadingItemList,
  itemListError,
  ignoreSelectionOverrides,
  appShellStyled = false,
}) {
  // Subscribed rather than read from the cache: the filter used to depend only on the query client,
  // which never changes, so blueprints arriving after the first render never reached the list and
  // the search offered nothing buildable.
  const {
    data: blueprints,
    isLoading: esiLoading,
    isError: esiError,
  } = useBlueprintIndex({ scope: BLUEPRINT_SCOPE.ALL });

  const listToDisplay = useMemo(() => {
    if (isLoadingItemList) return [];
    if (itemListError) return [];
    if (ignoreSelectionOverrides) return itemList;

    const owned = new Set(blueprints.rows.map((row) => row.typeId));
    return itemList.filter(({ blueprintID }) => owned.has(blueprintID));
  }, [
    itemList,
    isLoadingItemList,
    itemListError,
    ignoreSelectionOverrides,
    blueprints,
  ]);

  return (
    <RecipeSearchAutocomplete
      onSelect={onSelect}
      listToDisplay={listToDisplay}
      isLoadingItemList={isLoadingItemList}
      itemListError={itemListError}
      esiLoading={esiLoading}
      esiError={esiError}
      isListFiltered
      appShellStyled={appShellStyled}
    />
  );
}

/**
 * A virtualized autocomplete component for searching EVE Online recipes/blueprints.
 * Uses TanStack Virtual for performance with large datasets and filters results based on available blueprints.
 *
 * @param {Object} props - Component props
 * @param {Function} props.onSelect - Callback function called when a recipe is selected. Receives the selected recipe object.
 * @param {boolean} [props.ignoreSelectionOverrides=false] - If true, ignores blueprint availability filtering and shows all items
 * @param {boolean} [props.appShellStyled=false] - Outlined field + app-shell dropdown styling
 * @returns {JSX.Element} Virtualized recipe search autocomplete component
 */
function VirtualisedRecipeSearch({
  onSelect,
  ignoreSelectionOverrides = false,
  appShellStyled = false,
}) {
  const ignoreItemsWithoutBlueprints = useUsersStore(
    (state) => state.applicationSettings.enableSkipMissingBlueprints,
  );
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { data: tranquilityStatus } = useTranquilityServerStatusQuery();
  const queryEnabled = isLoggedIn && !!tranquilityStatus?.online;

  const {
    entries: itemList,
    isLoading: isLoadingItemList,
    error: itemListError,
  } = useItemSearchIndex();

  const shouldApplyBlueprintFilter =
    !ignoreSelectionOverrides &&
    ignoreItemsWithoutBlueprints &&
    isLoggedIn &&
    queryEnabled;

  const listToDisplayUnfiltered = useMemo(() => {
    if (isLoadingItemList) return [];
    if (itemListError) return [];
    if (ignoreSelectionOverrides) return itemList;
    return itemList;
  }, [itemList, isLoadingItemList, itemListError, ignoreSelectionOverrides]);

  if (!shouldApplyBlueprintFilter) {
    return (
      <RecipeSearchAutocomplete
        onSelect={onSelect}
        listToDisplay={listToDisplayUnfiltered}
        isLoadingItemList={isLoadingItemList}
        itemListError={itemListError}
        esiLoading={false}
        esiError={false}
        isListFiltered={false}
        appShellStyled={appShellStyled}
      />
    );
  }

  return (
    <RecipeSearchWithBlueprintQueries
      onSelect={onSelect}
      itemList={itemList}
      isLoadingItemList={isLoadingItemList}
      itemListError={itemListError}
      ignoreSelectionOverrides={ignoreSelectionOverrides}
      appShellStyled={appShellStyled}
    />
  );
}

export default VirtualisedRecipeSearch;
