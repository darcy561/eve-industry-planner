import { firestore } from "../firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import Group from "../Classes/group";
import JobSnapshot from "../Classes/jobSnapshot";
import Job from "../Classes/job";
import getMarketData from "../Functions/MarketData/findMarketData";
import useUsersStore from "../Zustand/usersStore";
import getCurrentFirebaseUser from "../Functions/Firebase/currentFirebaseUser";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../Events/loginEvents";
import { logWaterfall } from "../Functions/Debugging/queryWaterfallLogger";

/**
 * Custom hook that provides comprehensive Firebase integration for EVE Online industry planning.
 * 
 * This hook handles all Firebase operations:
 * - Real-time listeners for user data, jobs, groups, and watchlists
 * - User watchlist upload and management
 * - Account data building from cloud and local sources
 * - System index data fetching from user structures
 * - Login step management and error handling
 * 
 * The Firebase integration includes:
 * 1. Job snapshot listener: User job snapshots and linked ESI data
 * 2. Watchlist listener: User watchlist items and groups
 * 3. Group data listener: User group data and linked ESI data
 * 4. Individual job listeners: Real-time job updates
 * 5. Watchlist upload: User watchlist data persistence
 *
 * Main user account data and app settings come from Mongo via login; see `applyLoginAuthResponse` + `runPostLoginAccountSync` (pass `user_document` into the latter).
 * 
 * @returns {Object} Object containing Firebase integration functions
 * @returns {Function} returns.userGroupDataListener - Sets up group data listener
 * @returns {Function} returns.userJobListener - Sets up individual job listener
 * @returns {Function} returns.userJobSnapshotListener - Sets up job snapshot listener
 * @returns {Function} returns.userWatchlistListener - Sets up watchlist listener
 * @returns {Function} returns.uploadUserWatchlist - Uploads user watchlist data
 * 
 * @example
 * function FirebaseManager() {
 *   const { userJobSnapshotListener } = useFirebase();
 * 
 *   useEffect(() => {
 *     userJobSnapshotListener();
 *   }, []);
 * 
 *   return <div>Firebase integration active</div>;
 * }
 */
export function useFirebase() {
  const { updateFirebaseListeners } = useUsersStore.getState().users.actions;
  const { addLinkedEsiData } = useUsersStore.getState().account.actions;
  const { replaceGroupArray, setUserWatchlist, replaceUserJobSnapshotArray, updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;

  const uploadUserWatchlist = async (itemGroups, itemWatchlist) => {
    updateDoc(
      doc(
        firestore,
        `Users/${getCurrentFirebaseUser()}/ProfileInfo`,
        "Watchlist"
      ),
      {
        groups: itemGroups,
        items: itemWatchlist,
      }
    );
  };

  const userJobSnapshotListener = async () => {
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        `Users/${getCurrentFirebaseUser()}/ProfileInfo`,
        "JobSnapshot"
      ),
      (doc) => {
        if (!doc.exists() || doc.metadata.fromCache) return;
        const updateSnapshotState = async () => {
          try {
            let snapshotData = doc.data().snapshot;
            let priceIDRequest = new Set();
            let newUserJobSnapshot = [];
            let newLinkedOrderIDs = new Set();
            let newLinkedJobIDs = new Set();
            let newLinkedTransIDs = new Set();
            snapshotData.forEach((snap) => {
              const jobSnapshot = new JobSnapshot(snap);

              jobSnapshot.apiJobs.forEach((id) => {
                newLinkedJobIDs.add(id);
              });
              jobSnapshot.apiOrders.forEach((id) => {
                newLinkedOrderIDs.add(id);
              });
              jobSnapshot.apiTransactions.forEach((id) => {
                newLinkedTransIDs.add(id);
              });
              jobSnapshot.materialIDs.forEach((id) => {
                priceIDRequest.add(id);
              });
              priceIDRequest.add(jobSnapshot.itemID);
              newUserJobSnapshot.push(jobSnapshot);
            });

            newUserJobSnapshot.sort((a, b) => {
              if (a.name < b.name) {
                return -1;
              }
              if (a.name > b.name) {
                return 1;
              }
              return 0;
            });
            addLinkedEsiData({
              ordersToAdd: newLinkedOrderIDs,
              jobsToAdd: newLinkedJobIDs,
              transactionsToAdd: newLinkedTransIDs,
            });

            replaceUserJobSnapshotArray(newUserJobSnapshot);
            emitLoginStepComplete(LOGIN_STEPS.JOB_PLANNER);
          } catch (err) {
            emitLoginError(LOGIN_STEPS.JOB_PLANNER, err);
            console.error(err);
          }
        };
        updateSnapshotState();
      }
    );

    updateFirebaseListeners({ id: "snapshot", unsubscribe });
    return;
  };

  const userWatchlistListener = async () => {
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        `Users/${getCurrentFirebaseUser()}/ProfileInfo`,
        "Watchlist"
      ),
      (doc) => {
        if (!doc.exists() || doc.metadata.fromCache) return;
        const updateSnapshotState = async () => {
          try {
            let snapshotData = doc.data();
            let priceIDRequest = new Set();
            let newWatchlistGroups = [];
            let newWatchlistItems = [];
            snapshotData.groups.forEach((group) => {
              newWatchlistGroups.push(group);
            });
            snapshotData.items.forEach((item) => {
              priceIDRequest.add(item.typeID);
              item.materials.forEach((mat) => {
                priceIDRequest.add(mat.typeID);
                mat.materials.forEach((cMat) => {
                  priceIDRequest.add(cMat.typeID);
                });
              });
              newWatchlistItems.push(item);
            });
            const itemPriceResult = await getMarketData(priceIDRequest);
            useUsersStore
              .getState()
              .worldData.actions.addMarketData(itemPriceResult);
            setUserWatchlist(newWatchlistItems, newWatchlistGroups);

            emitLoginStepComplete(LOGIN_STEPS.WATCHLIST_DATA);
          } catch (err) {
            emitLoginError(LOGIN_STEPS.WATCHLIST_DATA, err);
            console.error(err);
          }
        };
        updateSnapshotState();
      }
    );
    updateFirebaseListeners({ id: "watchlist", unsubscribe });

    return;
  };

  const userJobListener = async (JobID) => {
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        `Users/${getCurrentFirebaseUser()}/Jobs`,
        JobID.toString()
      ),
      (doc) => {
        if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
          try {
            let downloadDoc = doc.data();
            const newJob = new Job(downloadDoc);
            updateOrAddJobsToJobArray(newJob);
          } catch (err) {
            emitLoginError(LOGIN_STEPS.JOB_PLANNER, err);
            console.error(err);
          }
        }
      }
    );
    updateFirebaseListeners({ id: JobID, unsubscribe });
  };

  const userGroupDataListener = async () => {
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        `Users/${getCurrentFirebaseUser()}/ProfileInfo`,
        "GroupData"
      ),
      (doc) => {
        const updateGroupData = async () => {
          if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
            try {
              const groupData = doc.data().groupData;
              const groupArray = [];
              let newLinkedOrderIDs = new Set();
              let newLinkedJobIDs = new Set();
              let newLinkedTransIDs = new Set();

              for (let group of groupData) {
                const groupObject = new Group(group);
                groupArray.push(groupObject);

                groupObject.linkedJobIDs?.forEach((id) => {
                  newLinkedJobIDs.add(id);
                });
                groupObject.linkedOrderIDs?.forEach((id) => {
                  newLinkedOrderIDs.add(id);
                });
                groupObject.linkedTransIDs?.forEach((id) => {
                  newLinkedTransIDs.add(id);
                });
              }

              addLinkedEsiData({
                ordersToAdd: newLinkedOrderIDs,
                jobsToAdd: newLinkedJobIDs,
                transactionsToAdd: newLinkedTransIDs,
              });

              replaceGroupArray(groupArray);
              emitLoginStepComplete(LOGIN_STEPS.GROUP_DATA);
            } catch (err) {
              emitLoginError(LOGIN_STEPS.GROUP_DATA, err);
              console.error(err);
            }
          }
        };
        updateGroupData();
      }
    );

    updateFirebaseListeners({ id: "groups", unsubscribe });
  };

  return {
    userGroupDataListener,
    userJobListener,
    userJobSnapshotListener,
    userWatchlistListener,
    uploadUserWatchlist,
  };
}
