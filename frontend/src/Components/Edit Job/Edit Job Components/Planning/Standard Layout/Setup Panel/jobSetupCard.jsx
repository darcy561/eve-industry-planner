import {
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Tooltip,
  Typography,
} from "@mui/material";
import { setJobLayout } from "../../../../Edit Job Hooks/jobCommands";
import {
  jobTypeMapping,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import { jobTypes } from "../../../../../../Context/defaultValues";
import {
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../../../../../../Functions/Custom Structures/getStructureInfo";
import { useSolarSystemName } from "../../../../../../Hooks/useSolarSystemNames";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";
import { calculateInstallCostfromSetup } from "../../../../../../Functions/Installation Costs/installCosts";
import { rigSlotLabel } from "../../../../../../Functions/Custom Structures/rigs";
import {
  setupHasOrphanedCustomStructure,
  setupShowsManualStructureFields,
} from "../../../../../../Functions/Custom Structures/customStructureSetup";
import MissingStructureNotice from "../../../../../../Styled Components/Item/missingStructureNotice";

const UNREADABLE = "Unknown";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

export function JobSetupCard({ setupEntry }) {
  const setupToEdit = useJobDraft((job) => job.layout.setupToEdit);
  const actions = useJobActions();
  const installCostPerJob = calculateInstallCostfromSetup(setupEntry);
  const assignedCharacterName =
    useUsersStore
      .getState()
      .account.actions.findCharacterByHash(setupEntry.selectedCharacter)
      ?.CharacterName || "No Matching Character Found";

  return (
    <Grid
      container
      size={{
        xs: 6,
        sm: 4,
      }}
    >
      <Card elevation={3} square sx={{ minWidth: "100%" }}>
        <CardActionArea
          onClick={() => {
            actions.run(setJobLayout({ setupToEdit: setupEntry.id }));
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
                size={jobTypes.manufacturing === setupEntry.jobType ? 3 : 6}
              >
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Runs: {setupEntry.runCount}
                </Typography>
              </Grid>
              <Grid
                align="center"
                size={jobTypes.manufacturing === setupEntry.jobType ? 3 : 6}
              >
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
              {setupShowsManualStructureFields(setupEntry) ? (
                <UseDefaultStructures setupEntry={setupEntry} />
              ) : (
                <UseCustomStructure setupEntry={setupEntry} />
              )}

              <Tooltip
                title={`Install Cost Per Job: ${formatNumberForLocale(
                  installCostPerJob,
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
                      installCostPerJob * setupEntry.jobCount,
                    )}
                  </Typography>
                </Grid>
              </Tooltip>
            </Grid>
            <Grid
              sx={{
                height: "1px",
                backgroundColor: (theme) =>
                  setupEntry.id === setupToEdit
                    ? theme.palette[jobTypeMapping[setupEntry.jobType]].main
                    : null,
              }}
              size={12}
            />
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
          {assignedStructureData.name}
        </Typography>
      </Tooltip>
    </Grid>
  );
}

function UseDefaultStructures({ setupEntry }) {
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
    <Grid container size={12}>
      {structureWasDeleted && (
        <Grid size={12} sx={{ display: "flex", justifyContent: "center" }}>
          <MissingStructureNotice />
        </Grid>
      )}
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {systemTypeData?.label ?? UNREADABLE}
        </Typography>
      </Grid>
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {structureTypeData?.label ?? UNREADABLE}
        </Typography>
      </Grid>
      <Grid size={4}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {rigLabel}
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
