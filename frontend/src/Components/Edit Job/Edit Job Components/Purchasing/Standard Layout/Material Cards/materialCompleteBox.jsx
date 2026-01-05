import { Box, Typography } from "@mui/material";

export function MaterialCompleteBox_Purchasing({
  material,
  childJobs,
  childJobProductionTotal,
  remainingTotalToBeImported,
}) {
  // Determine if material is complete
  let isComplete = false;

  if (childJobs.length === 0) {
    // No child jobs: complete when quantityPurchased equals quantity
    isComplete = material.quantityPurchased >= material.quantity;
  } else {
    // Child jobs exist
    if (childJobProductionTotal >= material.quantity) {
      // Child jobs cover the requirement: complete when all costs are imported
      isComplete = remainingTotalToBeImported === 0;
    } else {
      // Child jobs don't cover: complete when shortfall is purchased AND all costs are imported
      const shortfall = material.quantity - childJobProductionTotal;
      isComplete =
        material.quantityPurchased >= shortfall &&
        remainingTotalToBeImported === 0;
    }
  }

  if (!isComplete) return null;

  return (
    <Box
      sx={{
        backgroundColor: "manufacturing.main",
        borderRadius: "5px",
        marginLeft: "auto",
        marginRight: "auto",
        marginTop: "13px",
        padding: "8px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Typography align="center">Complete</Typography>
    </Box>
  );
}
