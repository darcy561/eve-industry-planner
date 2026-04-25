import { Typography, Box } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";

export default function GroupStep2JobCard({ job }) {
  const totalComplete = job.totalCompletedMaterials();
  const isNotReadyToBuild = !job.isReadyToBuild();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        paddingLeft: { xs: 0, sm: 0.5 },
        minWidth: 0,
        alignItems: "center",
      }}
    >
      {isNotReadyToBuild ? (
        <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
          <Box sx={{ flex: "0 0 83.333%" }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Awaiting Materials
            </Typography>
          </Box>
          <Box sx={{ flex: "0 0 16.666%", textAlign: "right", paddingRight: { xs: 2, md: 3 } }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              {job.build.materials.length - totalComplete}/
              {job.build.materials.length}
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box sx={{ width: "100%" }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Ready To Build
          </Typography>
        </Box>
      )}
    </Box>
  );
}
