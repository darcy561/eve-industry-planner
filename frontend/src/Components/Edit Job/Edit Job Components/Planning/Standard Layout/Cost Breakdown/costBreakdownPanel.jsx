import { useState } from "react";
import { Stack, useTheme } from "@mui/material";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import { ProportionBar } from "../../../../../../Styled Components/Charts";
import {
  HeadlineStat,
  PanelHeadline,
} from "../../../../../../Styled Components/Typography/figures";
import { formatIsk } from "../../../../../../Functions/Helper/numberParser";
import CostTable from "./costTable";
import { costParts } from "./costParts";

/**
 * What the build costs, and what each part of that is.
 *
 * One pricing model at a time, named in the header, so every figure beneath it
 * has one meaning.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/Job/costBreakdown.js").CostBreakdown} props.cost
 * @param {React.ReactNode} [props.aside] - Shown beside the headline figure
 * @param {React.ReactNode} [props.children] - Shown under the table
 * @param {React.ReactNode} [props.action] - Shown in the panel header
 */
export default function CostBreakdownPanel({ cost, aside, action, children }) {
  const theme = useTheme();
  // Which part of the cost is being looked at. The bar shows the shape and the
  // table states the figures, and on a build with six components it is not
  // obvious which line a segment belongs to — so looking at one marks the other.
  const [activeId, setActiveId] = useState(null);

  if (!cost) return null;

  return (
    <AppShellPanel
      title="Cost Breakdown"
      componentName="CostBreakdownPanel"
      // AppShellPanel fills its parent by default, which is meant for panels
      // sharing a grid row. These are stacked, so each takes its own height.
      paperSx={{ height: "auto" }}
      action={action}
    >
      <Stack spacing={2}>
        <PanelHeadline aside={aside}>
          <HeadlineStat
            caption="Cost per unit"
            value={cost.perUnit === null ? null : formatIsk(cost.perUnit)}
          />
        </PanelHeadline>

        {/* The shape of the cost before its figures: which band dominates is
            readable here in a glance, and the dots in the table say which row
            is which segment. */}
        <ProportionBar
          parts={costParts(cost, theme)}
          describe={(part) => `${part.label} — ${formatIsk(part.value)}`}
          activeId={activeId}
          onActivePart={setActiveId}
        />

        <CostTable
          cost={cost}
          formatIsk={formatIsk}
          activeId={activeId}
          onActivePart={setActiveId}
        />

        {children}
      </Stack>
    </AppShellPanel>
  );
}
