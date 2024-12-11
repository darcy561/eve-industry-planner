import uuid from "react-uuid";
import {
  customStructureLocationMap,
  customStructureMap,
  jobTypes,
} from "../Context/defaultValues";
import GLOBAL_CONFIG from "../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

class ApplicationSettingsObject {
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
    this.exemptTypeIDs = new Set(settings?.exemptTypeIDs || []);
    this.automaticJobRecalculation =
      settings?.automaticJobRecalculation || false;
    this.ignoreItemsWithoutBlueprits =
      settings?.ignoreItemsWithoutBlueprits || false;
  }

  toDocument() {
    return {
      account: {
        cloudAccounts: this.cloudAccounts,
      },
      editJob: {
        citatadelBrokersFee: this.citadelBrokersFee,
        defaultAssetLocation: this.defaultAssetLocation,
        defaultMarket: this.defaultMarket,
        defaultOrders: this.defaultOrders,
        hideCompleteMaterials: this.hideCompleteMaterials,
        defaultMaterialEfficiencyValue: this.defaultMaterialEfficiencyValue,
      },
      layout: {
        esiJobTab: this.esiJobTab,
        hideTutorials: this.hideTutorials,
        localMarketDisplay: this.localOrderDisplay,
        localOrderDisplay: this.localOrderDisplay,
        enableCompactView: this.enableCompactView,
      },
      structures: {
        manufacturing: this.manufacturingStructures,
        reaction: this.reactionStructures,
      },
      exemptTypeIDs: [...this.exemptTypeIDs],
      automaticJobRecalculation: this.automaticJobRecalculation,
      ignoreItemsWithoutBlueprits: this.ignoreItemsWithoutBlueprits,
    };
  }

  toggleCloudAccounts() {
    return new ApplicationSettingsObject({
      ...this,
      cloudAccounts: !this.cloudAccounts,
    });
  }

  toggleHideTutorials() {
    return new ApplicationSettingsObject({
      ...this,
      hideTutorials: !this.hideTutorials,
    });
  }

  toggleEnableCompactView() {
    return new ApplicationSettingsObject({
      ...this,
      enableCompactView: !this.enableCompactView,
    });
  }

  updatelocalMarketDisplay(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      localMarketDisplay: newValue,
    });
  }

  updateLocaleOrderDisplay(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      localOrderDisplay: newValue,
    });
  }

  updateEsiJobTab(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      esiJobTab: newValue,
    });
  }

  updateDefaultMaterialEfficiencyValue(newValue) {
    if (!newValue) return this;

    return new ApplicationSettingsObject({
      ...this,
      defaultAssetLocation: newValue,
    });
  }

  updateDefaultMarket(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      defaultMarket: newValue,
    });
  }

  updateDefaultOrders(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      defaultOrders: newValue,
    });
  }

  toggleHideCompleteMaterials() {
    return new ApplicationSettingsObject({
      ...this,
      hideCompleteMaterials: !this.hideCompleteMaterials,
    });
  }

  updateDefaultAssetLocation(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      defaultAssetLocation: newValue,
    });
  }

  updateCitadelBrokersFee(newValue) {
    if (!newValue) return this;
    return new ApplicationSettingsObject({
      ...this,
      citadelBrokersFee: newValue,
    });
  }

  updateExemptTypeIDs(newValue) {
    if (!newValue) return this;
    this.exemptTypeIDs.add(newValue);
    return new ApplicationSettingsObject(this);
  }

  checkTypeIDisExempt(inputTypeID) {
    if (!inputTypeID) return false;

    return this.exemptTypeIDs.has(inputTypeID);
  }

  addCustomManufacturingStructure(structure) {
    if (!structure) return this;
    this.manufacturingStructures.push(structure);
    return new ApplicationSettingsObject(this);
  }

  removeCustomManufacturingStructure(structure) {
    if (!structure) return;
    this.manufacturingStructures = this.manufacturingStructures.filter(
      (i) => i.id !== structure.id
    );
    if (this.manufacturingStructures.length > 0 && structure.default) {
      this.manufacturingStructures[0].default = true;
    }
    return new ApplicationSettingsObject(this);
  }

  setDefaultCustomManufacturingStructure(id) {
    if (!id) return;
    this.manufacturingStructures.forEach((obj) =>
      obj.id === id ? (obj.default = true) : (obj.default = false)
    );
    return new ApplicationSettingsObject(this);
  }

  addCustomReactionStructure(structure) {
    if (!structure) return this;
    this.reactionStructures.push(structure);
    return new ApplicationSettingsObject(this);
  }

  removeCustomReactionStructure(structure) {
    if (!structure) return;
    this.reactionStructures = this.reactionStructures.filter(
      (i) => i.id !== structure.id
    );
    if (this.reactionStructures.length > 0 && structure.default) {
      this.reactionStructures[0].default = true;
    }
    return new ApplicationSettingsObject(this);
  }

  setDefaultCustomReactionStructure(id) {
    if (!id) return;
    this.reactionStructures.forEach((obj) =>
      obj.id === id ? (obj.default = true) : (obj.default = false)
    );
    return new ApplicationSettingsObject(this);
  }

  getCustomStructureWithID(structureID) {
    if (!structureID) return null;
    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return;
    }

    const storageLocationKey = [customStructureMap[jobType]];
    const storageLocation = this[storageLocationKey];

    if (!storageLocation) {
      console.error("No Matching Storage Location");
      return;
    }

    const foundStructure = storageLocation.find(
      (obj) => obj.id === structureID
    );

    if (!foundStructure) {
      console.warn(`No structure found with ID ${structureID}.`);
      return null;
    }

    return foundStructure;
  }

  getDefaultCustomStructureWithJobType(inputJobType) {
    if (!inputJobType) return null;

    const structureKey = customStructureMap[inputJobType];
    const structureLocation = this[structureKey];

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

  addCustomStructure(
    jobType,
    name,
    structureType,
    rigType,
    tax,
    systemID,
    systemType
  ) {
    if (
      [jobType, name, structureType, rigType, tax, systemID, systemType].some(
        (param) => param === undefined
      )
    ) {
      console.error("Unable to add structurem, missing requirements");
      return;
    }

    const storageLocation = this[customStructureMap[jobType]];

    const structureObject = {
      id: `${customStructureLocationMap[jobType]}-${uuid()}`,
      name,
      systemType,
      structureType,
      rigType,
      systemID,
      tax,
      default: storageLocation.length === 0 ? true : false,
    };
    storageLocation.push(structureObject);

    return new ApplicationSettingsObject(this);
  }

  setDefaultCustomStructure(structureID) {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }

    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return;
    }

    const storageLocation = this[customStructureMap[jobType]];

    if (!storageLocation) {
      console.error("No Matching Storage Location");
      return;
    }

    const matchingStructure = storageLocation.find(
      ({ id }) => id === structureID
    );

    if (!matchingStructure) {
      console.error("No Matching Structure");
      return;
    }

    matchingStructure.default = true;

    for (let structure of storageLocation) {
      if (structure.id !== structureID) {
        structure.default = false;
      }
    }

    return new ApplicationSettingsObject(this);
  }

  deleteCustomStructure(structureID) {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }

    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return;
    }

    const storageLocationKey = [customStructureMap[jobType]];
    const storageLocation = this[storageLocationKey];

    if (!storageLocation) {
      console.error("No Matching Storage Location");
      return;
    }

    const matchingStructure = storageLocation.find(
      ({ id }) => id === structureID
    );

    if (!matchingStructure) {
      console.error("No Matching Structure");
      return;
    }

    this[storageLocationKey] = storageLocation.filter(
      ({ id }) => id !== structureID
    );

    if (matchingStructure.default && this[storageLocationKey].length > 0) {
      this[storageLocationKey][0].default = true;
    }
    return new ApplicationSettingsObject(this);
  }

  addExemptTypeID(inputValue) {
    if (!inputValue) return;
    const inputAsArray =
      Array.isArray(inputValue) || inputValue instanceof Set
        ? [...inputValue]
        : [inputValue];

    this.exemptTypeIDs = new Set([...this.exemptTypeIDs, ...inputAsArray]);
    return new ApplicationSettingsObject(this);
  }
  removeExemptTypeID(inputValue) {
    if (!inputValue) return;
    const inputAsArray =
      Array.isArray(inputValue) || inputValue instanceof Set
        ? [...inputValue]
        : [inputValue];

    this.exemptTypeIDs = new Set(
      [...this.exemptTypeIDs].filter((i) => !inputAsArray.includes(i))
    );
    return new ApplicationSettingsObject(this);
  }
}

export default ApplicationSettingsObject;
