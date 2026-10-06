import {
  jobTypes,
  reprocessingItemTypes,
} from "../../../Context/defaultValues";
import { structureFromDocument } from "../../Custom Structures/customStructure";
import { getImplantFromID } from "../../Industry Facilities/getStructureInfo";
import { reprocessFromItemType } from "./reprocessingFormulas";
import {
  rigBonusFor,
  rigSecurityFor,
  structureBonusFor,
} from "./reprocessingBonuses";

/** The skill every reprocessing yield is raised by: Reprocessing. */
export const reprocessingSkillID = 3385;

/** The second skill every reprocessing yield is raised by: Reprocessing Efficiency. */
export const reprocessingEfficiencySkillID = 3389;

/**
 * Everything a reprocessing yield needs, resolved once from a structure and a character's skills,
 * so the setup can be passed on its own to whatever reprocesses or chooses ore.
 *
 * @param {Object} [structure] - the structure reprocessed in; an NPC station when absent
 * @param {Object<string|number, number>} [skills] - skill levels keyed by skill type id
 * @returns {Readonly<{kinds: Object<number, {rig: number, rigSecurity: number, structure: number}>,
 *   implant: number, skills: Object<string, number>, taxPercent: number}>}
 */
export function reprocessingSetupFrom(
  structure = structureFromDocument(undefined, jobTypes.reprocessing),
  skills = {},
) {
  const kinds = {};
  for (const kind of Object.values(reprocessingItemTypes)) {
    kinds[kind] = Object.freeze({
      rig: rigBonusFor(structure, kind),
      rigSecurity: rigSecurityFor(structure, kind),
      structure: structureBonusFor(structure, kind),
    });
  }

  return Object.freeze({
    kinds: Object.freeze(kinds),
    implant:
      getImplantFromID(structure?.jobType, structure?.implant)?.value ?? 0,
    skills: Object.freeze({ ...skills }),
    taxPercent: structure?.tax ?? 0,
  });
}

/**
 * The yield, as a percentage, one item reprocesses at in a setup.
 *
 * @param {ReturnType<typeof reprocessingSetupFrom>} setup
 * @param {{itemType: number, reprocessingSkill: number}} item
 * @returns {number}
 */
export function yieldFor(setup, item) {
  const kind = setup.kinds[item.itemType];
  if (!kind) return 0;

  return reprocessFromItemType(
    item.itemType,
    kind.rig,
    kind.rigSecurity,
    kind.structure,
    setup.skills[reprocessingSkillID] ?? 0,
    setup.skills[reprocessingEfficiencySkillID] ?? 0,
    setup.skills[item.reprocessingSkill] ?? 0,
    setup.implant,
  );
}
