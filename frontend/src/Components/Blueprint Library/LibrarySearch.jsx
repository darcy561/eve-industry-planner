import { Box } from "@mui/material";
import { useItemSearchIndex } from "../../Hooks/Static/useItems";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import FilterChipGroup from "../../Styled Components/Chip/filterChipGroup";
import VirtualisedLocationSearch from "../../Styled Components/autocomplete/virtualisedLocationSearch";
import { useNavigate, useSearch } from "@tanstack/react-router";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "reactions", label: "Reactions" },
  { value: "bpo", label: "BP Originals" },
  { value: "bpc", label: "BP Copies" },
];

/**
 * The controls above the library: what to look for, which kinds to show, and where they are held.
 *
 * @param {{places: Array<{locationId: number, name: string}>}} props
 */
export function LibrarySearch({ places = [] }) {
  const { entries: itemList } = useItemSearchIndex();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) || {};

  const currentFilter = search?.filter || "all";
  const currentLocation = search?.location ?? "";

  function handleFilterChange(newFilter) {
    navigate({
      search: (prev) => ({
        ...prev,
        filter: newFilter,
        page: 1, // Reset to first page when filter changes
        search: undefined, // Clear search when filter changes
      }),
    });
  }

  function handleSearchSelect(value) {
    if (!itemList || !value) return;

    // Update URL to reflect search - parent component will handle filtering
    navigate({
      search: (prev) => ({
        ...prev,
        search: value.blueprintID.toString(),
        filter: "all", // Reset filter when searching
        page: 1,
      }),
    });
  }

  function handleLocationChange(locationId) {
    navigate({
      search: (prev) => ({
        ...prev,
        location: locationId || undefined,
        page: 1,
      }),
    });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* What to look for and where to look sit together: they are two halves of one question, and
          a search field given the whole width reads as the page's subject rather than a control. */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: "1 1 320px", minWidth: 0 }}>
          <VirtualisedRecipeSearch onSelect={handleSearchSelect} />
        </Box>
        <Box sx={{ flex: "0 1 260px", minWidth: 200 }}>
          <VirtualisedLocationSearch
            places={places}
            value={currentLocation}
            onChange={handleLocationChange}
            anywhereLabel="Anywhere"
            label="Held at"
          />
        </Box>
      </Box>
      <FilterChipGroup
        label="Blueprint kind"
        options={FILTER_OPTIONS}
        value={currentFilter}
        onChange={handleFilterChange}
      />
    </Box>
  );
}
