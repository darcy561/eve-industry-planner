import { Grid } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import { jobTypes } from "../../../../../Context/defaultValues";
import { recalculateWatchListItemsFromSetup } from "../../../../../Functions/JobPlanner/recalculateJobFromSetup";
import VirtualisedSystemSearch from "../../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import CustomStructureSelect from "../../../../../Styled Components/Select/customStructure";
import MaterialEfficiencySelect from "../../../../../Styled Components/Select/materialEfficiency";
import TimeEfficiencySelect from "../../../../../Styled Components/Select/timeEfficiency";
import StructureTypeSelect from "../../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../../Styled Components/Select/systemType";
import TaxPercentageTextField from "../../../../../Styled Components/Textfield/tax";
import useUsersStore from "../../../../../Zustand/usersStore";
import { setupShowsManualStructureFields } from "../../../../../Functions/Helper/customStructureSetup";

export function WatchListSetupOptions_WatchlistDialogue({
  watchlistItemRequest,
  materialJobs,
  setMaterialJobs,
  itemToModify,
}) {
  const queryClient = useQueryClient();
  const getCustomStructureWithID = useUsersStore(
    (state) => state.applicationSettings.actions.getCustomStructureWithID
  );
  const jobSetup = Object.values(materialJobs[itemToModify]?.build?.setup)[0];

  return (
    <Grid container spacing={2} sx={{ width: "100%" }}>
      <Grid size={12}>
        <CustomStructureSelect
          value={jobSetup.customStructureID}
          jobType={jobSetup.jobType}
          onChange={(value) => {
            jobSetup.updateCustomStructureID(value, getCustomStructureWithID);

            recalculateWatchListItemsFromSetup(
              itemToModify,
              watchlistItemRequest,
              jobSetup.id,
              materialJobs,
              queryClient
            );

            setMaterialJobs({ ...materialJobs });
          }}
        />
      </Grid>
      {jobSetup.jobType === jobTypes.manufacturing && (
        <Grid size={12} container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <MaterialEfficiencySelect
              value={jobSetup.ME}
              onChange={(value) => {
                jobSetup.updateMEValue(value);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <TimeEfficiencySelect
              value={jobSetup.TE}
              onChange={(value) => {
                jobSetup.updateTEValue(value);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
        </Grid>
      )}
      {setupShowsManualStructureFields(jobSetup, getCustomStructureWithID) && (
        <Grid container spacing={2} size={12}>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <StructureTypeSelect
              value={jobSetup.structureID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) => {
                jobSetup.updateStructureID(selectedEntry);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <RigTypeSelect
              value={jobSetup.rigID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) => {
                jobSetup.updateRigID(selectedEntry);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <SystemTypeSelect
              value={jobSetup.systemTypeID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) => {
                jobSetup.updateSystemType(selectedEntry);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <VirtualisedSystemSearch
              selectedValue={jobSetup.systemID}
              jobType={jobSetup.jobType}
              updateSelectedValue={(value) => {
                jobSetup.updateSystemID(Number(value));
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <TaxPercentageTextField
              initialState={jobSetup.taxValue}
              onBlur={(value) => {
                jobSetup.updateTaxValue(value);
                recalculateWatchListItemsFromSetup(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  materialJobs,
                  queryClient
                );
                setMaterialJobs({ ...materialJobs });
              }}
            />
          </Grid>
        </Grid>
      )}
    </Grid>
  );
}
