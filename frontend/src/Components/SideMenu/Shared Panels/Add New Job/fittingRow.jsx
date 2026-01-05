import { Avatar, Checkbox, Box, Typography } from "@mui/material";
import { SMALL_TEXT_FORMAT } from "../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";

function FittingImportRow({ item, index, updateImportedFitData }) {
  if (!item.buildable) return null;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        // py: 0.5,
        // px: 0.5,
        gap: 0.5,
      }}
    >
      <Avatar
        src={`https://images.evetech.net/types/${item.itemID}/icon?size=32`}
        alt={item.itemName}
        variant="square"
        sx={{
          height: { xs: 24, sm: 32 },
          width: { xs: 24, sm: 32 },
          flexShrink: 0,
          "& img": {
            objectFit: "contain",
            p: 0.5,
          },
        }}
      />
      <Typography
        sx={{
          typography: SMALL_TEXT_FORMAT,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {item.itemName}
      </Typography>
      <Typography
        sx={{
          typography: SMALL_TEXT_FORMAT,
          flexShrink: 0,
          minWidth: "40px",
          textAlign: "right",
        }}
      >
        {formatNumberForLocale(item.itemCalculatedQty, { max: 0 })}
      </Typography>
      <Checkbox
        size="small"
        disabled={!item.buildable}
        checked={item.included}
        onChange={() => {
          updateImportedFitData((prev) => {
            const newList = [...prev];
            newList[index].included = !newList[index].included;
            return newList;
          });
        }}
      />
    </Box>
  );
}

export default FittingImportRow;
