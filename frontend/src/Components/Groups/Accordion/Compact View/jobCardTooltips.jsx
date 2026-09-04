import { formatNumberForLocale, formatTimeRemaining } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>
            Quantity:{" "}
            {formatNumberForLocale(job.totalQuantityProduced, {
              max: 0,
            })}
          </p>
          <p>
            Job Setups: {formatNumberForLocale(job.setupCount, { max: 0 })}
          </p>
        </span>
      );
    case 1:
      const totalComplete = job.completedMaterialCount;
      const totalRemaining = job.remainingMaterialCount;

      if (!job.isReadyToBuild) {
        return (
          <span>
            <p>
              Awaiting Materials: {totalRemaining}/{job.build.materials.length}
            </p>
          </span>
        );
      }
      return <p>Ready To Build</p>;
    case 2:
      const timeRemaining = timeUntilNextJobFinishes(job);

      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(job.esiJobIDs.size, { max: 0 })}
          </p>
          {job.esiJobIDs.size > 0 && (
            <p>
              {timeRemaining === "Complete"
                ? "Complete"
                : `Ends In: ${timeRemaining}`}
            </p>
          )}
        </span>
      );
    case 3:
      return (
        <span>
          <p>
            Items Built:{" "}
            {formatNumberForLocale(job.totalQuantityProduced, {
              max: 0,
            })}
          </p>
          <p>Build Cost Per Item: {formatNumberForLocale(job.buildCostPerItem())}</p>
        </span>
      );
    case 4:
      return (
        <span>
          <p>
            Market Orders:{" "}
            {formatNumberForLocale(job.esiOrderIDs.size, { max: 0 })}
          </p>
          <p>
            Transactions:{" "}
            {formatNumberForLocale(job.esiTransactionIDs.size, { max: 0 })}
          </p>
        </span>
      );
    default:
      return null;
  }
}

function timeUntilNextJobFinishes(job) {
  const next = job.nextRunToFinish;
  return next ? formatTimeRemaining(next.finishesAt) : null;
}

export default getTooltipContent;
