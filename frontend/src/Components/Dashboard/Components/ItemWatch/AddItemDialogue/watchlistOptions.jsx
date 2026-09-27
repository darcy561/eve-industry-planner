import { Grid } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import Setup from "../../../../../Classes/jobSetup";
import { jobTypes } from "../../../../../Context/defaultValues";
import { recalculateWatchListItemsFromSetup } from "../../../../../Functions/JobPlanner/applySetupChange";
import VirtualisedSystemSearch from "../../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import CustomStructureSelect from "../../../../../Styled Components/Select/customStructure";
import MaterialEfficiencySelect from "../../../../../Styled Components/Select/materialEfficiency";
import TimeEfficiencySelect from "../../../../../Styled Components/Select/timeEfficiency";
import StructureTypeSelect from "../../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../../Styled Components/Select/systemType";
import TaxPercentageTextField from "../../../../../Styled Components/Textfield/tax";
import useUsersStore from "../../../../../Zustand/usersStore";
import { setupShowsManualStructureFields } from "../../../../../Functions/Custom Structures/customStructureSetup";
import useRigSlots from "../../../../../Hooks/useRigSlots";
import { getRigInfoFromID } from "../../../../../Functions/Custom Structures/getStructureInfo";

export function WatchListSetupOptions_WatchlistDialogue({
  watchlistItemRequest,
  materialJobs,
  setMaterialJobs,
  itemToModify,
}) {
  const queryClient = useQueryClient();
  const getCustomStructureWithID = useUsersStore(
    (state) => state.applicationSettings.actions.getCustomStructureWithID,
  );
  const jobSetup = Object.values(materialJobs[itemToModify]?.build?.setup)[0];

  const changeSetup = (change) => {
    const next = new Setup(jobSetup);
    change(next);

    const changed = structuredClone(materialJobs);
    changed[itemToModify].build.setup[next.id] = next.toDocument();
    recalculateWatchListItemsFromSetup(
      itemToModify,
      watchlistItemRequest,
      next.id,
      changed,
      queryClient,
    );
    setMaterialJobs(changed);
  };

  const rigSlots = useRigSlots(jobSetup, (slot, rigID) =>
    changeSetup((setup) =>
      setup.updateRigSlot(slot, getRigInfoFromID(jobSetup.jobType, rigID)),
    ),
  );

  return (
    <Grid container spacing={2} sx={{ width: "100%" }}>
      <Grid size={12}>
        <CustomStructureSelect
          value={jobSetup.customStructureID}
          jobType={jobSetup.jobType}
          onChange={(value) =>
            changeSetup((setup) =>
              setup.updateCustomStructureID(value, getCustomStructureWithID),
            )
          }
        />
      </Grid>
      {jobSetup.jobType === jobTypes.manufacturing && (
        <Grid size={12} container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <MaterialEfficiencySelect
              value={jobSetup.ME}
              onChange={(value) =>
                changeSetup((setup) => setup.updateMEValue(value))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <TimeEfficiencySelect
              value={jobSetup.TE}
              onChange={(value) =>
                changeSetup((setup) => setup.updateTEValue(value))
              }
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
              onChange={(selectedEntry) =>
                changeSetup((setup) => setup.updateStructureID(selectedEntry))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <RigTypeSelect
              value={jobSetup.rigSlot1}
              jobType={jobSetup.jobType}
              error={rigSlots.slot1.error}
              onChange={rigSlots.slot1.onChange}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <RigTypeSelect
              value={jobSetup.rigSlot2}
              jobType={jobSetup.jobType}
              error={rigSlots.slot2.error}
              onChange={rigSlots.slot2.onChange}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <SystemTypeSelect
              value={jobSetup.systemTypeID}
              jobType={jobSetup.jobType}
              onChange={(selectedEntry) =>
                changeSetup((setup) => setup.updateSystemType(selectedEntry))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingLeft: "10px" }}>
            <VirtualisedSystemSearch
              selectedValue={jobSetup.systemID}
              jobType={jobSetup.jobType}
              updateSelectedValue={(value) =>
                changeSetup((setup) => setup.updateSystemID(Number(value)))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ paddingRight: "10px" }}>
            <TaxPercentageTextField
              initialState={jobSetup.taxValue}
              onBlur={(value) =>
                changeSetup((setup) => setup.updateTaxValue(value))
              }
            />
          </Grid>
        </Grid>
      )}
    </Grid>
  );
}
