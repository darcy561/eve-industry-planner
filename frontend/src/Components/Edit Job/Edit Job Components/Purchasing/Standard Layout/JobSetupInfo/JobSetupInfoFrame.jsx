import { Box, Paper, Tooltip, Typography } from "@mui/material";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { jobTypes } from "../../../../../../Context/defaultValues";
import {
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../../../../../../Functions/Industry Facilities/getStructureInfo";
import { useSolarSystemName } from "../../../../../../Hooks/useSolarSystemNames";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";
import { rigSlotLabel } from "../../../../../../Functions/Industry Facilities/rigs";
import { settledSetup } from "../../../../../../Functions/Industry Facilities/placeConstraints";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import {
  setupHasOrphanedCustomStructure,
  setupShowsManualStructureFields,
} from "../../../../../../Functions/Custom Structures/customStructureSetup";
import MissingStructureNotice from "../../../../../../Styled Components/Item/missingStructureNotice";

const UNREADABLE = "Unknown";

export default function JobSetupInfoFrame() {
  const setups = useJobDraft((job) => job.build.setup);
  const setupCount = Object.values(setups).length;

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
        {Object.values(setups).map((setupEntry) => {
          return <JobSetupItem key={setupEntry.id} setupEntry={setupEntry} />;
        })}
      </Box>
    </ContentPanel>
  );
}

function JobSetupItem({ setupEntry }) {
  const itemsProducedPerRun = useJobDraft((job) => job.itemsProducedPerRun);
  const quantityProduced =
    itemsProducedPerRun * setupEntry.runCount * setupEntry.jobCount;

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

          {setupShowsManualStructureFields(setupEntry) ? (
            <UseDefaultStructures setupEntry={setupEntry} />
          ) : (
            <UseCustomStructure setupEntry={setupEntry} />
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
    setupEntry.customStructureID,
  );

  const systemIndexValue =
    findSystemIndexForJob(
      setupEntry.systemID,
      setupEntry.jobType,
      setupEntry.useAlternativeSystemIndexValue,
      setupEntry.alternativeSystemIndexValue,
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
          {assignedStructureData.name}
        </Typography>
      </Tooltip>
    </Box>
  );
}

function UseDefaultStructures({ setupEntry: chosen }) {
  const setupEntry = settledSetup(chosen);

  const structureWasDeleted = setupHasOrphanedCustomStructure(setupEntry);

  const structureTypeData = getStructureInfoFromID(
    setupEntry.jobType,
    setupEntry.structureID,
  );

  const rigLabel = rigSlotLabel(
    setupEntry.jobType,
    setupEntry.rigSlot1,
    setupEntry.rigSlot2,
  );

  const systemTypeData = getSystemTypeFromID(
    setupEntry.jobType,
    setupEntry.systemTypeID,
  );

  const matchedSystemID = useSolarSystemName(setupEntry.systemID);

  const systemIndexValue =
    findSystemIndexForJob(
      setupEntry.systemID,
      setupEntry.jobType,
      setupEntry.useAlternativeSystemIndexValue,
      setupEntry.alternativeSystemIndexValue,
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
      {structureWasDeleted && (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <MissingStructureNotice />
        </Box>
      )}
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
            {systemTypeData?.label ?? UNREADABLE}
          </Typography>
        </Box>
        <Box sx={{ flex: "1 1 calc(33.333% - 12px)", minWidth: 0 }}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {structureTypeData?.label ?? UNREADABLE}
          </Typography>
        </Box>
        <Box sx={{ flex: "1 1 calc(33.333% - 12px)", minWidth: 0 }}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {rigLabel}
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
