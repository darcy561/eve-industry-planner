import { Typography, Tooltip, Box } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";

function childSupplyTooltip(childSupply, remaining) {
  const { min, max, sharedWith, claimsKnown, output } = childSupply;

  if (!claimsKnown) {
    return `Child jobs produce ${numberToShortText(output)}, shared with jobs that are not open. Remaining: ${numberToShortText(remaining)}`;
  }
  if (sharedWith === 0) {
    return `From child jobs: ${numberToShortText(max)} | Remaining: ${numberToShortText(remaining)}`;
  }
  return `Child jobs supply between ${numberToShortText(min)} and ${numberToShortText(max)} of these, the rest is claimed by ${sharedWith} other job${sharedWith === 1 ? "" : "s"}. Remaining: ${numberToShortText(remaining)}`;
}

export function MaterialQuantityInfoDoubleRow({
  material,
  childSupply,
  remainingTotalToBeImported,
}) {
  const { min, max, coversEveryClaim, sharedWith, claimsKnown } = childSupply;
  const fromChildJobs = coversEveryClaim
    ? formatNumberForLocale(max, { max: 0 })
    : `${formatNumberForLocale(min, { max: 0 })}–${formatNumberForLocale(max, {
        max: 0,
      })}`;
  const remainingWithChildJobs = Math.max(0, material.quantityRemaining - min);
  const remainingWithoutChildJobs = Math.max(
    0,
    material.quantity -
      material.quantityPurchased -
      remainingTotalToBeImported
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: { xs: 0.25, sm: 0.25 },
        marginTop: { xs: 0.5, sm: 0 },
      }}
    >
      <Tooltip
        title={`Total Needed: ${numberToShortText(material.quantity)}`}
        arrow
        placement="top"
      >
        <Typography
          sx={{
            typography: SMALL_TEXT_FORMAT,
            color: "text.secondary",
          }}
        >
          Total Needed: {formatNumberForLocale(material.quantity, { max: 0 })}
        </Typography>
      </Tooltip>
      <Tooltip
        title={
          childSupply.output > 0
            ? childSupplyTooltip(childSupply, remainingWithChildJobs)
            : `Remaining: ${numberToShortText(remainingWithoutChildJobs)}`
        }
        arrow
        placement="top"
      >
        <Typography
          sx={{
            typography: SMALL_TEXT_FORMAT,
            color: "text.secondary",
          }}
        >
          {childSupply.output > 0 ? (
            <>
              From Child Jobs: {fromChildJobs} | Remaining:{" "}
              {formatNumberForLocale(remainingWithChildJobs, { max: 0 })}
            </>
          ) : (
            <>
              Remaining:{" "}
              {formatNumberForLocale(remainingWithoutChildJobs, { max: 0 })}
            </>
          )}
        </Typography>
      </Tooltip>
    </Box>
  );
}

