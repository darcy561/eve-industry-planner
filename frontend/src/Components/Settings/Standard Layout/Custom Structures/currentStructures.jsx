import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  customStructureMap,
  jobTypeMapping,
  jobTypes,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
  Implants,
} from "../../../../Context/defaultValues";
import {
  UNKNOWN_SYSTEM_LABEL,
  useSolarSystemNames,
} from "../../../../Hooks/useSolarSystemNames";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

function CurrentStructuresFrame({ selectedJobType, isLoading }) {
  const structures = useUsersStore(
    (state) =>
      state.applicationSettings.customStructures?.[
        customStructureMap[selectedJobType]
      ] ?? [],
  );
  const systemNames = useSolarSystemNames();
  const { setDefaultCustomStructure, deleteCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  function getSystemIndex(systemID) {
    const jobTypeKey = jobTypeMapping[selectedJobType];
    return (
      useUsersStore.getState().worldData.actions.findSystemIndex(systemID)?.[
        jobTypeKey
      ] || 0
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          marginTop: "20px",
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  function StructureFact({ label, children }) {
    return (
      <Grid size={{ xs: 6, sm: 4 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.2 }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, mt: 0.25, wordBreak: "break-word" }}
        >
          {children}
        </Typography>
      </Grid>
    );
  }

  return (
    <Grid container sx={{ width: "100%" }}>
      {(structures || []).map((structure) => {
        return (
          <Grid
            key={structure.id}
            sx={{ width: "100%", padding: "8px", display: "flex" }}
            size={{ xs: 12, sm: 6, md: 6 }}
          >
            <Card
              variant="outlined"
              elevation={0}
              sx={(theme) => ({
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "visible",
                borderRadius: 2,
                borderColor: alpha(theme.palette.primary.main, 0.22),
                bgcolor: alpha(
                  theme.palette.background.paper,
                  theme.palette.mode === "dark" ? 0.55 : 0.94,
                ),
                backdropFilter: "blur(4px)",
                boxShadow: "none",
              })}
            >
              <Stack
                direction="row"
                spacing={0.25}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 1,
                }}
              >
                <Tooltip
                  title={
                    structure.default
                      ? "Default for new jobs"
                      : "Make default for new jobs"
                  }
                  arrow
                >
                  <span>
                    <IconButton
                      size="small"
                      disabled={structure.default}
                      onClick={async () => {
                        setDefaultCustomStructure(structure.id);
                        scheduleDebouncedApplicationSettingsSave();
                      }}
                      sx={{
                        p: 0.35,
                        color: "primary.main",
                        "&.Mui-disabled": { opacity: 0.85 },
                      }}
                      aria-label="Make default structure"
                    >
                      {structure.default ? (
                        <StarIcon sx={{ fontSize: 18 }} />
                      ) : (
                        <StarBorderIcon sx={{ fontSize: 18 }} />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove structure" arrow>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={async () => {
                      deleteCustomStructure(structure.id);
                      scheduleDebouncedApplicationSettingsSave();
                    }}
                    sx={{ p: 0.35 }}
                    aria-label="Remove structure"
                  >
                    <DeleteOutlinedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
              <CardContent sx={{ flexGrow: 1, pt: 1.25, pr: 1 }}>
                <Box sx={{ pr: { xs: 5, sm: 5.5 } }}>
                  <Typography
                    variant="subtitle1"
                    color="primary"
                    sx={{ fontWeight: 700, lineHeight: 1.3 }}
                  >
                    {structure.name}
                  </Typography>
                  <Grid container spacing={1} columns={12} sx={{ mt: 1 }}>
                    {selectedJobType === jobTypes.reprocessing ? (
                      <>
                        <StructureFact label="Structure type">
                          {structureTypeMap[selectedJobType][
                            structure.structureType
                          ]?.label || "—"}
                        </StructureFact>
                        <StructureFact label="Rigs">
                          {[
                            rigTypeMap[selectedJobType][structure.rigSlot1]
                              ?.label,
                            rigTypeMap[selectedJobType][structure.rigSlot2]
                              ?.label,
                          ]
                            .filter((label) => label && label !== "None")
                            .join(" · ") || "—"}
                        </StructureFact>
                        <StructureFact label="Tax">
                          {`${structure.tax || 0}%`}
                        </StructureFact>
                        <StructureFact label="Security">
                          {systemTypeMap[selectedJobType][structure.systemType]
                            ?.label || "—"}
                        </StructureFact>
                        <StructureFact label="Implant">
                          {Implants[selectedJobType]?.[structure.implant]
                            ?.label || "—"}
                        </StructureFact>
                      </>
                    ) : selectedJobType === jobTypes.invention ? (
                      <>
                        <StructureFact label="Structure type">
                          {structureTypeMap[selectedJobType][
                            structure.structureType
                          ]?.label || "—"}
                        </StructureFact>
                        <StructureFact label="Rigs">
                          {[
                            rigTypeMap[selectedJobType][structure.rigSlot1]
                              ?.label,
                            rigTypeMap[selectedJobType][structure.rigSlot2]
                              ?.label,
                          ]
                            .filter((label) => label && label !== "None")
                            .join(" · ") || "—"}
                        </StructureFact>
                        <StructureFact label="Tax">
                          {`${structure.tax || 0}%`}
                        </StructureFact>
                        <StructureFact label="Security">
                          {systemTypeMap[selectedJobType][structure.systemType]
                            ?.label || "—"}
                        </StructureFact>
                      </>
                    ) : (
                      <>
                        <StructureFact label="Structure type">
                          {structureTypeMap[selectedJobType][
                            structure.structureType
                          ]?.label || "—"}
                        </StructureFact>
                        <StructureFact label="Rig">
                          {rigTypeMap[selectedJobType][structure.rigType]
                            ?.label || "—"}
                        </StructureFact>
                        <StructureFact label="Tax">
                          {`${structure.tax || 0}%`}
                        </StructureFact>
                        <StructureFact label="Security">
                          {systemTypeMap[selectedJobType][structure.systemType]
                            ?.label || "—"}
                        </StructureFact>
                        <StructureFact label="System">
                          <Tooltip
                            title={`System index ${getSystemIndex(structure.systemID)}%`}
                            arrow
                            placement="top"
                          >
                            <Box component="span">
                              {systemNames[structure.systemID] ??
                                UNKNOWN_SYSTEM_LABEL}
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block" }}
                              >
                                Index {getSystemIndex(structure.systemID) * 100}
                                %
                              </Typography>
                            </Box>
                          </Tooltip>
                        </StructureFact>
                      </>
                    )}
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default CurrentStructuresFrame;
