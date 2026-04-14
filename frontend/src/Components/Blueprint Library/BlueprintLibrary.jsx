import { useEffect, useMemo } from "react";
import { Pagination, Box, Grid } from "@mui/material";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LibrarySearch } from "./LibrarySearch";
import { ClassicBlueprintGroup } from "./Classic/classicBlueprintGroup";
import { CompactBlueprintGroup } from "./Compact/compactBlueprintGroup";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { getAllCachedCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import useGetAllIndustryJobs from "../../Hooks/EveEsi/useGetAllIndustryJobs";
import { useCachedData } from "../../Hooks/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import {
  combineBlueprints,
  sortBlueprints,
  filterBlueprints,
  filterBlueprintsByID,
  getUniqueBlueprintIDs,
} from "../../Functions/Helper/blueprintFiltering";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

export default function BlueprintLibrary() {
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) || {};

  const { data: itemList } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  // Initialize URL params with defaults if they don't exist
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

  // Get blueprint data
  const characterBlueprints =
    getAllCachedCharacterBlueprints(queryClient)?.data || {};
  const corporationBlueprints =
    getAllCachedCorporationBlueprints(queryClient)?.data || {};
  const { data: apiJobs = [] } = useGetAllIndustryJobs();

  // Combine and filter blueprints based on URL params
  const filteredBlueprintData = useMemo(() => {
    const allBlueprints = combineBlueprints(
      characterBlueprints,
      corporationBlueprints
    );

    let filteredArray;
    if (searchBlueprintID) {
      // If there's a search term, filter by blueprint ID
      filteredArray = filterBlueprintsByID(allBlueprints, searchBlueprintID);
    } else {
      // Otherwise, apply the selected filter
      filteredArray = filterBlueprints(allBlueprints, currentFilter, {
        itemList,
        apiJobs,
        queryClient,
      });
    }

    const sortedArray = sortBlueprints(filteredArray);
    let idArray = getUniqueBlueprintIDs(sortedArray);

    // If searching and no blueprints found, but the blueprint ID exists in itemList,
    // include it in ids so the frame shows (for archive data access)
    if (searchBlueprintID && idArray.length === 0 && itemList) {
      const blueprintExists = itemList.some(
        (item) => item.blueprintID === searchBlueprintID
      );
      if (blueprintExists) {
        idArray = [searchBlueprintID];
      }
    }

    return {
      ids: idArray,
      blueprints: sortedArray,
    };
  }, [
    characterBlueprints,
    corporationBlueprints,
    currentFilter,
    searchBlueprintID,
    itemList,
    apiJobs,
    queryClient,
  ]);

  // Calculate pagination
  const totalPages = Math.ceil(
    filteredBlueprintData.ids.length / currentPageSize
  );
  const from = (currentPage - 1) * currentPageSize;
  const to = Math.min(
    currentPage * currentPageSize,
    filteredBlueprintData.ids.length
  );

  // Get paginated results
  const blueprintResults = useMemo(() => {
    const returnIDs = Array.from(
      new Set(filteredBlueprintData.ids.slice(from, to))
    );
    const returnBps = filteredBlueprintData.blueprints.filter((i) =>
      returnIDs.includes(i.type_id)
    );

    return {
      ids: returnIDs,
      blueprints: returnBps,
    };
  }, [filteredBlueprintData, from, to]);

  // Handle page change
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
    <DefaultPageLayout>
      <Grid container spacing={2}>
        <Grid size={12}>
          <LibrarySearch />
        </Grid>
        <Grid size={12}>
          <Grid container spacing={2}>
            {blueprintResults.ids.map((bpID) => {
              if (enableCompactView) {
                return (
                  <CompactBlueprintGroup
                    key={`compact-${bpID}`}
                    bpID={bpID}
                    blueprintResults={blueprintResults}
                    currentFilter={currentFilter}
                  />
                );
              } else {
                return (
                  <ClassicBlueprintGroup
                    key={`classic-${bpID}`}
                    bpID={bpID}
                    blueprintResults={blueprintResults}
                  />
                );
              }
            })}
            <Grid
              container
              justifyContent="center"
              align="center"
              sx={{ marginTop: 4, marginBottom: 1 }}
              size={12}
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
        </Grid>
      </Grid>
    </DefaultPageLayout>
  );
}
