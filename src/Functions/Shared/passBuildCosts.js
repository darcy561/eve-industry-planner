import uuid from "react-uuid";
import findOrGetJobObject from "../Helper/findJobObject";
import updateJobInFirebase from "../Firebase/updateJob";
import convertJobIDsToObjects from "../Helper/convertJobIDsToObjects";

async function passBuildCostsToParentJobs(
  jobsToPass,
  jobArray,
  userJobSnapshot,
  retrievedJobs
) {
  const matchedObjects = await convertJobIDsToObjects(
    jobsToPass,
    jobArray,
    retrievedJobs
  );

  const { collectedMaterials, parentJobMap } =
    collectMaterialsAndParentJobs(matchedObjects);

  const parentJobs = await findNeededParentJobs(
    parentJobMap,
    jobArray,
    retrievedJobs
  );

  const { successfulParentImportCount, priceItemsImportedCount } =
    distributeItemsBetweenParentJobs(
      collectedMaterials,
      parentJobs,
      parentJobMap,
      userJobSnapshot
    );
  await saveModifiedJobsToDatabase(parentJobs);

  return buildNotificationText(
    successfulParentImportCount,
    priceItemsImportedCount
  );
}

function collectMaterialsAndParentJobs(chosenJobs) {
  const collectedMaterials = {};
  const parentJobMap = {};

  for (let job of chosenJobs) {
    const materialID = job.itemID;
    const quantity = job.build.products.totalQuantity;
    const itemCost = job.totalCostPerItem();

    if (!collectedMaterials[materialID]) {
      collectedMaterials[materialID] = {
        totalQuantity: 0,
        costs: [],
      };
    }

    collectedMaterials[materialID].totalQuantity += quantity;

    const existingCostEntry = collectedMaterials[materialID].costs.find(
      (i) => i.cost === itemCost
    );

    if (existingCostEntry) {
      existingCostEntry.totalQuantity += quantity;
    } else {
      collectedMaterials[materialID].costs.push({
        id: job.jobID,
        cost: itemCost,
        quantity,
      });
    }

    for (const parentID of job.parentJob) {
      if (!parentJobMap[materialID]) {
        parentJobMap[materialID] = new Set();
      }

      parentJobMap[materialID].add(parentID);
    }
  }
  return { collectedMaterials, parentJobMap };
}

async function findNeededParentJobs(parentMap, jobArray, retrievedJobs) {
  const parentJobs = [];
  const parentJobPromises = [];

  for (const parentIDs of Object.values(parentMap)) {
    for (const parentID of parentIDs) {
      parentJobPromises.push(
        findOrGetJobObject(parentID, jobArray, retrievedJobs)
      );
    }
  }

  const resolvedPromises = await Promise.allSettled(parentJobPromises);

  for (const result of resolvedPromises) {
    if (
      result.status === "fulfilled" &&
      result.value &&
      !parentJobs.some((i) => i.jobID === result.value.jobID)
    ) {
      parentJobs.push(result.value);
    }
  }

  return parentJobs;
}

function distributeItemsBetweenParentJobs(
  collectedMaterials,
  parentJobs,
  parentMap,
  userJobSnapshot
) {
  const successfulParentImportCount = parentJobs.length;
  let priceItemsImportedCount = 0;

  for (const parentJob of parentJobs) {
    for (const materialID of Object.keys(collectedMaterials)) {
      if (!parentMap[materialID]?.has(parentJob.jobID)) continue;

      const material = parentJob.build.materials.find(
        (i) => i.typeID == materialID
      );
      if (!material) continue;
      const materialToImport = collectedMaterials[materialID];
      if (!materialToImport) continue;

      let remainingQuantityToPurchase =
        material.quantity - material.quantityPurchased;

      for (const costEntry of materialToImport.costs) {
        if (remainingQuantityToPurchase <= 0) break;

        if (costEntry.quantity <= 0) continue;

        if (isMaterialPurchased(material, costEntry.id, parentJob)) continue;

        const quantityAvailableToPurchase = Math.min(
          remainingQuantityToPurchase,
          costEntry.quantity
        );
        console.log(quantityAvailableToPurchase)
        priceItemsImportedCount++;
        if (quantityAvailableToPurchase > 0) {
          const purchaseObject = {
            id: uuid(),
            childID: costEntry.id,
            childJobImport: true,
            itemCount: quantityAvailableToPurchase,
            itemCost: costEntry.cost,
          };

          parentJob.addPurchaseCostToMaterial(materialID, purchaseObject);

          costEntry.quantity -= quantityAvailableToPurchase;
          remainingQuantityToPurchase -= quantityAvailableToPurchase;

          if (costEntry.quantity <= 0) {
            costEntry.quantity = 0;
          }
        }
      }
    }
    parentJob.updateJobSnapshot(userJobSnapshot);
  }
  return { successfulParentImportCount, priceItemsImportedCount };
}

async function saveModifiedJobsToDatabase(parentJobs) {
  const promises = parentJobs.map((job) => updateJobInFirebase(job));

  await Promise.allSettled(promises);
}

function buildNotificationText(
  successfulParentImportCount,
  priceItemsImportedCount
) {
  if (priceItemsImportedCount === 0) {
    return null;
  }

  let costLabel = "Cost";
  if (priceItemsImportedCount !== 1) {
    costLabel = "Costs";
  }

  let jobLabel = "Job";
  if (successfulParentImportCount !== 1) {
    jobLabel = "Jobs";
  }

  return `${priceItemsImportedCount} ${costLabel} Imported into ${successfulParentImportCount} ${jobLabel}.`;
}

function isMaterialPurchased(material, jobID, parentJob) {
  return (
    material.purchasing.some((i) => i.childID === jobID) &&
    parentJob.build.childJobs[material.typeID]?.includes(jobID)
  );
}

export default passBuildCostsToParentJobs;
