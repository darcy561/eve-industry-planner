import { useEffect, useMemo } from "react";
import { Box, Grid, MenuItem, Pagination } from "@mui/material";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LibrarySearch } from "./LibrarySearch";
import BlueprintGroup from "./blueprintGroup";
import useUsersStore from "../../Zustand/usersStore";
import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
} from "../../Hooks/EveEsi/useBlueprintIndex";
import useBlueprintLocations from "../../Hooks/EveEsi/useBlueprintLocations";
import useGetAllIndustryJobs from "../../Hooks/EveEsi/useGetAllIndustryJobs";
import { useItemSearchIndex } from "../../Hooks/Static/useItems";
import filterLibraryBlueprints from "../../Functions/Blueprints/filterLibraryBlueprints";
import blueprintsAtLocation from "../../Functions/Blueprints/blueprintsAtLocation";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import AppShellSelect from "../../Styled Components/Select/AppShellSelect";
import BlueprintArchiveDialogue from "../Dialogues/Blueprint Archive";

export default function BlueprintLibrary() {
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView,
  );
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) || {};

  const { entries: itemList } = useItemSearchIndex();

  // Initialise URL params with defaults if they don't exist
  useEffect(() => {
    const hasParams = search && Object.keys(search).length > 0;
    if (!hasParams) {
      navigate({
        search: {
          filter: "all",
          page: 1,
          pageSize: 16,
        },
        replace: true, // Use replace to avoid adding to history
      });
    }
  }, []); // Only run on mount

  // Get URL params with defaults and validation
  const validFilters = [
    "all",
    "active",
    "manufacturing",
    "reactions",
    "bpo",
    "bpc",
  ];
  const currentFilter =
    search?.filter && validFilters.includes(search.filter)
      ? search.filter
      : "all";
  const currentPage = Math.max(1, search?.page || 1);
  const currentPageSize = Math.min(64, Math.max(4, search?.pageSize || 16));
  const searchBlueprintID = search?.search
    ? parseInt(search.search)
    : undefined;
  const currentLocation = search?.location
    ? Number(search.location)
    : undefined;

  // Subscribed rather than read from the cache during render. A cache read hands back a new object
  // every render, so the filter and sort below re-ran every time and the page picked up new rows
  // only because a sibling query happened to re-render it.
  const { data: blueprints } = useBlueprintIndex({
    scope: BLUEPRINT_SCOPE.ALL,
  });
  const { data: apiJobs = [] } = useGetAllIndustryJobs();
  // Every blueprint carries where it is held, and that is only knowable once the assets are in.
  // The results wait for them rather than drawing each label in as its scope lands.
  const {
    names: blueprintLocationNames,
    places,
    locationIds: blueprintLocationIds,
    isLoading: blueprintLocationsLoading,
    isError: blueprintLocationsError,
    error: blueprintLocationsErrorValue,
  } = useBlueprintLocations(blueprints);

  // Combine and filter blueprints based on URL params
  const filteredBlueprintData = useMemo(() => {
    const found = searchBlueprintID
      ? (blueprints.byTypeId.get(searchBlueprintID) ?? [])
      : filterLibraryBlueprints(blueprints.rows, currentFilter, apiJobs);

    const matching = blueprintsAtLocation(
      found,
      blueprintLocationIds,
      currentLocation,
    );

    // Originals before copies, then the most researched — the same order the collection uses within
    // a type, applied across the whole library.
    const sorted = [...matching].sort(
      (a, b) =>
        Number(a.isCopy) - Number(b.isCopy) || b.me - a.me || b.te - a.te,
    );

    let ids = [...new Set(sorted.map((row) => row.typeId))];

    // A search naming a blueprint the account does not hold still opens its frame, so the archived
    // jobs for it can be read.
    if (searchBlueprintID && ids.length === 0) {
      const known = itemList?.some(
        (item) => item.blueprintID === searchBlueprintID,
      );
      if (known) ids = [searchBlueprintID];
    }

    return { ids, blueprints: sorted };
  }, [
    blueprints,
    currentFilter,
    searchBlueprintID,
    itemList,
    apiJobs,
    currentLocation,
    blueprintLocationIds,
  ]);

  // Calculate pagination
  const totalPages = Math.ceil(
    filteredBlueprintData.ids.length / currentPageSize,
  );
  const from = (currentPage - 1) * currentPageSize;
  const to = Math.min(
    currentPage * currentPageSize,
    filteredBlueprintData.ids.length,
  );

  // Get paginated results
  const blueprintResults = useMemo(() => {
    const returnIDs = Array.from(
      new Set(filteredBlueprintData.ids.slice(from, to)),
    );
    const returnBps = filteredBlueprintData.blueprints.filter((row) =>
      returnIDs.includes(row.typeId),
    );

    return {
      ids: returnIDs,
      blueprints: returnBps,
    };
  }, [filteredBlueprintData, from, to]);

  const handlePageSizeChange = (pageSize) => {
    navigate({
      search: (prev) => ({ ...prev, pageSize, page: 1 }),
    });
  };

  const handlePageChange = (event, page) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page,
      }),
    });
    window.scrollTo(0, 0);
  };

  return (
    <>
      <AppShellPanel
        title="Blueprint Library"
        componentName="Blueprint Library"
        isLoading={blueprintLocationsLoading}
        isError={blueprintLocationsError}
        error={blueprintLocationsErrorValue}
        paperSx={{ height: "auto", width: "100%" }}
        contentSx={{ overflow: "visible", minHeight: "auto" }}
        action={
          <AppShellSelect
            value={currentPageSize}
            onChange={(size) => handlePageSizeChange(Number(size))}
            helperText="Items Per Page"
            minWidth={110}
          >
            {[4, 8, 16, 32, 64].map((size) => (
              <MenuItem key={size} value={size}>
                {size}
              </MenuItem>
            ))}
          </AppShellSelect>
        }
      >
        <Box sx={{ width: "100%" }}>
          <LibrarySearch places={places} />
          <Grid container spacing={2} sx={{ marginTop: 1 }}>
            {blueprintResults.ids.map((bpID) => (
              <BlueprintGroup
                key={bpID}
                bpID={bpID}
                blueprintResults={blueprintResults}
                currentFilter={currentFilter}
                locationNames={blueprintLocationNames}
                compact={enableCompactView}
              />
            ))}
            <Grid
              container
              align="center"
              size={12}
              sx={{
                justifyContent: "center",
                marginTop: 4,
                marginBottom: 1,
              }}
            >
              <Pagination
                color="primary"
                size="small"
                count={totalPages}
                page={currentPage}
                onChange={handlePageChange}
              />
            </Grid>
          </Grid>
        </Box>
      </AppShellPanel>
      <BlueprintArchiveDialogue />
    </>
  );
}
