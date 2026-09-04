import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";

function getTooltipContent(job) {
  switch (job.jobStatus) {
    case 0:
      return (
        <span>
          <p>Job Setups: {job.setupCount}</p>
        </span>
      );
    case 1:
      const totalMaterials = job.build.materials.length;
      const totalComplete = job.completedMaterialCount;
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
    case 2:
      return (
        <span>
          <p>
            ESI Jobs Linked:{" "}
            {formatNumberForLocale(job.esiJobIDs.size, { max: 0 })}
          </p>

        </span>
      );
    case 3:
      return (
        <span>
          <p>
            Items Built: {formatNumberForLocale(job.totalQuantityProduced, { max: 0 })}
          </p>
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
            {formatNumberForLocale(job.esiTransactionIDs.size, { max: 0 })}{" "}
          </p>
        </span>
      );
    default:
      return null;
  }
}

export default getTooltipContent;
