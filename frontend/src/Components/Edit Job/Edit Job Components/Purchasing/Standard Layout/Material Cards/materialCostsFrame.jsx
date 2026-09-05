import { Chip, Box, Tooltip } from "@mui/material";

import ClearIcon from "@mui/icons-material/Clear";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

function purchaseCountedText(counted, itemCount) {
  if (counted === itemCount) return "All of this purchase is in the total.";
  if (counted === 0) {
    return "The job needed none of this purchase, so it adds nothing to the total.";
  }
  return `The job needed ${counted} of these, and is charged for those. The cheapest purchases fill the requirement first.`;
}

export function MaterialCostsFrame_Purchasing({
  state,
  actions,
  material,
}) {
  function handleRemove(purchaseID) {
    state.activeJob.removeMaterialPurchase(material.typeID, purchaseID);
    actions.updateActiveJob(state.activeJob);
    showSnackbarError("Deleted");
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 0.5,
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 0.5,
      }}
    >
      {material.purchasing.map((record) => {
        const counted = material.countedFromPurchase(record.id);
        const label = `${formatNumberForLocale(record.itemCount, {
          max: 0,
        })} @ ${formatNumberForLocale(record.itemCost)} ISK Each`;

        return (
          <Tooltip
            key={record.id}
            arrow
            placement="top"
            title={purchaseCountedText(counted, record.itemCount)}
          >
            <Chip
              label={
                counted === record.itemCount
                  ? label
                  : `${label} (${formatNumberForLocale(counted, {
                      max: 0,
                    })} counted)`
              }
              variant="outlined"
              deleteIcon={<ClearIcon />}
              sx={{
                "& .MuiChip-deleteIcon": {
                  color: "error.main",
                },
                boxShadow: 2,
                opacity: counted === 0 ? 0.55 : 1,
              }}
              onDelete={() => handleRemove(record.id)}
              color={record.childJobImport ? "primary" : "secondary"}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}
