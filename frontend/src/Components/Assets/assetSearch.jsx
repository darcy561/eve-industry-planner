import {
  CircularProgress,
  FormControl,
  FormHelperText,
  Grid,
  MenuItem,
  Paper,
  Select,
} from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";

export function AssetSearch({
  locationList,
  selectedLocation,
  updateSelectedLocation,
  namesLoad,
  pagination,
  setPagination,
}) {
  return (
    <Paper
      square={true}
      elevation={2}
      sx={{
        padding: "20px",
      }}
    >
      <Grid container>
        {namesLoad ? (
          <>
            <Grid
              size={{
                xs: 8,
                sm: 6
              }}>
              <FormControl
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                }}
                fullWidth
              >
                <Select
                  value={selectedLocation}
                  size="small"
                  onChange={(e) => {
                    updateSelectedLocation(e.target.value);
                  }}
                >
                  {locationList.map((entry) => {
                    const name = useUsersStore
                      .getState()
                      .worldData.actions.findUniverseData(entry)?.name;

                    if (!name || name === "No Access To Location") {
                      return null;
                    }
                    return (
                      <MenuItem key={entry} value={entry}>
                        {name}
                      </MenuItem>
                    );
                  })}
                </Select>
                <FormHelperText variant="standard">
                  Asset Locations
                </FormHelperText>
              </FormControl>
            </Grid>
            <Grid
              align="right"
              size={{
                xs: 4,
                sm: 6
              }}>
              <FormControl
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                }}
              >
                <Select
                  variant="standard"
                  value={pagination.pageSize}
                  size="small"
                  onChange={(e) => {
                    setPagination((prev) => ({
                      ...prev,
                      to: e.target.value,
                      pageSize: e.target.value,
                    }));
                  }}
                >
                  <MenuItem value={4}>4</MenuItem>
                  <MenuItem value={8}>8</MenuItem>
                  <MenuItem value={16}>16</MenuItem>
                  <MenuItem value={32}>32</MenuItem>
                  <MenuItem value={64}>64</MenuItem>
                </Select>
                <FormHelperText variant="standard">
                  Items Per Page
                </FormHelperText>
              </FormControl>
            </Grid>
          </>
        ) : (
          <Grid align="center" size={12}>
            <CircularProgress color="primary" />
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}
