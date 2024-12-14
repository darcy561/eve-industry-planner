import {
  Box,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Typography,
} from "@mui/material";
import { useContext, useState } from "react";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { MaterialRow } from "./materialRow";
import { useManageGroupJobs } from "../../../../../../Hooks/GroupHooks/useManageGroupJobs";
import { useJobBuild } from "../../../../../../Hooks/useJobBuild";
import {
  EvePricesContext,
  SystemIndexContext,
} from "../../../../../../Context/EveDataContext";
import { useHelperFunction } from "../../../../../../Hooks/GeneralHooks/useHelperFunctions";
import Job from "../../../../../../Classes/jobConstructor";
import getMissingESIData from "../../../../../../Functions/Shared/getMissingESIData";
import { useInstallCostsCalc } from "../../../../../../Hooks/GeneralHooks/useInstallCostCalc";
import recalculateInstallCostsWithNewData from "../../../../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import checkJobTypeIsBuildable from "../../../../../../Functions/Helper/checkJobTypeIsBuildable";

export function RawResourceList({
  activeJob,
  updateActiveJob,
  setJobModified,
  temporaryChildJobs,
  updateTemporaryChildJobs,
  parentChildToEdit,
  updateParentChildToEdit,
}) {
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const [displayType, updateDisplyType] = useState(
    activeJob.layout?.resourceDisplayType || "all"
  );
  const { findMaterialJobIDInGroup } = useManageGroupJobs();
  const { buildJob } = useJobBuild();
  const { calculateInstallCostFromJob } = useInstallCostsCalc();
  const { writeTextToClipboard } = useHelperFunction();

  if (!activeJob.build.setup[activeJob.layout.setupToEdit]) return null;

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  let copyText = "";
  let volumeTotal = 0;

  activeJob.build.materials.forEach((i) => {
    let quantityToUse =
      displayType === "active"
        ? activeJob.build.setup[activeJob.layout.setupToEdit].materialCount[
            i.typeID
          ].quantity
        : i.quantity;
    copyText = copyText.concat(`${i.name} ${quantityToUse}\n`);
    volumeTotal += i.volume * quantityToUse;
  });

  return (
    <Paper
      sx={{
        minWidth: "100%",
        padding: "20px",
        position: "relative",
      }}
      elevation={3}
      square
    >
      <Grid container>
        <Grid
          item
          xs={12}
          align="center"
          sx={{ marginBottom: { xs: "50px", sm: "20px", lg: "40px" } }}
        >
          <Typography variant="h6" color="primary" align="center">
            Raw Resources
          </Typography>
        </Grid>
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
            activeJob.layout.resourceDisplayType = e.target.value;
            updateActiveJob((prev) => new Job(prev));
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
          MenuListProps={{
            "aria-labelledby": "rawResources_menu_button",
          }}
        >
          <MenuItem
            onClick={async () => {
              await writeTextToClipboard(copyText);
            }}
          >
            Copy Resources List
          </MenuItem>

          <MenuItem onClick={buildAllChildJobs}>Create All Child Jobs</MenuItem>
        </Menu>
      </Grid>
      <Box
        sx={{
          marginLeft: { xs: "5px", md: "15px" },
          marginRight: { xs: "10px", md: "20px" },
        }}
      >
        <Grid container item direction="column">
          {activeJob.build.materials.map((material) => {
            return (
              <MaterialRow
                key={material.typeID}
                material={material}
                displayType={displayType}
                activeJob={activeJob}
                updateActiveJob={updateActiveJob}
                temporaryChildJobs={temporaryChildJobs}
                parentChildToEdit={parentChildToEdit}
                updateParentChildToEdit={updateParentChildToEdit}
              />
            );
          })}
        </Grid>
      </Box>
      <Grid container sx={{ marginTop: "20px" }}>
        <Grid item xs={6} sm={8} md={9}>
          <Typography
            sx={{ typography: { xs: "caption", sm: "body2" } }}
            align="right"
          >
            Total Volume
          </Typography>
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <Typography
            sx={{ typography: { xs: "caption", sm: "body2" } }}
            align="center"
          >
            {volumeTotal.toLocaleString()} m3
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  );
  async function buildAllChildJobs() {
    let buildRequestArray = [];
    const groupJobsToLink = new Map();
    const newParentJobsToEdit_ChildJobs = {
      ...parentChildToEdit.childJobs,
    };
    const newTempChildJobs = { ...temporaryChildJobs };

    activeJob.build.materials.forEach(({ jobType, typeID, quantity }) => {
      if (!checkJobTypeIsBuildable(jobType)) return;
      const childJobLocation = activeJob.build.childJobs[typeID];
      const tempChildJob = temporaryChildJobs[typeID];
      if (groupJobCheck(typeID, activeJob.groupID, groupJobsToLink)) return;

      if (childJobLocation.length > 0 || tempChildJob) return;

      buildRequestArray.push({
        itemID: typeID,
        itemQty: quantity,
        groupID: activeJob.groupID,
        parentJobs: [activeJob.jobID],
      });

      function groupJobCheck(requestedTypeID, requestedGroupID, outputMap) {
        if (!activeJob.groupID) return false;
        const matchedGroupJobID = findMaterialJobIDInGroup(
          requestedTypeID,
          requestedGroupID
        );
        if (!matchedGroupJobID || childJobLocation.length > 0 || tempChildJob)
          return false;

        outputMap.set(requestedTypeID, matchedGroupJobID);
        return true;
      }
    });
    console.log(buildRequestArray);
    // if (buildRequestArray.length === 0) return;
    const newJobs = await buildJob(buildRequestArray);

    for (let newJob of newJobs) {
      const childLocation = newParentJobsToEdit_ChildJobs[newJob.itemID];
      if (!childLocation) {
        newParentJobsToEdit_ChildJobs[newJob.itemID] = {
          add: [newJob.jobID],
          remove: [],
        };
      } else {
        childLocation.add.push(newJob.jobID);
      }
      newTempChildJobs[newJob.itemID] = newJob;
    }

    groupJobsToLink.entries() || [].forEach(([typeID, jobID]) => {
      const childLocation = newParentJobsToEdit_ChildJobs[typeID];

      if (!childLocation) {
        newParentJobsToEdit_ChildJobs[typeID] = {
          add: [jobID],
          remove: [],
        };
      } else {
        childLocation.add.push(...jobIDArray);
      }
    });

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData(newJobs, evePrices, systemIndexData);

    recalculateInstallCostsWithNewData(
      newJobs,
      calculateInstallCostFromJob,
      requestedMarketData,
      requestedSystemIndexes
    );

    console.log(newTempChildJobs);
    updateTemporaryChildJobs(newTempChildJobs);
    updateParentChildToEdit((prev) => ({
      ...prev,
      childJobs: newParentJobsToEdit_ChildJobs,
    }));

    updateEvePrices((prev) => ({
      ...prev,
      ...requestedMarketData,
    }));
    updateSystemIndexData((prev) => ({ ...prev, ...requestedSystemIndexes }));
    setJobModified(true);
  }
}
