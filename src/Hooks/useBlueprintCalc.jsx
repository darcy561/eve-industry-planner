import { useContext } from "react";
import { UsersContext } from "../Context/AuthContext";
import { jobTypes } from "../Context/defaultValues";
import { structureOptions } from "../Context/defaultValues";
import { PersonalESIDataContext } from "../Context/EveDataContext";
import { useHelperFunction } from "./GeneralHooks/useHelperFunctions";

export function useBlueprintCalc() {
  const { users } = useContext(UsersContext);
  const { esiSkills } = useContext(PersonalESIDataContext);
  const { findParentUser } = useHelperFunction();

  function calculateResources(calcData) {
    switch (calcData.jobType) {
      case jobTypes.manufacturing:
        const manStructureData = getStructureData(
          "manStructure",
          calcData.structureID
        );

        const manRigData = getStructureData("manRigs", calcData.rigID);
        const manSystemData = getSystemData("manSystem", calcData.systemTypeID);

        return updateMaterialQuantities(calcData.materialCount, (rawQuantity) =>
          manufacturingMaterialCalc(
            rawQuantity,
            calcData.runCount,
            calcData.jobCount,
            calcData.ME,
            manStructureData,
            manRigData,
            manSystemData
          )
        );

      case jobTypes.reaction:
        const reactionRigData = getStructureData(
          "reactionRigs",
          calcData.rigID
        );
        const reactionSystemData = getSystemData(
          "reactionSystem",
          calcData.systemTypeID
        );

        return updateMaterialQuantities(calcData.materialCount, (rawQuantity) =>
          reactionMaterialCalc(
            rawQuantity,
            calcData.runCount,
            calcData.jobCount,
            reactionRigData,
            reactionSystemData
          )
        );
    }
    function manufacturingMaterialCalc(
      baseQty,
      itemRuns,
      itemJobs,
      bpME,
      structureType,
      rigType,
      systemType
    ) {
      const meModifier =
        (1 - bpME / 100) *
        (1 - structureType / 100) *
        (1 - (rigType / 100) * systemType);
      const materialTotal =
        baseQty === 1 ? itemRuns * baseQty : itemRuns * baseQty * meModifier;

      return Math.max(Math.ceil(materialTotal) * itemJobs, 1);
    }

    function reactionMaterialCalc(
      baseQty,
      itemRuns,
      itemJobs,
      rigType,
      systemMultiplyer
    ) {
      const meModifier = 1 - (rigType / 100) * systemMultiplyer;
      const materialTotal =
        baseQty === 1 ? itemRuns * baseQty : itemRuns * baseQty * meModifier;

      return Math.max(Math.ceil(materialTotal) * itemJobs, 1);
    }

    function updateMaterialQuantities(materialCount, calculateMaterial) {
      Object.values({ ...materialCount }).forEach((material) => {
        material.quantity = calculateMaterial(material.rawQuantity);
      });
      return materialCount;
    }
  }

  function getSystemData(materialType, id) {
    return structureOptions[materialType][id]?.value || 0;
  }
  function getStructureData(materialType, id) {
    return structureOptions[materialType][id]?.material || 0;
  }
  const calculateTime = (calcData, jobSkills) => {
    let user =
      users.find((i) => i.CharacterHash === calcData.selectedCharacter) ||
      findParentUser();

    const userSkills =
      esiSkills.find((i) => i.user === user.CharacterHash)?.data || {};

    const timeModifier = timeModifierCalc(calcData, userSkills);
    const skillModifier = skillModifierCalc(jobSkills, userSkills);

    return Math.floor(
      calcData.rawTime * timeModifier * skillModifier * calcData.runCount
    );

    function timeModifierCalc(job, userSkills) {
      if (job.jobType === jobTypes.manufacturing) {
        const indySkill = userSkills[3380]?.activeLevel || 0;
        const advIndySkill = userSkills[3388]?.activeLevel || 0;
        const strucData = structureOptions.manStructure[job.structureID].time;
        const rigData = structureOptions.manRigs[job.rigID].time;

        let teIndexer = 1;
        let indyIndexer = 1 - 0.04 * indySkill;
        let advIndyIndexer = 1 - 0.03 * advIndySkill;
        let strucIndexer = 1 - strucData;
        let rigIndexer = 1 - rigData;

        for (let x = 1; x <= job.TE; x++) {
          teIndexer = teIndexer - 0.01;
          if (teIndexer < 0.8) {
            teIndexer = 0.8;
          }
        }
        if (indyIndexer < 0.8) {
          indyIndexer = 0.8;
        }
        if (advIndyIndexer < 0.85) {
          advIndyIndexer = 0.85;
        }

        return (
          teIndexer * indyIndexer * advIndyIndexer * strucIndexer * rigIndexer
        );
      }
      if (job.jobType === jobTypes.reaction) {
        const reactionSkill = userSkills[45746].activeLevel || 0;
        const strucData =
          structureOptions.reactionStructure[job.structureID].time;
        const rigData = structureOptions.reactionRigs[job.rigID].time;

        let reacIndexer = 1 - 0.04 * reactionSkill;
        let strucIndexer = 1 - strucData;
        let rigIndexer = 1 - rigData;

        if (reacIndexer < 0.8) {
          reacIndexer = 0.8;
        }

        return reacIndexer * strucIndexer * rigIndexer;
      }
    }

    function skillModifierCalc(reqSkills, userSkills) {
      const skillsToIgnore = new Set([3380, 3388, 45746, 22242]);
      let indexer = 1;
      if (!reqSkills) {
        return indexer;
      }

      reqSkills.forEach((skill) => {
        let { id, activeLevel } = userSkills[skill.typeID] || {};

        if (id && activeLevel && !skillsToIgnore.has(id)) {
          indexer -= 0.01 * activeLevel;
        }
      });
      return indexer;
    }
  };

  return {
    calculateTime,
    calculateResources,
  };
}
