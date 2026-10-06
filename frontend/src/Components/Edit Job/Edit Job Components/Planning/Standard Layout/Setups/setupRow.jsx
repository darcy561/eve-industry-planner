import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import { useQueryClient } from "@tanstack/react-query";
import { Figure } from "../../../../../../Styled Components/Typography/figures";
import ExpandableRow from "../../../../../../Styled Components/Paper/ExpandableRow";
import calculateTimeForSetup from "../../../../../../Functions/Blueprint Calculations/calculateTimeForSetup";
import { setupInstallCost } from "../../../../../../Functions/Installation Costs/installCosts";
import findSystemIndexForJob from "../../../../../../Functions/Helper/findSystemIndexValue";
import {
  countOf,
  formatNumberForLocale,
  formatPercentage,
  formatTimeDuration,
} from "../../../../../../Functions/Helper/numberParser";
import { facilityOf } from "../../../../../../Functions/Industry Facilities/setupFacility";
import { jobTypes } from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import { useFacilityWords } from "./useFacilityWords";
import MissingStructureNotice from "../../../../../../Styled Components/Item/missingStructureNotice";

/**
 * @param {object} setup
 * @returns {string}
 */
export function setupHeadline(setup) {
  return `${countOf(setup.runCount, "run")} × ${countOf(setup.jobCount, "slot")}`;
}

/**
 * @param {object} setup
 * @returns {number}
 */
export function systemIndexOf(setup) {
  return findSystemIndexForJob(
    setup.systemID,
    setup.jobType,
    setup.useAlternativeSystemIndexValue,
    setup.alternativeSystemIndexValue,
  );
}

function Departure({ setup, shared }) {
  const own = facilityOf(setup);
  const words = useFacilityWords(own, setup.jobType);
  const differs = (...fields) =>
    fields.some((field) => own[field] !== shared[field]);

  const changes = [
    ...(differs("customStructureID", "structureID")
      ? [`at ${words.name}`]
      : []),
    ...(differs("systemID") ? [`in ${words.system}`] : []),
    ...(differs("systemTypeID") ? [words.security] : []),
    ...(differs("rigSlot1", "rigSlot2") ? [`with ${words.rigs}`] : []),
    ...(differs("taxValue") ? [`at ${words.tax} facility tax`] : []),
  ];

  return (
    <>
      <Typography
        variant="caption"
        color="warning.main"
        sx={{ display: "block" }}
      >
        Builds {changes.join(", ")} instead — index{" "}
        {formatPercentage(systemIndexOf(setup), { places: 2 })}
      </Typography>
      {own.customStructureID && !words.saved ? (
        <MissingStructureNotice />
      ) : null}
    </>
  );
}

/**
 * One setup as a row that opens its editor: the runs leading, then who builds it and how, what it
 * contributes and what it costs to install.
 *
 * @param {object} props
 * @param {object} props.setup
 * @param {boolean} props.selected - The setup the stage's other panels read
 * @param {boolean} props.open - Its editor is showing
 * @param {object|null} props.departsFrom - The facility the rest of the job shares, when this one builds elsewhere
 * @param {(() => void)|null} props.onDelete - Absent on the last setup
 * @param {() => void} props.onToggle
 * @param {React.ReactNode} [props.drawer] - The editor, beneath the row; absent where it opens as a sheet
 */
export default function SetupRow({
  setup,
  selected,
  open,
  departsFrom,
  onDelete,
  onToggle,
  drawer,
}) {
  const queryClient = useQueryClient();
  const perRun = useJobDraft((job) => job.itemsProducedPerRun);
  const skills = useJobDraft((job) => job.skills);
  const itemID = useJobDraft((job) => job.itemID);
  const character = useUsersStore(
    (state) =>
      state.account.actions.findCharacterByHash(setup.selectedCharacter)
        ?.CharacterName,
  );
  const slotTime = calculateTimeForSetup(setup, skills, queryClient, itemID);
  const install = setupInstallCost(setup);

  const how = [
    character ?? "No matching character",
    ...(setup.jobType === jobTypes.manufacturing
      ? [`ME ${setup.ME}`, `TE ${setup.TE * 2}`]
      : []),
    ...(slotTime ? [`${formatTimeDuration(slotTime)} a slot`] : []),
  ].join(" · ");

  return (
    <ExpandableRow
      isOpen={open}
      onToggle={onToggle}
      selected={selected}
      showLabel={`Edit the setup of ${setupHeadline(setup)}`}
      hideLabel={`Close the setup of ${setupHeadline(setup)}`}
      drawer={drawer}
      sx={{ px: 1.5, py: 1 }}
      actions={
        onDelete ? (
          <Tooltip arrow title="Deletes this setup">
            <IconButton
              size="small"
              aria-label={`Delete the setup of ${setupHeadline(setup)}`}
              onClick={onDelete}
              sx={{
                display: { xs: "none", sm: "inline-flex" },
                color: "text.secondary",
                "&:hover": { color: "error.main" },
              }}
            >
              <ClearIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        ) : (
          <Box sx={{ width: 30, display: { xs: "none", sm: "block" } }} />
        )
      }
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0, flex: "1 1 220px" }}>
          <Figure sx={{ fontWeight: 500 }}>{setupHeadline(setup)}</Figure>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {how}
          </Typography>
          {departsFrom ? (
            <Departure setup={setup} shared={departsFrom} />
          ) : null}
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Figure sx={{ display: "block" }}>
            {countOf(perRun * setup.runCount * setup.jobCount, "item")}
          </Figure>
          <Typography variant="caption" color="text.secondary">
            {formatNumberForLocale(install, { max: 0 })} install
          </Typography>
        </Box>
      </Box>
    </ExpandableRow>
  );
}
