import { Box, Paper, Tooltip, Typography } from "@mui/material";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { jobTypes } from "../../../../../../Context/defaultValues";
import {
  getRigInfoFromID,
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../../../../../../Functions/Helper/getStructureInfo";
import getSystemNameFromID from "../../../../../../Functions/Helper/getSystemName";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";

export default function JobSetupInfoFrame(props) {
  const { state, actions } = props;
  const setupCount = Object.values(state.activeJob.build.setup).length;

  return (
    <ContentPanel
      paperSx={{
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "100%",
        "& .MuiGrid-container": {
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 2,
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          maxWidth: "100%",
          overflowX: {
            xs: "auto",
            sm: setupCount > 5 ? "auto" : "visible",
          },
          paddingY: 1,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {Object.values(state.activeJob.build.setup).map((setupEntry) => {
          return (
            <JobSetupItem
              key={setupEntry.id}
              setupEntry={setupEntry}
              state={state}
              actions={actions}
            />
          );
        })}
      </Box>
    </ContentPanel>
  );
}

function JobSetupItem({ setupEntry, state, actions }) {
  const quantityProduced =
    state.activeJob.itemsProducedPerRun *
    setupEntry.runCount *
    setupEntry.jobCount;

  return (
    <Box
      sx={{
        flex: "0 0 auto",
        flexShrink: 0,
        width: {
          xs: "220px",
          sm: "250px",
          md: "280px",
          lg: "400px",
        },
        height: "100%",
      }}
    >
      <Paper
        elevation={3}
        square
        sx={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          padding: 2,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            {jobTypes.manufacturing === setupEntry.jobType && (
              <>
                <Box sx={{ flex: "1 1 calc(25% - 12px)", minWidth: 0 }}>
                  <Typography
                    sx={{
                      typography: STANDARD_TEXT_FORMAT,
                    }}
                    align="center"
                  >
                    ME: {setupEntry.ME}
                  </Typography>
                </Box>
                <Box sx={{ flex: "1 1 calc(25% - 12px)", minWidth: 0 }}>
                  <Typography
                    sx={{
                      typography: STANDARD_TEXT_FORMAT,
                    }}
                    align="center"
                  >
                    TE: {setupEntry.TE * 2}
                  </Typography>
                </Box>
              </>
            )}
            <Box
              sx={{
                flex:
                  jobTypes.manufacturing === setupEntry.jobType
                    ? "1 1 calc(25% - 12px)"
                    : "1 1 calc(50% - 12px)",
                minWidth: 0,
              }}
            >
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="center"
              >
                Runs: {setupEntry.runCount}
              </Typography>
            </Box>
            <Box
              sx={{
                flex:
                  jobTypes.manufacturing === setupEntry.jobType
                    ? "1 1 calc(25% - 12px)"
                    : "1 1 calc(50% - 12px)",
                minWidth: 0,
              }}
            >
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="center"
              >
                Jobs: {setupEntry.jobCount}
              </Typography>
            </Box>
          </Box>

          {setupEntry.customStructureID !== "" ? (
            <UseCustomStructure setupEntry={setupEntry} />
          ) : (
            <UseDefaultStructures setupEntry={setupEntry} />
          )}

          <Box>
            <Typography
              align="center"
              sx={{
                typography: STANDARD_TEXT_FORMAT,
              }}
            >
              Quantity Planned:{" "}
              {formatNumberForLocale(quantityProduced, { max: 0 })}
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

function UseCustomStructure({ setupEntry }) {
  const { getCustomStructureWithID } =
    useUsersStore.getState().applicationSettings.actions;

  const assignedStructureData = getCustomStructureWithID(
    setupEntry.customStructureID
  );

  const systemIndexValue =
    findSystemIndexForJob(
      setupEntry.systemID,
      setupEntry.jobType,
      setupEntry.useAlternativeSystemIndexValue,
      setupEntry.alternativeSystemIndexValue
    ) * 100;

  return (
    <Box>
      <Tooltip
        title={`System Index: ${systemIndexValue}%`}
        arrow
        placement="bottom"
      >
        <Typography
          align="center"
          sx={{
            typography: STANDARD_TEXT_FORMAT,
          }}
        >
          {assignedStructureData
            ? assignedStructureData.name
            : "Missing Structure"}
        </Typography>
      </Tooltip>
    </Box>
  );
}

function UseDefaultStructures({ setupEntry }) {
  const structureTypeData = getStructureInfoFromID(
    setupEntry.jobType,
    setupEntry.structureID
  );

  const rigTypeData = getRigInfoFromID(setupEntry.jobType, setupEntry.rigID);

  const systemTypeData = getSystemTypeFromID(
    setupEntry.jobType,
    setupEntry.systemTypeID
  );

  const matchedSystemID = getSystemNameFromID(setupEntry.systemID);

  const systemIndexValue =
    findSystemIndexForJob(
      setupEntry.systemID,
      setupEntry.jobType,
      setupEntry.useAlternativeSystemIndexValue,
      setupEntry.alternativeSystemIndexValue
    ) * 100;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        flex: "1 1 auto",
        justifyContent: "space-between",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box sx={{ flex: "1 1 calc(33.333% - 12px)", minWidth: 0 }}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {systemTypeData.label}
          </Typography>
        </Box>
        <Box sx={{ flex: "1 1 calc(33.333% - 12px)", minWidth: 0 }}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {structureTypeData.label}
          </Typography>
        </Box>
        <Box sx={{ flex: "1 1 calc(33.333% - 12px)", minWidth: 0 }}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {rigTypeData.label}
          </Typography>
        </Box>
      </Box>
      <Tooltip
        title={`System Index Value: ${systemIndexValue}%`}
        arrow
        placement="bottom"
      >
        <Box>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {matchedSystemID}
          </Typography>
        </Box>
      </Tooltip>
    </Box>
  );
}
