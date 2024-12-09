import { getAnalytics, logEvent } from "firebase/analytics";
import { getAuth, signOut } from "firebase/auth";
import { functions } from "../firebase";
import { useNavigate } from "react-router";
import { useContext } from "react";
import {
  FirebaseListenersContext,
  IsLoggedInContext,
  UserJobSnapshotContext,
  UsersContext,
  UserWatchlistContext,
} from "../Context/AuthContext";
import {
  ActiveJobContext,
  ApiJobsContext,
  ArchivedJobsContext,
  JobArrayContext,
  JobStatusContext,
} from "../Context/JobContext";
import {
  CorpEsiDataContext,
  EveIDsContext,
  PersonalESIDataContext,
  SystemIndexContext,
} from "../Context/EveDataContext";
import {
  ApplicationSettingsContext,
  UserLoginUIContext,
} from "../Context/LayoutContext";
import {
  apiJobsDefault,
  jobArrayDefault,
  jobStatusDefault,
  usersDefault,
  eveIDsDefault,
  userJobSnapshotDefault,
  defaultEsiJobs,
  defaultEsiSkills,
  defaultEsiOrders,
  defaultEsiHistOrders,
  defaultEsiBlueprints,
  defaultEsiJournal,
  defaultEsiTransactions,
  defaultEsiStandings,
} from "../Context/defaultValues";
import { httpsCallable } from "firebase/functions";
import searchData from "../RawData/searchIndex.json";
import { useBuildCorporationState } from "./Account Management Hooks/Corporation State/useBuildCorporationState";
import { useRemoveCorporatinState } from "./Account Management Hooks/Corporation State/useRemoveCorporationState";
import { useUpdateCorporationState } from "./Account Management Hooks/Corporation State/useUpdateCorporationState";
import { useHelperFunction } from "./GeneralHooks/useHelperFunctions";
import getWorldData from "../Functions/EveESI/World/getWorldData";
import getSystemIndexes from "../Functions/System Indexes/findSystemIndex";
import ApplicationSettingsObject from "../Classes/applicationSettingsConstructor";
import getUserFromRefreshToken from "../Components/Auth/RefreshToken";

export function useAccountManagement() {
  const { updateIsLoggedIn } = useContext(IsLoggedInContext);
  const { updateUsers } = useContext(UsersContext);
  const { updateGroupArray, updateJobArray } = useContext(JobArrayContext);
  const { updateUserJobSnapshot } = useContext(UserJobSnapshotContext);
  const { eveIDs, updateEveIDs } = useContext(EveIDsContext);
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { setJobStatus } = useContext(JobStatusContext);
  const { updateActiveJob, updateActiveGroup } = useContext(ActiveJobContext);
  const { updateArchivedJobs } = useContext(ArchivedJobsContext);
  const { updateApiJobs } = useContext(ApiJobsContext);
  const { updateUserWatchlist } = useContext(UserWatchlistContext);
  const { firebaseListeners, updateFirebaseListeners } = useContext(
    FirebaseListenersContext
  );
  const {
    esiIndJobs,
    updateEsiIndJobs,
    esiSkills,
    updateEsiSkills,
    esiOrders,
    updateEsiOrders,
    esiHistOrders,
    updateEsiHistOrders,
    esiBlueprints,
    updateEsiBlueprints,
    esiJournal,
    updateEsiJournal,
    esiTransactions,
    updateEsiTransactions,
    esiStandings,
    updateEsiStandings,
  } = useContext(PersonalESIDataContext);
  const {
    corpEsiIndJobs,
    updateCorpEsiIndJobs,
    corpEsiOrders,
    updateCorpEsiOrders,
    corpEsiHistOrders,
    updateCorpEsiHistOrders,
    corpEsiBlueprints,
    updateCorpEsiBlueprints,
    corpEsiJournal,
    updateCorpEsiJournal,
    corpEsiTransactions,
    updateCorpEsiTransactions,
    updateCorpEsiData,
  } = useContext(CorpEsiDataContext);
  const { updateUserUIData, updateLoginInProgressComplete } =
    useContext(UserLoginUIContext);
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );

  const checkClaims = httpsCallable(functions, "userClaims-updateCorpIDs");
  const { findParentUser, sendSnackbarNotificationInfo } = useHelperFunction();
  const auth = getAuth();
  const parentUser = findParentUser();
  const buildCoporationState = useBuildCorporationState();
  const removeCharacterFromCorporationState = useRemoveCorporatinState();
  const updateCharacterDataInCorporationState = useUpdateCorporationState();
  const analytics = getAnalytics();
  const navigate = useNavigate();

  const buildMainUser = (userObject, userSettings) => {
    userObject.accountID = userSettings.accountID;
    userObject.linkedJobs = new Set(userSettings.linkedJobs);
    userObject.linkedTrans = new Set(userSettings.linkedTrans);
    userObject.linkedOrders = new Set(userSettings.linkedOrders);
    userObject.settings = userSettings.settings;
    userObject.accountRefreshTokens = userSettings.refreshTokens;

    return userObject;
  };

  const getLocationNames = async (users, mainUser, esiObjectArray) => {
    let returnObject = {};

    function checkAndAddLocationID(requestedID, requestSet) {
      if (!requestedID) return;

      if (!eveIDs[requestedID] && !returnObject[requestedID]) {
        requestSet.add(requestedID);
      }
    }

    for (let user of users) {
      const requestedIDs = new Set();
      let data = esiObjectArray.find((i) => i.owner === user.CharacterHash);
      if (!data) {
        continue;
      }

      if (user.ParentUser) {
        checkAndAddLocationID(
          user.settings.editJob.defaultAssetLocation,
          requestedIDs
        );
      }

      [...data.esiJobs, ...data.esiCorpJobs].forEach((job) => {
        checkAndAddLocationID(job.facility_id, requestedIDs);
      });

      [
        ...data.esiOrders,
        ...data.esiHistOrders,
        ...data.esiCorpMOrders,
        ...data.esiCorpHistMOrders,
      ].forEach((order) => {
        checkAndAddLocationID(order.location_id, requestedIDs);
        checkAndAddLocationID(order.region_id, requestedIDs);
      });

      const corporationOfficeLocationObjects = data.esiCorpAssets.filter(
        (i) => i.location_flag === "OfficeFolder"
      );
      corporationOfficeLocationObjects.forEach(({ location_id }) => {
        checkAndAddLocationID(location_id, requestedIDs);
      });

      const newLocationoObjects = await getWorldData(requestedIDs, user);
      returnObject = { ...returnObject, ...newLocationoObjects };
    }

    return returnObject;
  };

  const logUserOut = () => {
    logEvent(analytics, "userLogOut", {
      UID: parentUser.accountID,
    });
    firebaseListeners.forEach(({ unsubscribe }) => {
      unsubscribe();
    });
    updateLoginInProgressComplete(false);
    updateFirebaseListeners([]);
    updateIsLoggedIn(false);
    updateUsers(usersDefault);
    updateApplicationSettings(new ApplicationSettingsObject());
    updateUserJobSnapshot(userJobSnapshotDefault);
    updateJobArray(jobArrayDefault);
    updateEveIDs(eveIDsDefault);
    setJobStatus(jobStatusDefault);
    updateActiveJob(null);
    updateArchivedJobs([]);
    updateGroupArray([]);
    updateActiveGroup(null);
    updateApiJobs(apiJobsDefault);
    updateUserWatchlist({ groups: [], items: [] });

    updateEsiIndJobs(defaultEsiJobs);
    updateEsiSkills(defaultEsiSkills);
    updateEsiOrders(defaultEsiOrders);
    updateEsiHistOrders(defaultEsiHistOrders);
    updateEsiBlueprints(defaultEsiBlueprints);
    updateEsiJournal(defaultEsiJournal);
    updateEsiTransactions(defaultEsiTransactions);
    updateEsiStandings(defaultEsiStandings);

    updateCorpEsiIndJobs(new Map());
    updateCorpEsiOrders(new Map());
    updateCorpEsiHistOrders(new Map());
    updateCorpEsiBlueprints(new Map());
    updateCorpEsiJournal([]);
    updateCorpEsiTransactions([]);
    updateCorpEsiData(new Map());

    sessionStorage.clear();
    localStorage.removeItem("Auth");
    signOut(auth);
    navigate("/");
    sendSnackbarNotificationInfo("Logged Out", 3);
  };

  const failedUserRefresh = (failedRefreshSet, userObject) => {
    if (failedRefreshSet.size === 0) return;

    if (userObject.settings.account.cloudAccounts) {
      userObject.accountRefreshTokens = userObject.accountRefreshTokens.filter(
        (i) => !failedRefreshSet.has(i.CharacterHash)
      );
      return;
    }
    let oldLS = JSON.parse(
      localStorage.getItem(`${refreshedUser.CharacterHash} AdditionalAccounts`)
    );
    let newLS = oldLS.filter((i) => !failedRefreshSet.has(i.CharacterHash));
    localStorage.setItem(
      `${refreshedUser.CharacterHash} AdditionalAccounts`,
      JSON.stringify(newLS)
    );
    return;
  };

  const tidyLinkedData = (
    newLinkedJobs,
    newLinkedOrders,
    newLinkedTrans,
    userObject,
    userArray,
    esiObjectArray
  ) => {
    const allJobIDs = new Set(
      userArray.flatMap((user) => {
        const data = esiObjectArray.find(
          (obj) => obj.owner === user.CharacterHash
        );
        if (!data) return [];
        return [...data.esiJobs, ...data.esiCorpJobs].map((job) => job.job_id);
      })
    );

    const allOrderIDs = new Set(
      userArray.flatMap((user) => {
        const data = esiObjectArray.find(
          (obj) => obj.owner === user.CharacterHash
        );
        if (!data) return [];
        return [
          ...data.esiOrders,
          ...data.esiHistOrders,
          ...data.esiCorpMOrders,
          ...data.esiCorpHistMOrders,
        ].map((order) => order.order_id);
      })
    );

    const allTransIDs = new Set(
      userArray.flatMap((user) => {
        const data = esiObjectArray.find(
          (obj) => obj.owner === user.CharacterHash
        );
        if (!data) return [];
        return [...data.esiTransactions, ...data.esiCorpTransactions].map(
          (trans) => trans.transaction_id
        );
      })
    );

    newLinkedJobs = newLinkedJobs.filter((id) => allJobIDs.has(id));
    newLinkedOrders = newLinkedOrders.filter((id) => allOrderIDs.has(id));
    newLinkedTrans = newLinkedTrans.filter((id) => allTransIDs.has(id));

    Object.assign(userObject, {
      linkedJobs: new Set(newLinkedJobs),
      linkedOrders: new Set(newLinkedOrders),
      linkedTrans: new Set(newLinkedTrans),
    });
  };

  const checkUserClaims = async (newUserArray) => {
    let triggerClaimUpdate = false;
    const token = await auth.currentUser.getIdTokenResult();
    const dataArray = [];
    const corpIDs = new Set();

    for (let user of newUserArray) {
      if (
        !token.claims.hasOwnProperty("corporations") ||
        !token.claims.corporations.includes(user.corporation_id)
      ) {
        triggerClaimUpdate = true;
      }
      dataArray.push({
        authToken: `${user.aToken}`,
      });
      corpIDs.add(user.corporation_id);
    }
    if (
      !triggerClaimUpdate &&
      corpIDs.size !== token.claims.corporations.length
    ) {
      triggerClaimUpdate = true;
    }

    if (triggerClaimUpdate) {
      await checkClaims(dataArray);
      await auth.currentUser.getIdToken(true);
      return;
    }
    return;
  };

  const buildCloudAccountData = async (
    refreshTokens,
    userArray,
    esiObjectArray
  ) => {
    for (let token of refreshTokens) {
      let newUser = await getUserFromRefreshToken(token.rToken);
      if (newUser === "RefreshFail") continue;

      await newUser.getPublicCharacterData();
      let esiObject = await newUser.getCharacterESIData();
      updateUserUIData((prev) => ({
        ...prev,
        userArray: prev.userArray.concat([
          {
            CharacterID: newUser.CharacterID,
            CharacterName: newUser.CharacterName,
          },
        ]),
      }));
      userArray.push(newUser);
      esiObjectArray.push(esiObject);
    }
  };

  const buildLocalAccountData = async (userArray, esiObjectArray) => {
    const parent = userArray.find((i) => i.ParentUser);
    const rTokens = JSON.parse(
      localStorage.getItem(`${parent.CharacterHash} AdditionalAccounts`)
    );

    if (!rTokens) {
      return userArray;
    }
    for (let token of rTokens) {
      let newUser = await getUserFromRefreshToken(token.rToken);
      if (newUser === "RefreshFail") continue;

      await newUser.getPublicCharacterData();
      let esiObject = await newUser.getCharacterESIData();
      updateUserUIData((prev) => ({
        ...prev,
        userArray: prev.userArray.concat([
          {
            CharacterID: newUser.CharacterID,
            CharacterName: newUser.CharacterName,
          },
        ]),
      }));
      esiObjectArray.push(esiObject);
      userArray.push(newUser);
    }
  };

  const updateCloudRefreshTokens = (refreshTokens, userArray) => {
    for (let user of userArray) {
      if (user.ParentUser) continue;

      let token = refreshTokens.find(
        (i) => i.CharacterHash === user.CharacterHash
      );
      if (!token) continue;

      if (user.rToken !== token.rToken) {
        token.rToken = user.rToken;
      }
    }
    refreshTokens = refreshTokens.filter((i) =>
      userArray.some(
        (u) => u.CharacterHash === i.CharacterHash && !u.ParentUser
      )
    );
    return refreshTokens;
  };

  const updateLocalRefreshTokens = (userArray) => {
    const tokenArray = [];
    const parent = userArray.find((i) => i.ParentUser);
    for (let user of userArray) {
      if (user.ParentUser) continue;

      tokenArray.push({
        CharacterHash: user.CharacterHash,
        rToken: user.rToken,
      });
    }
    localStorage.setItem(
      `${parent.CharacterHash} AdditionalAccounts`,
      JSON.stringify(tokenArray)
    );
  };

  const buildApiArray = (userArray, esiObjectArray) => {
    let newApiArray = [];
    const includedIDs = new Set();
    for (let user of userArray) {
      let data = esiObjectArray.find((i) => i.owner === user.CharacterHash);
      if (!data) continue;

      data.esiCorpJobs.forEach((job) => {
        if (includedIDs.has(job.job_id)) return;
        includedIDs.add(job.job_id);
        newApiArray.push(job);
      });
      data.esiJobs.forEach((job) => {
        if (includedIDs.has(job.job_id)) return;
        includedIDs.add(job.job_id);
        newApiArray.push(job);
      });
    }

    newApiArray.sort((a, b) => {
      const getItemName = (itemId, blueprintId) => {
        const item = searchData.find(
          (i) => i.itemID === itemId || i.blueprintID === blueprintId
        );
        return item ? item.name : "";
      };

      const aName = getItemName(a.product_type_id, a.blueprint_type_id);
      const bName = getItemName(b.product_type_id, b.blueprint_type_id);

      return aName.localeCompare(bName);
    });

    return newApiArray;
  };

  const updateApiArray = (
    chosenApiArray,
    chosentUsersArray,
    esiObjectArray
  ) => {
    const characterIDToRemove = new Set();

    for (let entry of esiObjectArray) {
      let id = chosentUsersArray.find(
        (i) => i.CharacterHash === entry.owner
      ).CharacterID;
      characterIDToRemove.add(id);
    }

    if (characterIDToRemove.szie > 0) {
      chosenApiArray = chosenApiArray.filter(
        (i) => !characterIDToRemove.has(i.installer_id)
      );
    }

    for (let entry of esiObjectArray) {
      chosenApiArray = chosenApiArray.concat(entry.esiJobs, entry.esiCorpJobs);
    }
    chosenApiArray.sort((a, b) => {
      const getItemName = (itemId, blueprintId) => {
        const item = searchData.find(
          (i) => i.itemID === itemId || i.blueprintID === blueprintId
        );
        return item ? item.name : "";
      };

      const aName = getItemName(a.product_type_id, a.blueprint_type_id);
      const bName = getItemName(b.product_type_id, b.blueprint_type_id);

      return aName.localeCompare(bName);
    });

    return chosenApiArray;
  };

  const storeESIData = async (esiObjectArray) => {
    let skills = [];
    let jobs = [];
    let orders = [];
    let histOrders = [];
    let blueprints = [];
    let transactions = [];
    let journal = [];
    let standings = [];
    let corpJournal = [];
    let corpTransactions = [];

    for (let esiUser of esiObjectArray) {
      skills.push({
        user: esiUser.owner,
        data: esiUser.esiSkills,
      });
      jobs.push({
        user: esiUser.owner,
        data: esiUser.esiJobs,
      });
      orders.push({
        user: esiUser.owner,
        data: esiUser.esiOrders,
      });
      histOrders.push({
        user: esiUser.owner,
        data: esiUser.esiHistOrders,
      });
      blueprints.push({
        user: esiUser.owner,
        data: esiUser.esiBlueprints,
      });
      transactions.push({
        user: esiUser.owner,
        data: esiUser.esiTransactions,
      });
      journal.push({
        user: esiUser.owner,
        data: esiUser.esiJournal,
      });
      standings.push({
        user: esiUser.owner,
        data: esiUser.esiStandings,
      });

      saveCharacterAssets(esiUser.owner, esiUser.esiAssets);

      corpJournal.push({
        user: esiUser.owner,
        data: esiUser.esiCorpJournal,
      });
      corpTransactions.push({
        user: esiUser.owner,
        data: esiUser.esiCorpTransactions,
      });
    }
    const {
      corpIndustyJobs,
      corpMarketOrders,
      corpHistoricMarketOrders,
      corpBlueprints,
    } = buildCoporationState(esiObjectArray);
    updateEsiIndJobs(jobs);
    updateEsiSkills(skills);
    updateEsiOrders(orders);
    updateEsiHistOrders(histOrders);
    updateEsiBlueprints(blueprints);
    updateEsiJournal(journal);
    updateEsiTransactions(transactions);
    updateEsiStandings(standings);
    updateCorpEsiIndJobs(corpIndustyJobs);
    updateCorpEsiOrders(corpMarketOrders);
    updateCorpEsiHistOrders(corpHistoricMarketOrders);
    updateCorpEsiBlueprints(corpBlueprints);
    updateCorpEsiJournal(corpJournal);
    updateCorpEsiTransactions(corpTransactions);
  };

  const updateUserEsiData = (esiObjectArray) => {
    let usersToUpdate = new Set();
    let newEsiIndJobs = [...esiIndJobs];
    let newEsiSkills = [...esiSkills];
    let newEsiOrders = [...esiOrders];
    let newEsiHistOrders = [...esiHistOrders];
    let newEsiBlueprints = [...esiBlueprints];
    let newEsiJournal = [...esiJournal];
    let newEsiTransactions = [...esiTransactions];
    let newEsiStandings = [...esiStandings];
    let newCorpEsiJournal = [...corpEsiJournal];
    let newCorpESiTransactions = [...corpEsiTransactions];

    esiObjectArray.forEach((entry) => {
      usersToUpdate.add(entry.user);
    });

    newEsiIndJobs = newEsiIndJobs.filter((i) => !usersToUpdate.has(i.user));
    newEsiSkills = newEsiSkills.filter((i) => !usersToUpdate.has(i.user));
    newEsiOrders = newEsiOrders.filter((i) => !usersToUpdate.has(i.user));
    newEsiHistOrders = newEsiHistOrders.filter(
      (i) => !usersToUpdate.has(i.user)
    );
    newEsiBlueprints = newEsiBlueprints.filter(
      (i) => !usersToUpdate.has(i.user)
    );
    newEsiJournal = newEsiJournal.filter((i) => !usersToUpdate.has(i.user));
    newEsiTransactions = newEsiTransactions.filter(
      (i) => !usersToUpdate.has(i.user)
    );
    newEsiStandings = newEsiStandings.filter((i) => !usersToUpdate.has(i.user));
    newCorpEsiJournal = newCorpEsiJournal.filter(
      (i) => !usersToUpdate.has(i.user)
    );
    newCorpESiTransactions = newCorpESiTransactions.filter(
      (i) => !usersToUpdate.has(i.user)
    );

    for (let esiUser of esiObjectArray) {
      newEsiOrders.push({
        user: esiUser.owner,
        data: esiUser.esiJobs,
      });
      newEsiSkills.push({
        user: esiUser.owner,
        data: esiUser.esiSkills,
      });
      newEsiOrders.push({
        user: esiUser.owner,
        data: esiUser.esiOrders,
      });
      newEsiHistOrders.push({
        user: esiUser.owner,
        data: esiUser.esiHistOrders,
      });
      newEsiBlueprints.push({
        user: esiUser.owner,
        data: esiUser.esiBlueprints,
      });
      newEsiTransactions.push({
        user: esiUser.owner,
        data: esiUser.esiTransactions,
      });
      newEsiJournal.push({
        user: esiUser.owner,
        data: esiUser.esiJournal,
      });
      newEsiStandings.push({
        user: esiUser.owner,
        data: esiUser.esiStandings,
      });

      saveCharacterAssets(esiUser.owner, esiUser.esiAssets);

      newCorpEsiJournal.push({
        user: esiUser.owner,
        data: esiUser.esiJournal,
      });
      newCorpESiTransactions.push({
        user: esiUser.owner,
        data: esiUser.esiTransactions,
      });
    }
    const {
      corpIndustyJobs,
      corpMarketOrders,
      corpHistoricMarketOrders,
      corpBlueprints,
    } = updateCharacterDataInCorporationState(
      esiObjectArray,
      corpEsiIndJobs,
      corpEsiOrders,
      corpEsiHistOrders,
      corpEsiBlueprints
    );

    updateEsiIndJobs(newEsiIndJobs);
    updateEsiSkills(newEsiSkills);
    updateEsiOrders(newEsiOrders);
    updateEsiHistOrders(newEsiHistOrders);
    updateEsiBlueprints(newEsiBlueprints);
    updateEsiJournal(newEsiJournal);
    updateEsiTransactions(newEsiTransactions);
    updateEsiStandings(newEsiStandings);
    updateCorpEsiIndJobs(corpIndustyJobs);
    updateCorpEsiOrders(corpMarketOrders);
    updateCorpEsiHistOrders(corpHistoricMarketOrders);
    updateCorpEsiBlueprints(corpBlueprints);
    updateCorpEsiJournal(newCorpEsiJournal);
    updateCorpEsiTransactions(newCorpESiTransactions);
  };

  const removeUserEsiData = (userObject) => {
    const { CharacterHash } = userObject;
    let newEsiIndJobs = [...esiIndJobs];
    let newEsiSkills = [...esiSkills];
    let newEsiOrders = [...esiOrders];
    let newEsiHistOrders = [...esiHistOrders];
    let newEsiBlueprints = [...esiBlueprints];
    let newEsiJournal = [...esiJournal];
    let newEsiTransactions = [...esiTransactions];
    let newEsiStandings = [...esiStandings];
    let newCorpEsiJournal = [...corpEsiJournal];
    let newCorpESiTransactions = [...corpEsiTransactions];

    newEsiIndJobs = newEsiIndJobs.filter((i) => i.user !== CharacterHash);
    newEsiSkills = newEsiSkills.filter((i) => i.user !== CharacterHash);
    newEsiOrders = newEsiOrders.filter((i) => i.user !== CharacterHash);
    newEsiHistOrders = newEsiHistOrders.filter((i) => i.user !== CharacterHash);
    newEsiBlueprints = newEsiBlueprints.filter((i) => i.user !== CharacterHash);
    newEsiJournal = newEsiJournal.filter((i) => i.user !== CharacterHash);
    newEsiTransactions = newEsiTransactions.filter(
      (i) => i.user !== CharacterHash
    );
    newEsiStandings = newEsiStandings.filter((i) => i.user !== CharacterHash);
    newCorpEsiJournal = newCorpEsiJournal.filter(
      (i) => i.user !== CharacterHash
    );
    newCorpESiTransactions = newCorpESiTransactions.filter(
      (i) => i.user !== CharacterHash
    );

    sessionStorage.removeItem(`assets_${CharacterHash}`);

    const {
      corporationIndustryJobs,
      corpotationMarketOrders,
      corporationHistoricOrders,
      corporationBlueprints,
    } = removeCharacterFromCorporationState(
      userObject,
      corpEsiIndJobs,
      corpEsiOrders,
      corpEsiHistOrders,
      corpEsiBlueprints
    );

    updateEsiIndJobs(newEsiIndJobs);
    updateEsiSkills(newEsiSkills);
    updateEsiOrders(newEsiOrders);
    updateEsiHistOrders(newEsiHistOrders);
    updateEsiBlueprints(newEsiBlueprints);
    updateEsiJournal(newEsiJournal);
    updateEsiTransactions(newEsiTransactions);
    updateEsiStandings(newEsiStandings);
    updateCorpEsiIndJobs(corporationIndustryJobs);
    updateCorpEsiOrders(corpotationMarketOrders);
    updateCorpEsiHistOrders(corporationHistoricOrders);
    updateCorpEsiBlueprints(corporationBlueprints);
    updateCorpEsiJournal(newCorpEsiJournal);
    updateCorpEsiTransactions(newCorpESiTransactions);
  };

  const getSystemIndexDataFromUserStructures = async (userObject) => {
    const manufacturingStructures =
      userObject.settings.structures.manufacturing;
    const reactionStructures = userObject.settings.structures.reaction;

    const requestIDs = new Set(
      [...manufacturingStructures, ...reactionStructures].map(
        (entry) => entry.systemID
      )
    );

    const retrievedSystemIndexes = await getSystemIndexes(
      requestIDs,
      systemIndexData
    );

    return retrievedSystemIndexes;
  };

  function saveCharacterAssets(characterHash, esiAssets) {
    try {
      if (esiAssets.length === 0) return;

      sessionStorage.setItem(
        `assets_${characterHash}`,
        JSON.stringify(esiAssets)
      );
    } catch (err) {
      console.warn(
        "Character Assets data is too large to store in sessionStorage."
      );
      sessionStorage.setItem(`assets${characterHash}`, null);
    }
  }



  return {
    buildApiArray,
    buildCloudAccountData,
    buildLocalAccountData,
    buildMainUser,
    checkUserClaims,
    failedUserRefresh,
    getSystemIndexDataFromUserStructures,
    getLocationNames,
    logUserOut,
    removeUserEsiData,
    saveCharacterAssets,
    storeESIData,
    tidyLinkedData,
    updateApiArray,
    updateCloudRefreshTokens,
    updateLocalRefreshTokens,
    updateUserEsiData,
  };
}
