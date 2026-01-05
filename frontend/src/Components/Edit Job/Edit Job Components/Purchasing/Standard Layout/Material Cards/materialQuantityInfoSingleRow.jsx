import { Typography, Tooltip } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";

export function MaterialQuantityInfoSingleRow({ material, remainingTotalToBeImported }) {
  const remaining = Math.max(
    0,
    material.quantity -
      material.quantityPurchased -
      remainingTotalToBeImported
  );

  return (
    <Tooltip
      title={`Total Needed: ${numberToShortText(material.quantity)} | Remaining: ${numberToShortText(remaining)}`}
      arrow
      placement="top"
    >
      <Typography
        sx={{
          typography: SMALL_TEXT_FORMAT,
          color: "text.secondary",
          marginTop: { xs: 0.5, sm: 0 },
        }}
      >
        Total Needed: {formatNumberForLocale(material.quantity, { max: 0 })} |{" "}
        Remaining: {formatNumberForLocale(remaining, { max: 0 })}
      </Typography>
    </Tooltip>
  );
}

