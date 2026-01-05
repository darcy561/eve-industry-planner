import { useState } from "react";
import { Icon, Tooltip, Typography, Grid } from "@mui/material";

import InfoIcon from "@mui/icons-material/Info";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import GLOBAL_CONFIG from "../../../../../../global-config-app";
import { ChildJobPopoverFrame } from "./Child Job Pop Over/childJobPopoverFrame";
import { useMaterialCostCalculations } from "../../../../../../Hooks/GroupHooks/useMaterialCostCalculations";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import useUsersStore from "../../../../../../Zustand/usersStore";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;

export function MaterialCostRow_MaterialPricePanel(props) {
  const { state, actions, material, marketSelect, listingSelect } = props;
  const { jobArray } = useUsersStore((state) => state.jobData);
  const checkTypeIDisExempt = useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const [displayPopover, updateDisplayPopover] = useState(null);
  const { calculateMaterialCostFromChildJobs } = useMaterialCostCalculations();

  const itemPriceObject = useUsersStore
    .getState()
    .worldData.actions.findMarketData(material.typeID);

  const currentMaterialPrice = itemPriceObject[marketSelect][listingSelect];

  const matchedChildJobs = jobArray.filter((i) =>
    state.activeJob.build.childJobs[material.typeID].includes(i.jobID)
  );
  if (state.temporaryChildJobs[material.typeID]) {
    const tempJobID = state.temporaryChildJobs[material.typeID].jobID;

    if (!matchedChildJobs.some((i) => i.jobID === tempJobID)) {
      matchedChildJobs.push(state.temporaryChildJobs[material.typeID]);
    }
  }
  if (state.parentChildToEdit.childJobs[material.typeID]?.add) {
    for (let id of state.parentChildToEdit.childJobs[material.typeID].add) {
      const match = jobArray.find((i) => i.jobID === id);
      if (!match) continue;
      matchedChildJobs.push(match);
    }
  }

  const matchedChildJobIDs = actions.getCurrentMaterialChildJobs(
    material.typeID
  );

  const totalPurchaseCost = currentMaterialPrice * material.quantity;
  const productionCostPerItem =
    Math.round(
      (calculateMaterialCostFromChildJobs(
        material,
        matchedChildJobIDs,
        matchedChildJobs,
        [],
        marketSelect,
        listingSelect
      ) /
        material.quantity +
        Number.EPSILON) *
        100
    ) / 100;

  return (
    <Grid
      container
      sx={{
        padding: { xs: "7px 0px", sm: "10px 0px" },
        backgroundColor: (theme) =>
          selectRowHighlightColor(theme, displayPopover),
      }}
      size={12}>
      <Grid
        justifyContent="center"
        sx={{
          display: { xs: "flex", md: "flex" },
          paddingRight: "5px",
        }}
        size={{
          xs: 2,
          sm: 1
        }}>
        <img
          src={`https://images.evetech.net/types/${material.typeID}/icon?size=32`}
          alt=""
        />
      </Grid>
      <Grid
        container
        align="left"
        size={{
          xs: 10,
          md: 4
        }}>
        <Grid alignItems="center" sx={{ display: "flex" }} size={11}>
          <MaterialPopoverIconButtons
            typeID={material.typeID}
            regionID={marketSelect}
          >
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              {material.name}
            </Typography>
          </MaterialPopoverIconButtons>
        </Grid>
        <Grid
          alignItems="center"
          justifyContent="center"
          sx={{ display: "flex" }}
          size={1}>
          {checkJobTypeIsBuildable(material.jobType) ? (
            <>
              <Tooltip
                title="Click To Compare Material Build Cost"
                arrow
                placement="bottom"
              >
                <Icon
                  aria-haspopup="true"
                  color={
                    checkTypeIDisExempt(material.typeID) ? "warning" : "primary"
                  }
                  onClick={(event) => {
                    updateDisplayPopover(event.currentTarget);
                  }}
                >
                  <InfoIcon fontSize="small" />
                </Icon>
              </Tooltip>
              <ChildJobPopoverFrame
                {...props}
                displayPopover={displayPopover}
                updateDisplayPopover={updateDisplayPopover}
                currentMaterialPrice={currentMaterialPrice}
                matchedChildJobs={matchedChildJobs}
              />
            </>
          ) : null}
        </Grid>
      </Grid>
      <Grid
        alignItems="center"
        justifyContent="center"
        container
        align="center"
        sx={{
          marginTop: { xs: "10px", md: "0px" },
          display: "flex",
        }}
        size={{
          xs: 6,
          md: 3
        }}>
        <Grid size={12}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(currentMaterialPrice)}
          </Typography>
        </Grid>
        {checkJobTypeIsBuildable(material.jobType) && (
          <Grid sx={{ marginTop: 1 }} size={12}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              color={selectTextHighlight(
                currentMaterialPrice,
                productionCostPerItem,
                false
              )}
            >
              <i>
                {matchedChildJobs.length > 0
                  ? formatNumberForLocale(productionCostPerItem)
                  : "-"}
              </i>
            </Typography>
          </Grid>
        )}
      </Grid>
      <Grid
        alignItems="center"
        justifyContent="center"
        container
        align="center"
        sx={{ marginTop: { xs: "10px", md: "0px" }, display: "flex" }}
        size={{
          xs: 6,
          md: 4
        }}>
        <Grid size={12}>
          <Typography
            sx={{ typography: STANDARD_TEXT_FORMAT }}
            color={selectTextHighlight(
              currentMaterialPrice,
              productionCostPerItem,
              true
            )}
          >
            {formatNumberForLocale(totalPurchaseCost)}
          </Typography>
        </Grid>
        {checkJobTypeIsBuildable(material.jobType) && (
          <Grid size={12}>
            <Typography
              sx={{ typography: { xs: "caption", sm: "body2" } }}
              color={selectTextHighlight(
                currentMaterialPrice,
                productionCostPerItem,
                false
              )}
            >
              <i>
                {matchedChildJobIDs.length > 0
                  ? formatNumberForLocale(
                      productionCostPerItem * material.quantity
                    )
                  : "-"}
              </i>
            </Typography>
          </Grid>
        )}
      </Grid>
    </Grid>
  );
}

function selectRowHighlightColor(theme, displayPopover) {
  if (!displayPopover) return null;

  switch (theme.palette.mode) {
    case PRIMARY_THEME:
      return theme.palette.secondary.highlight;

    case SECONDARY_THEME:
      return theme.palette.secondary.highlight;

    default:
      return theme.palette.secondary.main;
  }
}

function selectTextHighlight(
  currentMaterialPrice,
  calculatedChildPrice,
  highlightIfGreater
) {
  if (calculatedChildPrice === 0) return null;

  if (currentMaterialPrice == calculatedChildPrice) return null;

  if (
    (highlightIfGreater && currentMaterialPrice >= calculatedChildPrice) ||
    (!highlightIfGreater && currentMaterialPrice <= calculatedChildPrice)
  ) {
    return "error.main";
  } else {
    return "success.main";
  }
}
