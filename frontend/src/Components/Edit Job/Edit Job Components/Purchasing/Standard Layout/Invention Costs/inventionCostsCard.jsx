import { useState } from "react";
import {
  Avatar,
  Chip,
  Grid,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import AddIcon from "@mui/icons-material/Add";
import {
  META_LEVELS_THAT_REQUIRE_INVENTION_COSTS,
  STANDARD_TEXT_FORMAT,
  TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS,
} from "../../../../../../Context/defaultValues";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function InventionCostsCard({ state, actions }) {
  const [inputs, setInputs] = useState({
    itemName: null,
    itemCost: 0,
  });

  function handleRemove(record) {
    state.activeJob.removeInventionCost(record);
    actions.updateActiveJob(state.activeJob);
    showSnackbarError("Deleted");
  }

  function handleSubmit(event) {
    event.preventDefault();

    state.activeJob.addInventionCost({
      id: Date.now(),
      itemName: inputs.itemName,
      itemCost: inputs.itemCost,
    });

    actions.updateActiveJob(state.activeJob);
    showSnackbarSuccess("Success");
    setInputs({ itemName: null, itemCost: 0 });
  }

  if (
    !META_LEVELS_THAT_REQUIRE_INVENTION_COSTS.has(state.activeJob.metaLevel) &&
    !TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS.has(state.activeJob.itemID)
  )
    return null;

  return (
    <Grid
      size={{
        xs: 12,
        sm: 6,
        md: 4,
        lg: 3,
      }}
    >
      <ContentPanel
        paperSx={{ minHeight: { xs: 32, md: 30 }, position: "relative" }}
      >
        <Grid container>
          <Grid align="center" size={12}>
            <Avatar
              variant="cirular"
              sx={{
                bgcolor: "primary.main",
                height: { xs: "32px", sm: "64px" },
                width: { xs: "32px", sm: "64px" },
              }}
            >
              <img
                src={"../images/invention.png"}
                alt=""
                style={{
                  height: { xs: "15px", sm: "35px" },
                  width: { xs: "15px", sm: "35px" },
                }}
              />
            </Avatar>
          </Grid>
          <Grid
            sx={{
              minHeight: "3rem",
              marginTop: "5px",
            }}
            size={12}
          >
            <Typography variant="subtitle2" align="center">
              Invention Costs
            </Typography>
          </Grid>
          <Grid container>
            <Grid sx={{ marginTop: "5px", height: "4.5rem" }} size={12}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                Total Cost:{" "}
                {formatNumberForLocale(
                  state.activeJob.build.costs.inventionCosts
                )}
              </Typography>
            </Grid>
          </Grid>
          <Grid
            container
            sx={{
              height: "7vh",
              overflowY: "auto",
            }}
          >
            {state.activeJob.build.costs.inventionEntries.map((record) => {
              return (
                <Grid
                  key={record.id}
                  container
                  justifyContent="center"
                  alignItems="center"
                  sx={{ marginBottom: "5px" }}
                >
                  <Chip
                    key={record.id}
                    label={`${record.itemName} ${formatNumberForLocale(
                      record.itemCost
                    )}`}
                    variant="outlined"
                    deleteIcon={<ClearIcon />}
                    sx={{
                      "& .MuiChip-deleteIcon": {
                        color: "error.main",
                      },
                      boxShadow: 2,
                    }}
                    onDelete={() => {
                      handleRemove(record);
                    }}
                    color="secondary"
                  />
                </Grid>
              );
            })}
          </Grid>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={1}>
              <Grid size={6}>
                <TextField
                  sx={{
                    "& .MuiFormHelperText-root": {
                      color: (theme) => theme.palette.secondary.main,
                    },
                    "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                      {
                        display: "none",
                      },
                  }}
                  required={true}
                  size="small"
                  variant="standard"
                  type="text"
                  helperText="Item"
                  onChange={(e) => {
                    const input = e.target.value.replace(/[^a-zA-Z0-9 ]/g, "");
                    setInputs((prevState) => ({
                      ...prevState,
                      itemName: input,
                    }));
                  }}
                />
              </Grid>
              <Grid size={4}>
                <TextField
                  sx={{
                    "& .MuiFormHelperText-root": {
                      color: (theme) => theme.palette.secondary.main,
                    },
                  }}
                  required={true}
                  size="small"
                  variant="standard"
                  type="number"
                  helperText="Item Price"
                  defaultValue="0"
                  onChange={(e) => {
                    setInputs((prevState) => ({
                      ...prevState,
                      itemCost: Number(e.target.value),
                    }));
                  }}
                  slotProps={{
                    htmlInput: { step: "0.01" },
                  }}
                />
              </Grid>
              <Grid align="center" size={1}>
                <IconButton size="small" color="primary" type="submit">
                  <AddIcon />
                </IconButton>
              </Grid>
            </Grid>
          </form>
        </Grid>
      </ContentPanel>
    </Grid>
  );
}
