import { useMemo } from "react";
import {
  IconButton,
  TextField,
  Tooltip,
  Box,
  CircularProgress,
} from "@mui/material";
import { useFormStatus } from "react-dom";
import AddIcon from "@mui/icons-material/Add";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { useEffectiveMarketHub } from "../../../../../../Hooks/Planner/useEffectiveMarketHub.js";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";
import { getMarketPriceForType } from "../../../../../../Functions/MarketData/marketPriceForType";
import { useMarketPricesQuery } from "../../../../../../Hooks/React Query/World/marketPrices";
import {
  importedQuantities,
  importPurchaseToMaterial,
} from "../../../../Edit Job Hooks/jobCommands";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { useMaterialFigures } from "../../../../Edit Job Hooks/useMaterialFigures";

export function AddMaterialCost_Purchasing({
  material,
  childSupply,
  childJobs,
}) {
  const localPricing = useJobDraft((job) => job.build.localPricing);
  const { remaining } = useMaterialFigures(material);
  const actions = useJobActions();
  const { marketLocation, orderType } = useEffectiveMarketHub(
    localPricing,
    PRICING_SIDE.BUYING,
  );

  // The one price this card draws. Read out of the cache as it renders, so the
  // query is what tells it the figure has moved.
  const wants = useMemo(
    () => [{ typeID: material.typeID, sourceID: marketLocation }],
    [material.typeID, marketLocation],
  );
  useMarketPricesQuery(wants);

  const materialPrice = getMarketPriceForType(
    material.typeID,
    marketLocation,
    orderType,
  );

  // A child job's output is not promised to this job until its cost is
  // imported, so the form offers what the children cannot be counted on for.
  const stillToBuy = Math.max(
    0,
    remaining - (childJobs.length === 0 ? 0 : childSupply.min),
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
    const purchase = {
      id: crypto.randomUUID(),
      itemCount: itemCountInput,
      itemCost: itemCostInput,
    };
    const availableToBuy = remaining;
    const { leftOver } = importedQuantities(purchase, availableToBuy);

    actions.run(
      importPurchaseToMaterial(material.typeID, purchase, {
        availableToBuy,
        recordExcess: true,
      }),
    );
    showSnackbarSuccess(
      leftOver > 0
        ? `Success. ${formatNumberForLocale(leftOver, { max: 0 })} more than this job needs, not charged to it.`
        : "Success",
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
            defaultValue={materialPrice}
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
