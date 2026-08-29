import {
  Avatar,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import AddIcon from "@mui/icons-material/Add";
import { useFormStatus } from "react-dom";
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
import DOMPurify from "dompurify";

export function InventionCostsCard({ state, actions }) {
  function handleRemove(record) {
    state.activeJob.removeInventionCost(record);
    actions.updateActiveJob(state.activeJob);
    showSnackbarError("Deleted");
  }

  function handleSubmit(formData) {
    const itemName = DOMPurify.sanitize(String(formData.get("itemName") ?? ""), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();
    const itemCost = Number(formData.get("itemCost") ?? 0);
    if (!itemName || !Number.isFinite(itemCost)) {
      return;
    }

    state.activeJob.addInventionCost({
      id: Date.now(),
      itemName,
      itemCost,
    });

    actions.updateActiveJob(state.activeJob);
    showSnackbarSuccess("Success");
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
              variant="circular"
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
                  sx={{
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: "5px"
                  }}>
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
          <form action={handleSubmit}>
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
                  name="itemName"
                  helperText="Item"
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
                  name="itemCost"
                  helperText="Item Price"
                  defaultValue="0"
                  slotProps={{
                    htmlInput: { step: "0.01" },
                  }}
                />
              </Grid>
              <Grid align="center" size={1}>
                <PendingAddIconButton />
              </Grid>
            </Grid>
          </form>
        </Grid>
      </ContentPanel>
    </Grid>
  );
}

function PendingAddIconButton() {
  const { pending } = useFormStatus();

  return (
    <IconButton size="small" color="primary" type="submit" disabled={pending}>
      {pending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
    </IconButton>
  );
}
