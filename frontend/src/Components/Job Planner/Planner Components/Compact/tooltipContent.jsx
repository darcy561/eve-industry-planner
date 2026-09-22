import {
  completedMaterialCount,
  setupCount,
  totalQuantityProduced,
} from "../../../Edit Job/Edit Job Hooks/jobSelectors";
import {
  esiJobIDs,
  esiOrderIDs,
  esiTransactionIDs,
} from "../../../Edit Job/Edit Job Hooks/jobSelectors";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>Job Setups: {setupCount(job)}</p>
        </span>
      );
    case 1: {
      const totalMaterials = Object.keys(job.build.materials).length;
      const totalComplete = completedMaterialCount(job);
      if (!job.isReadyToBuild) {
        return (
          <span>
            <p>
              Awaiting Materials: {totalMaterials - totalComplete}/
              {totalMaterials}
            </p>
          </span>
        );
      }
      return <p>Ready To Build</p>;
    }
    case 2:
      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(esiJobIDs(job).size, { max: 0 })}
          </p>
        </span>
      );
    case 3:
      return (
        <span>
          <p>
            Items Built:{" "}
            {formatNumberForLocale(totalQuantityProduced(job), { max: 0 })}
          </p>
        </span>
      );
    case 4:
      return (
        <span>
          <p>
            Market Orders:{" "}
            {formatNumberForLocale(esiOrderIDs(job).size, { max: 0 })}
          </p>
          <p>
            Transactions:{" "}
            {formatNumberForLocale(esiTransactionIDs(job).size, {
              max: 0,
            })}{" "}
          </p>
        </span>
      );
    default:
      return null;
  }
}

export default getTooltipContent;
