import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../../../firebase";
import applicationSettingsConverter from "./applicationSettingsConstructor";

export async function uploadApplicationSettings(settingsObject) {
  try {
    const ref = doc(
      firestore,
      `Users/${userObj.accountID}/ProfileInfo`,
      "Settings"
    ).withConverter(applicationSettingsConverter);
    await updateDoc(ref, settingsObject);
  } catch (err) {
    console.error(err.message);
  }
}

