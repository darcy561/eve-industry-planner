import { useState } from "react";
import {
  Box,
  Button,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import BottomSheet from "../../../../../../Styled Components/Dialogue/BottomSheet";
import { PanelFooterMeta } from "../../../../../../Styled Components/Typography/figures";
import MissingStructureNotice from "../../../../../../Styled Components/Item/missingStructureNotice";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import {
  countOf,
  numberWord,
  formatNumberForLocale,
  formatPercentage,
} from "../../../../../../Functions/Helper/numberParser";
import { sharedFacility } from "../../../../../../Functions/Industry Facilities/setupFacility";
import { sumSetupInstallCostEstimates } from "../../../../../../Functions/Installation Costs/installCosts";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
} from "../../../../../../Functions/Job/setups/setups";
import {
  attachNewSetupToJob,
  deleteSetup,
  setJobLayout,
} from "../../../../Edit Job Hooks/jobCommands";
import {
  quantityProduced,
  setupToBuildFrom,
} from "../../../../Edit Job Hooks/jobSelectors";
import {
  jobDraftNow,
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import SetupRow, { setupHeadline } from "./setupRow";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";
import { SetupEditor } from "./setupEditor";
import { useFacilityWords } from "./useFacilityWords";

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

function FacilityLine({ setups, shared }) {
  const jobType = useJobDraft((job) => job.jobType);
  const words = useFacilityWords(shared.facility, jobType);
  const index = findSystemIndexForJob(
    shared.facility.systemID,
    jobType,
    false,
    null,
  );

  const lead =
    setups.length === 1
      ? "Builds at"
      : shared.sharedBy === setups.length
        ? `All ${numberWord(setups.length)} build at`
        : `${capitalise(numberWord(shared.sharedBy))} of ${numberWord(setups.length)} build at`;

  return (
    <InsetSurface>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: 1.5,
          rowGap: 0.5,
        }}
      >
        <Typography variant="body2">
          {lead} <strong>{words.name}</strong>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {words.details.join(" · ")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          index {formatPercentage(index, { places: 2 })}
        </Typography>
      </Box>
      {shared.facility?.customStructureID && !words.saved ? (
        <MissingStructureNotice />
      ) : null}
    </InsetSurface>
  );
}

/**
 * The job's setups as rows, the facility they share said once above them, each opening its editor
 * in place.
 */
export function SetupsPanel() {
  const theme = useTheme();
  const asSheet = useMediaQuery(theme.breakpoints.down("sm"));
  const queryClient = useQueryClient();
  const actions = useJobActions();
  const setupMap = useJobDraft((job) => job.build.setup);
  const perRun = useJobDraft((job) => job.itemsProducedPerRun);
  const selectedID = useJobDraft((job) => job.layout.setupToEdit);
  const [editorFor, setEditorFor] = useState(null);

  const setups = Object.values(setupMap ?? {});
  const shared = sharedFacility(setups);
  const canDelete = setups.length > 1;

  function toggle(setup) {
    if (editorFor === setup.id) {
      setEditorFor(null);
      return;
    }
    if (setup.id !== selectedID) {
      actions.run(setJobLayout({ setupToEdit: setup.id }));
    }
    setEditorFor(setup.id);
  }

  function remove(setup) {
    if (editorFor === setup.id) setEditorFor(null);
    actions.run(deleteSetup(setup.id));
    showSnackbarSuccess("Setup deleted");
  }

  function addSetup() {
    const job = jobDraftNow();
    const setup = buildSetupFromQuantity(
      job,
      { runCount: 1, jobCount: 1 },
      queryClient,
      buildSetupContextForJob(job, queryClient),
      { basedOn: setupToBuildFrom(job) },
    );
    actions.run(attachNewSetupToJob(setup));
    setEditorFor(setup.id);
  }

  const editorOf = (setup) => (
    <SetupEditor
      key={setup.id}
      setup={setup}
      onDelete={canDelete ? () => remove(setup) : null}
    />
  );
  const sheetSetup = setupMap?.[editorFor];

  return (
    <AppShellPanel
      title="Setups"
      componentName="SetupsPanel"
      paperSx={{ height: "auto" }}
      action={
        <Button size="small" startIcon={<AddIcon />} onClick={addSetup}>
          Add setup
        </Button>
      }
    >
      <Stack spacing={1.5}>
        {shared.facility ? (
          <FacilityLine setups={setups} shared={shared} />
        ) : null}
        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            "& > :last-child": { borderBottom: 0 },
          }}
        >
          {setups.map((setup) => (
            <Box
              key={setup.id}
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <SetupRow
                setup={setup}
                selected={setup.id === selectedID}
                open={editorFor === setup.id}
                departsFrom={shared.departs(setup) ? shared.facility : null}
                onDelete={canDelete ? () => remove(setup) : null}
                onToggle={() => toggle(setup)}
                drawer={
                  asSheet ? undefined : (
                    <InsetSurface sx={{ borderRadius: 0, border: 0 }}>
                      {editorOf(setup)}
                    </InsetSurface>
                  )
                }
              />
            </Box>
          ))}
        </Box>
        <PanelFooterMeta
          value={`${countOf(quantityProduced(setupMap, perRun), "item")} · ${formatNumberForLocale(
            sumSetupInstallCostEstimates(setupMap),
            { max: 0 },
          )} install`}
        >
          {countOf(setups.length, "setup")}
        </PanelFooterMeta>
      </Stack>
      {asSheet ? (
        <BottomSheet
          open={Boolean(sheetSetup)}
          onClose={() => setEditorFor(null)}
          title={sheetSetup ? setupHeadline(sheetSetup) : null}
          contentProps={{ sx: { px: 2, pt: 1 } }}
        >
          {sheetSetup ? editorOf(sheetSetup) : null}
        </BottomSheet>
      ) : null}
    </AppShellPanel>
  );
}
