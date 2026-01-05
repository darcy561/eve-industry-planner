import { Typography, Box } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../Functions/Helper/numberParser";

export default function Step4JobCard({ job }) {
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
      <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
        <Box sx={{ flex: "0 0 50%" }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Items Built
          </Typography>
        </Box>
        <Box sx={{ flex: "0 0 50%", textAlign: "right", paddingRight: { xs: 2, md: 3 } }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(job.itemQuantity, { max: 0 })}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
