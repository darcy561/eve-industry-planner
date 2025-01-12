import { Grid, Paper, CircularProgress } from "@mui/material";
import { useContext, useState } from "react";
import { IsLoggedInContext } from "../../../../../../Context/AuthContext";
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
import { ApplicationSettingsContext } from "../../../../../../Context/LayoutContext";

export function EditJobSetup({ activeJob, updateActiveJob, setJobModified }) {
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { recalcuateJobFromSetup } = useUpdateSetupValue();
  const setupToEdit = activeJob.layout.setupToEdit;

  if (!activeJob.build.setup[setupToEdit]) return null;

  let buildObject = activeJob.build.setup[setupToEdit];

  return (
    <Paper
      elevation={3}
      sx={{
        minWidth: "100%",
        padding: "20px",
      }}
      square
    >
      <Grid container direction="column">
        <Grid item container direction="row" spacing={2}>
          <Grid item xs={6}>
            <BlueprintRunsTextField
              initialState={buildObject.runCount}
              onChange={(value) => {
                buildObject.updateRunCount(value);
                recalcuateJobFromSetup(
                  buildObject,
                  activeJob,
                  updateActiveJob
                );
                setJobModified(true);
              }}
            />
          </Grid>
          <Grid item xs={6}>
            <JobSlotsTextField
              initialState={buildObject.jobCount}
              onChange={(value) => {
                buildObject.updateJobCount(value);
                recalcuateJobFromSetup(
                  buildObject,
                  activeJob,
                  updateActiveJob
                );
                setJobModified(true);
              }}
            />
          </Grid>
          {activeJob.jobType === jobTypes.manufacturing && (
            <>
              <Grid item xs={6}>
                <MaterialEfficiencySelect
                  value={activeJob.build.setup[setupToEdit].ME}
                  onChange={(value) => {
                    buildObject.updateMEValue(value);
                    recalcuateJobFromSetup(
                      buildObject,
                      activeJob,
                      updateActiveJob
                    );
                    setJobModified(true);
                  }}
                />
              </Grid>
              <Grid item xs={6}>
                <TimeEfficiencySelect
                  value={activeJob.build.setup[setupToEdit].TE}
                  onChange={(value) => {
                    buildObject.updateTEValue(value);
                    recalcuateJobFromSetup(
                      buildObject,
                      activeJob,
                      updateActiveJob
                    );
                    setJobModified(true);
                  }}
                />
              </Grid>
            </>
          )}
          <ManualStructureSelection
            activeJob={activeJob}
            updateActiveJob={updateActiveJob}
            setJobModified={setJobModified}
            setupToEdit={setupToEdit}
            buildObject={buildObject}
          />
          {isLoggedIn && (
            <>
              <Grid item xs={12}>
                <CustomStructureSelect
                  value={activeJob.build.setup[setupToEdit].customStructureID}
                  jobType={activeJob.jobType}
                  onChange={(value) => {
                    buildObject.updateCustomStructureID(
                      value,
                      applicationSettings
                    );
                    recalcuateJobFromSetup(
                      buildObject,
                      activeJob,
                      updateActiveJob
                    );
                    setJobModified(true);
                  }}
                />
              </Grid>
              <Grid item xs={12} xl={8}>
                <AssignUsersSelect
                  value={activeJob.build.setup[setupToEdit].selectedCharacter}
                  onChange={(value) => {
                    buildObject.updateSelectedCharacter(value);
                    recalcuateJobFromSetup(
                      buildObject,
                      activeJob,
                      updateActiveJob
                    );
                    setJobModified(true);
                  }}
                />
              </Grid>
            </>
          )}
        </Grid>
      </Grid>
    </Paper>
  );
}

function ManualStructureSelection({
  activeJob,
  updateActiveJob,
  setJobModified,
  setupToEdit,
  buildObject,
}) {
  const [fetchSystemDataTrigger, updateFetchSystemDataTrigger] =
    useState(false);
  const { recalcuateJobFromSetup } = useUpdateSetupValue();

  if (activeJob.build.setup[setupToEdit].customStructureID) return null;

  return (
    <>
      <Grid item xs={6}>
        <StructureTypeSelect
          value={activeJob.build.setup[setupToEdit].structureID}
          jobType={activeJob.jobType}
          onChange={(selectedEntry) => {
            buildObject.updateStructureID(selectedEntry);
            recalcuateJobFromSetup(
              buildObject,
              activeJob,
              updateActiveJob
            );
            setJobModified(true);
          }}
        />
      </Grid>
      <Grid item xs={6}>
        <RigTypeSelect
          value={activeJob.build.setup[setupToEdit].rigID}
          jobType={activeJob.jobType}
          onChange={(selectedEntry) => {
            buildObject.updateRigID(selectedEntry);
            recalcuateJobFromSetup(
              buildObject,
              activeJob,
              updateActiveJob
            );
            setJobModified(true);
          }}
        />
      </Grid>
      <Grid item xs={6}>
        <SystemTypeSelect
          value={activeJob.build.setup[setupToEdit].systemTypeID}
          jobType={activeJob.jobType}
          onChange={(selectedEntry) => {
            buildObject.updateSystemType(selectedEntry);
            recalcuateJobFromSetup(
              buildObject,
              activeJob,
              updateActiveJob
            );
            setJobModified(true);
          }}
        />
      </Grid>
      <Grid item xs={6} align="center">
        {!fetchSystemDataTrigger ? (
          <VirtualisedSystemSearch
            selectedValue={activeJob.build.setup[setupToEdit].systemID}
            jobType={activeJob.jobType}
            updateSelectedValue={async (value) => {
              updateFetchSystemDataTrigger((prev) => !prev);
              buildObject.updateSystemID(Number(value));
              await recalcuateJobFromSetup(
                buildObject,
                activeJob,
                updateActiveJob
              );
              setJobModified(true);
              updateFetchSystemDataTrigger((prev) => !prev);
            }}
          />
        ) : (
          <CircularProgress size={26} />
        )}
      </Grid>
      <Grid item xs={6}>
        <TaxPercentageTextField
          initialState={activeJob.build.setup[setupToEdit].taxValue}
          onBlur={(value) => {
            buildObject.updateTaxValue(value);
            recalcuateJobFromSetup(
              buildObject,
              activeJob,
              updateActiveJob
            );
            setJobModified(true);
          }}
        />
      </Grid>
    </>
  );
}
