import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import { shortfallWording } from "../../../../../../Functions/Groups/childJobCoverage";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

/**
 * Says on the row that the jobs building this material no longer make enough of
 * it, and which ones.
 *
 * The drawer states the shortfall in full, but a row has to be opened to reach
 * it — and a player with thirty materials has no reason to open the one that
 * drifted. So the row carries the fact and the tooltip carries the jobs, which
 * is what a reader needs to know where to go next.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/Groups/childJobCoverage").ChildJobCoverage} [props.coverage]
 * @param {Array<object>} [props.childJobs] - The jobs behind the row, for naming
 */
export default function ShortfallChip({ coverage, childJobs = [] }) {
  if (!coverage?.isShort) return null;

  const short = formatNumberForLocale(coverage.shortfall, { max: 0 });

  return (
    <ExplainerTooltip title={explain(coverage, childJobs)}>
      <StatusChip label={`${short} short`} tone={STATUS_TONE.WARN} />
    </ExplainerTooltip>
  );
}

/**
 * @param {import("../../../../../../Functions/Groups/childJobCoverage").ChildJobCoverage} coverage
 * @param {Array<object>} childJobs
 * @returns {string}
 */
function explain(coverage, childJobs) {
  const named =
    childJobs.length > 0
      ? childJobs
          .map((job) => job.name)
          .filter(Boolean)
          .join(", ")
      : "The linked job";

  const makes = `${named} makes ${quantity(coverage.produced)} of the ${quantity(coverage.required)} needed.`;

  return `${makes} ${shortfallWording(coverage, quantity)}`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function quantity(value) {
  return formatNumberForLocale(value, { max: 0 });
}
