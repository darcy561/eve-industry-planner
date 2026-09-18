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
import recalculateJobFromSetup from "../../../../../../Functions/JobPlanner/recalculateJobFromSetup";
import { setupShowsManualStructureFields } from "../../../../../../Functions/Helper/customStructureSetup";

export function EditJobSetup(props) {
  const { state, actions } = props;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  const getCustomStructureWithID =
    useUsersStore.getState().applicationSettings.actions
      .getCustomStructureWithID;
  const selectedSetup = state.activeJob.selectedSetup;

  if (!selectedSetup) return null;

  return (
    <ContentPanel paperSx={{ height: "auto" }}>
      <Grid container sx={{ flexDirection: "column" }}>
        <Grid container spacing={2} sx={{ flexDirection: "row" }}>
          <Grid size={6}>
            <BlueprintRunsTextField
              initialState={selectedSetup.runCount}
              onChange={async (value) => {
                selectedSetup.updateRunCount(value);
                await recalculateJobFromSetup(selectedSetup, state, actions);
              }}
            />
          </Grid>
          <Grid size={6}>
            <JobSlotsTextField
              initialState={selectedSetup.jobCount}
              onChange={async (value) => {
                selectedSetup.updateJobCount(value);
                await recalculateJobFromSetup(selectedSetup, state, actions);
              }}
            />
          </Grid>
          {state.activeJob.jobType === jobTypes.manufacturing && (
            <>
              <Grid size={6}>
                <MaterialEfficiencySelect
                  value={selectedSetup.ME}
                  onChange={async (value) => {
                    selectedSetup.updateMEValue(value);
                    await recalculateJobFromSetup(
                      selectedSetup,
                      state,
                      actions,
                    );
                  }}
                />
              </Grid>
              <Grid size={6}>
                <TimeEfficiencySelect
                  value={selectedSetup.TE}
                  onChange={async (value) => {
                    selectedSetup.updateTEValue(value);
                    await recalculateJobFromSetup(
                      selectedSetup,
                      state,
                      actions,
                    );
                  }}
                />
              </Grid>
            </>
          )}

          <ManualStructureSelection {...props} selectedSetup={selectedSetup} />
          <Grid container size={12}>
            <Grid size={6}>
              <UseAlternativeCheckbox
                initialState={Boolean(
                  selectedSetup.useAlternativeSystemIndexValue,
                )}
                onChange={async (value) => {
                  selectedSetup.updateUseAlternativeSystemIndexValue(value);
                  if (!value) {
                    selectedSetup.updateAlternativeSystemIndexValue(null);
                  }
                  await recalculateJobFromSetup(selectedSetup, state, actions);
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
                  selectedSetup.updateAlternativeSystemIndexValue(value);
                  await recalculateJobFromSetup(selectedSetup, state, actions);
                }}
              />
            </Grid>
          </Grid>

          {isLoggedIn && (
            <>
              <Grid size={12}>
                <CustomStructureSelect
                  value={selectedSetup.customStructureID}
                  jobType={state.activeJob.jobType}
                  onChange={async (value) => {
                    selectedSetup.updateCustomStructureID(
                      value,
                      getCustomStructureWithID,
                    );

                    await recalculateJobFromSetup(
                      selectedSetup,
                      state,
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
                    selectedSetup.updateSelectedCharacter(value);
                    await recalculateJobFromSetup(
                      selectedSetup,
                      state,
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

function ManualStructureSelection({ state, actions, selectedSetup }) {
  const [fetchSystemDataTrigger, updateFetchSystemDataTrigger] =
    useState(false);

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
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            selectedSetup.updateStructureID(selectedEntry);
            await recalculateJobFromSetup(selectedSetup, state, actions);
          }}
        />
      </Grid>
      <Grid size={6}>
        <RigTypeSelect
          value={selectedSetup.rigID}
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            selectedSetup.updateRigID(selectedEntry);
            await recalculateJobFromSetup(selectedSetup, state, actions);
          }}
        />
      </Grid>
      <Grid size={6}>
        <SystemTypeSelect
          value={selectedSetup.systemTypeID}
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            selectedSetup.updateSystemType(selectedEntry);
            await recalculateJobFromSetup(selectedSetup, state, actions);
          }}
        />
      </Grid>
      <Grid align="center" size={6}>
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={selectedSetup.systemID}
            jobType={state.activeJob.jobType}
            updateSelectedValue={async (value) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              selectedSetup.updateSystemID(Number(value));
              await recalculateJobFromSetup(selectedSetup, state, actions);
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
            selectedSetup.updateTaxValue(value);
            await recalculateJobFromSetup(selectedSetup, state, actions);
          }}
        />
      </Grid>
    </>
  );
}
