import {
  esiJobIDs,
  totalJobSlots,
} from "../../../../Edit Job/Edit Job Hooks/jobSelectors";
import { useMemo } from "react";
import { Typography, Box } from "@mui/material";
import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  formatTimeRemaining,
} from "../../../../../Functions/Helper/numberParser";
import { useCurrentTime } from "../../../../../Hooks/useCurrentTime";

export default function GroupStep3JobCard({ job }) {
  const now = useCurrentTime();
  const timeRemaining = useMemo(() => {
    const next = job.nextRunToFinish;
    return next ? formatTimeRemaining(next.finishesAt, { now }) : null;
  }, [job, now]);

  const totalJobCount = totalJobSlots(job);
  const linkedRunCount = esiJobIDs(job).size;

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
        <Box sx={{ flex: "0 0 83.333%" }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            ESI Jobs Linked
          </Typography>
        </Box>
        <Box
          sx={{
            flex: "0 0 16.666%",
            textAlign: "right",
            paddingRight: { xs: 2, md: 3 },
          }}
        >
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(linkedRunCount, { max: 0 })}/{totalJobCount}
          </Typography>
        </Box>
      </Box>

      {linkedRunCount > 0 ? (
        timeRemaining === "Complete" ? (
          <Box sx={{ width: "100%" }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Complete
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
            <Box sx={{ flex: "0 0 33.333%" }}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                Ends In:
              </Typography>
            </Box>
            <Box
              sx={{
                flex: "0 0 66.666%",
                textAlign: "right",
                paddingRight: { xs: 2, md: 3 },
              }}
            >
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                {timeRemaining}
              </Typography>
            </Box>
          </Box>
        )
      ) : null}
    </Box>
  );
}
