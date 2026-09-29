import { Box, CircularProgress, Stack } from "@mui/material";
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
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import applySetupChange from "../../../../../../Functions/JobPlanner/applySetupChange";
import { setupShowsManualStructureFields } from "../../../../../../Functions/Custom Structures/customStructureSetup";
import { useSelectedSetup } from "../../../../Edit Job Hooks/useSelectedSetup";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

const fieldSx = { flex: "1 1 240px", minWidth: 0 };
const wideFieldSx = { flex: "1 1 100%", minWidth: 0 };

export function EditJobSetup() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  const getCustomStructureWithID =
    useUsersStore.getState().applicationSettings.actions
      .getCustomStructureWithID;
  const selectedSetup = useSelectedSetup();
  const jobType = useJobDraft((job) => job.jobType);
  const actions = useJobActions();

  if (!selectedSetup) return null;

  return (
    <ContentPanel paperSx={{ height: "auto" }}>
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", gap: 2, width: "100%" }}
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

        <ManualStructureSelection selectedSetup={selectedSetup} />

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

        {isLoggedIn && (
          <>
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
          </>
        )}

        <MilitiaSelection selectedSetup={selectedSetup} />
      </Stack>
    </ContentPanel>
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

  if (!setupShowsManualStructureFields(selectedSetup)) {
    return null;
  }

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
      <Box sx={{ ...fieldSx, textAlign: "center" }}>
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={settled.systemID}
            jobType={jobType}
            updateSelectedValue={async (value) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              await choose("systemID", "choose a system", (setup, chosen) =>
                setup.updateSystemID(Number(chosen)),
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
