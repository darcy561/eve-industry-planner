import { useState } from "react";
import { Icon, Tooltip, Typography, Grid } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import { ChildJobPopoverFrame } from "./Child Job Pop Over/childJobPopoverFrame";
import { calculateMaterialCostFromChildJobs } from "../../../../../../Functions/Groups/materialCostFromChildJobs.js";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import useUsersStore from "../../../../../../Zustand/usersStore";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { getMarketPriceForType } from "./marketPriceHelpers";
import { resolveMaterialChildJobs } from "./Helpers/materialChildJobs";
import {
  buildRowSourceText,
  getListingOrdersLabel,
} from "./Helpers/marketLabelHelpers";
import {
  selectChildBuildPriceColor,
  selectMarketPriceColor,
  selectRowHighlightColor,
} from "./Helpers/itemRowPriceHelpers";

export function MaterialCostRow_MaterialPricePanel(props) {
  const {
    state,
    actions,
    material,
    marketSelect,
    listingSelect,
  } = props;
  const { jobArray } = useUsersStore((state) => state.jobData);
  const checkTypeIDisExempt = useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const [displayPopover, updateDisplayPopover] = useState(null);

  const currentMaterialPrice = getMarketPriceForType(
    material.typeID,
    marketSelect,
    listingSelect
  );
  const { childJobsById, childJobIDs, hasChildJobs } = resolveMaterialChildJobs({
    state,
    actions,
    materialTypeID: material.typeID,
    jobArray,
  });
  const matchedChildJobs = Array.from(childJobsById.values());
  const rowSourceText = buildRowSourceText(marketSelect, listingSelect);

  const totalPurchaseCost = currentMaterialPrice * material.quantity;
  const productionCostPerItem =
    Math.round(
      (calculateMaterialCostFromChildJobs(
        material,
        childJobIDs,
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
        size={{
          xs: 2,
          sm: 1
        }}
        sx={{
          justifyContent: "center",
          alignItems: "center",
          display: { xs: "flex", md: "flex" },
          paddingRight: "5px"
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
        <Grid
          size={11}
          sx={{
            alignItems: "center",
            display: "flex",
            gap: 1.5,
          }}>
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
          size={1}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex",
          }}>
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
        container
        align="center"
        size={{
          xs: 6,
          md: 3
        }}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          marginTop: { xs: "10px", md: "0px" },
          display: "flex"
        }}>
        <Grid size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
            {rowSourceText}
          </Typography>
          <Typography
            sx={{
              typography: STANDARD_TEXT_FORMAT,
              color: selectMarketPriceColor(
                currentMaterialPrice,
                productionCostPerItem
              ),
            }}
          >
            {formatNumberForLocale(currentMaterialPrice)}
          </Typography>
        </Grid>
        {checkJobTypeIsBuildable(material.jobType) && (
          <Grid sx={{ marginTop: 1 }} size={12}>
            <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
              Child Build Unit Cost
            </Typography>
            <Typography
              sx={{
                typography: STANDARD_TEXT_FORMAT,
                color: selectChildBuildPriceColor(
                  currentMaterialPrice,
                  productionCostPerItem
                ),
              }}
            >
              <i>
                {hasChildJobs
                  ? formatNumberForLocale(productionCostPerItem)
                  : "-"}
              </i>
            </Typography>
          </Grid>
        )}
      </Grid>
      <Grid
        container
        align="center"
        size={{
          xs: 6,
          md: 4
        }}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          marginTop: { xs: "10px", md: "0px" },
          display: "flex"
        }}>
        <Grid size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
            {`Market ${getListingOrdersLabel(listingSelect)} Total`}
          </Typography>
          <Typography
            sx={{
              typography: STANDARD_TEXT_FORMAT,
              color: selectMarketPriceColor(
                currentMaterialPrice,
                productionCostPerItem
              ),
            }}
          >
            {formatNumberForLocale(totalPurchaseCost)}
          </Typography>
        </Grid>
        {checkJobTypeIsBuildable(material.jobType) && (
          <Grid size={12}>
            <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
              Child Build Total
            </Typography>
            <Typography
              sx={{
                typography: { xs: "caption", sm: "body2" },
                color: selectChildBuildPriceColor(
                  currentMaterialPrice,
                  productionCostPerItem
                ),
              }}
            >
              <i>
                {hasChildJobs
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
