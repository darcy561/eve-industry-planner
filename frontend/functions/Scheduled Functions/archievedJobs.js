import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
} from "../global-config-functions.js";
import { log, error } from "firebase-functions/logger";

/**
 * Scheduled Firebase Cloud Function for processing archived industry jobs.
 * 
 * This function runs every hour to process completed industry jobs and generate statistics:
 * - Queries Firestore for unprocessed archived jobs across all users
 * - Calculates comprehensive job statistics (costs, profits, sales data)
 * - Aggregates data into user-specific build statistics
 * - Updates both individual job records and aggregate statistics
 * - Uses Firestore batch operations for efficient database updates
 * 
 * Schedule: Every hour
 * Timeout: 9 minutes (540 seconds)
 * 
 * @function archievedJobs
 * @param {Object} event - Scheduled event object from Firebase Scheduler
 * @returns {Promise<null>} Always returns null
 * 
 * @example
 * // Function runs automatically via Firebase Scheduler
 * // Processes archived jobs and updates build statistics
 */
export default onSchedule(
  {
    schedule: "every 1 hours",
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      const db = getFirestore();
      const snapshot = await db
        .collectionGroup("ArchivedJobs")
        .where("archiveProcessed", "==", false)
        .get();

      if (snapshot.empty) {
        log("0 Archived Jobs To Process");
        return null;
      }

      const batch = db.batch();
      let processedCount = 0;

      for (const doc of snapshot.docs) {
        const job = doc.data();
        const userId = doc.ref.parent.parent.id;

        const brokersFeesTotal = job.build.sale.brokersFee.reduce(
          (total, item) => total + item.amount,
          0
        );
        const { transactionFeeTotal, totalSale, averageQuantity } =
          job.build.sale.transactions.reduce(
            (totals, item) => ({
              transactionFeeTotal: totals.transactionFeeTotal + item.tax,
              totalSale: totals.totalSale + item.amount,
              averageQuantity: totals.averageQuantity + item.quantity,
            }),
            { transactionFeeTotal: 0, totalSale: 0, averageQuantity: 0 }
          );

        const totalProduced = job.build.products.totalQuantity;
        const totalMaterialCost = job.build.costs.totalPurchaseCost;
        const materialCostPerItem = totalMaterialCost / totalProduced;
        const totalInventionCost = job.build.costs.inventionCosts || 0;
        const totalInstallCost = job.build.costs.installCosts;
        const totalExtras = job.build.costs.extrasTotal;
        const totalBuildCosts =
          totalMaterialCost + totalInstallCost + totalExtras;
        const totalJobCost =
          totalBuildCosts + brokersFeesTotal + transactionFeeTotal;
        const totalCostPerItem =
          Math.round((totalJobCost / totalProduced + Number.EPSILON) * 100) /
          100;
        const averageSalePrice =
          averageQuantity > 0
            ? Math.round((totalSale / averageQuantity + Number.EPSILON) * 100) /
              100
            : 0;
        const profitLoss = totalSale > 0 ? totalSale - totalJobCost : 0;
        const corpMarketOrder = job.build.sale.marketOrders.some(
          (order) => order.is_corporation
        );
        const corpIndustryJob = job.build.costs.linkedJobs.some(
          (linkedJob) => linkedJob.is_corporation
        );

        const archiveObject = {
          typeID: job.itemID,
          jobID: job.jobID,
          jobType: job.jobType,
          processDate: Date.now(),
          totalProduced,
          totalMaterialCost,
          materialCostPerItem,
          totalInventionCost,
          totalInstallCost,
          totalExtras,
          totalBuildCosts,
          brokersFeeTotal: brokersFeesTotal,
          transactionFeeTotal,
          totalJobCost,
          totalCostPerItem,
          totalSales: totalSale,
          averageSalePrice,
          profitLoss,
          corpMarketOrder,
          corpIndustryJob,
        };

        const dbObject = {
          jobType: archiveObject.jobType,
          typeID: archiveObject.typeID,
          totalJobs: FieldValue.increment(1),
          itemBuildCount: FieldValue.increment(archiveObject.totalProduced),
          buildCostTotal: FieldValue.increment(archiveObject.totalBuildCosts),
          brokersFeeTotal: FieldValue.increment(archiveObject.brokersFeeTotal),
          transactionFeeTotal: FieldValue.increment(
            archiveObject.transactionFeeTotal
          ),
          jobCostTotal: FieldValue.increment(archiveObject.totalJobCost),
          salesTotal: FieldValue.increment(archiveObject.totalSales),
          profitLoss: FieldValue.increment(archiveObject.profitLoss),
          dataSnapshots: FieldValue.arrayUnion(archiveObject),
        };

        const buildStatRef = db
          .collection(`Users/${userId}/BuildStats`)
          .doc(job.itemID.toString());
        const archivedJobRef = db
          .collection(`Users/${userId}/ArchivedJobs`)
          .doc(job.jobID.toString());

        const buildStat = await buildStatRef.get();
        if (buildStat.exists) {
          batch.update(buildStatRef, dbObject);
        } else {
          batch.set(buildStatRef, dbObject);
        }

        batch.update(archivedJobRef, { archiveProcessed: true });
        processedCount++;
      }

      await batch.commit();
      log(`${processedCount} Archived Jobs Processed`);
    } catch (err) {
      error(`Error processing archived jobs: ${err}`);
    }
    return null;
  }
);
