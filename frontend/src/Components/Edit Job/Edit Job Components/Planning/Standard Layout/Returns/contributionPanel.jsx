import { Stack, Typography } from "@mui/material";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import {
  ContextRow,
  HeadlineStat,
  PanelHeadline,
} from "../../../../../../Styled Components/Typography/figures";
import {
  formatNumberForLocale,
  formatPercentage,
} from "../../../../../../Functions/Helper/numberParser";

/**
 * What this job's output is worth to the jobs above it.
 *
 * A job with parents is building to order: that output is committed and never
 * listed, so it has no sale price, no broker fee and no tax. Quoting them would
 * invite a player to read a profit that does not exist. What it has instead is
 * the comparison its parent is making — build it here, or buy it at market —
 * stated from the child's side.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/Groups/parentRequirements").ParentCommitment} props.commitment
 * @param {number} props.contributedCost - What the committed output cost to make
 * @param {number} props.marketPrice - Unit price the parent would otherwise pay.
 *   Sell-side at this job's own hub: a parent buying the material pays the ask.
 *   Where the parent prices that material on another order type or hub, its own delta
 *   column will differ from this by that much.
 */
export default function ContributionPanel({
  commitment,
  contributedCost,
  marketPrice,
}) {
  if (!commitment?.hasParents || commitment.committed <= 0) return null;

  const atMarket = marketPrice * commitment.committed;
  const saving = atMarket - contributedCost;
  // Against what the parent would otherwise pay, which is the figure its own
  // delta column compares.
  const share = atMarket > 0 ? saving / atMarket : null;

  return (
    <AppShellPanel
      title="Contribution"
      componentName="ContributionPanel"
      // AppShellPanel fills its parent by default, which is meant for panels
      // sharing a grid row. These are stacked, so each takes its own height.
      paperSx={{ height: "auto" }}
    >
      <Stack spacing={2}>
        <PanelHeadline
          aside={
            <HeadlineStat
              caption="If bought at market"
              size="beside"
              value={formatNumberForLocale(atMarket)}
            />
          }
        >
          <HeadlineStat
            caption="Cost contributed"
            value={formatNumberForLocale(contributedCost)}
          />
        </PanelHeadline>

        <Stack>
          <ContextRow
            note={
              share === null
                ? null
                : `${formatPercentage(Math.abs(share))} of it`
            }
          >
            {saving >= 0
              ? `Building it here saves ${formatNumberForLocale(saving)} against buying it`
              : `Building it here costs ${formatNumberForLocale(-saving)} more than buying it`}
          </ContextRow>

          <ContextRow
            note={
              commitment.surplus > 0
                ? `${formatNumberForLocale(commitment.surplus, { max: 0 })} spare`
                : null
            }
          >
            {formatNumberForLocale(commitment.committed, { max: 0 })} of what
            this job makes is owed to the jobs above it
          </ContextRow>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Committed output is never listed, so it carries no broker fee and no
          sales tax.
        </Typography>
      </Stack>
    </AppShellPanel>
  );
}
