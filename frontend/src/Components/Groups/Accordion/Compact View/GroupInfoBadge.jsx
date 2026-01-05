import { Box, Tooltip } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { formatNumberForLocale, formatTimeRemaining } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      const totalSetupCount = Object.values(job.build.setup).reduce(
        (prev, setup) => {
          return prev + 1;
        },
        0
      );
      return (
        <span>
          <p>
            Quantity:{" "}
            {formatNumberForLocale(job.build.products.totalQuantity, {
              max: 0,
            })}
          </p>
          <p>
            Job Setups: {formatNumberForLocale(totalSetupCount, { max: 0 })}{" "}
          </p>
        </span>
      );
    case 1:
      const totalComplete = job.build.materials.reduce((res, mat) => {
        if (mat.purchaseComplete) {
          res++;
        }
        return res;
      }, 0);

      if (totalComplete < job.totalMaterials) {
        return (
          <span>
            <p>
              Awaiting Materials: {job.totalMaterials - totalComplete}/
              {job.totalMaterials}
            </p>
          </span>
        );
      }
      return <p>Ready To Build</p>;
    case 2:
      const timeRemaining = sortJobs(job);

      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(job.apiJobs.size, { max: 0 })}
          </p>
          {job.apiJobs.length > 0 && (
            <p>
              {timeRemaining === "Complete"
                ? "Complete"
                : `Ends In: ${timeRemaining}`}
            </p>
          )}
        </span>
      );
    case 3:
      return (
        <span>
          <p>
            Items Built:{" "}
            {formatNumberForLocale(job.build.products.totalQuantity, {
              max: 0,
            })}
          </p>
          <p>
            Item Cost:{" "}
            {formatNumberForLocale(
              Math.round(
                ((job.build.costs.extrasTotal +
                  job.build.costs.installCosts +
                  job.build.costs.totalPurchaseCost) /
                  job.build.products.totalQuantity +
                  Number.EPSILON) *
                100
              ) / 100
            )}
          </p>
        </span>
      );
    case 4:
      return (
        <span>
          <p>
            Market Orders:{" "}
            {formatNumberForLocale(job.apiOrders.size, { max: 0 })}
          </p>
          <p>
            Transactions:{" "}
            {formatNumberForLocale(job.apiTransactions.size, { max: 0 })}{" "}
          </p>
        </span>
      );
    default:
      return null;
  }
}

export default function GroupInfoPopout({ job }) {
  const tooltipContent = getTooltipContent(job);

  if (!tooltipContent) {
    return null;
  }

  return (
    <Tooltip title={tooltipContent} arrow placement="left">
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <InfoIcon fontSize="small" color="primary" />
      </Box>
    </Tooltip>
  );
}

function sortJobs(job) {
  let tempJobs = [...job.build.costs.linkedJobs];
  if (tempJobs.length === 0) return null;

  tempJobs.sort((a, b) => {
    if (Date.parse(a.end_date) > Date.parse(b.end_date)) {
      return 1;
    }
    if (Date.parse(a.end_date) < Date.parse(b.end_date)) {
      return -1;
    }
    return 0;
  });
  return formatTimeRemaining(Date.parse(tempJobs[0].end_date));
}
