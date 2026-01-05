import { useState } from "react";
import { IconButton, TextField, Tooltip, Box } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import { useAddMaterialCostsToJob } from "../../../../../../Hooks/JobHooks/useAddMaterialCosts";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { numberToShortText } from "../../../../../../Functions/Helper/numberParser";
import { materialPriceObjectFactory } from "../../../../../../Functions/JobPlanner/materialCosts";

export function AddMaterialCost_Purchasing({
  state,
  actions,
  material,
  marketDisplay,
  orderDisplay,
  childJobProductionTotal,
  childJobs,
}) {
  const materialPrice = useUsersStore
    .getState()
    .worldData.actions.findMarketData(material.typeID);

  // Calculate initial quantity based on child jobs
  const getInitialQuantity = () => {
    if (childJobs.length === 0) {
      // No child jobs: remaining is total minus purchased
      return Math.max(0, material.quantity - material.quantityPurchased);
    } else {
      if (childJobProductionTotal >= material.quantity) {
        // Child jobs cover requirement, shouldn't show but return 0
        return 0;
      } else {
        // Child jobs don't cover: shortfall minus purchased
        const shortfall = material.quantity - childJobProductionTotal;
        return Math.max(0, shortfall - material.quantityPurchased);
      }
    }
  };

  const [itemCountInput, setItemCountInput] = useState(getInitialQuantity());
  const [itemCostInput, setItemCostInput] = useState(
    materialPrice[marketDisplay][orderDisplay]
  );

  function handleSubmit(event) {
    event.preventDefault();
    // Item count must be > 0, price can be 0 (allow 0 for price, but not for quantity)
    if (itemCountInput == null || itemCountInput <= 0 || 
        itemCostInput == null || itemCostInput < 0) {
      return;
    }
    const { newMaterialArray, newTotalPurchaseCost } = useAddMaterialCostsToJob(
      state.activeJob,
      [
        materialPriceObjectFactory(
          material.typeID,
          itemCountInput,
          itemCostInput
        ),
      ]
    );

    state.activeJob.build.materials = newMaterialArray;
    state.activeJob.build.costs.totalPurchaseCost = newTotalPurchaseCost;
    actions.updateActiveJob(state.activeJob);
    showSnackbarSuccess("Success");
    setItemCostInput(0);
    setItemCountInput(0);
  }

  // Determine if cost entry should be shown
  let shouldShowCostEntry = false;

  if (childJobs.length === 0) {
    // No child jobs: show if not fully purchased
    shouldShowCostEntry = material.quantityPurchased < material.quantity;
  } else {
    // Child jobs exist
    if (childJobProductionTotal >= material.quantity) {
      // Child jobs cover the requirement, don't show cost entry
      shouldShowCostEntry = false;
    } else {
      // Child jobs don't cover the requirement, calculate shortfall
      const shortfall = material.quantity - childJobProductionTotal;
      // Only show cost entry if shortfall hasn't been covered yet
      shouldShowCostEntry = material.quantityPurchased < shortfall;
    }
  }

  if (!shouldShowCostEntry) return null;

  return (
    <form
      onSubmit={handleSubmit}
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
          <Tooltip
            title={numberToShortText(itemCountInput)}
            arrow
            placement="top"
          >
            <TextField
              size="small"
              variant="standard"
              type="number"
              label="Quantity"
              value={itemCountInput != null ? itemCountInput : ""}
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
              onChange={(e) => {
                const value = e.target.value === "" ? "" : Number(e.target.value);
                setItemCountInput(isNaN(value) ? "" : value);
              }}
              slotProps={{
                htmlInput: { step: "1", min: "0" },
              }}
            />
          </Tooltip>
        </Box>
        <Box sx={{ flex: { xs: "1 1 42%", sm: "1 1 45%" }, minWidth: 0 }}>
          <Tooltip
            title={numberToShortText(itemCostInput || 0)}
            arrow
            placement="top"
          >
            <TextField
              size="small"
              variant="standard"
              type="number"
              label="Price"
              value={itemCostInput != null ? itemCostInput : ""}
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
              onChange={(e) => {
                const value = e.target.value === "" ? "" : Number(e.target.value);
                setItemCostInput(isNaN(value) ? "" : value);
              }}
              slotProps={{
                htmlInput: { step: "0.01", min: "0" },
              }}
            />
          </Tooltip>
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
            <IconButton
              size="small"
              color="primary"
              type="submit"
              disabled={
                itemCountInput == null ||
                itemCountInput <= 0 ||
                itemCostInput == null ||
                itemCostInput < 0
              }
              sx={{
                padding: "6px",
                "& .MuiSvgIcon-root": {
                  fontSize: "1.25rem",
                },
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </form>
  );
}
