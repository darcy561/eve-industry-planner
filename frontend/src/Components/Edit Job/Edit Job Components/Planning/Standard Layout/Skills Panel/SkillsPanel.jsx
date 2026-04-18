import { Typography, Alert, Box, Stack, Tooltip, Divider } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import bpSkills from "../../../../../../RawData/bpSkills.json";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useGetCharacterSkills } from "../../../../../../Hooks/EveEsi/Character/useGetCharacterSkills";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function SkillsPanel({ state }) {
  const { activeJob } = state;
  const selectedCharacterHash =
    activeJob.build.setup[activeJob.layout.setupToEdit]?.selectedCharacter;

  const buildChar = selectedCharacterHash
    ? useUsersStore
        .getState()
        .account.actions.findCharacterByHash(selectedCharacterHash)
    : useUsersStore.getState().account.actions.getMainCharacter();

  const {
    data: characterSkills,
    isLoading,
    isError,
    error,
  } = useGetCharacterSkills(buildChar.CharacterHash);

  if (!activeJob.build.setup[activeJob.layout.setupToEdit]) return null;

  return (
    <ContentPanel
      title="Required Skills"
      paperSx={{ height: "auto" }}
      isLoading={isLoading}
      isError={isError}
      error={error}
    >
      <Box sx={{ width: "100%" }}>
        <Stack spacing={0} sx={{ mt: 1, width: "100%" }}>
          {activeJob.skills.map((jSkill, index) => {
            const charSkill = characterSkills?.[jSkill.typeID] || {
              activeLevel: 0,
            };
            const skillData = bpSkills[jSkill.typeID];
            const hasRequiredLevel =
              charSkill && charSkill.activeLevel >= jSkill.level;
            const currentLevel = charSkill ? charSkill.activeLevel : 0;

            return (
              <Box key={jSkill.typeID} sx={{ width: "100%" }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    py: 0.75,
                    px: 1.5,
                    backgroundColor: (theme) =>
                      hasRequiredLevel
                        ? `${theme.palette.success.main}15`
                        : `${theme.palette.error.main}15`,
                    borderLeft: (theme) =>
                      `3px solid ${
                        hasRequiredLevel
                          ? theme.palette.success.main
                          : theme.palette.error.main
                      }`,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: "text.primary",
                        fontSize: "0.8rem",
                      }}
                    >
                      {skillData?.name || "Unknown Skill"}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <Tooltip
                      title="Selected character's current skill level"
                      arrow
                      placement="top"
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: (theme) =>
                            hasRequiredLevel
                              ? theme.palette.success.main
                              : theme.palette.error.main,
                          fontSize: "0.8rem",
                        }}
                      >
                        {currentLevel}
                      </Typography>
                    </Tooltip>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        fontSize: "0.8rem",
                      }}
                    >
                      /
                    </Typography>
                    <Tooltip title="Required skill level" arrow placement="top">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: "text.primary",
                          fontSize: "0.8rem",
                        }}
                      >
                        {jSkill.level}
                      </Typography>
                    </Tooltip>
                  </Box>
                </Box>
                {index < activeJob.skills.length - 1 && <Divider />}
              </Box>
            );
          })}
        </Stack>
      </Box>
    </ContentPanel>
  );
}
