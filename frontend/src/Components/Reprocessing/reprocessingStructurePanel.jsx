import { useEffect } from "react";
import { Divider, Grid } from "@mui/material";

import StructureTypeSelect from "../../Styled Components/Select/structureType";
import { jobTypes } from "../../Context/defaultValues";
import SystemTypeSelect from "../../Styled Components/Select/systemType";
import RigTypeSelect from "../../Styled Components/Select/rigType";
import SkillSelector from "../../Styled Components/Select/skillSelector";
import getAllReprocessingSkills from "../../Functions/Skills/getAllReprocessingSkills";
import AssignUsersSelect from "../../Styled Components/Select/users";
import {
  structureFromDocument,
  updateStructure,
} from "../../Functions/Structure/customStructure";
import ImplantSelect from "../../Styled Components/Select/implantSelector";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { useGetCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import CustomStructureSelect from "../../Styled Components/Select/customStructure";

function ReprocessingStructurePanel({ pageState, pageActions }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const queryClient = useQueryClient();

  const requiredSkills = getAllReprocessingSkills();

  const { isLoading: skillsLoading, isError: skillsError } =
    useGetCharacterSkills(pageState.selectedUser);

  useEffect(() => {
    async function fetchSkills() {
      if (skillsLoading || skillsError) return;

      if (!pageState.skillsManuallyModified) {
        const { data: userSkills } = getCachedCharacterSkills(
          queryClient,
          pageState.selectedUser,
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
            {},
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
    <Grid container sx={{ flexDirection: "column" }}>
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
              pageActions.setCurrentStructure(
                updateStructure(pageState.currentStructure, {
                  structureType: selectedEntry.id,
                }),
              );
            }}
          />
        </Grid>
        <Grid size={6}>
          <SystemTypeSelect
            value={pageState.currentStructure.systemType}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) => {
              pageActions.setCurrentStructure(
                updateStructure(pageState.currentStructure, {
                  systemType: selectedEntry.id,
                }),
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
                pageActions.setCurrentStructure(
                  updateStructure(pageState.currentStructure, { rigSlot1: 0 }),
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: false });
                return;
              }

              if (
                pageState.currentStructure.rigSlot2 === selectedEntry.id ||
                selectedEntry.relatedTo.includes(
                  pageState.currentStructure.rigSlot2,
                )
              ) {
                pageActions.setCurrentStructure(
                  updateStructure(pageState.currentStructure, { rigSlot1: 0 }),
                );
                pageActions.setRigSlotErrors({ slot1: true, slot2: false });
                return;
              }
              pageActions.setCurrentStructure(
                updateStructure(pageState.currentStructure, {
                  rigSlot1: selectedEntry.id,
                }),
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
                pageActions.setCurrentStructure(
                  updateStructure(pageState.currentStructure, { rigSlot2: 0 }),
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: false });
                return;
              }
              if (
                pageState.currentStructure.rigSlot1 == selectedEntry.id ||
                selectedEntry.relatedTo.includes(
                  pageState.currentStructure.rigSlot1,
                )
              ) {
                pageActions.setCurrentStructure(
                  updateStructure(pageState.currentStructure, { rigSlot2: 0 }),
                );
                pageActions.setRigSlotErrors({ slot1: false, slot2: true });
                return;
              }
              pageActions.setCurrentStructure(
                updateStructure(pageState.currentStructure, {
                  rigSlot2: selectedEntry.id,
                }),
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
              pageActions.setCurrentStructure(
                updateStructure(pageState.currentStructure, {
                  implant: selectedEntry.id,
                }),
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
                        selectedEntry,
                      );
                    pageActions.setCurrentStructure(
                      structureFromDocument(matchedStructure),
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
              <SkillSelector
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
