import { useEffect } from "react";
import { Box, Divider } from "@mui/material";

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
} from "../../Functions/Custom Structures/customStructure";
import ImplantSelect from "../../Styled Components/Select/implantSelector";
import useUsersStore from "../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { useGetCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import CustomStructureSelect from "../../Styled Components/Select/customStructure";
import useRigSlots from "../../Hooks/useRigSlots";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState.selectedUser, skillsLoading, skillsError]);

  const rigSlots = useRigSlots(pageState.currentStructure, (slot, rigID) =>
    pageActions.setCurrentStructure(
      updateStructure(pageState.currentStructure, { [slot]: rigID }),
    ),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelFallBack
        isLoading={skillsLoading}
        isError={skillsError}
        error={skillsError}
      />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
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
        </Box>
        <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
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
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
          <RigTypeSelect
            value={pageState.currentStructure.rigSlot1}
            jobType={jobTypes.reprocessing}
            error={rigSlots.slot1.error}
            onChange={rigSlots.slot1.onChange}
          />
        </Box>
        <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
          <RigTypeSelect
            value={pageState.currentStructure.rigSlot2}
            jobType={jobTypes.reprocessing}
            error={rigSlots.slot2.error}
            onChange={rigSlots.slot2.onChange}
          />
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
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
        </Box>
        {isLoggedIn ? (
          <>
            <Box sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
              <AssignUsersSelect
                value={pageState.selectedUser}
                onChange={(hash) => pageActions.setSelectedUser(hash)}
              />
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ flexBasis: "100%", minWidth: 0 }}>
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
              </Box>
            </Box>
          </>
        ) : null}
      </Box>
      <Divider sx={{ marginTop: 3, marginBottom: 3 }} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {requiredSkills.map(({ id, name }) => {
          return (
            <Box key={id} sx={{ flexBasis: "calc(50% - 8px)", minWidth: 0 }}>
              <SkillSelector
                level={pageState.activeSkills[id] || 0}
                skillName={name}
                onChange={(newLevel) =>
                  pageActions.setSingleSkill(id, newLevel)
                }
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default ReprocessingStructurePanel;
