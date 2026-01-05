import Setup from "../../Classes/jobSetupConstructor";
import findSystemIndexForJob from "./findSystemIndexValue";
import { structureTypeMap, jobTypes } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import { SCC_SURCHARGE, ALPHA_CLONE_TAX } from "../../Context/defaultValues";

/**
 * Calculates the install cost for a given setup.
 * 
 * @param {Setup} setup - The setup to calculate the install cost for
 * @param {Object} additionalMaterialPrices - Additional material prices to use
 * @param {Object} additionalSystemIndexValues - Additional system index values to use
 * @returns {number} The install cost for the given setup
 */

export default function calculateInstallCostfromSetup(setup, additionalMaterialPrices = {}, additionalSystemIndexValues = {}) {
    if (!(setup instanceof Setup)) return 0;

    const estimatedItemValue = estimatedItemPriceCalc(
        setup.materialCount,
        setup.jobCount,
        additionalMaterialPrices
    );

    const facilityModifier = findFacilityModifier(
        setup.structureID,
        setup.jobType
    );

    const facilityTax = findFacilityTax(
        setup.customStructureID,
        setup.structureID,
        setup.jobType,
        setup.taxValue
    );

    const systemIndexValue = findSystemIndexForJob(
        setup.systemID,
        setup.jobType,
        setup.useAlternativeSystemIndexValue,
        setup.alternativeSystemIndexValue,
        additionalSystemIndexValues
    );

    const cloneValue = findCloneValue(setup.selectedCharacter);

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

    return installCost;
}

function estimatedItemPriceCalc(materialArray, jobCount, additionalMaterialPrices) {
    if (!materialArray || typeof materialArray !== 'object') {
        return 0;
    }
    
    return Math.ceil(
        Object.values(materialArray).reduce((preValue, material) => {
            return (preValue += estimatedMaterialPriceCalc(
                material.quantity / jobCount,
                material.typeID,
                additionalMaterialPrices
            ));
        }, 0)
    );
}
function estimatedMaterialPriceCalc(materialQuantity, materialTypeID, additionalMaterialPrices) {
    const adjustedPrice = useUsersStore
        .getState()
        .worldData.actions.findMarketData(
            materialTypeID,
            additionalMaterialPrices
        )?.adjustedPrice;

    return materialQuantity * adjustedPrice;
}

function findFacilityModifier(structureID, jobType) {
    return structureTypeMap[jobType][structureID]?.cost || 0;
}

function findFacilityTax(facilityID, structureType, jobType, taxValue) {
    if (
        jobType === jobTypes.manufacturing &&
        structureType === structureTypeMap[jobTypes.manufacturing].id
    ) {
        return structureTypeMap[jobTypes.manufacturing].defaultTax / 100;
    }

    if (!facilityID) return taxValue / 100;

    const parentUser = useUsersStore.getState().users.actions.findParentUser();
    if (!parentUser) return 0;

    return useUsersStore.getState().applicationSettings.actions.getCustomStructureWithID(facilityID)?.tax / 100 || 0;
}

function findCloneValue(inputCharacterHash) {
    const matchedCharacter = useUsersStore
        .getState()
        .users.actions.findUserByCharacterHash(inputCharacterHash);

    return matchedCharacter?.isOmega ? 0 : ALPHA_CLONE_TAX / 100;
}