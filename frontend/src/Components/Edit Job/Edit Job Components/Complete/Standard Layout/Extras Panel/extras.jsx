import { Grid } from "@mui/material";

import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import ExtrasEditor from "./extrasEditor";

/**
 * Extra costs as their own panel, which is how the Complete stage carries them.
 *
 * The Planning stage puts the same editor inside Cost Breakdown instead, beside
 * the line the extras total feeds.
 */
export function ExtrasPanel() {
  return (
    <ContentPanel title="Extra Costs" paperSx={{ height: "auto" }}>
      <Grid size={12}>
        <ExtrasEditor />
      </Grid>
    </ContentPanel>
  );
}
