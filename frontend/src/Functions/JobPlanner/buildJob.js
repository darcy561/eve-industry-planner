import Job from "../../Classes/job";
import { showSnackbarError } from "../../Events/snackbarEvents";
import { displayOutdatedAppVersionDialogue } from "../../Events/notificationDialogueEvents";
import getItemRecipes from "../Job Build/getItemRecipes";
import { trackNewJobsCreated } from "../../analytics/trackNewJobsCreated";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
  buildSetupFromPresetRow,
} from "./setupBuildHelpers";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";

export async function buildJob(buildRequest, options = {}) {
  const { queryClient } = options;

  try {
    const requests = Array.isArray(buildRequest) ? buildRequest : [buildRequest];

    if (requests.length === 0) {
      return Array.isArray(buildRequest) ? [] : undefined;
    }

    for (const request of requests) {
      if (!request.hasOwnProperty("itemID")) {
        jobBuildErrors(request, "Item Data Missing From Request");
        return Array.isArray(buildRequest) ? [] : undefined;
      }
    }

    const itemIDs = [...new Set(requests.map((request) => request.itemID))];
    const itemsData = await getItemRecipes(itemIDs);

    if (!itemsData || itemsData.length === 0) {
      jobBuildErrors(requests[0], "Outdated App Version");
      return Array.isArray(buildRequest) ? [] : undefined;
    }

    const results = [];
    const jobsForAnalytics = [];
    for (const request of requests) {
      const itemJson = itemsData.find((item) => item.itemID === request.itemID);
      if (!itemJson) continue;

      const jobObject = await buildJobObject(itemJson, request, queryClient);
      if (!jobObject) continue;

      results.push(jobObject);
      if (!request.skipJobCreateAnalytics) {
        jobsForAnalytics.push(jobObject);
      }
    }

    if (jobsForAnalytics.length > 0) {
      trackNewJobsCreated(jobsForAnalytics);
    }

    return Array.isArray(buildRequest) ? results : results[0];
  } catch (err) {
    console.log(err.message);
    return Array.isArray(buildRequest) ? [] : null;
  }
}

export function jobBuildErrors(buildRequest, newJob) {
  if (buildRequest.throwError !== undefined && !buildRequest.throwError) {
    return null;
  }
  if (buildRequest.throwError === undefined || buildRequest.throwError) {
    if (newJob === "TypeError") {
      showSnackbarError("No blueprint found for this item.");
    } else if (newJob === "objectError") {
      showSnackbarError("Error building job object, please try again");
    } else if (newJob === "Outdated App Version") {
      displayOutdatedAppVersionDialogue();
    } else if (newJob === "Item Data Missing From Request") {
      showSnackbarError("Item Data Missing From Request");
    } else {
      showSnackbarError("Unkown Error Contact Admin");
    }
  }
}

async function buildJobObject(itemJson, buildRequest, queryClient) {
  try {
    const outputObject = new Job(itemJson, buildRequest);
    outputObject.buildJobObject(itemJson, buildRequest);
    try {
      await buildSetupOptions(outputObject, buildRequest, queryClient);
      outputObject.layout.setupToEdit = Object.keys(outputObject.build.setup)[0];
      return outputObject;
    } catch (err) {
      console.log(err);
      jobBuildErrors(buildRequest, "objectError");
      return undefined;
    }
  } catch (err) {
    console.log(err);
    jobBuildErrors(buildRequest, err.name);
    return undefined;
  }
}

async function buildSetupOptions(inputJobObject, buildRequestObject, queryClient) {
  const requiredQuantity =
    buildRequestObject?.requiredQuantity ??
    buildRequestObject?.itemQty ??
    inputJobObject.rawData.products[0].quantity;

  const presets = buildRequestObject?.presetSetups;
  if (Array.isArray(presets) && presets.length > 0) {
    inputJobObject.build.setup = {};
    const rawTimeValue = inputJobObject.rawData.time;
    for (const row of presets) {
      const newSetup = buildSetupFromPresetRow(
        inputJobObject,
        row,
        queryClient,
        rawTimeValue
      );
      inputJobObject.build.setup[newSetup.id] = newSetup;
    }
    const keys = Object.keys(inputJobObject.build.setup);
    inputJobObject.layout.setupToEdit = keys[0];

    const target =
      typeof requiredQuantity === "number" && requiredQuantity > 0
        ? requiredQuantity
        : null;
    if (
      target != null &&
      inputJobObject.totalQuantityProduced() !== target
    ) {
      recalculateJobForNewTotal(inputJobObject, target, queryClient);
    }
    return;
  }

  const context = buildSetupContextForJob(
    inputJobObject,
    requiredQuantity,
    queryClient
  );

  for (const setupQuantity of context.setupQuantities) {
    const newSetup = buildSetupFromQuantity(
      inputJobObject,
      setupQuantity,
      queryClient,
      context,
      {
        systemID: buildRequestObject?.systemID,
        characterToUse: buildRequestObject?.characterToUse,
      }
    );
    inputJobObject.attachNewSetupToJob(newSetup);
  }
}
