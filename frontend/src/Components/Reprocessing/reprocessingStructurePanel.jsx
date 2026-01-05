import { useEffect } from "react";
import { Divider, Grid } from "@mui/material";

import StructureTypeSelect from "../../Styled Components/Select/structureType";
import { jobTypes } from "../../Context/defaultValues";
import SystemTypeSelect from "../../Styled Components/Select/systemType";
import RigTypeSelect from "../../Styled Components/Select/rigType";
import SkillSelecter from "../../Styled Components/Select/skillSelecter";
import getAllReprocessingSkills from "../../Functions/Skills/getAllReprocessingSkills";
import AssignUsersSelect from "../../Styled Components/Select/users";
import ReprocessingStructure from "../../Classes/reprocessingStructureConstructor";
import ImplantSelect from "../../Styled Components/Select/implantSelecter";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { useGetCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import CustomStructureSelect from "../../Styled Components/Select/customStructure";

function ReprocessingStructurePanel({ pageState, pageActions }) {
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const queryClient = useQueryClient();

  const requiredSkills = getAllReprocessingSkills();

  const { isLoading: skillsLoading, isError: skillsError } =
    useGetCharacterSkills(pageState.selectedUser);

  useEffect(() => {
    async function fetchSkills() {
      if (skillsLoading || skillsError) return;

      // Only load character skills if they haven't been manually modified
      if (!pageState.skillsManuallyModified) {
        const { data: userSkills } = getCachedCharacterSkills(
          queryClient,
          pageState.selectedUser
        );

        if (
          userSkills &&
          typeof userSkills === "object" &&
          !Array.isArray(userSkills)
        ) {
          const characterSkills = requiredSkills.reduce(
            (acc, { id }) => ({
              ...acc,
              [id]: userSkills[id]?.activeLevel ?? 0,
            }),
            {}
          );

          pageActions.loadCharacterSkills(characterSkills);
        }
      }
    }
    fetchSkills();
  }, [pageState.selectedUser, skillsLoading, skillsError]);

  const errorText =
    "You cannot have multiple rigs effecting the same material type.";

  return (
    <Grid container direction="column">
      <PanelFallBack
        isLoading={skillsLoading}
        isError={skillsError}
        error={skillsError}
      />
      <Grid container spacing={2}>
        <Grid size={6}>
          <StructureTypeSelect
            value={pageState.currentStructure.structureType}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) => {
              pageState.currentStructure.setStructureType(selectedEntry.id);
              pageActions.setCurrentStructure(
                new ReprocessingStructure(pageState.currentStructure)
              );
            }}
          />
        </Grid>
        <Grid size={6}>
          <SystemTypeSelect
            value={pageState.currentStructure.systemType}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) => {
              pageState.currentStructure.setSystemType(selectedEntry.id);
              pageActions.setCurrentStructure(
                new ReprocessingStructure(pageState.currentStructure)
              );
            }}
          />
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={6}>
          <RigTypeSelect
            value={pageState.currentStructure.rigSlot1}
            jobType={jobTypes.reprocessing}
            error={{ isError: pageState.rigSlotErrors.slot1, errorText }}
            onChange={(selectedEntry) => {
              if (selectedEntry.id === 0) {
                pageState.currentStructure.setRigSlot1(0);
                pageActions.setCurrentStructure(
                  new ReprocessingStructure(pageState.currentStructure)
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: false });
                return;
              }

              if (
                pageState.currentStructure.rigSlot2 === selectedEntry.id ||
                selectedEntry.relatedTo.includes(
                  pageState.currentStructure.rigSlot2
                )
              ) {
                pageState.currentStructure.setRigSlot1(0);
                pageActions.setCurrentStructure(
                  new ReprocessingStructure(pageState.currentStructure)
                );
                pageActions.setRigSlotErrors({ slot1: true, slot2: false });
                return;
              }
              pageState.currentStructure.setRigSlot1(selectedEntry.id);
              pageActions.setCurrentStructure(
                new ReprocessingStructure(pageState.currentStructure)
              );
              pageActions.setRigSlotErrors({ slot1: false, slot2: false });
            }}
          />
        </Grid>
        <Grid size={6}>
          <RigTypeSelect
            value={pageState.currentStructure.rigSlot2}
            jobType={jobTypes.reprocessing}
            error={{ isError: pageState.rigSlotErrors.slot2, errorText }}
            onChange={(selectedEntry) => {
              if (selectedEntry.id === 0) {
                pageState.currentStructure.setRigSlot2(0);
                pageActions.setCurrentStructure(
                  new ReprocessingStructure(pageState.currentStructure)
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: false });
                return;
              }
              if (
                pageState.currentStructure.rigSlot1 == selectedEntry.id ||
                selectedEntry.relatedTo.includes(
                  pageState.currentStructure.rigSlot1
                )
              ) {
                pageState.currentStructure.setRigSlot2(0);
                pageActions.setCurrentStructure(
                  new ReprocessingStructure(pageState.currentStructure)
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: true });
                return;
              }
              pageState.currentStructure.setRigSlot2(selectedEntry.id);
              pageActions.setCurrentStructure(
                new ReprocessingStructure(pageState.currentStructure)
              );
              pageActions.setRigSlotErrors({ slot1: false, slot2: false });
            }}
          />
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={6}>
          <ImplantSelect
            value={pageState.currentStructure.implant}
            jobType={pageState.currentStructure.jobType}
            onChange={(selectedEntry) => {
              pageState.currentStructure.setImplant(selectedEntry.id);
              pageActions.setCurrentStructure(
                new ReprocessingStructure(pageState.currentStructure)
              );
            }}
          />
        </Grid>
        {isLoggedIn ? (
          <>
            <Grid size={6}>
              <AssignUsersSelect
                value={pageState.selectedUser}
                onChange={(hash) => pageActions.setSelectedUser(hash)}
              />
            </Grid>
            <Grid container spacing={2}>
              <Grid size={12}>
                <CustomStructureSelect
                  value={pageState.currentStructure.id}
                  jobType={jobTypes.reprocessing}
                  onChange={(selectedEntry) => {
                    const matchedStructure = useUsersStore
                      .getState()
                      .applicationSettings.actions.getCustomStructureWithID(
                        selectedEntry
                      );
                    pageActions.setCurrentStructure(
                      new ReprocessingStructure(matchedStructure)
                    );
                  }}
                />
              </Grid>
            </Grid>
          </>
        ) : null}
      </Grid>
      <Divider sx={{ marginTop: 3, marginBottom: 3 }} />
      <Grid container spacing={2}>
        {requiredSkills.map(({ id, name }) => {
          return (
            <Grid key={id} size={6}>
              <SkillSelecter
                level={pageState.activeSkills[id] || 0}
                skillName={name}
                onChange={(newLevel) =>
                  pageActions.setSingleSkill(id, newLevel)
                }
              />
            </Grid>
          );
        })}
      </Grid>
    </Grid>
  );
}

export default ReprocessingStructurePanel;
