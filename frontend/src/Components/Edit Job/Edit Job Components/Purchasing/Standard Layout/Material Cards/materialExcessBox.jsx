import { Chip, Fade, Tooltip } from "@mui/material";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";
import { useMaterialFigures } from "../../../../Edit Job Hooks/useMaterialFigures";

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
  const { excess, imported, needed } = useMaterialFigures(material);

  return (
    <Fade in={excess > 0} unmountOnExit>
      <Tooltip
        title={`${numberToShortText(imported, 0)} bought for a job needing ${numberToShortText(needed, 0)}. The extra is not charged to this job.`}
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
