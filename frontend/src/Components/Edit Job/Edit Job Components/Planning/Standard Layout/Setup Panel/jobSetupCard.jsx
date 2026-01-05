import {
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  jobTypeMapping,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
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

export function JobSetupCard({ setupEntry, state, actions }) {
  const assignedCharacterName =
    useUsersStore
      .getState()
      .users.actions.findUserByCharacterHash(setupEntry.selectedCharacter)
      ?.CharacterName || "No Matching Character Found";

  return (
    <Grid
      container
      size={{
        xs: 6,
        sm: 4
      }}>
      <Card elevation={3} square sx={{ minWidth: "100%" }}>
        <CardActionArea
          onClick={() => {
            state.activeJob.layout.setupToEdit = setupEntry.id;
            actions.updateActiveJob(state.activeJob);
          }}
        >
          <CardContent>
            <Grid container size={12}>
              {jobTypes.manufacturing === setupEntry.jobType && (
                <>
                  <Grid size={3}>
                    <Typography
                      sx={{
                        typography: STANDARD_TEXT_FORMAT,
                      }}
                      align="center"
                    >
                      ME: {setupEntry.ME}
                    </Typography>
                  </Grid>
                  <Grid size={3}>
                    <Typography
                      sx={{
                        typography: STANDARD_TEXT_FORMAT,
                      }}
                      align="center"
                    >
                      TE: {setupEntry.TE * 2}
                    </Typography>
                  </Grid>
                </>
              )}
              <Grid
                align="center"
                size={jobTypes.manufacturing === setupEntry.jobType ? 3 : 6}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Runs: {setupEntry.runCount}
                </Typography>
              </Grid>
              <Grid
                align="center"
                size={jobTypes.manufacturing === setupEntry.jobType ? 3 : 6}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Jobs: {setupEntry.jobCount}
                </Typography>
              </Grid>
              <Grid size={12}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  {assignedCharacterName}
                </Typography>
              </Grid>
              {setupEntry.customStructureID ? (
                <UseCustomStructure setupEntry={setupEntry} />
              ) : (
                <UseDefaultStructures setupEntry={setupEntry} />
              )}

              <Tooltip
                title={`Install Cost Per Job: ${formatNumberForLocale(
                  setupEntry.estimatedInstallCost
                )}`}
                arrow
                placement="bottom"
              >
                <Grid size={12}>
                  <Typography
                    align="center"
                    sx={{
                      typography: STANDARD_TEXT_FORMAT,
                    }}
                  >
                    Est Total Install Costs:{" "}
                    {formatNumberForLocale(
                      setupEntry.estimatedInstallCost * setupEntry.jobCount
                    )}
                  </Typography>
                </Grid>
              </Tooltip>
            </Grid>
            <Grid
              sx={{
                height: "1px",
                backgroundColor: (theme) =>
                  setupEntry.id === state.activeJob.layout.setupToEdit
                    ? theme.palette[jobTypeMapping[setupEntry.jobType]].main
                    : null,
              }}
              size={12} />
          </CardContent>
        </CardActionArea>
      </Card>
    </Grid>
  );
}

function UseCustomStructure({ setupEntry }) {
  const { getCustomStructureWithID } =
    useUsersStore.getState().applicationSettings.actions;

  const assignedStructureData = getCustomStructureWithID(
    setupEntry.customStructureID
  );

  const systemIndexValue = findSystemIndexForJob(setupEntry.systemID, setupEntry.jobType, setupEntry.useAlternativeSystemIndexValue, setupEntry.alternativeSystemIndexValue) * 100;

  return (
    <Grid size={12}>
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
    </Grid>
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

  const systemIndexValue = findSystemIndexForJob(setupEntry.systemID, setupEntry.jobType, setupEntry.useAlternativeSystemIndexValue, setupEntry.alternativeSystemIndexValue) * 100;

  return (
    <Grid container size={12}>
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {systemTypeData.label}
        </Typography>
      </Grid>
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {structureTypeData.label}
        </Typography>
      </Grid>
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {rigTypeData.label}
        </Typography>
      </Grid>
      <Tooltip
        title={`System Index Value: ${systemIndexValue}%`}
        arrow
        placement="bottom"
      >
        <Grid size={12}>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {matchedSystemID}
          </Typography>
        </Grid>
      </Tooltip>
      <Grid size={12}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          Tax: {setupEntry.taxValue}%
        </Typography>
      </Grid>
    </Grid>
  );
}