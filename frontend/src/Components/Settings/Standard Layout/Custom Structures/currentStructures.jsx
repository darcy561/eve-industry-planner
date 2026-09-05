import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import {
  Box,
  Button,
  Card,
  CardActions,
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
  LARGE_TEXT_FORMAT,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
  Implants,
} from "../../../../Context/defaultValues";
import getSystemNameFromID from "../../../../Functions/Helper/getSystemName";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

function CurrentStructuresFrame({
  selectedJobType,
  isLoading,
  appearance = "default",
}) {
  const structures = useUsersStore(
    (state) =>
      state.applicationSettings.customStructures?.[
        customStructureMap[selectedJobType]
      ] ?? [],
  );
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

  const isFirstLogin = appearance === "firstLogin";

  function FirstLoginPair({ label, children }) {
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
            sx={{
              width: "100%",
              padding: isFirstLogin ? "8px" : "5px",
              display: "flex",
            }}
            size={
              isFirstLogin
                ? { xs: 12, sm: 6, md: 6 }
                : {
                    xs: 12,
                    sm: 3,
                  }
            }
          >
            <Card
              variant={isFirstLogin ? "outlined" : "elevation"}
              square={!isFirstLogin}
              elevation={isFirstLogin ? 0 : undefined}
              sx={(theme) => ({
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                position: isFirstLogin ? "relative" : undefined,
                overflow: isFirstLogin ? "visible" : undefined,
                borderRadius: isFirstLogin ? 2 : 0,
                ...(isFirstLogin
                  ? {
                      borderColor: alpha(theme.palette.primary.main, 0.22),
                      bgcolor: alpha(
                        theme.palette.background.paper,
                        theme.palette.mode === "dark" ? 0.55 : 0.94,
                      ),
                      backdropFilter: "blur(4px)",
                      boxShadow: "none",
                    }
                  : {}),
              })}
            >
              {isFirstLogin ? (
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
              ) : null}
              <CardContent
                sx={{
                  flexGrow: 1,
                  pt: isFirstLogin ? 1.25 : undefined,
                  pr: isFirstLogin ? 1 : undefined,
                  ...(isFirstLogin
                    ? {}
                    : {
                        "& .MuiTypography-caption": {
                          color: "text.secondary",
                          display: "block",
                        },
                      }),
                }}
              >
                {isFirstLogin ? (
                  <Box sx={{ pr: { xs: 5, sm: 5.5 } }}>
                    <Typography
                      variant="subtitle1"
                      color="primary"
                      fontWeight={700}
                      sx={{ lineHeight: 1.3 }}
                    >
                      {structure.name}
                    </Typography>
                    <Grid container spacing={1} columns={12} sx={{ mt: 1 }}>
                      {selectedJobType === jobTypes.reprocessing ? (
                        <>
                          <FirstLoginPair label="Structure type">
                            {structureTypeMap[selectedJobType][
                              structure.structureType
                            ]?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Rigs">
                            {[
                              rigTypeMap[selectedJobType][structure.rigSlot1]
                                ?.label,
                              rigTypeMap[selectedJobType][structure.rigSlot2]
                                ?.label,
                            ]
                              .filter((label) => label && label !== "None")
                              .join(" · ") || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Tax">
                            {`${structure.tax || 0}%`}
                          </FirstLoginPair>
                          <FirstLoginPair label="Security">
                            {systemTypeMap[selectedJobType][
                              structure.systemType
                            ]?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Implant">
                            {Implants[selectedJobType]?.[structure.implant]
                              ?.label || "—"}
                          </FirstLoginPair>
                        </>
                      ) : selectedJobType === jobTypes.invention ? (
                        <>
                          <FirstLoginPair label="Structure type">
                            {structureTypeMap[selectedJobType][
                              structure.structureType
                            ]?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Rigs">
                            {[
                              rigTypeMap[selectedJobType][structure.rigSlot1]
                                ?.label,
                              rigTypeMap[selectedJobType][structure.rigSlot2]
                                ?.label,
                            ]
                              .filter((label) => label && label !== "None")
                              .join(" · ") || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Tax">
                            {`${structure.tax || 0}%`}
                          </FirstLoginPair>
                          <FirstLoginPair label="Security">
                            {systemTypeMap[selectedJobType][
                              structure.systemType
                            ]?.label || "—"}
                          </FirstLoginPair>
                        </>
                      ) : (
                        <>
                          <FirstLoginPair label="Structure type">
                            {structureTypeMap[selectedJobType][
                              structure.structureType
                            ]?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Rig">
                            {rigTypeMap[selectedJobType][structure.rigType]
                              ?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="Tax">
                            {`${structure.tax || 0}%`}
                          </FirstLoginPair>
                          <FirstLoginPair label="Security">
                            {systemTypeMap[selectedJobType][
                              structure.systemType
                            ]?.label || "—"}
                          </FirstLoginPair>
                          <FirstLoginPair label="System">
                            <Tooltip
                              title={`System index ${getSystemIndex(structure.systemID)}%`}
                              arrow
                              placement="top"
                            >
                              <Box component="span">
                                {getSystemNameFromID(structure.systemID)}
                                <Typography
                                  component="span"
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  Index{" "}
                                  {getSystemIndex(structure.systemID) * 100}%
                                </Typography>
                              </Box>
                            </Tooltip>
                          </FirstLoginPair>
                        </>
                      )}
                    </Grid>
                  </Box>
                ) : (
                  <Grid container align="center" spacing={0}>
                    <Grid size={12}>
                      <Typography
                        color="primary"
                        sx={{ typography: LARGE_TEXT_FORMAT }}
                      >
                        {structure.name}
                      </Typography>
                    </Grid>
                    <Grid size={4}>
                      <Typography variant="caption">
                        {structureTypeMap[selectedJobType][
                          structure.structureType
                        ]?.label || "Missing Structure Type"}
                      </Typography>
                    </Grid>
                    {(selectedJobType === jobTypes.reprocessing ||
                      selectedJobType === jobTypes.invention) && (
                      <Grid size={8}>
                        <Typography variant="caption">
                          {[
                            rigTypeMap[selectedJobType][structure.rigSlot1]
                              ?.label,
                            rigTypeMap[selectedJobType][structure.rigSlot2]
                              ?.label,
                          ]
                            .filter((label) => label && label !== "None")
                            .join(", ") || "No Rigs"}
                        </Typography>
                      </Grid>
                    )}
                    {selectedJobType !== jobTypes.reprocessing &&
                      selectedJobType !== jobTypes.invention && (
                        <Grid size={4}>
                          <Typography variant="caption">
                            {rigTypeMap[selectedJobType][structure.rigType]
                              ?.label || "Missing Rig Type"}
                          </Typography>
                        </Grid>
                      )}
                    <Grid size={4}>
                      <Typography variant="caption">{`${
                        structure.tax || 0
                      }%`}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption">
                        {systemTypeMap[selectedJobType][structure.systemType]
                          ?.label || "Missing System Type"}
                      </Typography>
                    </Grid>
                    {(selectedJobType === jobTypes.manufacturing ||
                      selectedJobType === jobTypes.reaction) && (
                      <Grid size={6}>
                        <Box sx={{ display: "flex", flexDirection: "column" }}>
                          <Typography variant="caption">
                            {getSystemNameFromID(structure.systemID)}
                          </Typography>
                          <Tooltip
                            title="System Index Value"
                            arrow
                            placement="right"
                          >
                            <Typography variant="caption">
                              {`${getSystemIndex(structure.systemID)}%`}
                            </Typography>
                          </Tooltip>
                        </Box>
                      </Grid>
                    )}

                    {selectedJobType === jobTypes.reprocessing && (
                      <Grid size={4}>
                        <Typography variant="caption">
                          {Implants[selectedJobType]?.[structure.implant]
                            ?.label || "Missing Implant Type"}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                )}
              </CardContent>
              {!isFirstLogin ? (
                <CardActions
                  sx={{
                    px: 2,
                    pt: 0,
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Tooltip
                    title="Default structures are automatically applied when creating new jobs."
                    arrow
                    placement="top"
                  >
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        disabled={structure.default}
                        onClick={async () => {
                          setDefaultCustomStructure(structure.id);
                          scheduleDebouncedApplicationSettingsSave();
                        }}
                      >
                        Make Default
                      </Button>
                    </span>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="text"
                    color="error"
                    onClick={async () => {
                      deleteCustomStructure(structure.id);
                      scheduleDebouncedApplicationSettingsSave();
                    }}
                  >
                    Remove
                  </Button>
                </CardActions>
              ) : null}
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default CurrentStructuresFrame;
