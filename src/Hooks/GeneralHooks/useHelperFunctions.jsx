import { useContext } from "react";
import { EveIDsContext, EvePricesContext } from "../../Context/EveDataContext";
import { IsLoggedInContext, UsersContext } from "../../Context/AuthContext";
import {
  ApplicationSettingsContext,
  SnackBarDataContext,
} from "../../Context/LayoutContext";

export function useHelperFunction() {
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { users } = useContext(UsersContext);
  const { evePrices } = useContext(EvePricesContext);
  const { eveIDs } = useContext(EveIDsContext);
  const { setSnackbarData } = useContext(SnackBarDataContext);
  const { applicationSettings } = useContext(ApplicationSettingsContext);

  function findItemPriceObject(requestedTypeID, alternativePriceObject = {}) {
    const missingItemCost = {
      jita: {
        buy: 0,
        sell: 0,
      },
      amarr: {
        buy: 0,
        sell: 0,
      },
      dodixie: {
        buy: 0,
        sell: 0,
      },
      typeID: requestedTypeID,
      lastUpdated: 0,
      adjustedPrice: 0,
    };
    return (
      evePrices[requestedTypeID] ||
      alternativePriceObject[requestedTypeID] ||
      missingItemCost
    );
  }

  function findUniverseItemObject(requestedID, alternativeItemLocation) {
    if (
      !alternativeItemLocation ||
      typeof alternativeItemLocation !== "object"
    ) {
      return eveIDs[requestedID] || null;
    }
    return eveIDs[requestedID] || alternativeItemLocation[requestedID] || null;
  }

  function findParentUser() {
    return users.find((i) => i.ParentUser);
  }

  function findParentUserIndex() {
    return users.findIndex((i) => i.ParentUser);
  }

  async function checkClipboardReadPermissions() {
    try {
      const permissionStatus = await navigator.permissions.query({
        name: "clipboard-read",
      });
      if (["granted", "prompt"].includes(permissionStatus.state)) return true;

      return false;
    } catch (error) {
      console.error("Error requesting clipboard read permission:", error);
      return false;
    }
  }

  async function importMultibuyFromClipboard() {
    try {
      const returnArray = [];
      const hasPermission = await checkClipboardReadPermissions();
      if (!hasPermission) {
        sendSnackbarNotificationError(
          "Clipboard access denied. Please enable permissions."
        );
        return returnArray;
      }
      const importedText = await readTextFromClipboard();

      const matchedItems = [
        ...importedText.matchAll(/^(.*)\t([0-9,]*)\t([0-9,.]*)\t([0-9,.]*)$/gm),
      ];

      for (let item of matchedItems) {
        returnArray.push({
          importedName: item[1] || "",
          importedQuantity: parseFloat(item[2].replace(/,/g, "")) || 0,
          importedCost: parseFloat(item[3].replace(/,/g, "")) || 0,
        });
      }
      return returnArray;
    } catch (err) {
      console.error(err.message);
      return [];
    }
  }

  async function importAssetsFromClipboard_IconView() {
    try {
      let returnObject = {};
      const hasPermission = await checkClipboardReadPermissions();
      if (!hasPermission) {
        sendSnackbarNotificationError(
          "Clipboard access denied. Please enable permissions."
        );
        return returnObject;
      }
      const importedText = await readTextFromClipboard();
      if (!importedText) return returnObject;

      const itemMatches = [
        ...importedText.matchAll(
          /^(?<itemName>.+?)\s*(?<itemQuantity>\d+)?\s*$/gm
        ),
      ];

      itemMatches.forEach((inputMatch) => {
        let objectMatch = returnObject[inputMatch.groups.itemName];

        const quantityAsNumber = Number(inputMatch.groups.itemQuantity) || 0;

        if (objectMatch) {
          objectMatch += isNaN(quantityAsNumber) ? 0 : quantityAsNumber;
        } else {
          returnObject[inputMatch.groups.itemName] = isNaN(quantityAsNumber)
            ? 0
            : quantityAsNumber;
        }
      });
      return returnObject;
    } catch (err) {
      console.error(err.message);
      return {};
    }
  }

  async function writeTextToClipboard(inputTextString) {
    try {
      await navigator.clipboard.writeText(inputTextString);
      sendSnackbarNotificationSuccess(`Successfully Copied`, 1);
    } catch (err) {
      console.error(err.message);
      sendSnackbarNotificationError(`Error Copying Text To Clipboard`);
    }
  }

  async function readTextFromClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      console.error(err.message);
      sendSnackbarNotificationError(`Error Reading Text From Clipboard`);
      return null;
    }
  }

  function checkDisplayTutorials(pageDisplayPreference) {
    if (!isLoggedIn || pageDisplayPreference) return true;
    const tutorialsAreHidden = applicationSettings.hideTutorials;

    if (tutorialsAreHidden) return false;

    return true;
  }

  function sendSnackbarNotificationSuccess(
    messageText = "",
    durationInSeconds = 1
  ) {
    setSnackbarData((prev) => ({
      ...prev,
      open: true,
      message: messageText,
      severity: "success",
      autoHideDuration: durationInSeconds * 1000,
    }));
  }

  function sendSnackbarNotificationError(
    messageText = "",
    durationInSeconds = 1
  ) {
    setSnackbarData((prev) => ({
      ...prev,
      open: true,
      message: messageText,
      severity: "error",
      autoHideDuration: durationInSeconds * 1000,
    }));
  }

  function sendSnackbarNotificationWarning(
    messageText = "",
    durationInSeconds = 1
  ) {
    setSnackbarData((prev) => ({
      ...prev,
      open: true,
      message: messageText,
      severity: "warning",
      autoHideDuration: durationInSeconds * 1000,
    }));
  }

  function sendSnackbarNotificationInfo(
    messageText = "",
    durationInSeconds = 1
  ) {
    setSnackbarData((prev) => ({
      ...prev,
      open: true,
      message: messageText,
      severity: "info",
      autoHideDuration: durationInSeconds * 1000,
    }));
  }

  return {
    checkClipboardReadPermissions,
    checkDisplayTutorials,
    findItemPriceObject,
    findParentUser,
    findParentUserIndex,
    findUniverseItemObject,
    importAssetsFromClipboard_IconView,
    importMultibuyFromClipboard,
    readTextFromClipboard,
    sendSnackbarNotificationSuccess,
    sendSnackbarNotificationError,
    sendSnackbarNotificationWarning,
    sendSnackbarNotificationInfo,
    writeTextToClipboard,
  };
}
