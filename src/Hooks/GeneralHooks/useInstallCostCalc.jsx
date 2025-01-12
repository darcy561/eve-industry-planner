import { useContext } from "react";
import { SystemIndexContext } from "../../Context/EveDataContext";
import { customStructureMap, jobTypes } from "../../Context/defaultValues";
import { UsersContext } from "../../Context/AuthContext";
import { structureOptions } from "../../Context/defaultValues";
import { useHelperFunction } from "./useHelperFunctions";
import { ApplicationSettingsContext } from "../../Context/LayoutContext";

export function useInstallCostsCalc() {
  const { systemIndexData } = useContext(SystemIndexContext);
  const { users } = useContext(UsersContext);
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { findParentUser, findItemPriceObject } = useHelperFunction();

  const jobTypeMapping = {
    [jobTypes.manufacturing]: "manufacturing",
    [jobTypes.reaction]: "reaction",
  };

  const structureTypeMap = {
    [jobTypes.manufacturing]: structureOptions.manStructure,
    [jobTypes.reaction]: structureOptions.reactionStructure,
  };

  const DEFAULT_STATION_TAX =
    structureTypeMap[jobTypes.manufacturing].defaultTax;
  const SCC_SURCHARGE = 4.0 / 100;
  const ALPHA_CLONE_TAX = 0.25;

  function calculateInstallCostFromJob(
    inputSetup,
    additionalMaterialPrices,
    additionalSystemIndexValues
  ) {
    if (!inputSetup) return 0;
      
    const estimatedItemValue = estimatedItemPriceCalc(
      inputSetup.materialCount,
      inputSetup.jobCount,
      additionalMaterialPrices
    );

    const facilityModifier = findFacilityModifier(
      inputSetup.structureID,
      inputSetup.jobType
    );

    const facilityTax = findFacilityTax(
      inputSetup.customStructureID,
      inputSetup.structureID,
      inputSetup.jobType,
      inputSetup.taxValue
    );

    const systemIndexValue = findSystemIndex(
      inputSetup.systemID,
      inputSetup.jobType,
      additionalSystemIndexValues
    );

    const cloneValue = findCloneValue(inputSetup.selectedCharacter);

    const taxModifierTotal =
      estimatedItemValue *
      (systemIndexValue * facilityModifier +
        facilityTax +
        SCC_SURCHARGE +
        cloneValue);

    const systemIndexDeduction = Math.ceil(
      systemIndexValue * estimatedItemValue
    );

    const facilityBonusDeduction = Math.ceil(
      facilityModifier * systemIndexDeduction
    );

    const jobGrossCost = systemIndexDeduction - facilityBonusDeduction;

    const installCost = jobGrossCost + taxModifierTotal;

    function findSystemIndex(
      requiredSystemID,
      jobType,
      alternativeSystemIndexData
    ) {
      if (
        systemIndexData[requiredSystemID] ||
        !alternativeSystemIndexData ||
        !alternativeSystemIndexData[requiredSystemID]
      ) {
        return (
          systemIndexData[requiredSystemID]?.[jobTypeMapping[jobType]] || 0
        );
      } else {
        return alternativeSystemIndexData[requiredSystemID]?.[
          jobTypeMapping[jobType] || 0
        ];
      }
    }

    return installCost;
  }

  function estimatedItemPriceCalc(materialArray, jobCount, pricesArray) {
    return Math.ceil(
      Object.values(materialArray).reduce((preValue, material) => {
        return (preValue += estimatedMaterialPriceCalc(
          material.quantity / jobCount,
          material.typeID,
          pricesArray
        ));
      }, 0)
    );
  }

  function estimatedMaterialPriceCalc(
    materialQuantity,
    materialTypeID,
    pricesArray
  ) {
    if (!pricesArray) {
      pricesArray = [];
    }

    const adjustedPrice = findItemPriceObject(
      materialTypeID,
      pricesArray
    )?.adjustedPrice;

    return materialQuantity * adjustedPrice;
  }

  function findFacilityTax(facilityID, structureType, jobType, taxValue) {
    if (
      jobType === jobTypes.manufacturing &&
      structureType === structureTypeMap[jobTypes.manufacturing].id
    ) {
      return DEFAULT_STATION_TAX / 100;
    }

    if (!facilityID) return taxValue / 100;

    const parentUser = findParentUser();
    if (!parentUser) return 0;

    return (
      applicationSettings.getCustomStructureWithID(facilityID)?.tax / 100 || 0
    );
  }

  function findCloneValue(inputCharacterHash) {
    const matchedCharacter = users.find(
      (i) => i.CharacterHash === inputCharacterHash
    );

    return matchedCharacter?.isOmega ? 0 : ALPHA_CLONE_TAX / 100;
  }

  function findFacilityModifier(inputFacilityID, jobType) {
    return structureTypeMap[jobType][inputFacilityID]?.cost || 0;
  }

  return { calculateInstallCostFromJob };
}
