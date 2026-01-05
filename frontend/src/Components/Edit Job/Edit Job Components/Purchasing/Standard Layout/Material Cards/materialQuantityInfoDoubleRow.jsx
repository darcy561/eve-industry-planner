import { Typography, Tooltip, Box } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";

export function MaterialQuantityInfoDoubleRow({
  material,
  childJobProductionTotal,
  remainingTotalToBeImported,
}) {
  const remainingWithChildJobs = Math.max(
    0,
    material.quantity - childJobProductionTotal
  );
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
          childJobProductionTotal > 0
            ? `Total produced by child jobs: ${numberToShortText(childJobProductionTotal)} | Remaining: ${numberToShortText(remainingWithChildJobs)}`
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
          {childJobProductionTotal > 0 ? (
            <>
              From Child Jobs:{" "}
              {formatNumberForLocale(childJobProductionTotal, { max: 0 })} |
              Remaining:{" "}
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

