import { Typography, Tooltip } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";

export function TotalCost_Purchasing({ material }) {
  return (
    <Tooltip
      title={`Total Cost: ${numberToShortText(material.purchasedCost)} ISK`}
      arrow
      placement="top"
    >
      <Typography
        sx={{
          typography: SMALL_TEXT_FORMAT,
          color: "text.secondary",
          marginTop: { xs: 0.5, sm: 0.25 },
        }}
      >
        Total Cost: {formatNumberForLocale(material.purchasedCost)} ISK
      </Typography>
    </Tooltip>
  );
}
