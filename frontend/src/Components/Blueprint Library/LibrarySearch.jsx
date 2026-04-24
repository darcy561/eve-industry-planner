import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
} from "@mui/material";
import { useCachedData } from "../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import { useGetAllCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { useGetAllCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import { useNavigate, useSearch } from "@tanstack/react-router";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "reactions", label: "Reactions" },
  { value: "bpo", label: "BP Originals" },
  { value: "bpc", label: "BP Copies" },
];

export function LibrarySearch() {
  const { data: itemList, isLoading: itemListLoading, error: itemListError } = useCachedData(
    CACHED_DATA_FILES.SEARCH_INDEX
  );
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) || {};

  const { isLoading: characterBlueprintsLoading } =
    useGetAllCharacterBlueprints();
  const {
    isLoading: corporationBlueprintsLoading } =
    useGetAllCorporationBlueprints();

  const isLoading =
    characterBlueprintsLoading ||
    corporationBlueprintsLoading ||
    itemListLoading;

  const currentFilter = search?.filter || "all";
  const currentPageSize = search?.pageSize || 16;

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

  function handlePageSizeChange(newPageSize) {
    navigate({
      search: (prev) => ({
        ...prev,
        pageSize: newPageSize,
        page: 1, // Reset to first page when page size changes
      }),
    });
  }

  return (
    <ContentPanel
      componentName="Blueprint Library Search"
      isLoading={isLoading}
      isError={itemListError}
      error={itemListError}
      paperSx={{ height: "auto" }}
      contentGridSx={{
        overflow: "visible",
        minHeight: "auto",
        flex: "0 1 auto",
      }}
    >
      <Grid container sx={{ width: "100%", paddingX: { xs: 0.5, md: 1 } }}>
        <Grid
          size={{
            xs: 12,
            sm: 5,
            md: 4,
            xl: 2,
          }}
        >
          <VirtualisedRecipeSearch onSelect={handleSearchSelect} />
        </Grid>
        <Grid
          align="center"
          sx={{
            marginTop: { xs: "10px", sm: "0px" },
            paddingLeft: { xs: "0px", sm: "40px", md: "40px", lg: "0px" },
          }}
          size={{
            xs: 12,
            sm: 6,
            md: 7,
            xl: 9,
          }}
        >
          <FormControl>
            <RadioGroup row value={currentFilter}>
              {FILTER_OPTIONS.map((option) => (
                <FormControlLabel
                  key={option.value}
                  control={
                    <Radio
                      sx={{
                        "&, &.MuiButtonBase-root.MuiRadio-root": {
                          color: "secondary.main",
                        },
                      }}
                      value={option.value}
                      onChange={() => handleFilterChange(option.value)}
                    />
                  }
                  label={option.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 12,
            sm: 1,
          }}
        >
          <FormControl
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
              {
                display: "none",
              },
            }}
            fullWidth={true}
          >
            <Select
              variant="standard"
              value={currentPageSize}
              size="small"
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              onOpen={() => {
                // Blur any focused buttons to prevent aria-hidden warning
                const activeElement = document.activeElement;
                if (activeElement && activeElement instanceof HTMLElement) {
                  activeElement.blur();
                }
              }}
            >
              <MenuItem value={4}>4</MenuItem>
              <MenuItem value={8}>8</MenuItem>
              <MenuItem value={16}>16</MenuItem>
              <MenuItem value={32}>32</MenuItem>
              <MenuItem value={64}>64</MenuItem>
            </Select>
            <FormHelperText variant="standard">Items Per Page</FormHelperText>
          </FormControl>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
