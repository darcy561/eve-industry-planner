import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";

async function getSystemIndexDataFromFirebase(inputArray) {
  let URL = `${import.meta.env.VITE_APIURL}/systemindexes`;
  let isSingleItem = false;
  let returnObject = {};

  if (!inputArray || inputArray.length === 0) {
    return returnObject;
  }

  const appCheckToken = await getToken(appCheck);

  if (inputArray.size === 1) {
    URL += `/${inputArray[0]}`;
    isSingleItem = true;
  }

  const response = await fetch(URL, {
    method: isSingleItem ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-AppCheck": appCheckToken.token,
      accountID: getCurrentFirebaseUser(),
      appVersion: __APP_VERSION__,
    },
    body: isSingleItem ? undefined : JSON.stringify({ idArray: inputArray }),
  });

  if (!response.ok) {
    return returnObject;
  }

  const responseData = await response.json();

  if (Array.isArray(responseData)) {
    responseData.forEach((entry) => {
      returnObject[entry.solar_system_id] = entry;
    });
  } else {
    returnObject[responseData.solar_system_id] = responseData;
  }

  return returnObject;
}

export default getSystemIndexDataFromFirebase;
