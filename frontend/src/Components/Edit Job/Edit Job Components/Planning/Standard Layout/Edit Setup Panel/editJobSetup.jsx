import { CircularProgress, Grid } from "@mui/material";
import { useState } from "react";
import { jobTypes } from "../../../../../../Context/defaultValues";
import VirtualisedSystemSearch from "../../../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import MaterialEfficiencySelect from "../../../../../../Styled Components/Select/materialEfficiency";
import TimeEfficiencySelect from "../../../../../../Styled Components/Select/timeEfficiency";
import StructureTypeSelect from "../../../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../../../Styled Components/Select/systemType";
import BlueprintRunsTextField from "../../../../../../Styled Components/Textfield/blueprintRuns";
import JobSlotsTextField from "../../../../../../Styled Components/Textfield/jobSlots";
import AssignUsersSelect from "../../../../../../Styled Components/Select/users";
import CustomStructureSelect from "../../../../../../Styled Components/Select/customStructure";
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
      <Grid container sx={{ flexDirection: "column" }}>
        <Grid container spacing={2} sx={{ flexDirection: "row" }}>
          <Grid size={6}>
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
          </Grid>
          <Grid size={6}>
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
          </Grid>
          {jobType === jobTypes.manufacturing && (
            <>
              <Grid size={6}>
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
              </Grid>
              <Grid size={6}>
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
              </Grid>
            </>
          )}

          <ManualStructureSelection selectedSetup={selectedSetup} />
          <Grid container size={12}>
            <Grid size={6}>
              <UseAlternativeCheckbox
                initialState={Boolean(
                  selectedSetup.useAlternativeSystemIndexValue,
                )}
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
            </Grid>
            <Grid size={6}>
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
            </Grid>
          </Grid>

          {isLoggedIn && (
            <>
              <Grid size={12}>
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
              </Grid>
              <Grid
                size={{
                  xs: 12,
                  xl: 8,
                }}
              >
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
              </Grid>
            </>
          )}
        </Grid>
      </Grid>
    </ContentPanel>
  );
}

function ManualStructureSelection({ selectedSetup }) {
  const [fetchSystemDataTrigger, updateFetchSystemDataTrigger] =
    useState(false);
  const jobType = useJobDraft((job) => job.jobType);
  const actions = useJobActions();

  const getCustomStructureWithID =
    useUsersStore.getState().applicationSettings.actions
      .getCustomStructureWithID;

  if (
    !setupShowsManualStructureFields(selectedSetup, getCustomStructureWithID)
  ) {
    return null;
  }

  return (
    <>
      <Grid size={6}>
        <StructureTypeSelect
          value={selectedSetup.structureID}
          jobType={jobType}
          onChange={async (selectedEntry) => {
            await applySetupChange(
              selectedSetup,
              "choose a structure",
              (setup) => setup.updateStructureID(selectedEntry),
              actions,
            );
          }}
        />
      </Grid>
      <Grid size={6}>
        <RigTypeSelect
          value={selectedSetup.rigSlot1}
          jobType={jobType}
          onChange={async (selectedEntry) => {
            await applySetupChange(
              selectedSetup,
              "choose a rig",
              (setup) => setup.updateRigID(selectedEntry),
              actions,
            );
          }}
        />
      </Grid>
      <Grid size={6}>
        <SystemTypeSelect
          value={selectedSetup.systemTypeID}
          jobType={jobType}
          onChange={async (selectedEntry) => {
            await applySetupChange(
              selectedSetup,
              "choose a system type",
              (setup) => setup.updateSystemType(selectedEntry),
              actions,
            );
          }}
        />
      </Grid>
      <Grid align="center" size={6}>
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={selectedSetup.systemID}
            jobType={jobType}
            updateSelectedValue={async (value) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              await applySetupChange(
                selectedSetup,
                "choose a system",
                (setup) => setup.updateSystemID(Number(value)),
                actions,
              );
              updateFetchSystemDataTrigger((prev) => !prev);
            }}
          />
        ) : (
          <CircularProgress xs={26} />
        )}
      </Grid>
      <Grid size={6}>
        <TaxPercentageTextField
          initialState={selectedSetup.taxValue}
          onBlur={async (value) => {
            await applySetupChange(
              selectedSetup,
              "set the facility tax",
              (setup) => setup.updateTaxValue(value),
              actions,
            );
          }}
        />
      </Grid>
    </>
  );
}
