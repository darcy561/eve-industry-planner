import {
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { MaterialRow } from "./materialRow";
import { findMaterialJobInGroup } from "../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import getMissingESIData from "../../../../../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../../../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import writeTextToClipboard from "../../../../../../Functions/Clipboard/writeTextToClipboard";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { buildJob } from "../../../../../../Functions/JobPlanner/buildJob";

export function RawResourceList(props) {
  const { state, actions } = props;
  const [anchorEl, setAnchorEl] = useState(null);
  const [displayType, updateDisplyType] = useState(
    state.activeJob.layout?.resourceDisplayType || "all"
  );
  const queryClient = useQueryClient();

  if (!state.activeJob.build.setup[state.activeJob.layout.setupToEdit])
    return null;

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

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
      paperSx={{ position: "relative", height: "auto" }}
      titleMarginBottom={{ xs: 6, sm: 2 }}
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
          state.activeJob.layout.resourceDisplayType = e.target.value;
          actions.updateActiveJob(state.activeJob);
          updateDisplyType(e.target.value);
        }}
      >
        <MenuItem key="all" value="all">
          Display All Setups
        </MenuItem>
        <MenuItem key="active" value="active">
          Display Selected Setup
        </MenuItem>
      </Select>
      <IconButton
        id="rawResources_menu_button"
        onClick={handleMenuClick}
        aria-controls={Boolean(anchorEl) ? "rawResources_menu" : undefined}
        aria-haspopup="true"
        aria-expanded={Boolean(anchorEl) ? "true" : undefined}
        sx={{ position: "absolute", top: "10px", right: "10px" }}
      >
        <MoreVertIcon size="small" color="primary" />
      </IconButton>
      <Menu
        id="rawResources_menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          list: {
            "aria-labelledby": "rawResources_menu_button",
          },
        }}
      >
        <MenuItem
          onClick={async () => {
            await writeTextToClipboard(constructTextToCopy());
          }}
        >
          Copy Resources List
        </MenuItem>

        <MenuItem onClick={buildAllChildJobs}>Create All Child Jobs</MenuItem>
      </Menu>
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
  async function buildAllChildJobs() {
    let buildRequestArray = [];
    const groupJobsToLink = new Map();

    state.activeJob.build.materials.forEach(({ jobType, typeID, quantity }) => {
      if (!checkJobTypeIsBuildable(jobType)) return;
      const childJobLocation = state.activeJob.build.childJobs[typeID];
      const tempChildJob = state.temporaryChildJobs[typeID];
      if (groupJobCheck(typeID, state.activeJob.groupID, groupJobsToLink))
        return;

      if (childJobLocation.length > 0 || tempChildJob) return;

      buildRequestArray.push({
        itemID: typeID,
        itemQty: quantity,
        groupID: state.activeJob.groupID,
        parentJobs: [state.activeJob.jobID],
      });

      function groupJobCheck(requestedTypeID, requestedGroupID, outputMap) {
        if (!state.activeJob.includedInGroup) return false;
        const matchedGroupJob = findMaterialJobInGroup(
          requestedTypeID,
          requestedGroupID
        );
        if (!matchedGroupJob || childJobLocation.length > 0 || tempChildJob)
          return false;

        outputMap.set(requestedTypeID, matchedGroupJob);
        return true;
      }
    });

    // if (buildRequestArray.length === 0) return;
    const newJobs = await buildJob(buildRequestArray, { queryClient });

    // Combine new jobs and group jobs
    const allJobsToAdd = [...newJobs, ...groupJobsToLink.values()];

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobs);

    recalculateInstallCostsWithNewData(
      newJobs,
      requestedMarketData,
      requestedSystemIndexes
    );

    // Use the reducer action to handle job distribution
    actions.markChildJobsForAddition(allJobsToAdd);

    useUsersStore
      .getState()
      .worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);
  }
}
