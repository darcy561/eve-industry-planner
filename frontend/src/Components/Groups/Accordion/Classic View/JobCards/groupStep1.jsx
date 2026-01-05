import { Typography, Box } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../Functions/Helper/numberParser";

export default function GroupStep1JobCard({ job }) {
  const totalSetupCount = job.setupCount();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        paddingLeft: { xs: 0, sm: 0.5 },
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
        <Box sx={{ flex: "0 0 66.666%" }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Quantity
          </Typography>
        </Box>
        <Box sx={{ flex: "0 0 33.333%", textAlign: "right", paddingRight: { xs: 2, md: 3 } }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(job.build.products.totalQuantity, { max: 0 })}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
        <Box sx={{ flex: "0 0 83.333%" }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Setup Count:
          </Typography>
        </Box>
        <Box sx={{ flex: "0 0 16.666%", textAlign: "right", paddingRight: { xs: 2, md: 3 } }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(totalSetupCount, { max: 0 })}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
