import { Chip, Fade, Tooltip } from "@mui/material";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";

/**
 * Says when more of a material was bought than the job needs.
 *
 * The job is charged for what it needed at the best prices paid, so the extra
 * sits on the card rather than in the cost.
 *
 * @param {Object} props
 * @param {import("../../../../../../Classes/jobMaterial").default} props.material
 */
export function MaterialExcessBox_Purchasing({ material }) {
  const excess = material.excessQuantity;

  return (
    <Fade in={excess > 0} unmountOnExit>
      <Tooltip
        title={`${numberToShortText(material.quantityImported, 0)} bought for a job needing ${numberToShortText(material.quantity, 0)}. The extra is not charged to this job.`}
        arrow
        placement="top"
      >
        <Chip
          size="small"
          variant="outlined"
          color="secondary"
          label={`${formatNumberForLocale(excess, { max: 0 })} extra`}
          sx={{ marginTop: 1, marginLeft: "auto", marginRight: "auto" }}
        />
      </Tooltip>
    </Fade>
  );
}
