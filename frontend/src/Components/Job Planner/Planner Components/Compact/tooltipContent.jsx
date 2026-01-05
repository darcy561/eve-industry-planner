import { formatNumberForLocale, formatTimeRemaining } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>Job Setups: {job.totalSetupCount}</p>
        </span>
      );
    case 1:
      if (job.totalComplete < job.totalMaterials) {
        return (
          <span>
            <p>
              Awaiting Materials: {job.totalMaterials - job.totalComplete}/
              {job.totalMaterials}
            </p>
          </span>
        );
      }
      return <p>Ready To Build</p>;
    case 2:
      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(job.apiJobs.size, { max: 0 })}
          </p>
          {job.apiJobs.size > 0 && (
            <p>
              {formatTimeRemaining(Date.parse(job.end_date)) === "Complete"
                ? "Complete"
                : `Ends In: ${formatTimeRemaining(Date.parse(job.end_date))}`}
            </p>
          )}
        </span>
      );
    case 3:
      return (
        <span>
          <p>
            Items Built: {formatNumberForLocale(job.itemQuantity, { max: 0 })}
          </p>
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
            {formatNumberForLocale(job.apiTransactions.size, { max: 0 })}{" "}
          </p>
        </span>
      );
    default:
      return null;
  }
}

export default getTooltipContent;
