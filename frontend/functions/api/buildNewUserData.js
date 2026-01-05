import { getFirestore } from "firebase-admin/firestore";
import { error, info } from "firebase-functions/logger";
import {
  DEFAULT_CLOUD_ACCOUNTS,
  DEFAULT_MARKET_OPTION,
  DEFAULT_ORDER_OPTION,
  DEFAULT_ASSET_LOCATION,
  DEFAULT_CITADEL_BROKERS_FEE,
  DEFAULT_MANUFACTURING_STRUCTURES,
  DEFAULT_REACTION_STRUCTURES,
  DEFAULT_REPROCESSING_STRUCTURES,
} from "../global-config-functions.js";

/**
 * Builds initial user data structure for new EVE Industry Planner users.
 * 
 * This function creates the complete initial data structure for new users:
 * - Creates main user document with account settings and preferences
 * - Sets up default job status array for industry workflow management
 * - Initializes watchlist, job snapshot, and group data collections
 * - Configures default settings for market options, structures, and layouts
 * - Uses Firestore transactions for atomic data creation
 * - Provides comprehensive error handling and logging
 * 
 * @param {string} uid - Firebase user ID (UID) for the new user
 * @returns {Promise<void>} Resolves when user data creation is complete
 * @throws {Error} Throws error if UID is missing or data creation fails
 * 
 * @example
 * await buildNewUserdata("user123");
 * // User data structure created successfully
 */
async function buildNewUserdata(uid) {
  if (!uid) {
    error("unable to create user documents, missing UID");
    return;
  }

  const db = getFirestore();

  const refs = {
    userDocRef: db.collection("Users").doc(uid),
    watchlistRef: db.doc(`Users/${uid}/ProfileInfo/Watchlist`),
    jobSnapshotRef: db.doc(`Users/${uid}/ProfileInfo/JobSnapshot`),
    groupDataRef: db.doc(`Users/${uid}/ProfileInfo/GroupData`),
  };

  const documents = {
    userDocData: {
      accountID: uid,
      jobStatusArray: [
        {
          id: 0,
          name: "Planning",
          sortOrder: 0,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
        },
        {
          id: 1,
          name: "Purchasing",
          sortOrder: 1,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
        },
        {
          id: 2,
          name: "Building",
          sortOrder: 2,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
        },
        {
          id: 3,
          name: "Complete",
          sortOrder: 3,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
        },
        {
          id: 4,
          name: "For Sale",
          sortOrder: 4,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
        },
      ],
      deleted: null,
      linkedJobs: [],
      linkedTrans: [],
      linkedOrders: [],
      settings: {
        account: { cloudAccounts: DEFAULT_CLOUD_ACCOUNTS || false },
        layout: {
          hideTutorials: false,
          localMarketDisplay: null,
          localOrderDisplay: null,
          esiJobTab: null,
        },
        editJob: {
          defaultMarket: DEFAULT_MARKET_OPTION || "jita",
          defaultOrders: DEFAULT_ORDER_OPTION || "sell",
          hideCompleteMaterials: false,
          defaultAssetLocation: DEFAULT_ASSET_LOCATION || 60003760,
          citadelBrokersFee: DEFAULT_CITADEL_BROKERS_FEE || 1,
        },
        structures: {
          manufacturing: DEFAULT_MANUFACTURING_STRUCTURES || [],
          reaction: DEFAULT_REACTION_STRUCTURES || [],
          reprocessing: DEFAULT_REPROCESSING_STRUCTURES || [],
        },
      },
      refreshTokens: [],
    },
    watchlistDocument: { groups: [], items: [] },
    jobSnapshotDocument: { snapshot: [] },
    groupDataDocument: { groupData: [] },
  };

  try {
    await db.runTransaction(async (transaction) => {
      transaction.set(refs.userDocRef, documents.userDocData);
      transaction.set(refs.watchlistRef, documents.watchlistDocument);
      transaction.set(refs.jobSnapshotRef, documents.jobSnapshotDocument);
      transaction.set(refs.groupDataRef, documents.groupDataDocument);
    });

    info(`User data created successfully: ${uid}`);
  } catch (err) {
    error(`Failed creating user data: ${err.message}`);
  }
}

export default buildNewUserdata;
