import { useContext } from "react";
import { Grid } from "@mui/material";
import { jobTypes } from "../../../../../Context/defaultValues";
import { useUpdateSetupValue } from "../../../../../Hooks/JobHooks/useUpdateSetupValue";
import { ApplicationSettingsContext } from "../../../../../Context/LayoutContext";
import VirtualisedSystemSearch from "../../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import CustomStructureSelect from "../../../../../Styled Components/Select/customStructure";
import MaterialEfficiencySelect from "../../../../../Styled Components/Select/materialEfficiency";
import TimeEfficiencySelect from "../../../../../Styled Components/Select/timeEfficiency";
import StructureTypeSelect from "../../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../../Styled Components/Select/systemType";
import TaxPercentageTextField from "../../../../../Styled Components/Textfield/tax";

export function WatchListSetupOptions_WatchlistDialog({
  watchlistItemRequest,
  materialJobs,
  setMaterialJobs,
  itemToModify,
}) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { recalculateWatchListItems } = useUpdateSetupValue();
  const jobSetup = Object.values(materialJobs[itemToModify]?.build?.setup)[0];

  return (
    <Grid container item xs={12} spacing={2}>
      <Grid container item xs={12}>
        <Grid item xs={12}>
          <CustomStructureSelect
            value={jobSetup.customStructureID}
            jobType={jobSetup.jobType}
            onChange={(value) => {
              jobSetup.updateCustomStructureID(value, applicationSettings);
              recalculateWatchListItems(
                itemToModify,
                watchlistItemRequest,
                jobSetup.id,
                materialJobs
              );
              setMaterialJobs({ ...materialJobs });
            }}
          />
        </Grid>
      </Grid>
      {jobSetup.jobType === jobTypes.manufacturing && (
        <Grid container item xs={12}>
          <Grid item xs={6} sx={{ paddingRight: "10px" }}>
            <MaterialEfficiencySelect
              value={jobSetup.ME}
              onChange={(value) => {
                jobSetup.updateMEValue(value);
                recalculateWatchListItems(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
            <TimeEfficiencySelect
              value={jobSetup.TE}
              onChange={(value) => {
                jobSetup.updateTEValue(value);
                recalculateWatchListItems(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
        </Grid>
      )}
      {!jobSetup.customStructureID && (
        <Grid container item xs={12}>
          <Grid item xs={6} sx={{ paddingRight: "10px" }}>
            <StructureTypeSelect
              value={jobSetup.structureID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) => {
                jobSetup.updateStructureID(selectedEntry);
                recalculateWatchListItems(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
            <RigTypeSelect
              value={jobSetup.rigID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) => {
                jobSetup.updateRigID(selectedEntry);
                recalculateWatchListItems(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid container item xs={12}>
            <Grid item xs={6} sx={{ paddingRight: "10px" }}>
              <SystemTypeSelect
                value={jobSetup.systemTypeID}
                jobType={jobSetup.jobType}
                onChange={(selectedEntry) => {
                  jobSetup.updateSystemType(selectedEntry);
                  recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    materialJobs
                  );
                  setMaterialJobs({ ...materialJobs });
                }}
              />
            </Grid>
            <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
              <VirtualisedSystemSearch
                selectedValue={jobSetup.systemID}
                jobType={jobSetup.jobType}
                updateSelectedValue={(value) => {
                  jobSetup.updateSystemID(Number(value));
                  recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    materialJobs
                  );
                  setMaterialJobs({ ...materialJobs });
                }}
              />
            </Grid>
          </Grid>
          <Grid container item xs={12}>
            <Grid item xs={6} sx={{ paddingRight: "10px" }}>
              <TaxPercentageTextField
                initialState={jobSetup.taxValue}
                onBlur={(value) => {
                  jobSetup.updateTaxValue(value);
                  recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    materialJobs
                  );
                  setMaterialJobs({ ...materialJobs });
                }}
              />
            </Grid>
          </Grid>
        </Grid>
      )}
    </Grid>
  );
}
