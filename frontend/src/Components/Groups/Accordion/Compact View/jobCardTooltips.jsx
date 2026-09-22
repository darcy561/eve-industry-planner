import {
  buildCostPerItem,
  esiJobIDs,
  esiOrderIDs,
  esiTransactionIDs,
  setupCount,
  totalQuantityProduced,
} from "../../../Edit Job/Edit Job Hooks/jobSelectors";
import {
  formatNumberForLocale,
  formatTimeRemaining,
} from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job, now) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>
            Quantity:{" "}
            {formatNumberForLocale(totalQuantityProduced(job), {
              max: 0,
            })}
          </p>
          <p>
            Job Setups: {formatNumberForLocale(setupCount(job), { max: 0 })}
          </p>
        </span>
      );
    case 1: {
      const totalRemaining = job.remainingMaterialCount;

      if (!job.isReadyToBuild) {
        return (
          <span>
            <p>
              Awaiting Materials: {totalRemaining}/
              {Object.keys(job.build.materials).length}
            </p>
          </span>
        );
      }
      return <p>Ready To Build</p>;
    }
    case 2: {
      const timeRemaining = timeUntilNextJobFinishes(job, now);
      const linkedRunCount = esiJobIDs(job).size;

      return (
        <span>
          <p>
            ESI Jobs Linked: {formatNumberForLocale(linkedRunCount, { max: 0 })}
          </p>
          {linkedRunCount > 0 && (
            <p>
              {timeRemaining === "Complete"
                ? "Complete"
                : `Ends In: ${timeRemaining}`}
            </p>
          )}
        </span>
      );
    }
    case 3:
      return (
        <span>
          <p>
            Items Built:{" "}
            {formatNumberForLocale(totalQuantityProduced(job), {
              max: 0,
            })}
          </p>
          <p>
            Build Cost Per Item: {formatNumberForLocale(buildCostPerItem(job))}
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
            {formatNumberForLocale(esiTransactionIDs(job).size, { max: 0 })}
          </p>
        </span>
      );
    default:
      return null;
  }
}

function timeUntilNextJobFinishes(job, now) {
  const next = job.nextRunToFinish;
  return next ? formatTimeRemaining(next.finishesAt, { now }) : null;
}

export default getTooltipContent;
