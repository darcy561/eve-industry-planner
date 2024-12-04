import { useContext } from "react";
import {
  FirebaseListenersContext,
  UserJobSnapshotContext,
  UsersContext,
  UserWatchlistContext,
} from "../Context/AuthContext";
import { firestore, performance } from "../firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { trace } from "firebase/performance";
import {
  ApiJobsContext,
  ArchivedJobsContext,
  JobArrayContext,
  JobStatusContext,
  LinkedIDsContext,
} from "../Context/JobContext";
import {
  EveIDsContext,
  EvePricesContext,
  SystemIndexContext,
} from "../Context/EveDataContext";
import { useAccountManagement } from "./useAccountManagement";
import { useEveApi } from "./useEveApi";
import {
  UserLoginUIContext,
  ApplicationSettingsContext,
} from "../Context/LayoutContext";
import GLOBAL_CONFIG from "../global-config-app";
import { useCorporationObject } from "./Account Management Hooks/Corporation Objects/useCorporationObject";
import { useHelperFunction } from "./GeneralHooks/useHelperFunctions";
import Group from "../Classes/groupsConstructor";
import ApplicationSettingsObject from "../Classes/applicationSettingsConstructor";
import JobSnapshot from "../Classes/jobSnapshotConstructor";
import Job from "../Classes/jobConstructor";
import getMarketData from "../Functions/MarketData/findMarketData";

export function useFirebase() {
  const { updateUsers } = useContext(UsersContext);
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { jobStatus, setJobStatus } = useContext(JobStatusContext);
  const { archivedJobs } = useContext(ArchivedJobsContext);
  const { updateFirebaseListeners } = useContext(FirebaseListenersContext);
  const { updateUserJobSnapshot } = useContext(UserJobSnapshotContext);
  const { updateEveIDs } = useContext(EveIDsContext);
  const { updateApiJobs } = useContext(ApiJobsContext);
  const { updateUserWatchlist } = useContext(UserWatchlistContext);
  const { updateJobArray, updateGroupArray } = useContext(JobArrayContext);
  const { updateLinkedJobIDs, updateLinkedOrderIDs, updateLinkedTransIDs } =
    useContext(LinkedIDsContext);
  const {
    updateUserDataFetch,
    updateUserJobSnapshotDataFetch,
    updateUserWatchlistDataFetch,
    updateUserGroupsDataFetch,
  } = useContext(UserLoginUIContext);
  const { updateSystemIndexData } = useContext(SystemIndexContext);
  const { updateApplicationSettings } = useContext(ApplicationSettingsContext);
  const {
    buildApiArray,
    buildCloudAccountData,
    buildLocalAccountData,
    checkUserClaims,
    getLocationNames,
    getSystemIndexDataFromUserStructures,
    storeESIData, 
    tidyLinkedData,
    updateCloudRefreshTokens,
    updateLocalRefreshTokens,
  } = useAccountManagement();
  const { serverStatus } = useEveApi();
  const { updateCorporationObject } = useCorporationObject();
  const { findParentUser } = useHelperFunction();
  const { DEFAULT_ARCHIVE_REFRESH_PERIOD } = GLOBAL_CONFIG;

  const parentUser = findParentUser();

  async function updateMainUserDoc(settingsObject) {
    let updateObject = {
      parentUserHash: parentUser.CharacterHash,
      jobStatusArray: jobStatus,
      linkedJobs: [...parentUser.linkedJobs],
      linkedTrans: [...parentUser.linkedTrans],
      linkedOrders: [...parentUser.linkedOrders],
      refreshTokens: parentUser.accountRefreshTokens,
    };
    if (settingsObject) {
      updateObject.settings = settingsObject.toDocument();
    }
    await updateDoc(
      doc(firestore, "Users", parentUser.accountID),
      updateObject
    );
  }

  const uploadUserWatchlist = async (itemGroups, itemWatchlist) => {
    updateDoc(
      doc(firestore, `Users/${parentUser.accountID}/ProfileInfo`, "Watchlist"),
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
          `Users/${parentUser.accountID}/BuildStats`,
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
              `Users/${parentUser.accountID}/BuildStats`,
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

  const userJobSnapshotListener = async (userObj) => {
    const unsubscribe = onSnapshot(
      doc(firestore, `Users/${userObj.accountID}/ProfileInfo`, "JobSnapshot"),
      (doc) => {
        if (!doc.exists() || doc.metadata.fromCache) return;
        const updateSnapshotState = async () => {
          const t = trace(performance, "UserJobSnapshotListener");
          t.start();
          // updateUserJobSnapshotDataFetch(false);
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

          const itemPriceResult = await getMarketData(
            priceIDRequest,
            evePrices
          );
          newUserJobSnapshot.sort((a, b) => {
            if (a.name < b.name) {
              return -1;
            }
            if (a.name > b.name) {
              return 1;
            }
            return 0;
          });
          updateLinkedJobIDs((prevState) => {
            return [...new Set([...prevState, ...newLinkedJobIDs])];
          });
          updateLinkedOrderIDs((prevState) => {
            return [...new Set([...prevState, ...newLinkedOrderIDs])];
          });
          updateLinkedTransIDs((prevState) => {
            return [...new Set([...prevState, ...newLinkedTransIDs])];
          });
          updateEvePrices((prev) => ({
            ...prev,
            ...itemPriceResult,
          }));
          updateUserJobSnapshot(newUserJobSnapshot);
          updateUserJobSnapshotDataFetch(true);
          t.stop();
        };
        updateSnapshotState();
      }
    );
    updateFirebaseListeners((prev) => {
      const updatedListeners = prev.map((listener) =>
        listener.id === "snapshot" ? { id: "snapshot", unsubscribe } : listener
      );
      if (!prev.some((listener) => listener.id === "snapshot")) {
        updatedListeners.push({ id: "snapshot", unsubscribe });
      }
      return updatedListeners;
    });
    return;
  };

  const userWatchlistListener = async (token) => {
    const unsubscribe = onSnapshot(
      doc(firestore, `Users/${token.user.uid}/ProfileInfo`, "Watchlist"),
      (doc) => {
        if (!doc.exists() || doc.metadata.fromCache) return;

        const updateSnapshotState = async () => {
          const t = trace(performance, "UserWatchlistListener");
          t.start();
          updateUserWatchlistDataFetch(false);
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
          const itemPriceResult = await getMarketData(
            priceIDRequest,
            evePrices
          );
          updateEvePrices((prev) => ({
            ...prev,
            ...itemPriceResult,
          }));
          updateUserWatchlist({
            groups: newWatchlistGroups,
            items: newWatchlistItems,
          });
          updateUserWatchlistDataFetch(true);
          t.stop();
        };
        updateSnapshotState();
      }
    );
    updateFirebaseListeners((prev) => {
      const updatedListeners = prev.map((listener) =>
        listener.id === "watchlist"
          ? { id: "watchlist", unsubscribe }
          : listener
      );
      if (!prev.some((listener) => listener.id === "watchlist")) {
        updatedListeners.push({ id: "watchlist", unsubscribe });
      }
      return updatedListeners;
    });
    return;
  };

  const userJobListener = async (userObj, JobID) => {
    const unsubscribe = onSnapshot(
      doc(firestore, `Users/${userObj.accountID}/Jobs`, JobID.toString()),
      (doc) => {
        if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
          const t = trace(performance, "UserJobListener");
          t.start();
          let downloadDoc = doc.data();
          const newJob = new Job(downloadDoc);
          updateJobArray((prev) => {
            const index = prev.findIndex((i) => i.jobID === newJob.jobID);
            if (index === -1) {
              return [...prev, newJob];
            }
            return prev.map((job, idx) => (idx === index ? newJob : job));
          });
          t.stop();
        }
      }
    );
    updateFirebaseListeners((prev) => {
      const updatedListeners = prev.map((listener) =>
        listener.id === JobID ? { id: JobID, unsubscribe } : listener
      );
      if (!prev.some((listener) => listener.id === JobID)) {
        updatedListeners.push({ id: JobID, unsubscribe });
      }
      return updatedListeners;
    });
  };

  const userMaindDocListener = async (token, userObject) => {
    const unsubscribe = onSnapshot(
      doc(firestore, "Users", token.user.uid),
      (doc) => {
        const updateMainDocData = async () => {
          if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
            const t = trace(performance, "MainUserDocListener");
            t.start();
            updateUserDataFetch(false);
            let userData = doc.data();
            let newUserArray = [userObject];
            let esiOjectArray = [];
            let mainUser = newUserArray.find((i) => i.ParentUser);
            mainUser.accountID = userData.accountID;
            mainUser.settings = userData.settings;
            serverStatus();
            let mainUserESIObject = await mainUser.getCharacterESIData();
            esiOjectArray.push(mainUserESIObject);

            if (userData.settings.account.cloudAccounts) {
              await buildCloudAccountData(
                userData.refreshTokens,
                newUserArray,
                esiOjectArray
              );
              mainUser.accountRefreshTokens = updateCloudRefreshTokens(
                userData.refreshTokens,
                newUserArray
              );
              await storeESIData(esiOjectArray);
              updateCorporationObject(esiOjectArray);
            } else {
              await buildLocalAccountData(newUserArray, esiOjectArray);
              updateLocalRefreshTokens(newUserArray);
              await storeESIData(esiOjectArray);
              updateCorporationObject(esiOjectArray);
            }
            tidyLinkedData(
              userData.linkedJobs,
              userData.linkedOrders,
              userData.linkedTrans,
              mainUser,
              newUserArray,
              esiOjectArray
            );
            let newApiArray = buildApiArray(newUserArray, esiOjectArray);
            await checkUserClaims(newUserArray);
            let newEveIDs = await getLocationNames(
              newUserArray,
              mainUser,
              esiOjectArray
            );
            const systemIndexResults =
              await getSystemIndexDataFromUserStructures(mainUser);

            const applicationSettings = new ApplicationSettingsObject(
              mainUser.settings
            );

            newUserArray.sort((a, b) => {
              if (a.name < b.name) {
                return -1;
              }
              if (a.name > b.name) {
                return 1;
              }
              return 0;
            });

            updateEveIDs((prev) => ({ ...prev, ...newEveIDs }));
            updateSystemIndexData((prev) => ({
              ...prev,
              ...systemIndexResults,
            }));
            updateApplicationSettings(applicationSettings);
            updateApiJobs(newApiArray);
            updateUsers(newUserArray);
            setJobStatus(userData.jobStatusArray);
            updateUserDataFetch(true);
            t.stop();
          }
        };
        updateMainDocData();
      }
    );
    updateFirebaseListeners((prev) => {
      const updatedListeners = prev.map((listener) =>
        listener.id === "mainDoc" ? { id: "mainDoc", unsubscribe } : listener
      );
      if (!prev.some((listener) => listener.id === "mainDoc")) {
        updatedListeners.push({ id: "mainDoc", unsubscribe });
      }
      return updatedListeners;
    });
  };

  const userGroupDataListener = async (userObj) => {
    const unsubscribe = onSnapshot(
      doc(firestore, `Users/${userObj.accountID}/ProfileInfo`, "GroupData"),
      (doc) => {
        const updateGroupData = async () => {
          if (!doc.metadata.hasPendingWrites && doc.data() !== undefined) {
            const t = trace(performance, "UserGroupListener");
            t.start();
            updateUserGroupsDataFetch(false);
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

            updateLinkedJobIDs((prevState) => {
              return [...new Set([...prevState, ...newLinkedJobIDs])];
            });
            updateLinkedOrderIDs((prevState) => {
              return [...new Set([...prevState, ...newLinkedOrderIDs])];
            });
            updateLinkedTransIDs((prevState) => {
              return [...new Set([...prevState, ...newLinkedTransIDs])];
            });
            updateGroupArray(groupArray);
            updateUserGroupsDataFetch(true);
            t.stop();
          }
        };
        updateGroupData();
      }
    );
    updateFirebaseListeners((prev) => {
      const updatedListeners = prev.map((listener) =>
        listener.id === "groups" ? { id: "groups", unsubscribe } : listener
      );
      if (!prev.some((listener) => listener.id === "groups")) {
        updatedListeners.push({ id: "groups", unsubscribe });
      }
      return updatedListeners;
    });
  };

  async function uploadApplicationSettings(settingsObject) {
    if (!settingsObject) return;
    await fbAuthState();

    await updateDoc(doc(firestore, "Users", parentUser.accountID), {
      settings: convertApplicationSettingsToDocument(settingsObject),
    });
  }

  return {
    getArchivedJobData,
    updateMainUserDoc,
    userGroupDataListener,
    userJobListener,
    userJobSnapshotListener,
    userMaindDocListener,
    userWatchlistListener,
    uploadUserWatchlist,
  };
}
