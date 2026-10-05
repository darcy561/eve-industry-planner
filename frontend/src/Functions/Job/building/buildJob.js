import { totalQuantityProduced } from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { applyRecipeToJob, jobFromDocument } from "../jobDocument";
import { showSnackbarError } from "../../../Events/snackbarEvents";
import { displayOutdatedAppVersionDialogue } from "../../../Events/notificationDialogueEvents";
import { trackNewJobsCreated } from "../../../analytics/trackNewJobsCreated";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
  setupQuantitiesForTotal,
} from "../setups/setups";
import recalculateJobForNewTotal from "../setups/recalculateJobForNewTotal";
import {
  applyCommands,
  attachNewSetupToJob,
} from "../../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { primeRecipes, recipeFor } from "../../Static/recipes";
import fetchBlueprints from "../../Endpoints/Public/blueprints";

export async function buildJob(buildRequest, options = {}) {
  const { queryClient } = options;

  try {
    const requests = Array.isArray(buildRequest)
      ? buildRequest
      : [buildRequest];

    if (requests.length === 0) {
      return Array.isArray(buildRequest) ? [] : undefined;
    }

    for (const request of requests) {
      if (!Object.hasOwn(request, "itemID")) {
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
    const outputObject = applyRecipeToJob(
      jobFromDocument(itemJson, buildRequest),
      itemJson,
      buildRequest,
    );
    try {
      await buildSetupOptions(outputObject, buildRequest, queryClient);
      outputObject.layout.setupToEdit = Object.keys(
        outputObject.build.setup,
      )[0];
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

async function buildSetupOptions(
  inputJobObject,
  buildRequestObject,
  queryClient,
) {
  const requiredQuantity =
    buildRequestObject?.requiredQuantity ??
    buildRequestObject?.itemQty ??
    inputJobObject.rawData.products[0].quantity;

  const presets = buildRequestObject?.presetSetups;
  if (Array.isArray(presets) && presets.length > 0) {
    const presetContext = buildSetupContextForJob(inputJobObject, queryClient);
    inputJobObject.build.setup = {};
    for (const row of presets) {
      const newSetup = buildSetupFromQuantity(
        inputJobObject,
        { runCount: row.runCount, jobCount: row.jobCount },
        queryClient,
        presetContext,
        { overrides: row },
      );
      inputJobObject.build.setup[newSetup.id] = newSetup;
    }
    const keys = Object.keys(inputJobObject.build.setup);
    inputJobObject.layout.setupToEdit = keys[0];

    const target =
      typeof requiredQuantity === "number" && requiredQuantity > 0
        ? requiredQuantity
        : null;
    if (target != null && totalQuantityProduced(inputJobObject) !== target) {
      recalculateJobForNewTotal(inputJobObject, target, queryClient);
    }
    return;
  }

  const context = buildSetupContextForJob(inputJobObject, queryClient);
  const setupQuantities = setupQuantitiesForTotal(
    inputJobObject,
    requiredQuantity,
    queryClient,
  );

  for (const setupQuantity of setupQuantities) {
    const newSetup = buildSetupFromQuantity(
      inputJobObject,
      setupQuantity,
      queryClient,
      context,
      {
        overrides: {
          systemID: buildRequestObject?.systemID,
          characterToUse: buildRequestObject?.characterToUse,
        },
      },
    );
    applyCommands(inputJobObject, attachNewSetupToJob(newSetup));
  }
}

/**
 * The recipes for the items asked about.
 *
 * The cached file answers first, and the API only when it cannot: a recipe the file does not carry
 * is one published since the build the app holds, which is the case the fallback exists for. A
 * partial answer is not used — the API is asked for the whole set rather than the found recipes
 * being mixed with fetched ones, so every recipe in one build request comes from one source.
 *
 * @param {string|number|Array<string|number>} itemRequests
 * @returns {Promise<Array<Object>>}
 */
export async function getItemRecipes(itemRequests) {
  const itemIDs = Array.isArray(itemRequests) ? itemRequests : [itemRequests];

  try {
    await primeRecipes();
    const found = itemIDs.map((itemID) => recipeFor(itemID)).filter(Boolean);

    if (found.length === itemIDs.length) {
      return found;
    }
  } catch (error) {
    console.warn("Recipes: reading the cached list failed", error);
  }

  return await fetchBlueprints(itemRequests);
}
