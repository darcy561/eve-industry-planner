import { CircularProgress, Grid } from "@mui/material";
import { useState } from "react";
import { jobTypes } from "../../../../../../Context/defaultValues";
import { useUpdateSetupValue } from "../../../../../../Hooks/JobHooks/useUpdateSetupValue";
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

export function EditJobSetup(props) {
  const { state, actions } = props;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  const getCustomStructureWithID =
    useUsersStore.getState().applicationSettings.actions
      .getCustomStructureWithID;
  const { recalcuateJobFromSetup } = useUpdateSetupValue();
  const setupToEdit = state.activeJob.layout.setupToEdit;

  if (!state.activeJob.build.setup[setupToEdit]) return null;

  let buildObject = state.activeJob.build.setup[setupToEdit];

  return (
    <ContentPanel paperSx={{ height: "auto" }}>
      <Grid container sx={{ flexDirection: "column" }}>
        <Grid container spacing={2} sx={{ flexDirection: "row" }}>
          <Grid size={6}>
            <BlueprintRunsTextField
              initialState={buildObject.runCount}
              onChange={async (value) => {
                buildObject.updateRunCount(value);
                await recalcuateJobFromSetup(buildObject, state, actions);
              }}
            />
          </Grid>
          <Grid size={6}>
            <JobSlotsTextField
              initialState={buildObject.jobCount}
              onChange={async (value) => {
                buildObject.updateJobCount(value);
                await recalcuateJobFromSetup(buildObject, state, actions);
              }}
            />
          </Grid>
          {state.activeJob.jobType === jobTypes.manufacturing && (
            <>
              <Grid size={6}>
                <MaterialEfficiencySelect
                  value={state.activeJob.build.setup[setupToEdit].ME}
                  onChange={async (value) => {
                    buildObject.updateMEValue(value);
                    await recalcuateJobFromSetup(buildObject, state, actions);
                  }}
                />
              </Grid>
              <Grid size={6}>
                <TimeEfficiencySelect
                  value={state.activeJob.build.setup[setupToEdit].TE}
                  onChange={async (value) => {
                    buildObject.updateTEValue(value);
                    await recalcuateJobFromSetup(buildObject, state, actions);
                  }}
                />
              </Grid>
            </>
          )}

          <ManualStructureSelection
            {...props}
            setupToEdit={setupToEdit}
            buildObject={buildObject}
          />
          <Grid container size={12}>
            <Grid size={6}>
              <UseAlternativeCheckbox
                initialState={Boolean(
                  buildObject.useAlternativeSystemIndexValue
                )}
                onChange={async (value) => {
                  buildObject.updateUseAlternativeSystemIndexValue(value);
                  if (!value) {
                    buildObject.updateAlternativeSystemIndexValue(null);
                  }
                  await recalcuateJobFromSetup(buildObject, state, actions);
                }}
              />
            </Grid>
            <Grid size={6}>
              <SystemIndexTextField
                inputSystemID={buildObject.systemID}
                jobType={buildObject.jobType}
                useAlternativeSystemIndexValue={
                  buildObject.useAlternativeSystemIndexValue
                }
                alternativeSystemIndexValue={
                  buildObject.alternativeSystemIndexValue
                }
                onChange={async (value) => {
                  buildObject.updateAlternativeSystemIndexValue(value);
                  await recalcuateJobFromSetup(buildObject, state, actions);
                }}
              />
            </Grid>
          </Grid>

          {isLoggedIn && (
            <>
              <Grid size={12}>
                <CustomStructureSelect
                  value={
                    state.activeJob.build.setup[setupToEdit].customStructureID
                  }
                  jobType={state.activeJob.jobType}
                  onChange={async (value) => {
                    buildObject.updateCustomStructureID(
                      value,
                      getCustomStructureWithID
                    );

                    await recalcuateJobFromSetup(buildObject, state, actions);
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
                  value={
                    state.activeJob.build.setup[setupToEdit].selectedCharacter
                  }
                  onChange={async (value) => {
                    buildObject.updateSelectedCharacter(value);
                    await recalcuateJobFromSetup(buildObject, state, actions);
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

function ManualStructureSelection({
  state,
  actions,
  setupToEdit,
  buildObject,
}) {
  const [fetchSystemDataTrigger, updateFetchSystemDataTrigger] =
    useState(false);
  const { recalcuateJobFromSetup } = useUpdateSetupValue();

  if (state.activeJob.build.setup[setupToEdit].customStructureID !== "") return null;

  return (
    <>
      <Grid size={6}>
        <StructureTypeSelect
          value={state.activeJob.build.setup[setupToEdit].structureID}
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            buildObject.updateStructureID(selectedEntry);
            await recalcuateJobFromSetup(buildObject, state, actions);
          }}
        />
      </Grid>
      <Grid size={6}>
        <RigTypeSelect
          value={state.activeJob.build.setup[setupToEdit].rigID}
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            buildObject.updateRigID(selectedEntry);
            await recalcuateJobFromSetup(buildObject, state, actions);
          }}
        />
      </Grid>
      <Grid size={6}>
        <SystemTypeSelect
          value={state.activeJob.build.setup[setupToEdit].systemTypeID}
          jobType={state.activeJob.jobType}
          onChange={async (selectedEntry) => {
            buildObject.updateSystemType(selectedEntry);
            await recalcuateJobFromSetup(buildObject, state, actions);
          }}
        />
      </Grid>
      <Grid align="center" size={6}>
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={state.activeJob.build.setup[setupToEdit].systemID}
            jobType={state.activeJob.jobType}
            updateSelectedValue={async (value) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              buildObject.updateSystemID(Number(value));
              await recalcuateJobFromSetup(buildObject, state, actions);
              updateFetchSystemDataTrigger((prev) => !prev);
            }}
          />
        ) : (
          <CircularProgress xs={26} />
        )}
      </Grid>
      <Grid size={6}>
        <TaxPercentageTextField
          initialState={state.activeJob.build.setup[setupToEdit].taxValue}
          onBlur={async (value) => {
            buildObject.updateTaxValue(value);
            await recalcuateJobFromSetup(buildObject, state, actions);
          }}
        />
      </Grid>
    </>
  );
}
