import { Tooltip, Typography, Grid } from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

export function BuildStatsPanel({ state }) {
  return (
    <ContentPanel componentName="Build Stats Panel">
      <Grid container direction="row" spacing={1}>
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
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost
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
              {formatNumberForLocale(state.activeJob.build.costs.installCosts)}
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
              {formatNumberForLocale(state.activeJob.build.costs.extrasTotal)}
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
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost +
                state.activeJob.build.costs.installCosts +
                state.activeJob.build.costs.extrasTotal
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
                state.activeJob.build.products.totalQuantity,
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
              Cost per item:
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
                Math.round(
                  ((state.activeJob.build.costs.extrasTotal +
                    state.activeJob.build.costs.installCosts +
                    state.activeJob.build.costs.totalPurchaseCost) /
                    state.activeJob.build.products.totalQuantity +
                    Number.EPSILON) *
                  100
                ) / 100
              )}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
