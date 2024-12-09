import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import {
  initializeAppCheck,
  onTokenChanged,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getPerformance } from "firebase/performance";
import { getFunctions } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";
import GLOBAL_CONFIG from "./global-config-app";
import { fetchAndActivate, getRemoteConfig } from "firebase/remote-config";
import { REMOTE_CONFIG_DEFAULT_VALUES } from "./Context/defaultValues";
import sendAppCheckTokenToSW from "./Service Workers/sendAppCheckToSW";

const { FIREBASE_FUNCTION_REGION } = GLOBAL_CONFIG;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_fbApiKey,
  authDomain: import.meta.env.VITE_fbAuthDomain,
  databaseURL: import.meta.env.VITE_fbDatabaseURL,
  projectId: import.meta.env.VITE_fbProjectID,
  storageBucket: import.meta.env.VITE_fbStorageBucket,
  messagingSenderId: import.meta.env.VITE_fbMessagingSenderID,
  appId: import.meta.env.VITE_fbAppID,
  measurementId: import.meta.env.VITE_measurmentID,
};

const app = initializeApp(firebaseConfig);

export const firestore = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const auth = getAuth(app);

export const functions = getFunctions(app, FIREBASE_FUNCTION_REGION);

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_ReCaptchaKey),
  isTokenAutoRefreshEnabled: true,
});

onTokenChanged(appCheck, async () => {
  await sendAppCheckTokenToSW();
});

export const performance = getPerformance(app);
export const analytics = getAnalytics(app);

export const remoteConfig = getRemoteConfig(app);
if (import.meta.env.DEV) {
  remoteConfig.settings.minimumFetchIntervalMillis = 300000; //5mins
}
remoteConfig.defaultConfig = REMOTE_CONFIG_DEFAULT_VALUES;
fetchAndActivate(remoteConfig).catch((error) => {
  console.error("Error fetching and activating Remote Config: ", error);
});
export default app;
