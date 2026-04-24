import { Avatar, Typography, Grid, Box } from "@mui/material";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { ChildJobDialogue } from "../Child Job Dialogue/childJobDialogue";
import { useState } from "react";
import { ChildJobsAvatar_Purchasing } from "./childJobsAvatar";
import { TotalCost_Purchasing } from "./totalMaterialCost";
import { MaterialCostsFrame_Purchasing } from "./materialCostsFrame";
import { AddMaterialCost_Purchasing } from "./addMaterialCosts";
import { MaterialCompleteBox_Purchasing } from "./materialCompleteBox";
import { AwaitingCostImportBox_Purchasing } from "./awaitingCostImportBox";
import getCurrentLinkedChildJobIDsForMaterial from "./functions/getCurrentLinkedChildJobIDsForMaterial.js";
import AssetsIconButton from "../../../../../../Styled Components/IconButton/assets";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { MaterialQuantityInfoSingleRow } from "./materialQuantityInfoSingleRow";
import { MaterialQuantityInfoDoubleRow } from "./materialQuantityInfoDoubleRow";

export function MaterialCardFrame_Purchasing(props) {
  const { state, material } = props;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { jobArray } = useUsersStore((state) => state.jobData);
  const [childDialogTrigger, updateChildDialogTrigger] = useState(false);

  function calculateChildJobData() {
    let childJobs = [];
    let childJobProductionTotal = 0;
    let remainingTotalToBeImported = 0;
    const childJobLocation = getCurrentLinkedChildJobIDsForMaterial(
      material.typeID,
      state.activeJob,
      state.temporaryChildJobs,
      state.parentChildToEdit
    );

    if (childJobLocation.length > 0) {
      function filterJobs(jobList) {
        return jobList.filter((job) => childJobLocation.includes(job.jobID));
      }

      if (!state.activeJob.includedInGroup) {
        childJobs = filterJobs(jobArray);
        childJobProductionTotal = childJobs.reduce(
          (total, job) => total + job.build.products.totalQuantity,
          0
        );
        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = material.purchasing.find(
            (i) => i.childID === job.jobID
          );

          if (!matchingCostImport) {
            return (total += job.build.products.totalQuantity);
          }
          return total;
        }, 0);
      } else {
        childJobs = filterJobs([
          ...jobArray,
          Object.entries(state.temporaryChildJobs),
        ]);
        childJobProductionTotal = childJobs.reduce((total, job) => {
          return (total += job.build.products.totalQuantity);
        }, 0);

        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = material.purchasing.find(
            (i) => i.childID === job.jobID
          );

          if (!matchingCostImport) {
            return (total += job.build.products.totalQuantity);
          }
          return total;
        }, 0);
      }
    }
    return {
      childJobs,
      childJobProductionTotal,
      childJobLocation,
      remainingTotalToBeImported,
    };
  }

  const {
    childJobs,
    childJobProductionTotal,
    childJobLocation,
    remainingTotalToBeImported,
  } = calculateChildJobData();

  return (
    <Grid
      size={{
        xs: 12,
        sm: 6,
        md: 4,
        lg: 3,
      }}
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <ContentPanel
        paperSx={{
          minHeight: { xs: 180, sm: 200, md: 240 },
          width: "100%",
          maxWidth: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          "& .MuiGrid-container": {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            flex: 1,
            minHeight: 0,
          },
          "& .MuiGrid-item": {
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: "5px" },
            marginBottom: { xs: 0.75, sm: 0.5 },
            width: "100%",
            maxWidth: "100%",
            flexWrap: { xs: "wrap", sm: "nowrap" },
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Avatar
              src={`https://images.evetech.net/types/${material.typeID}/icon?size=32`}
              alt={material.name}
              variant="square"
              sx={{
                height: { xs: 24, sm: 32 },
                width: { xs: 24, sm: 32 },
              }}
            />
          </Box>
          <Box
            sx={{
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <MaterialPopoverIconButtons typeID={material.typeID}>
              <Typography
                sx={{
                  typography: { xs: "body2", sm: "body1" },
                  whiteSpace: { xs: "normal", sm: "nowrap" },
                  overflow: "hidden",
                  textOverflow: { xs: "clip", sm: "ellipsis" },
                  lineHeight: { xs: 1.3, sm: 1.5 },
                  wordBreak: { xs: "break-word", sm: "normal" },
                }}
              >
                {material.name}
              </Typography>
            </MaterialPopoverIconButtons>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexShrink: 0,
            }}
          >
            {isLoggedIn && (
              <AssetsIconButton
                iconButtonStyle={{}}
                materialTypeID={material.typeID}
              />
            )}
            <ChildJobsAvatar_Purchasing
              {...props}
              updateChildDialogTrigger={updateChildDialogTrigger}
              childJobs={childJobs}
            />
          </Box>
        </Box>
        <Box
          sx={{
            marginBottom: { xs: 0.75, sm: 0.5 },
            width: "100%",
            maxWidth: "100%",
            paddingLeft: { xs: "32px", sm: "40px" },
            minWidth: 0,
          }}
        >
          {childJobLocation.length > 0 ? (
            <MaterialQuantityInfoDoubleRow
              material={material}
              childJobProductionTotal={childJobProductionTotal}
              remainingTotalToBeImported={remainingTotalToBeImported}
            />
          ) : (
            <MaterialQuantityInfoSingleRow
              material={material}
              remainingTotalToBeImported={remainingTotalToBeImported}
            />
          )}
          <TotalCost_Purchasing material={material} />
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: material.purchasing.length > 2 ? "auto" : "hidden",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                minHeight:
                  material.purchasing.length === 0 ? 0 : { xs: 80, sm: 80 },
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <MaterialCostsFrame_Purchasing {...props} />
            </Box>
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <AwaitingCostImportBox_Purchasing
              {...props}
              childJobs={childJobs}
              childJobProductionTotal={childJobProductionTotal}
            />
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <MaterialCompleteBox_Purchasing
              material={material}
              childJobs={childJobs}
              childJobProductionTotal={childJobProductionTotal}
              remainingTotalToBeImported={remainingTotalToBeImported}
            />
          </Box>
          <Box sx={{ flexShrink: 0, marginTop: "auto" }}>
            <AddMaterialCost_Purchasing
              {...props}
              childJobProductionTotal={childJobProductionTotal}
              childJobs={childJobs}
            />
          </Box>
        </Box>
        <ChildJobDialogue
          {...props}
          childDialogTrigger={childDialogTrigger}
          updateChildDialogTrigger={updateChildDialogTrigger}
        />
      </ContentPanel>
    </Grid>
  );
}
