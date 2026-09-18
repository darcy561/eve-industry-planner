import { useState } from "react";
import { Box, Chip, Link, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import {
  FIGURE_TONE,
  Figure,
  FigureCaption,
} from "../../../../../../Styled Components/Typography/figures";
import { useGetCharacterSkills } from "../../../../../../Hooks/EveEsi/Character/useGetCharacterSkills";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { groupJobSkills } from "../../../../../../Functions/Skills/jobSkillGroups";
import { quotedCharacterHash } from "../../../../../../Functions/Skills/quotedCharacter";
import { useJobSellingContext } from "../../../../../../Hooks/Planner/useJobSellingContext";
import { useSellingRates } from "../../../../../../Hooks/React Query/Character/useSellingRates";
import { getMarketPriceForType } from "../../../../../../Functions/MarketData/marketPriceForType";
import SkillsWhatIf from "./skillsWhatIf";
import SkillLevelPips from "./skillLevelPips";
import SkillsTimeEffect from "./skillsTimeEffect";
import { useJobCommitment } from "../../../../../../Hooks/Planner/useJobCommitment";

/**
 * What this job asks of a character, what would make it quicker, and what makes
 * selling it cost what it does.
 *
 * The three are read from different characters — the build character runs the
 * job, the seller lists the order — so each group says whose levels it is
 * quoting.
 *
 * @param {object} props
 * @param {object} props.state - Edit Job state
 * @param {object} props.actions - Edit Job actions
 */
export function SkillsPanel({ state, actions }) {
  const { activeJob } = state;
  const buildCharacterHash = quotedCharacterHash(activeJob.selectedSetup);
  const { seller, saleLocation } = useJobSellingContext(activeJob);

  const findCharacterByHash = useUsersStore(
    (store) => store.account.actions.findCharacterByHash,
  );
  const buildCharacter = buildCharacterHash
    ? findCharacterByHash(buildCharacterHash)
    : null;

  // A level being tried is a question, not a plan: it lives here and reaches no
  // store, no document and no other panel.
  const [proposed, setProposed] = useState({});

  // A job whose output is owed to its parents never lists anything, so what
  // selling would cost is not a question it has.
  const { surplus } = useJobCommitment({ state, actions });
  const build = useGetCharacterSkills(buildCharacterHash);
  const sell = useGetCharacterSkills(seller.hash);
  const { data: rates } = useSellingRates(saleLocation, seller.hash);

  if (!activeJob.selectedSetup) return null;

  const groups = groupJobSkills({
    jobSkills: activeJob.skills,
    characterSkills: build.data ?? null,
    jobType: activeJob.jobType,
    saleLocation,
    sells: surplus > 0,
    proposed,
  });

  // Selling is the seller's skills, not the builder's, so that group is quoted
  // from a different read.
  const sellingSkills = sell.data ?? null;
  const quotedFor = {
    required: buildCharacter?.CharacterName,
    buildTime: buildCharacter?.CharacterName,
    selling: seller.name,
  };

  return (
    <AppShellPanel
      title="Skills"
      componentName="SkillsPanel"
      // AppShellPanel fills its parent by default, which is meant for panels
      // sharing a grid row. These are stacked, so each takes its own height.
      paperSx={{ height: "auto" }}
      isLoading={build.isLoading}
      isError={build.isError}
      error={build.error}
      // Always present, even with nothing to say. The header's columns and its
      // height both depend on whether there is an action at all, so letting it
      // appear on the first click changes the panel's shape underneath the
      // control being clicked.
      action={
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", minHeight: 24 }}
        >
          {Object.keys(proposed).length > 0 ? (
            <>
              <Chip label="What-if" size="small" color="primary" />
              <Link
                component="button"
                type="button"
                underline="hover"
                variant="caption"
                onClick={() => setProposed({})}
              >
                Reset
              </Link>
            </>
          ) : null}
        </Stack>
      }
    >
      <Stack spacing={2}>
        {groups.map((group) => (
          <SkillGroup
            key={group.id}
            group={group}
            characterName={quotedFor[group.id]}
            sellingSkills={sellingSkills}
            onPropose={(typeID, level) =>
              setProposed((was) => {
                const next = { ...was };
                if (level === null) delete next[typeID];
                else next[typeID] = level;
                return next;
              })
            }
          />
        ))}

        <SkillsTimeEffect
          setup={activeJob.selectedSetup}
          jobSkills={activeJob.skills}
          characterSkills={build.data ?? null}
          proposed={proposed}
        />

        {surplus > 0 && rates ? (
          <SkillsWhatIf
            brokerFee={rates.brokerFee}
            salesTax={rates.salesTax}
            listedValue={
              getMarketPriceForType(
                activeJob.itemID,
                saleLocation?.priceHubID,
                "sell",
              ) * surplus
            }
            quantity={surplus}
            proposed={proposed}
          />
        ) : null}
      </Stack>
    </AppShellPanel>
  );
}

/**
 * @param {object} props
 */
function SkillGroup({ group, characterName, sellingSkills, onPropose }) {
  if (group.rows.length === 0) return null;

  return (
    <Box>
      <FigureCaption>
        {group.label}
        {group.requirement
          ? ` — ${group.requirement.met} of ${group.requirement.total} met`
          : ""}
      </FigureCaption>
      {characterName ? (
        <Typography variant="caption" color="text.secondary">
          {characterName}
        </Typography>
      ) : null}
      <Stack sx={{ mt: 0.5 }}>
        {group.rows.map((row) => (
          <SkillRow
            key={`${group.id}-${row.typeID}`}
            row={
              group.id === "selling" && sellingSkills
                ? { ...row, level: sellingSkills[row.typeID]?.activeLevel ?? 0 }
                : row
            }
            onPropose={onPropose}
          />
        ))}
      </Stack>

      {group.requirement ? (
        <RequirementImpact requirement={group.requirement} />
      ) : null}
    </Box>
  );
}

/**
 * What a shortfall actually stops.
 *
 * A red row saying "2 / 4" leaves the reader to work out the consequence for
 * themselves; this is the consequence.
 *
 * @param {object} props
 */
function RequirementImpact({ requirement }) {
  const { short } = requirement;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: 1,
        flexWrap: "wrap",
        mt: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
      }}
    >
      <Typography
        variant="caption"
        color={short.length === 0 ? "success.main" : "error.main"}
      >
        {short.length === 0 ? "Job can be run" : "Job cannot start"}
      </Typography>
      {short.length > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {shortfallText(short)}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * @param {import("../../../../../../Functions/Skills/jobSkillGroups").SkillRow[]} short
 */
function shortfallText(short) {
  if (short.length === 1) {
    const [only] = short;
    const missing = only.required - (only.proposed ?? only.level ?? 0);
    return `${only.name} needs ${missing} more ${missing === 1 ? "level" : "levels"}`;
  }
  return `${short.length} skills short`;
}

/**
 * One skill: what it is, what it does here, and where the character stands.
 *
 * @param {object} props
 */
function SkillRow({ row, onPropose }) {
  const tone =
    row.proposed !== null || row.required === null
      ? FIGURE_TONE.PLAIN
      : row.met
        ? FIGURE_TONE.GOOD
        : FIGURE_TONE.BAD;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 2,
        py: 0.5,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
        opacity: row.applies === false ? 0.6 : 1,
        px: 1,
        borderLeft: 3,
        borderLeftColor: rowAccent(row),
        bgcolor: (theme) => rowWash(theme, row),
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{row.name}</Typography>
        {row.effect ? (
          <Typography variant="caption" color="text.secondary">
            {row.effect}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
      >
        <SkillLevelPips
          level={row.level}
          required={row.required}
          proposed={row.proposed}
          name={row.name}
          onPropose={
            onPropose && row.level !== null
              ? (level) => onPropose(row.typeID, level)
              : undefined
          }
        />
        <Figure tone={tone} sx={{ minWidth: 44, textAlign: "right" }}>
          {levelText(row)}
        </Figure>
      </Box>
    </Box>
  );
}

/**
 * A level of zero for a character the app cannot read is a claim, not a figure —
 * signed out, the requirement is stated and the level left blank.
 *
 * @param {import("../../../../../../Functions/Skills/jobSkillGroups").SkillRow} row
 */
function levelText(row) {
  if (row.level === null)
    return row.required === null ? null : `needs ${row.required}`;
  // A level being tried is stated as a move from the real one, so the figure it
  // replaces stays visible beside it.
  if (row.proposed !== null) return `${row.level} → ${row.proposed}`;
  return row.required === null
    ? String(row.level)
    : `${row.level} / ${row.required}`;
}

/**
 * The stripe down a row, saying which of three states it is in.
 *
 * A level being tried is drawn in the primary colour rather than success: it is
 * not a state the character is in, and colouring a hypothetical green would read
 * as achieved.
 *
 * @param {import("../../../../../../Functions/Skills/jobSkillGroups").SkillRow} row
 */
function rowAccent(row) {
  if (row.proposed !== null) return "primary.main";
  if (row.required === null) return "transparent";
  return row.met ? "success.main" : "error.main";
}

/**
 * @param {object} theme
 * @param {import("../../../../../../Functions/Skills/jobSkillGroups").SkillRow} row
 */
function rowWash(theme, row) {
  if (row.proposed !== null) return alpha(theme.palette.primary.main, 0.1);
  if (row.required === null) return "transparent";
  return alpha(
    row.met ? theme.palette.success.main : theme.palette.error.main,
    0.09,
  );
}
