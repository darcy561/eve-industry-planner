import { Typography, Tooltip } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";
import { useMaterialFigures } from "../../../../Edit Job Hooks/useMaterialFigures";

export function MaterialQuantityInfoSingleRow({
  material,
  remainingTotalToBeImported,
}) {
  const { needed, purchased } = useMaterialFigures(material);
  const remaining = Math.max(
    0,
    needed - purchased - remainingTotalToBeImported,
  );

  return (
    <Tooltip
      title={`Total Needed: ${numberToShortText(needed)} | Remaining: ${numberToShortText(remaining)}`}
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
        Total Needed: {formatNumberForLocale(needed, { max: 0 })} | Remaining:{" "}
        {formatNumberForLocale(remaining, { max: 0 })}
      </Typography>
    </Tooltip>
  );
}
