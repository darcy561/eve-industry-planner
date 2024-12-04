import { jobTypes } from "../../../Context/defaultValues";
import GLOBAL_CONFIG from "../../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

class ApplicationSettings {
  constructor(settings) {
    this.cloudAccounts =
      settings?.account?.cloudAccounts || settings?.cloudAccounts || false;
    this.hideTutorials =
      settings?.layout?.hideTutorials || settings?.hideTutorials || false;
    this.enableCompactView =
      settings?.layout?.enableCompactView ||
      settings?.enableCompactView ||
      false;
    this.localMarketDisplay =
      settings?.layout?.localMarketDisplay ||
      settings?.localMarketDisplay ||
      null;
    this.localOrderDisplay =
      settings?.layout?.localOrderDisplay ||
      settings?.localOrderDisplay ||
      null;
    this.esiJobTab = settings?.layout?.esiJobTab || settings?.esiJobTab || null;
    this.defaultMaterialEfficiencyValue =
      settings?.editJob?.defaultMaterialEfficiencyValue ||
      settings?.defaultMaterialEfficiencyValue ||
      0;
    this.defaultMarket =
      settings?.editJob?.defaultMarket ||
      settings?.defaultMarket ||
      DEFAULT_MARKET_OPTION;
    this.defaultOrders =
      settings?.editJob?.defaultOrders ||
      settings?.defaultOrders ||
      DEFAULT_ORDER_OPTION;
    this.hideCompleteMaterials =
      settings?.editJob?.hideCompleteMaterials ||
      settings?.hideCompleteMaterials ||
      false;
    this.defaultAssetLocation =
      settings?.editJob?.defaultAssetLocation ||
      settings?.defaultAssetLocation ||
      DEFAULT_ASSET_LOCATION;
    this.citadelBrokersFee =
      settings?.editJob?.citadelBrokersFee || settings?.citadelBrokersFee || 1;
    this.manufacturingStructures =
      settings?.structures?.manufacturing ||
      settings?.manufacturingStructures ||
      [];
    this.reactionStructures =
      settings?.structures?.reaction || settings?.reactionStructures || [];
  }

  toggleCloudAccounts() {
    return new ApplicationSettings({
      ...this,
      cloudAccounts: !this.cloudAccounts,
    });
  }

  toggleHideTutorials() {
    return new ApplicationSettings({
      ...this,
      hideTutorials: !this.hideTutorials,
    });
  }

  toggleEnableCompactView() {
    return new ApplicationSettings({
      ...this,
      enableCompactView: !this.enableCompactView,
    });
  }

  updatelocalMarketDisplay(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      localMarketDisplay: newValue,
    });
  }

  updateLocaleOrderDisplay(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      localOrderDisplay: newValue,
    });
  }

  updateEsiJobTab(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      esiJobTab: newValue,
    });
  }

  updateDefaultMaterialEfficiencyValue(newValue) {
    if (!newValue) return this;

    return new ApplicationSettings({
      ...this,
      defaultAssetLocation: newValue,
    });
  }

  updateDefaultMarket(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      defaultMarket: newValue,
    });
  }

  updateDefaultOrders(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      defaultOrders: newValue,
    });
  }

  toggleHideCompleteMaterials() {
    return new ApplicationSettings({
      ...this,
      hideCompleteMaterials: !this.hideCompleteMaterials,
    });
  }

  updateDefaultAssetLocation(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      defaultAssetLocation: newValue,
    });
  }

  updateCitadelBrokersFee(newValue) {
    if (!newValue) return this;
    return new ApplicationSettings({
      ...this,
      citadelBrokersFee: newValue,
    });
  }

  addCustomManufacturingStructure(structure) {
    if (!structure) return this;
    this.manufacturingStructures.push(structure);
    return new ApplicationSettings(this);
  }

  removeCustomManufacturingStructure(structure) {
    if (!structure) return;
    this.manufacturingStructures = this.manufacturingStructures.filter(
      (i) => i.id !== structure.id
    );
    if (this.manufacturingStructures.length > 0 && structure.default) {
      this.manufacturingStructures[0].default = true;
    }
    return new ApplicationSettings(this);
  }

  setDefaultCustomManufacturingStructure(id) {
    if (!id) return;
    this.manufacturingStructures.forEach((obj) =>
      obj.id === id ? (obj.default = true) : (obj.default = false)
    );
    return new ApplicationSettings(this);
  }

  addCustomReactionStructure(structure) {
    if (!structure) return this;
    this.reactionStructures.push(structure);
    return new ApplicationSettings(this);
  }

  removeCustomReactionStructure(structure) {
    if (!structure) return;
    this.reactionStructures = this.reactionStructures.filter(
      (i) => i.id !== structure.id
    );
    if (this.reactionStructures.length > 0 && structure.default) {
      this.reactionStructures[0].default = true;
    }
    return new ApplicationSettings(this);
  }

  setDefaultCustomReactionStructure(id) {
    if (!id) return;
    this.reactionStructures.forEach((obj) =>
      obj.id === id ? (obj.default = true) : (obj.default = false)
    );
    return new ApplicationSettings(this);
  }

  getCustomStructureWithID(inputID) {
    if (!inputID) return null;
    let structureLocation;
    if (inputID.includes("manStruct")) {
      structureLocation = this.manufacturingStructures;
    } else if (inputID.includes("reacStruct")) {
      structureLocation = this.reactionStructures;
    } else {
      console.warn(`Input ID ${inputID} does not match.`);
      return null;
    }

    if (!Array.isArray(structureLocation)) {
      console.error("Structure location is not an array.");
      return null;
    }

    const foundStructure = structureLocation.find((obj) => obj.id === inputID);

    if (!foundStructure) {
      console.warn(`No structure found with ID ${inputID}.`);
      return null;
    }

    return foundStructure;
  }

  getDefaultCustomStructureWithJobType(inputJobType) {
    if (!inputJobType) return null;

    let structureLocation;

    if (jobTypes.manufacturing === inputJobType) {
      structureLocation = this.manufacturingStructures;
    } else if (jobTypes.reaction === inputJobType) {
      structureLocation = this.reactionStructures;
    } else {
      console.warn(`No custom structures for job type. ${inputJobType}`);
      return null;
    }
    if (!Array.isArray(structureLocation)) {
      console.error("Structure location is not an array.");
      return null;
    }

    return (
      structureLocation.find((obj) => obj.default) ||
      structureLocation[0] ||
      null
    );
  }
}
// const applicationSettingsConverter = {
//   toFirestore: (settings) => {
//     return {
//       cloudAccounts: settings.cloudAccounts,
//       hideTutorials: settings.hideTutorials,
//       localMarketDisplay: settings.localMarketDisplay,
//       localOrderDisplay: settings.localOrderDisplay,
//       esiJobTab: settings.esiJobTab,
//       defaultMarket: settings.defaultMarket,
//       defaultOrders: settings.defaultOrders,
//       hideCompleteMaterials: settings.hideCompleteMaterials,
//       defaultAssetLocation: settings.defaultAssetLocation,
//       citadelBrokersFee: settings.citadelBrokersFee,
//       manufacturingStructures: settings.manufacturingStructures,
//       reactionStructures: settings.reactionStructures,
//     };
//   },
//   fromFirestore: (snapshot, options) => {
//     const data = snapshot.data(options);
//     return new ApplicationSettings(data);
//   },
// };

export function importApplicationSettingsFromDocument(userObject) {
  return new ApplicationSettings(userObject?.settings);
}

export function convertApplicationSettingsToDocument(settingsObject) {
  const {
    cloudAccounts,
    citadelBrokersFee,
    enableCompactView,
    defaultMaterialEfficiencyValue,
    defaultAssetLocation,
    defaultMarket,
    defaultOrders,
    hideCompleteMaterials,
    esiJobTab,
    hideTutorials,
    localMarketDisplay,
    localOrderDisplay,
  } = settingsObject;
  return {
    account: {
      cloudAccounts,
    },
    editJob: {
      citadelBrokersFee,
      defaultAssetLocation,
      defaultMarket,
      defaultOrders,
      hideCompleteMaterials,
      defaultMaterialEfficiencyValue,
    },
    layout: {
      esiJobTab,
      hideTutorials,
      localMarketDisplay,
      localOrderDisplay,
      enableCompactView,
    },
    structures: {
      manufacturing: settingsObject.manufacturingStructures,
      reaction: settingsObject.reactionStructures,
    },
  };
}
