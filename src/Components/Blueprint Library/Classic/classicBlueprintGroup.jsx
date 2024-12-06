import { useContext, useState } from "react";
import {
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import blueprintIDs from "../../../RawData/searchIndex.json";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { BlueprintEntry } from "./classicBlueprintEntry";
import { ApiJobsContext, JobArrayContext } from "../../../Context/JobContext";
import AddIcon from "@mui/icons-material/Add";
import { ArchiveBpData } from "../blueprintArchiveData";
import { useJobBuild } from "../../../Hooks/useJobBuild";
import {
  EvePricesContext,
  SystemIndexContext,
} from "../../../Context/EveDataContext";
import { UserJobSnapshotContext } from "../../../Context/AuthContext";
import { getAnalytics, logEvent } from "firebase/analytics";
import { trace } from "@firebase/performance";
import { performance } from "../../../firebase";
import { useHelperFunction } from "../../../Hooks/GeneralHooks/useHelperFunctions";
import JobSnapshot from "../../../Classes/jobSnapshotConstructor";
import addNewJobToFirebase from "../../../Functions/Firebase/addNewJob";
import uploadJobSnapshotsToFirebase from "../../../Functions/Firebase/uploadJobSnapshots";
import getMissingESIData from "../../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import { useInstallCostsCalc } from "../../../Hooks/GeneralHooks/useInstallCostCalc";

export function ClassicBlueprintGroup({ bpID, blueprintResults }) {
  const { apiJobs } = useContext(ApiJobsContext);
  const { jobArray, updateJobArray } = useContext(JobArrayContext);
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { userJobSnapshot, updateUserJobSnapshot } = useContext(
    UserJobSnapshotContext
  );
  const [archiveOpen, updateArchiveOpen] = useState(false);
  const [loadingBuild, updateLoadingBuild] = useState(false);
  const { buildJob, checkAllowBuild } = useJobBuild();
  const { findParentUser, sendSnackbarNotificationSuccess } =
    useHelperFunction();
  const { calculateInstallCostFromJob } = useInstallCostsCalc();
  const analytics = getAnalytics();
  const t = trace(performance, "CreateJobProcessFull");

  const parentUser = findParentUser();

  const esiJobs = apiJobs.filter(
    (i) => i.product_type_id === bpID || i.blueprint_type_id === bpID
  );

  let bpData = blueprintIDs.find((i) => i.blueprintID === bpID);
  let output = blueprintResults.blueprints.filter((bp) => bp.type_id === bpID);

  if (!bpData) {
    return null;
  }
  return (
    <Grid key={bpID} container item xs={12} sm={6}>
      <Paper
        square={true}
        elevation={2}
        sx={{ width: "100%", padding: "20px" }}
      >
        <Grid
          container
          item
          xs={12}
          sx={{
            paddingBottom: "10px",
          }}
        >
          <Grid item xs={9} sx={{ marginBottom: "20px" }}>
            <Typography
              color="primary"
              sx={{ typography: { xs: "h6", sm: "h5" } }}
            >
              {bpData.name}
            </Typography>
          </Grid>
          <Grid item xs={3} align="right">
            {!loadingBuild ? (
              <Tooltip title="Create Job On Planner" arrow placement="bottom">
                <IconButton
                  color="primary"
                  size="small"
                  onClick={async () => {
                    t.start();
                    updateLoadingBuild((prev) => !prev);
                    if (!checkAllowBuild) {
                      updateLoadingBuild((prev) => !prev);
                      return;
                    }
                    const newJobArray = [...jobArray];
                    const newSnapshotArray = [...newSnapshotArray];

                    const newJob = await buildJob({ itemID: bpData.itemID });
                    if (!newJob) {
                      updateLoadingBuild((prev) => !prev);
                      return;
                    }

                    newJobArray.push(newJob);
                    newSnapshotArray.push(new JobSnapshot(newJob));

                    await addNewJobToFirebase(newJob);
                    await uploadJobSnapshotsToFirebase(newSnapshotArray);

                    logEvent(analytics, "New Job", {
                      loggedIn: true,
                      UID: parentUser.accountID,
                      name: newJob.name,
                      itemID: newJob.itemID,
                    });

                    const { requestedMarketData, requestedSystemIndexes } =
                      await getMissingESIData(
                        newJob,
                        evePrices,
                        systemIndexData
                      );
                    recalculateInstallCostsWithNewData(
                      newJob,
                      calculateInstallCostFromJob,
                      requestedMarketData,
                      requestedSystemIndexes
                    );

                    updateEvePrices((prev) => ({
                      ...prev,
                      ...requestedMarketData,
                    }));
                    updateSystemIndexData((prev) => ({
                      ...prev,
                      ...requestedSystemIndexes,
                    }));
                    updateUserJobSnapshot(newSnapshotArray);
                    updateJobArray(newJobArray);
                    sendSnackbarNotificationSuccess(`${newJob.name} Added`, 3);

                    updateLoadingBuild((prev) => !prev);
                    t.stop();
                  }}
                >
                  <AddIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <CircularProgress color="primary" size={14} />
            )}
            <Tooltip title="Archived Job Data" arrow placement="bottom">
              <IconButton
                color="primary"
                size="small"
                onClick={() => {
                  updateArchiveOpen((prev) => !prev);
                }}
              >
                <AssessmentOutlinedIcon />
              </IconButton>
            </Tooltip>
            <ArchiveBpData
              archiveOpen={archiveOpen}
              updateArchiveOpen={updateArchiveOpen}
              bpData={bpData}
            />
          </Grid>

          {output.length > 0 ? (
            output.map((blueprint) => {
              return (
                <BlueprintEntry
                  key={blueprint.item_id}
                  blueprint={blueprint}
                  esiJobs={esiJobs}
                  bpData={bpData}
                />
              );
            })
          ) : (
            <Grid item xs={12}>
              <Typography
                align="center"
                sx={{ typography: { xs: "caption", sm: "body2" } }}
              >
                {" "}
                No Blueprints Owned
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>
    </Grid>
  );
}
