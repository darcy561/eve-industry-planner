import { Tooltip, Typography, Grid } from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

export function JobCostSummaryPanel({ state }) {
  return (
    <ContentPanel componentName="Job Cost Summary Panel">
      <Grid container spacing={1} sx={{ flexDirection: "row" }}>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Material Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.totalMaterialCost())}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Tooltip title="Calculated from linked jobs only, add any unlinked jobs manually as an extra.">
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                Total Install Costs:
              </Typography>
            </Tooltip>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.totalInstallCost())}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Extras:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}
            sx={{ marginBottom: 1 }}
          >
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.totalExtrasCost())}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Invention Costs:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}
            sx={{ marginBottom: 1 }}
          >
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.totalInventionCost())}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Build Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.buildCost())}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Items Built:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(
                state.activeJob.totalQuantityProduced(),
                { max: 0 }
              )}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Build Cost Per Item:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(state.activeJob.buildCostPerItem())}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
