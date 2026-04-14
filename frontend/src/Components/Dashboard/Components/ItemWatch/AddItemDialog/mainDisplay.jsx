import {
  FormControl,
  FormHelperText,
  Grid,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { ChildJobItem } from "./childJobItem";
import { useState } from "react";
import useUsersStore from "../../../../../Zustand/usersStore";
import { WatchListSetupOptions_WatchlistDialog } from "./watchlistOptions";

export function EditItemDisplay_WatchlistDialog({
  watchlistItemRequest,
  updateWatchlistItemRequest,
  setImportedJob,
  materialJobs,
  setMaterialJobs,
  groupSelect,
  updateGroupSelect,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const [itemToModify, updateItemToModify] = useState(watchlistItemRequest);
  return (
    <Grid size={12}>
      <Grid
        container
        onClick={() => {
          updateItemToModify(watchlistItemRequest);
        }}
        size={12}>
        <Grid align="center" size={12}>
          <img
            src={`https://images.evetech.net/types/${watchlistItemRequest}/icon?size=64 `}
            alt=""
          />
        </Grid>
        <Grid
          align="center"
          sx={{
            marginBottom: "20px",
          }}
          size={12}>
          <Typography
            color={itemToModify === watchlistItemRequest ? "primary" : null}
            sx={{
              textDecoration:
                itemToModify === watchlistItemRequest ? "underline" : null,
            }}
          >
            {materialJobs[watchlistItemRequest].name}
          </Typography>
        </Grid>
      </Grid>
      <Grid container sx={{ marginBottom: "20px" }} size={12}>
        {Object.values(materialJobs).map((job) => {
          if (job.itemID === watchlistItemRequest) return null;
          return (
            <ChildJobItem
              key={job.jobID}
              job={job}
              itemToModify={itemToModify}
              updateItemToModify={updateItemToModify}
            />
          );
        })}
      </Grid>
      <WatchListSetupOptions_WatchlistDialog
        setImportedJob={setImportedJob}
        watchlistItemRequest={watchlistItemRequest}
        materialJobs={materialJobs}
        setMaterialJobs={setMaterialJobs}
        itemToModify={itemToModify}
        updateItemToModify={updateItemToModify}
      />
      <Grid sx={{ paddingRight: "10px", marginTop: "20px" }} size={6}>
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
          fullWidth
        >
          <Select
            variant="standard"
            size="small"
            value={groupSelect}
            onChange={(e) => {
              updateGroupSelect(e.target.value);
            }}
          >
            <MenuItem value={0}>Clear</MenuItem>
            {userWatchlist.groups.map((entry) => {
              return (
                <MenuItem key={entry.id} value={entry.id}>
                  {entry.name}
                </MenuItem>
              );
            })}
          </Select>
          <FormHelperText variant="standard">Watchlist Group</FormHelperText>
        </FormControl>
      </Grid>
    </Grid>
  );
}
