import { formatNumberForLocale, formatTimeRemaining } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>
            Quantity:{" "}
            {formatNumberForLocale(job.build.products.totalQuantity, {
              max: 0,
            })}
          </p>
          <p>
            Job Setups: {formatNumberForLocale(job.setupCount(), { max: 0 })}
          </p>
        </span>
      );
    case 1:
      const totalComplete = job.totalCompletedMaterials();
      const totalRemaining = job.totalRemainingMaterials();

      if (!job.isReadyToBuild()) {
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
      const timeRemaining = sortJobs(job);

      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(job.apiJobs.size, { max: 0 })}
          </p>
          {job.apiJobs.size > 0 && (
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
            {formatNumberForLocale(job.build.products.totalQuantity, {
              max: 0,
            })}
          </p>
          <p>Item Cost: {formatNumberForLocale(job.totalCostPerItem())}</p>
        </span>
      );
    case 4:
      return (
        <span>
          <p>
            Market Orders:{" "}
            {formatNumberForLocale(job.apiOrders.size, { max: 0 })}
          </p>
          <p>
            Transactions:{" "}
            {formatNumberForLocale(job.apiTransactions.size, { max: 0 })}
          </p>
        </span>
      );
    default:
      return null;
  }
}

function sortJobs(job) {
  let tempJobs = [...job.build.costs.linkedJobs];
  if (tempJobs.length === 0) return null;

  tempJobs.sort((a, b) => {
    if (Date.parse(a.end_date) > Date.parse(b.end_date)) {
      return 1;
    }
    if (Date.parse(a.end_date) < Date.parse(b.end_date)) {
      return -1;
    }
    return 0;
  });
  return formatTimeRemaining(Date.parse(tempJobs[0].end_date));
}

export default getTooltipContent;
