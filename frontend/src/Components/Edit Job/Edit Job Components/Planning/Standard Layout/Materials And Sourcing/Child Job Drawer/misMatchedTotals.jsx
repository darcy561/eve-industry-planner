import { Alert, AlertTitle, Typography } from "@mui/material";

import { shortfallWording } from "../../../../../../../Functions/Groups/childJobCoverage";
import {
  formatIsk,
  formatQuantity,
} from "../../../../../../../Functions/Helper/numberParser";

/**
 * Says when the child job no longer makes what the parent needs.
 *
 * A child job is sized to the requirement when it is created and not again until
 * the parent is closed, so any change to the parent's runs, efficiency or setup
 * leaves it short. Until it is resized the row's cost is partly a guess, and the
 * player is the only one who can decide whether to resize the job or buy the
 * difference — so this states the shortfall rather than quietly absorbing it.
 *
 * @param {object} props
 * @param {import("../../../../../../../Functions/Groups/childJobCoverage").ChildJobCoverage} [props.coverage]
 */
export function DisplayMismatchedChildTotals({ coverage }) {
  if (!coverage?.isShort) return null;

  const { required, produced, shortfall } = coverage;
  const short = formatQuantity(shortfall);

  return (
    <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
      <AlertTitle sx={{ fontSize: "0.85rem" }}>
        The child job is {short} short
      </AlertTitle>
      <Typography variant="caption" sx={{ display: "block" }}>
        It makes {formatQuantity(produced)} of the {formatQuantity(required)}{" "}
        this job needs.
      </Typography>
      <Typography variant="caption" sx={{ display: "block" }}>
        {shortfallWording(coverage, formatQuantity, formatIsk)}
      </Typography>
    </Alert>
  );
}
