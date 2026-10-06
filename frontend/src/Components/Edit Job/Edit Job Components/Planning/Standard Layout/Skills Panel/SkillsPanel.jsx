import { useMemo, useState } from "react";
import { Box, Chip, Link, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import {
  FIGURE_TONE,
  FigureCaption,
} from "../../../../../../Styled Components/Typography/figures";
import { useGetCharacterSkills } from "../../../../../../Hooks/EveEsi/Character/useGetCharacterSkills";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { groupJobSkills } from "../../../../../../Functions/Skills/jobSkillGroups";
import { quotedCharacterHash } from "../../../../../../Functions/Skills/quotedCharacter";
import { useJobSellingContext } from "../../../../../../Hooks/Planner/useJobSellingContext";
import { useSellingRates } from "../../../../../../Hooks/React Query/Character/useSellingRates";
import { readMarketPriceForType } from "../../../../../../Functions/MarketData/prices/marketPriceForType.js";
import { useMarketPricesQuery } from "../../../../../../Hooks/React Query/World/marketPrices";
import SkillsWhatIf from "./skillsWhatIf";
import { SkillLevelRow } from "../../../../../../Styled Components/Skills/SkillLevelRow";
import SkillsTimeEffect from "./skillsTimeEffect";
import { useJobCommitment } from "../../../../../../Hooks/Planner/useJobCommitment";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import { useSelectedSetup } from "../../../../Edit Job Hooks/useSelectedSetup";

/**
 * What this job asks of a character, what would make it quicker, and what selling it costs, each
 * group saying whose levels it quotes.
 */
export function SkillsPanel() {
  const selectedSetup = useSelectedSetup();
  const skills = useJobDraft((job) => job.skills);
  const jobType = useJobDraft((job) => job.jobType);
  const itemID = useJobDraft((job) => job.itemID);
  const buildCharacterHash = quotedCharacterHash(selectedSetup);
  const { seller, saleLocation } = useJobSellingContext();

  const findCharacterByHash = useUsersStore(
    (store) => store.account.actions.findCharacterByHash,
  );
  const buildCharacter = buildCharacterHash
    ? findCharacterByHash(buildCharacterHash)
    : null;

  const [proposed, setProposed] = useState({});

  const { surplus } = useJobCommitment();
  const soldAtID = saleLocation?.id;
  const wants = useMemo(
    () =>
      itemID == null || !soldAtID
        ? []
        : [{ typeID: itemID, marketLocation: soldAtID }],
    [itemID, soldAtID],
  );
  useMarketPricesQuery(wants);
  const build = useGetCharacterSkills(buildCharacterHash);
  const sell = useGetCharacterSkills(seller.hash);
  const { data: rates } = useSellingRates(saleLocation, seller.hash);

  if (!selectedSetup) return null;

  const groups = groupJobSkills({
    jobSkills: skills,
    characterSkills: build.data ?? null,
    jobType: jobType,
    saleLocation,
    sells: surplus > 0,
    proposed,
  });

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
      paperSx={{ height: "auto" }}
      isLoading={build.isLoading}
      isError={build.isError}
      error={build.error}
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
          setup={selectedSetup}
          jobSkills={skills}
          characterSkills={build.data ?? null}
          proposed={proposed}
        />

        {surplus > 0 && rates ? (
          <SkillsWhatIf
            brokerFee={rates.brokerFee}
            salesTax={rates.salesTax}
            listedValue={
              readMarketPriceForType(itemID, saleLocation?.id, "sell") * surplus
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
 * What a shortfall actually stops, so a red row states its consequence rather than leaving it to
 * the reader.
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
 * One skill with its state stripe: what it is, what it does here, and where the character stands.
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
    <SkillLevelRow
      name={row.name}
      caption={row.effect}
      level={row.level}
      required={row.required}
      proposed={row.proposed}
      onPropose={
        onPropose && row.level !== null
          ? (level) => onPropose(row.typeID, level)
          : undefined
      }
      value={levelText(row)}
      tone={tone}
      sx={{
        opacity: row.applies === false ? 0.6 : 1,
        px: 1,
        borderLeft: 3,
        borderLeftColor: rowAccent(row),
        bgcolor: (theme) => rowWash(theme, row),
      }}
    />
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
  if (row.proposed !== null) return `${row.level} → ${row.proposed}`;
  return row.required === null
    ? String(row.level)
    : `${row.level} / ${row.required}`;
}

/**
 * The stripe down a row, saying which of three states it is in; a level being tried is primary
 * rather than success, since it is not a state the character is in.
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
