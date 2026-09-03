import { IconButton, TextField, Tooltip, Box, CircularProgress } from "@mui/material";
import { useFormStatus } from "react-dom";
import AddIcon from "@mui/icons-material/Add";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useEffectiveMarketHubFromLayout } from "../../../../../../Hooks/Planner/useEffectiveMarketHubFromLayout.js";

export function AddMaterialCost_Purchasing({
  state,
  actions,
  material,
  childSupply,
  childJobs,
}) {
  const { marketDisplay, orderDisplay } = useEffectiveMarketHubFromLayout(
    state.activeJob.layout
  );

  const materialPrice = useUsersStore
    .getState()
    .worldData.actions.findMarketData(material.typeID);

  // A child job's output is not promised to this job until its cost is
  // imported, so the form offers what the children cannot be counted on for.
  const stillToBuy = Math.max(
    0,
    material.quantityStillRequired() -
      (childJobs.length === 0 ? 0 : childSupply.min),
  );

  const getInitialQuantity = () => stillToBuy;

  function handleSubmitAction(formData) {
    const itemCountInput = Number(formData.get("itemCountInput"));
    const itemCostInput = Number(formData.get("itemCostInput"));
    // Item count must be > 0, price can be 0 (allow 0 for price, but not for quantity)
    if (
      !Number.isFinite(itemCountInput) ||
      itemCountInput <= 0 ||
      !Number.isFinite(itemCostInput) ||
      itemCostInput < 0
    ) {
      return;
    }
    const { leftOver } = state.activeJob.importPurchaseToMaterial(
      material.typeID,
      { itemCount: itemCountInput, itemCost: itemCostInput },
      { recordExcess: true }
    );

    actions.updateActiveJob(state.activeJob);
    showSnackbarSuccess(
      leftOver > 0
        ? `Success. ${formatNumberForLocale(leftOver, { max: 0 })} more than this job needs, not charged to it.`
        : "Success"
    );
  }

  if (stillToBuy <= 0) return null;

  return (
    <form
      action={handleSubmitAction}
      style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 0.5,
          marginTop: 0.5,
          width: "100%",
          maxWidth: "100%",
          paddingLeft: { xs: 0, sm: 2.5 },
          boxSizing: "border-box",
        }}
      >
        <Box sx={{ flex: { xs: "1 1 33%", sm: "1 1 40%" }, minWidth: 0 }}>
          <TextField
            size="small"
            variant="standard"
            type="number"
            label="Quantity"
            name="itemCountInput"
            defaultValue={getInitialQuantity()}
            fullWidth
            sx={{
              "& .MuiInputBase-root": {
                fontSize: "0.875rem",
              },
              "& .MuiInputLabel-root": {
                fontSize: "0.75rem",
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
            }}
            slotProps={{
              htmlInput: { step: "1", min: "0" },
            }}
          />
        </Box>
        <Box sx={{ flex: { xs: "1 1 42%", sm: "1 1 45%" }, minWidth: 0 }}>
          <TextField
            size="small"
            variant="standard"
            type="number"
            label="Price"
            name="itemCostInput"
            defaultValue={materialPrice[marketDisplay][orderDisplay]}
            fullWidth
            sx={{
              "& .MuiInputBase-root": {
                fontSize: "0.875rem",
              },
              "& .MuiInputLabel-root": {
                fontSize: "0.75rem",
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
            }}
            slotProps={{
              htmlInput: { step: "0.01", min: "0" },
            }}
          />
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
            flex: { xs: "0 0 auto", sm: "0 0 auto" },
          }}
        >
          <Tooltip title="Click to add" arrow>
            <PendingAddIconButton />
          </Tooltip>
        </Box>
      </Box>
    </form>
  );
}

function PendingAddIconButton() {
  const { pending } = useFormStatus();

  return (
    <IconButton
      size="small"
      color="primary"
      type="submit"
      disabled={pending}
      sx={{
        padding: "6px",
        "& .MuiSvgIcon-root": {
          fontSize: "1.25rem",
        },
      }}
    >
      {pending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
    </IconButton>
  );
}
