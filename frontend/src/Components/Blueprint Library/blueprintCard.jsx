import { useState } from "react";
import { Badge, Box, IconButton, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { appShellNestedCardSx } from "../../Context/appShell";
import { jobTypes } from "../../Context/defaultValues";
import blueprintHolderLabel, {
  blueprintOwner,
} from "../../Functions/Blueprints/blueprintHolderLabel";
import { stackCount } from "../../Functions/Blueprints/consolidateBlueprints";
import OwnerAvatar from "../../Styled Components/Avatar/OwnerAvatar";
import { Figure } from "../../Styled Components/Typography/figures";
import { ActiveBPPopout } from "./ActiveBPPout";
import { blueprintAccentColour } from "./blueprintStatus";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";

/**
 * How much room a card is given. The two library views differ in this and nothing else.
 *
 * `columns` is the panel's grid template rather than the card's, because it is the panel that
 * decides how many fit across. Both use `auto-fit`, which collapses the tracks it cannot fill so a
 * panel holding one card gives that card the whole row — `auto-fill` leaves the empty tracks in
 * place and strands the card at the left.
 *
 * @type {Readonly<Record<string, {art: number, owner: number, figure: number, stackedFigures: boolean, padding: number, columns: string}>>}
 */
/** Research levels, runs and counts are whole; the formatter's two decimals are for ISK. */
const WHOLE = { max: 0 };

export const BLUEPRINT_CARD_DENSITY = Object.freeze({
  STANDARD: {
    art: 64,
    owner: 24,
    figure: 76,
    stackedFigures: true,
    padding: 1.5,
    columns: "1fr",
  },
  COMPACT: {
    art: 40,
    owner: 18,
    figure: 64,
    stackedFigures: false,
    padding: 1,
    columns: "repeat(auto-fit, minmax(240px, 1fr))",
  },
});

/**
 * One card in a blueprint panel: a shelf of interchangeable blueprints, or a single one with a job
 * running on it.
 *
 * @param {{
 *   stack: import("../../Functions/Blueprints/consolidateBlueprints").BlueprintStack,
 *   bpData?: {jobType: number},
 *   locationName?: string,
 *   isRelic?: boolean,
 *   density?: typeof BLUEPRINT_CARD_DENSITY.STANDARD
 * }} props
 */
export default function BlueprintCard({
  stack,
  bpData,
  locationName,
  isRelic = false,
  density = BLUEPRINT_CARD_DENSITY.COMPACT,
}) {
  const [popoverAnchor, setPopoverAnchor] = useState(null);
  const { blueprint, esiJob } = stack;

  const held = stackCount(stack);
  // A relic is served only as `relic`; asking for its `bp` or `bpc` is answered with a 400.
  const kind = isRelic ? "relic" : blueprint.isCopy ? "bpc" : "bp";
  const isManufacturing = bpData?.jobType === jobTypes.manufacturing;

  return (
    <Box
      sx={[
        appShellNestedCardSx,
        {
          // Not the `border` shorthand: it would reset the tinted colour the token sets.
          borderWidth: 1,
          borderStyle: "solid",
          padding: density.padding,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          // The stripe is the card's leading edge rather than a bar beneath it, so a shelf being
          // built is picked out down a column of cards without costing a row of height.
          borderLeftWidth: 3,
          borderLeftColor: blueprintAccentColour(
            esiJob,
            blueprint.isCopy,
            blueprint.runs,
            bpData?.jobType,
          ),
        },
      ]}
    >
      <Tooltip
        title={blueprintHolderLabel(blueprint, locationName)}
        arrow
        placement="top"
      >
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={
            <OwnerAvatar
              owner={blueprintOwner(blueprint)}
              size={density.owner}
            />
          }
        >
          <EveImageAvatar
            type={blueprint.typeId}
            variation={kind}
            size={density.art}
            variant="rounded"
          />
        </Badge>
      </Tooltip>

      {/* Spread across whatever width the card has, so the figures line up down the panel rather
          than bunching at the left. */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${density.figure}px, 1fr))`,
          columnGap: 1,
          rowGap: 0.25,
        }}
      >
        {isManufacturing && (
          <>
            <LabelledFigure
              label="M.E"
              value={blueprint.me}
              density={density}
            />
            <LabelledFigure
              label="T.E"
              value={blueprint.te}
              density={density}
            />
          </>
        )}
        {blueprint.runs !== -1 && (
          <LabelledFigure
            label="Runs"
            value={blueprint.runs}
            density={density}
          />
        )}
        <LabelledFigure label="Held" value={held} density={density} />
      </Box>

      {esiJob && (
        <Tooltip title="Job details" arrow placement="bottom">
          <IconButton
            size="small"
            color="primary"
            sx={{ flexShrink: 0 }}
            aria-label={`Job details for ${blueprintHolderLabel(blueprint, locationName)}`}
            onClick={(event) => setPopoverAnchor(event.currentTarget)}
          >
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {esiJob && (
        <ActiveBPPopout
          blueprint={blueprint}
          esiJob={esiJob}
          displayPopover={popoverAnchor}
          updateDisplayPopover={setPopoverAnchor}
        />
      )}
    </Box>
  );
}

/**
 * One of a card's figures, under its label or beside it depending on the density.
 */
function LabelledFigure({ label, value, density }) {
  if (!density.stackedFigures) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: "nowrap" }}
      >
        {label}:{" "}
        <Figure variant="caption" formatOptions={WHOLE}>
          {value}
        </Figure>
      </Typography>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", lineHeight: 1.2 }}
      >
        {label}
      </Typography>
      <Figure sx={{ lineHeight: 1.3 }} formatOptions={WHOLE}>
        {value}
      </Figure>
    </Box>
  );
}
