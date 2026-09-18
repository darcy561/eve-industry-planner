import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import EntityRow from "../../../../Styled Components/Paper/EntityRow";
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

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        width: "100%",
      }}
    >
      {(structures || []).map((structure) => (
        <EntityRow
          key={structure.id}
          name={structure.name}
          sx={{ flexBasis: { xs: "100%", sm: "calc(50% - 8px)" }, minWidth: 0 }}
          actions={
            <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
              <Tooltip
                title={
                  structure.default
                    ? "Default for new jobs"
                    : "Make default for new jobs"
                }
                arrow
              >
                {/* A disabled button takes no pointer events, so the tooltip needs something
                    around it that still does. */}
                <span>
                  <IconButton
                    size="small"
                    disabled={structure.default}
                    onClick={() => {
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
                  onClick={() => {
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
          }
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              columnGap: 1,
              rowGap: 1,
            }}
          >
            {structureFacts(selectedJobType, structure, {
              systemNames,
              getSystemIndex,
            }).map(({ label, value }) => (
              <StructureFact key={label} label={label}>
                {value}
              </StructureFact>
            ))}
          </Box>
        </EntityRow>
      ))}
    </Box>
  );
}

/**
 * What a structure is worth saying, in the order a reader reads it. Each job type asks a different
 * question of a structure, so the facts differ rather than being blanked out.
 *
 * @returns {Array<{label: string, value: React.ReactNode}>}
 */
function structureFacts(
  selectedJobType,
  structure,
  { systemNames, getSystemIndex },
) {
  const structureType =
    structureTypeMap[selectedJobType][structure.structureType]?.label ||
    "\u2014";
  const tax = `${structure.tax || 0}%`;
  const security =
    systemTypeMap[selectedJobType][structure.systemType]?.label || "\u2014";
  const pairedRigs =
    [
      rigTypeMap[selectedJobType][structure.rigSlot1]?.label,
      rigTypeMap[selectedJobType][structure.rigSlot2]?.label,
    ]
      .filter((label) => label && label !== "None")
      .join(" \u00b7 ") || "\u2014";

  if (selectedJobType === jobTypes.reprocessing) {
    return [
      { label: "Structure type", value: structureType },
      { label: "Rigs", value: pairedRigs },
      { label: "Tax", value: tax },
      { label: "Security", value: security },
      {
        label: "Implant",
        value:
          Implants[selectedJobType]?.[structure.implant]?.label || "\u2014",
      },
    ];
  }

  if (selectedJobType === jobTypes.invention) {
    return [
      { label: "Structure type", value: structureType },
      { label: "Rigs", value: pairedRigs },
      { label: "Tax", value: tax },
      { label: "Security", value: security },
    ];
  }

  return [
    { label: "Structure type", value: structureType },
    {
      label: "Rig",
      value: rigTypeMap[selectedJobType][structure.rigType]?.label || "\u2014",
    },
    { label: "Tax", value: tax },
    { label: "Security", value: security },
    {
      label: "System",
      value: (
        <Tooltip
          title={`System index ${getSystemIndex(structure.systemID)}%`}
          arrow
          placement="top"
        >
          <Box component="span">
            {systemNames[structure.systemID] ?? UNKNOWN_SYSTEM_LABEL}
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              Index {getSystemIndex(structure.systemID) * 100}%
            </Typography>
          </Box>
        </Tooltip>
      ),
    },
  ];
}

/** One of a structure's facts, named above its value. */
function StructureFact({ label, children }) {
  return (
    <Box sx={{ flex: "1 1 30%", minWidth: 96 }}>
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
    </Box>
  );
}

export default CurrentStructuresFrame;
