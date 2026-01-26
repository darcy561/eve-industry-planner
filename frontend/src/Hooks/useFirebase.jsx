import { firestore, performance } from "../firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { trace } from "firebase/performance";
import GLOBAL_CONFIG from "../global-config-app";
import Group from "../Classes/groupsConstructor";
import JobSnapshot from "../Classes/jobSnapshotConstructor";
import Job from "../Classes/jobConstructor";
import getMarketData from "../Functions/MarketData/findMarketData";
import checkUserClaims from "../Functions/Auth/checkUserClaims";
import useUsersStore from "../Zustand/usersStore";
import getCurrentFirebaseUser from "../Functions/Firebase/currentFirebaseUser";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../Events/loginEvents";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "./React Query/useCharacterHooks";
import { buildUsersFromRefreshTokens, getSystemIndexDataFromUserStructures } from "../Functions/Auth/buildAccountData";
import { clearQueryTimings, logWaterfall } from "../Functions/Debugging/queryWaterfallLogger";

/**
 * Custom hook that provides comprehensive Firebase integration for EVE Online industry planning.
 * 
 * This hook handles all Firebase operations:
 * - Real-time listeners for user data, jobs, groups, and watchlists
 * - Archived job data retrieval and caching
 * - User watchlist upload and management
 * - Account data building from cloud and local sources
 * - System index data fetching from user structures
 * - Login step management and error handling
 * - Performance tracing for Firebase operations
 * 
 * The Firebase integration includes:
 * 1. User document listener: Main user data and settings
 * 2. Job snapshot listener: User job snapshots and linked ESI data
 * 3. Watchlist listener: User watchlist items and groups
 * 4. Group data listener: User group data and linked ESI data
 * 5. Individual job listeners: Real-time job updates
 * 6. Archived job retrieval: Build statistics and historical data
 * 7. Watchlist upload: User watchlist data persistence
 * 
 * @returns {Object} Object containing Firebase integration functions
 * @returns {Function} returns.getArchivedJobData - Retrieves archived job data
 * @returns {Function} returns.userGroupDataListener - Sets up group data listener
 * @returns {Function} returns.userJobListener - Sets up individual job listener
 * @returns {Function} returns.userJobSnapshotListener - Sets up job snapshot listener
 * @returns {Function} returns.userMaindDocListener - Sets up main user document listener
 * @returns {Function} returns.userWatchlistListener - Sets up watchlist listener
 * @returns {Function} returns.uploadUserWatchlist - Uploads user watchlist data
 * 
 * @example
 * function FirebaseManager() {
 *   const { userMaindDocListener, userJobSnapshotListener } = useFirebase();
 * 
 *   useEffect(() => {
 *     userMaindDocListener();
 *     userJobSnapshotListener();
 *   }, []);
 * 
 *   return <div>Firebase integration active</div>;
 * }
 */
export function useFirebase() {
  const archivedJobs = useUsersStore.getState().jobData.archivedJobs;
  const { updateFirebaseListeners, updateJobStatus, addLinkedEsiData } =
    useUsersStore.getState().users.actions;
  const { replaceGroupArray, setUserWatchlist, replaceUserJobSnapshotArray, updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const { addUserSettings } =
    useUsersStore.getState().applicationSettings.actions;
  const { DEFAULT_ARCHIVE_REFRESH_PERIOD } = GLOBAL_CONFIG;
  const queryClient = useQueryClient();
  const { prefetchMultipleCharacters } = useCharacterHooks();

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

  const getArchivedJobData = async (typeID) => {
    let newArchivedJobsArray = [...archivedJobs];

    if (!newArchivedJobsArray.some((i) => i.typeID == typeID)) {
      const document = await getDoc(
        doc(
          firestore,
          `Users/${getCurrentFirebaseUser()}/BuildStats`,
          typeID.toString()
        )
      );
      if (document.exists()) {
        let docData = document.data();
        docData.lastUpdated = Date.now();

        if (newArchivedJobsArray.length > 10) {
          newArchivedJobsArray.shift();
          newArchivedJobsArray.push(docData);
        } else {
          newArchivedJobsArray.push(docData);
        }
      }
      return newArchivedJobsArray;
    } else {
      let index = newArchivedJobsArray.findIndex((i) => i.typeID === typeID);
      if (index !== -1) {
        if (
          newArchivedJobsArray[index].lastUpdated +
          DEFAULT_ARCHIVE_REFRESH_PERIOD * 24 * 60 * 60 * 1000 <=
          Date.now()
        ) {
          const document = await getDoc(
            doc(
              firestore,
              `Users/${getCurrentFirebaseUser()}/BuildStats`,
              typeID.toString()
            )
          );
          if (document.exists()) {
            let docData = document.data();
            docData.lastUpdated = Date.now();
            newArchivedJobsArray[index] = docData;
            return newArchivedJobsArray;
          }
        } else {
          return newArchivedJobsArray;
        }
      }
    }
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
          const t = trace(performance, "UserJobSnapshotListener");
          t.start();
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
            t.stop();
          } catch (err) {
            emitLoginError(LOGIN_STEPS.JOB_PLANNER, err);
            console.error(err);
            t.stop();
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
          const t = trace(performance, "UserWatchlistListener");
          t.start();
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

            t.stop();
          } catch (err) {
            emitLoginError(LOGIN_STEPS.WATCHLIST_DATA, err);
            console.error(err);
            t.stop();
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
          const t = trace(performance, "UserJobListener");
          t.start();
          try {
            let downloadDoc = doc.data();
            const newJob = new Job(downloadDoc);
            updateOrAddJobsToJobArray(newJob);
            t.stop();
          } catch (err) {
            emitLoginError(LOGIN_STEPS.JOB_PLANNER, err);
            console.error(err);
            t.stop();
          }
        }
      }
    );
    updateFirebaseListeners({ id: JobID, unsubscribe });
  };

  const userMaindDocListener = async () => {
    const unsubscribe = onSnapshot(
      doc(firestore, "Users", getCurrentFirebaseUser()),
      (doc) => {
        const updateMainDocData = async () => {
          if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
            const t = trace(performance, "MainUserDocListener");
            t.start();
            try {
              const userData = doc.data();
              const newUserArray = await buildUsersFromRefreshTokens(userData);



              const systemIndexResults =
                await getSystemIndexDataFromUserStructures(userData.settings);

              if (Object.keys(systemIndexResults).length > 0) {
                useUsersStore
                  .getState()
                  .worldData.actions.addSystemIndex(systemIndexResults);
              }

              addUserSettings(
                userData.settings,
                useUsersStore.getState().users.actions.findParentUser()
                  .CharacterHash
              );
              useUsersStore.getState().users.actions.addNewUsers(newUserArray);

              // Clear timings before starting all character prefetches
              clearQueryTimings();
              
              // Extract character hashes
              const characterHashes = newUserArray.map(({ CharacterHash }) => CharacterHash);
              
              // Prefetch data for all characters in batches (fire-and-forget to not block listener)
              // This prevents overwhelming ESI endpoints when users have many characters
              prefetchMultipleCharacters(queryClient, characterHashes, true)
                .catch((error) => {
                  console.error('Error during character data prefetch:', error);
                });

              await checkUserClaims();

              if (
                userData.settings.account.cloudAccounts &&
                newUserArray.length > 0
              ) {
                // Normalize refreshTokens from database (characterHash -> CharacterHash) for internal use
                const normalizedTokens = (userData.refreshTokens || []).map(token => ({
                  CharacterHash: token.CharacterHash || token.characterHash,
                  rToken: token.rToken,
                }));
                useUsersStore
                  .getState()
                  .users.actions.updateAccountRefreshTokens(
                    normalizedTokens
                  );
              }

              updateJobStatus(userData.jobStatusArray);
              emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
              t.stop();
            } catch (err) {
              emitLoginError(LOGIN_STEPS.CHARACTER_DATA, err);
              console.error(err);
              t.stop();
            }
          }
        };
        updateMainDocData();
      }
    );
    updateFirebaseListeners({ id: "mainDoc", unsubscribe });
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
            const t = trace(performance, "UserGroupListener");
            t.start();
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
              t.stop();
            } catch (err) {
              emitLoginError(LOGIN_STEPS.GROUP_DATA, err);
              console.error(err);
              t.stop();
            }
          }
        };
        updateGroupData();
      }
    );

    updateFirebaseListeners({ id: "groups", unsubscribe });
  };

  return {
    getArchivedJobData,
    userGroupDataListener,
    userJobListener,
    userJobSnapshotListener,
    userMaindDocListener,
    userWatchlistListener,
    uploadUserWatchlist,
  };
}
