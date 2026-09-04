import { Box, Typography } from "@mui/material";

export function MaterialCompleteBox_Purchasing({
  material,
  childJobs,
  childSupply,
  remainingTotalToBeImported,
}) {
  // What the child jobs can be counted on for is the most any of them promises
  // this job, so anything beyond that has to be bought before it is covered.
  const isComplete =
    childJobs.length === 0
      ? material.purchaseComplete
      : material.quantityRemaining <= childSupply.min &&
        remainingTotalToBeImported === 0;

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
