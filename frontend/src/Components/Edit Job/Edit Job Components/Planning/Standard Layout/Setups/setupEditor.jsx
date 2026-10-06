import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import {
  jobTypes,
  structureTypeMap,
  systemTypeMap,
} from "../../../../../../Context/defaultValues";
import { getStructureInfoFromID } from "../../../../../../Functions/Industry Facilities/getStructureInfo";
import {
  allowedOptionsFor,
  fieldsReleasedBy,
  forcedFieldsFor,
  offerableOptions,
  settledSetup,
} from "../../../../../../Functions/Industry Facilities/placeConstraints";
import {
  militiasThatMatterFor,
  systemTakesAnUpgradeLevel,
} from "../../../../../../Functions/Industry Facilities/enlistedFaction";
import { getRigInfoFromID } from "../../../../../../Functions/Industry Facilities/rigs";
import VirtualisedSystemSearch from "../../../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import MaterialEfficiencySelect from "../../../../../../Styled Components/Select/materialEfficiency";
import TimeEfficiencySelect from "../../../../../../Styled Components/Select/timeEfficiency";
import StructureTypeSelect from "../../../../../../Styled Components/Select/structureType";
import VirtualisedRigSearch from "../../../../../../Styled Components/autocomplete/virtualisedRigSearch";
import { useIndustryBonuses } from "../../../../../../Hooks/Static/useIndustryBonuses";
import useRigSlots from "../../../../../../Hooks/useRigSlots";
import SystemTypeSelect from "../../../../../../Styled Components/Select/systemType";
import BlueprintRunsTextField from "../../../../../../Styled Components/Textfield/blueprintRuns";
import JobSlotsTextField from "../../../../../../Styled Components/Textfield/jobSlots";
import AssignUsersSelect from "../../../../../../Styled Components/Select/users";
import CustomStructureSelect from "../../../../../../Styled Components/Select/customStructure";
import EnlistedMilitiaSelect from "../../../../../../Styled Components/Select/enlistedMilitia";
import MilitiaUpgradeLevelSelect from "../../../../../../Styled Components/Select/militiaUpgradeLevel";
import TaxPercentageTextField from "../../../../../../Styled Components/Textfield/tax";
import useUsersStore from "../../../../../../Zustand/usersStore";
import SystemIndexTextField from "../../../../../../Styled Components/Textfield/systemIndex";
import UseAlternativeCheckbox from "../../../../../../Styled Components/Checkbox/useAlternativeCheckbox";
import {
  BandCaption,
  FigureRow,
} from "../../../../../../Styled Components/Typography/figures";
import { facilityOf } from "../../../../../../Functions/Industry Facilities/setupFacility";
import { useFacilityWords } from "./useFacilityWords";
import { useQueryClient } from "@tanstack/react-query";
import { useSolarSystemName } from "../../../../../../Hooks/useSolarSystems";
import calculateTimeForSetup from "../../../../../../Functions/Blueprint Calculations/calculateTimeForSetup";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";
import {
  formatPercentage,
  formatQuantity,
  formatTimeDuration,
} from "../../../../../../Functions/Helper/numberParser";
import applySetupChange from "../../../../../../Functions/Job/setups/applySetupChange";
import { setupShowsManualStructureFields } from "../../../../../../Functions/Custom Structures/customStructureSetup";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

const fieldSx = { flex: "1 1 240px", minWidth: 0 };
const wideFieldSx = { flex: "1 1 100%", minWidth: 0 };

function Group({ caption, children, note }) {
  return (
    <Stack spacing={1.5}>
      <BandCaption>{caption}</BandCaption>
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", gap: 2, width: "100%" }}
      >
        {children}
      </Stack>
      {note ? (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Stack>
  );
}

function SavedStructureFacts({ setup }) {
  const words = useFacilityWords(facilityOf(setup), setup.jobType);
  return (
    <Box sx={wideFieldSx}>
      <FigureRow label="Size" value={words.size} />
      <FigureRow label="Security" value={words.security} />
      <FigureRow label="Rigs" value={words.rigs} />
      <FigureRow label="Facility tax" value={words.tax} />
      <FigureRow label="System" value={words.system} />
    </Box>
  );
}

/**
 * The open setup's fields, grouped as how much it builds, where, and who builds it; each change is
 * saved as it is made.
 *
 * @param {object} props
 * @param {object} props.setup
 * @param {(() => void)|null} props.onDelete - Absent on the last setup
 */
export function SetupEditor({ setup: selectedSetup, onDelete }) {
  const queryClient = useQueryClient();
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const maxRuns = useJobDraft((job) => job.maxProductionLimit);
  const skills = useJobDraft((job) => job.skills);
  const itemID = useJobDraft((job) => job.itemID);
  const systemName = useSolarSystemName(selectedSetup.systemID);
  const slotTime = calculateTimeForSetup(
    selectedSetup,
    skills,
    queryClient,
    itemID,
  );
  const systemIndex = findSystemIndexForJob(
    selectedSetup.systemID,
    selectedSetup.jobType,
    false,
    null,
  );
  const reportedIndex = systemIndex
    ? formatPercentage(systemIndex, { places: 2 })
    : null;
  const getCustomStructureWithID =
    useUsersStore.getState().applicationSettings.actions
      .getCustomStructureWithID;
  const jobType = useJobDraft((job) => job.jobType);
  const actions = useJobActions();
  const manualFacility = setupShowsManualStructureFields(selectedSetup);

  return (
    <Stack spacing={2.5}>
      <Group
        caption="How much"
        note={
          maxRuns > 0
            ? `${formatQuantity(maxRuns)} runs is the most this blueprint takes in one slot.`
            : null
        }
      >
        <Box sx={fieldSx}>
          <BlueprintRunsTextField
            initialState={selectedSetup.runCount}
            onChange={async (value) => {
              await applySetupChange(
                selectedSetup,
                "set the runs",
                (setup) => setup.updateRunCount(value),
                actions,
              );
            }}
          />
        </Box>
        <Box sx={fieldSx}>
          <JobSlotsTextField
            initialState={selectedSetup.jobCount}
            onChange={async (value) => {
              await applySetupChange(
                selectedSetup,
                "set the job slots",
                (setup) => setup.updateJobCount(value),
                actions,
              );
            }}
          />
        </Box>
        {jobType === jobTypes.manufacturing && (
          <>
            <Box sx={fieldSx}>
              <MaterialEfficiencySelect
                value={selectedSetup.ME}
                onChange={async (value) => {
                  await applySetupChange(
                    selectedSetup,
                    "set the material efficiency",
                    (setup) => setup.updateMEValue(value),
                    actions,
                  );
                }}
              />
            </Box>
            <Box sx={fieldSx}>
              <TimeEfficiencySelect
                value={selectedSetup.TE}
                onChange={async (value) => {
                  await applySetupChange(
                    selectedSetup,
                    "set the time efficiency",
                    (setup) => setup.updateTEValue(value),
                    actions,
                  );
                }}
              />
            </Box>
          </>
        )}
      </Group>

      <Group
        caption="Where"
        note={
          manualFacility
            ? null
            : "A saved structure supplies the size, security, rigs and tax, so they are shown rather than asked."
        }
      >
        {isLoggedIn && (
          <Box sx={wideFieldSx}>
            <CustomStructureSelect
              value={selectedSetup.customStructureID}
              jobType={jobType}
              onChange={async (value) => {
                await applySetupChange(
                  selectedSetup,
                  "choose a structure",
                  (setup) =>
                    setup.updateCustomStructureID(
                      value,
                      getCustomStructureWithID,
                    ),
                  actions,
                );
              }}
            />
          </Box>
        )}
        {manualFacility ? (
          <ManualStructureSelection selectedSetup={selectedSetup} />
        ) : (
          <SavedStructureFacts setup={selectedSetup} />
        )}
        <MilitiaSelection selectedSetup={selectedSetup} />
        <Box sx={fieldSx}>
          <UseAlternativeCheckbox
            initialState={Boolean(selectedSetup.useAlternativeSystemIndexValue)}
            onChange={async (value) => {
              await applySetupChange(
                selectedSetup,
                "choose where the system index comes from",
                (setup) => {
                  setup.updateUseAlternativeSystemIndexValue(value);
                  if (!value) setup.updateAlternativeSystemIndexValue(null);
                },
                actions,
              );
            }}
          />
        </Box>
        <Box sx={fieldSx}>
          <SystemIndexTextField
            inputSystemID={selectedSetup.systemID}
            jobType={selectedSetup.jobType}
            useAlternativeSystemIndexValue={
              selectedSetup.useAlternativeSystemIndexValue
            }
            alternativeSystemIndexValue={
              selectedSetup.alternativeSystemIndexValue
            }
            onChange={async (value) => {
              await applySetupChange(
                selectedSetup,
                "set the system index",
                (setup) => setup.updateAlternativeSystemIndexValue(value),
                actions,
              );
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={wideFieldSx}>
          {selectedSetup.useAlternativeSystemIndexValue
            ? `On — ${formatPercentage(selectedSetup.alternativeSystemIndexValue, { places: 2 }) ?? "no figure yet"}, as you typed it. Clearing the box goes back to the figure for ${systemName}.`
            : `Off, the index for ${systemName} is used — ${reportedIndex ?? "not yet known"} right now. On, you type the figure the game shows you.`}
        </Typography>
      </Group>

      {isLoggedIn && (
        <Group
          caption="Who"
          note={`Their industry skills set ${
            slotTime
              ? `the ${formatTimeDuration(slotTime)} a slot takes`
              : "how long a slot takes"
          }; the install cost is the same whoever runs it.`}
        >
          <Box sx={wideFieldSx}>
            <AssignUsersSelect
              value={selectedSetup.selectedCharacter}
              onChange={async (value) => {
                await applySetupChange(
                  selectedSetup,
                  "choose who builds it",
                  (setup) => setup.updateSelectedCharacter(value),
                  actions,
                );
              }}
            />
          </Box>
        </Group>
      )}

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Changes save as you make them.
        </Typography>
        {onDelete ? (
          <Button size="small" color="error" onClick={onDelete}>
            Delete this setup
          </Button>
        ) : null}
      </Box>
    </Stack>
  );
}

function ManualStructureSelection({ selectedSetup }) {
  const [fetchSystemDataTrigger, updateFetchSystemDataTrigger] =
    useState(false);
  const jobType = useJobDraft((job) => job.jobType);
  const actions = useJobActions();

  const { catalogue } = useIndustryBonuses();

  const settled = settledSetup(selectedSetup);

  const rigSlots = useRigSlots(
    settled,
    async (slot, rigID) => {
      await applySetupChange(
        selectedSetup,
        "choose a rig",
        (setup) => setup.updateRigSlot(slot, getRigInfoFromID(jobType, rigID)),
        actions,
      );
    },
    jobType,
  );

  const offer = (field, table) =>
    allowedOptionsFor(selectedSetup, field, offerableOptions(table[jobType]));

  const fixed = forcedFieldsFor(selectedSetup);
  const isFixed = (field) => Object.hasOwn(fixed, field);

  const choose = (field, label, apply) => async (chosen, value) => {
    const released = fieldsReleasedBy(selectedSetup, field, value);
    await applySetupChange(
      selectedSetup,
      label,
      (setup) => {
        apply(setup, chosen);
        setup.releaseFields(released);
      },
      actions,
    );
  };

  const rigSize = getStructureInfoFromID(jobType, settled.structureID)?.rigSize;

  return (
    <>
      <Box sx={fieldSx}>
        <StructureTypeSelect
          value={settled.structureID}
          jobType={jobType}
          options={offer("structureID", structureTypeMap)}
          onChange={(selectedEntry) =>
            choose("structureID", "choose a structure", (setup, entry) =>
              setup.updateStructureID(entry),
            )(selectedEntry, selectedEntry?.id)
          }
        />
      </Box>
      <Box sx={fieldSx}>
        <SystemTypeSelect
          value={settled.systemTypeID}
          jobType={jobType}
          options={offer("systemTypeID", systemTypeMap)}
          onChange={(selectedEntry) =>
            choose("systemTypeID", "choose a system type", (setup, entry) =>
              setup.updateSystemType(entry),
            )(selectedEntry, selectedEntry?.id)
          }
        />
      </Box>
      <Box sx={fieldSx}>
        <VirtualisedRigSearch
          value={settled.rigSlot1}
          jobType={jobType}
          rigSize={rigSize}
          catalogue={catalogue}
          label="Rig 1"
          disabled={isFixed("rigSlot1")}
          error={rigSlots.slot1.error}
          onChange={rigSlots.slot1.onChange}
        />
      </Box>
      <Box sx={fieldSx}>
        <VirtualisedRigSearch
          value={settled.rigSlot2}
          jobType={jobType}
          rigSize={rigSize}
          catalogue={catalogue}
          label="Rig 2"
          disabled={isFixed("rigSlot2")}
          error={rigSlots.slot2.error}
          onChange={rigSlots.slot2.onChange}
        />
      </Box>
      <Box sx={{ ...fieldSx, textAlign: "center" }}>
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={settled.systemID}
            jobType={jobType}
            updateSelectedValue={async (value, band) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              await choose("systemID", "choose a system", (setup, chosen) =>
                setup.updateSystemID(Number(chosen), band),
              )(value, Number(value));
              updateFetchSystemDataTrigger((prev) => !prev);
            }}
          />
        ) : (
          <CircularProgress size={26} />
        )}
      </Box>
      <Box sx={fieldSx}>
        <TaxPercentageTextField
          initialState={settled.taxValue}
          disabled={isFixed("taxValue")}
          onBlur={async (value) => {
            await applySetupChange(
              selectedSetup,
              "set the facility tax",
              (setup) => setup.updateTaxValue(value),
              actions,
            );
          }}
        />
      </Box>
    </>
  );
}

function MilitiaSelection({ selectedSetup }) {
  const actions = useJobActions();

  const holdingFaction = useUsersStore(
    (state) =>
      state.worldData.systemIndexes?.[selectedSetup?.systemID]
        ?.militiaFactionID ?? 0,
  );

  const militias = useMemo(
    () => militiasThatMatterFor(selectedSetup, holdingFaction),
    [selectedSetup, holdingFaction],
  );

  if (militias.length === 0) return null;

  return (
    <>
      <Box sx={fieldSx}>
        <EnlistedMilitiaSelect
          value={selectedSetup.enlistedFaction}
          options={militias}
          onChange={async (value) => {
            await applySetupChange(
              selectedSetup,
              "choose the militia it is costed against",
              (setup) => setup.updateEnlistedFaction(value),
              actions,
            );
          }}
        />
      </Box>
      {systemTakesAnUpgradeLevel(selectedSetup) && (
        <Box sx={fieldSx}>
          <MilitiaUpgradeLevelSelect
            value={selectedSetup.militiaUpgradeLevel}
            onChange={async (value) => {
              await applySetupChange(
                selectedSetup,
                "set the system upgrade level",
                (setup) => setup.updateMilitiaUpgradeLevel(value),
                actions,
              );
            }}
          />
        </Box>
      )}
    </>
  );
}
