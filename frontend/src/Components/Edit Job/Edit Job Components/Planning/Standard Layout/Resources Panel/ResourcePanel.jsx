import {
  Grid,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { MaterialRow } from "./materialRow";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import writeTextToClipboard from "../../../../../../Functions/Clipboard/writeTextToClipboard";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function RawResourceList(props) {
  const { state, actions } = props;
  const [displayType, updateDisplyType] = useState(
    state.activeJob.layout?.resourceDisplayType || "all"
  );

  if (!state.activeJob.build.setup[state.activeJob.layout.setupToEdit])
    return null;

  const calculateVolume = () => {
    let total = 0;
    state.activeJob.build.materials.forEach((material) => {
      const quantityToUse =
        displayType === "active"
          ? state.activeJob.build.setup[state.activeJob.layout.setupToEdit]
              .materialCount[material.typeID].quantity
          : material.quantity;
      total += material.volume * quantityToUse;
    });
    return total;
  };

  function constructTextToCopy() {
    let textToCopy = "";
    state.activeJob.build.materials.forEach((i) => {
      let quantityToUse =
        displayType === "active"
          ? state.activeJob.build.setup[state.activeJob.layout.setupToEdit]
              .materialCount[i.typeID].quantity
          : i.quantity;
      textToCopy = textToCopy.concat(`${i.name} ${quantityToUse}\n`);
    });
    return textToCopy;
  }

  const volumeTotal = calculateVolume();

  return (
    <ContentPanel
      title="Raw Resources"
      wikiUrl="edit job/planning/resources"
      paperSx={{ position: "relative", height: "auto" }}
      titleMarginBottom={{ xs: 6, sm: 2 }}
      enableMenu
      menuItems={[
        {
          label: "Copy Resources List",
          onClick: async () => {
            await writeTextToClipboard(constructTextToCopy());
          },
        },
      ]}
    >
      <Select
        variant="standard"
        size="small"
        value={displayType}
        sx={{
          position: "absolute",
          top: { xs: "55px", sm: "20px" },
          left: { xs: "10% ", sm: "30px" },
        }}
        onChange={(e) => {
          const nextDisplayType = e.target.value;
          actions.updateActiveJob({
            ...state.activeJob,
            layout: {
              ...state.activeJob.layout,
              resourceDisplayType: nextDisplayType,
            },
          });
          updateDisplyType(nextDisplayType);
        }}
      >
        <MenuItem key="all" value="all">
          Display All Setups
        </MenuItem>
        <MenuItem key="active" value="active">
          Display Selected Setup
        </MenuItem>
      </Select>
      <Grid container size={12} spacing={1}>
        {state.activeJob.build.materials.map((material) => {
          return (
            <MaterialRow
              key={material.typeID}
              material={material}
              displayType={displayType}
              {...props}
            />
          );
        })}
      </Grid>
      <Grid container size={12} sx={{ marginTop: 2 }}>
        <Grid
          size={{
            xs: 6,
            sm: 8,
            md: 9,
          }}
        >
          <Typography
            sx={{ typography: { xs: "caption", sm: "body2" } }}
            align="right"
          >
            Total Volume
          </Typography>
        </Grid>
        <Grid
          size={{
            xs: 6,
            sm: 4,
            md: 3,
          }}
        >
          <Typography
            sx={{ typography: { xs: "caption", sm: "body2" } }}
            align="center"
          >
            {formatNumberForLocale(volumeTotal, { max: 0 })} m3
          </Typography>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
