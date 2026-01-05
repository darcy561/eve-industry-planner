import { Chip, Box } from "@mui/material";

import ClearIcon from "@mui/icons-material/Clear";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

export function MaterialCostsFrame_Purchasing({
  state,
  actions,
  materialIndex,
  material,
}) {
  function handleRemove(purchasingIndex) {
    const newArray = [...state.activeJob.build.materials];
    let newTotal = state.activeJob.build.costs.totalPurchaseCost;
    let material = newArray[materialIndex];
    const itemCost = material.purchasing[purchasingIndex].itemCost;
    const itemCount = material.purchasing[purchasingIndex].itemCount;
    const hasInvalidQuantityOrCost = material.purchasing.some(
      (entry) =>
        isNaN(entry.itemCount) ||
        entry.itemCount < 0 ||
        isNaN(entry.itemCost) ||
        entry.itemCost < 0
    );
    const hasInvalidTotalPurchaseCost = isNaN(newTotal) || newTotal < 0;

    if (hasInvalidQuantityOrCost) {
      const { newQuantity, newPurchaseCost } = material.purchasing.reduce(
        (acc, entry) => ({
          newQuantity: acc.newQuantity + entry.itemCount,
          newPurchaseCost:
            acc.newPurchaseCost + entry.itemCount * entry.itemCost,
        }),
        { newQuantity: 0, newPurchaseCost: 0 }
      );

      material.quantityPurchased = newQuantity;
      material.purchasedCost = newPurchaseCost;
    }
    if (hasInvalidTotalPurchaseCost) {
      newTotal = newArray.reduce((acc, entry) => acc + entry.purchasedCost, 0);
    }

    material.quantityPurchased -= itemCount;
    material.purchasedCost -= itemCount * itemCost;
    newTotal -= itemCount * itemCost;
    if (material.quantityPurchased < material.quantity) {
      material.purchaseComplete = false;
    }

    material.purchasing = material.purchasing.filter(
      (item, index) => index !== purchasingIndex
    );

    if (material.purchasing.length === 0) {
      if (material.quantityPurchased !== 0 || material.purchasedCost !== 0) {
        material.quantityPurchased = 0;
        material.purchasedCost = 0;

        newTotal = newArray.reduce(
          (acc, entry) => acc + entry.purchasedCost,
          0
        );
      }
    }

    state.activeJob.build.materials = newArray;
    state.activeJob.build.costs.totalPurchaseCost = newTotal;
    actions.updateActiveJob(state.activeJob);
    showSnackbarError("Deleted");
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 0.5,
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 0.5,
      }}
    >
      {material.purchasing.map((record, recordIndex) => {
        return (
          <Chip
            key={record.id}
            label={`${formatNumberForLocale(record.itemCount, {
              max: 0,
            })} @ ${formatNumberForLocale(record.itemCost)} ISK Each`}
            variant="outlined"
            deleteIcon={<ClearIcon />}
            sx={{
              "& .MuiChip-deleteIcon": {
                color: "error.main",
              },
              boxShadow: 2,
            }}
            onDelete={() => handleRemove(recordIndex)}
            color={record.childJobImport ? "primary" : "secondary"}
          />
        );
      })}
    </Box>
  );
}
