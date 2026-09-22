import {
  customStructureLocationMap,
  structureKinds,
} from "../Context/defaultValues";
import {
  getRigInfoFromID,
  getStructureInfoFromID,
} from "../Functions/Helper/getStructureInfo";
import { reprocessingItemTypes } from "../Context/defaultValues";
import GLOBAL_CONFIG from "../global-config-app";
import DOMPurify from "dompurify";
import coerceFiniteNumber from "../Functions/Helper/coerceFiniteNumber";
import coerceTaxPercentage from "../Functions/Helper/coerceTaxPercentage";
import rigSlotBonuses from "../Functions/Helper/rigSlotBonuses";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * The fields a kind of structure carries beyond the ones every kind has.
 *
 * A kind's entry decides which optional fields it reads, writes and stores; a
 * field absent from the entry stays unset and is left out of the document.
 * Adding a kind is an entry here, not a new class.
 *
 * @type {Object<number, {built?: boolean, rigSlots?: boolean, implant?: boolean,
 *   systemID?: boolean}>}
 */
const fieldsByJobType = {
  // `built` is the three fields a place a job is performed in carries: a
  // security modifier, a structure type carrying bonuses, and an installation
  // tax.
  [structureKinds.manufacturing]: {
    built: true,
    rigSlots: true,
    systemID: true,
  },
  [structureKinds.reaction]: { built: true, rigSlots: true, systemID: true },
  [structureKinds.reprocessing]: { built: true, rigSlots: true, implant: true },
  [structureKinds.invention]: { built: true, rigSlots: true },
};

/**
 * A structure a user has described so their jobs can be costed in it: where it
 * is, what it is, what rigs it carries, and what it charges.
 *
 * One class serves every kind. `jobType` says which kind a row is, and the
 * optional fields it carries follow from that rather than from which class built
 * it — so a caller holding a list of mixed kinds can read any of them.
 *
 * Every value arrives from a text field or a stored document, so the class
 * settles each one as it is set: a name is sanitised, and a number that is not
 * one falls back.
 *
 * **Tax is a percentage, not a fraction** — `2.5` means 2.5%, and a consumer
 * divides by 100 at the point it costs something. A reader types a percentage
 * and every screen prints one, so storing a fraction would make the stored
 * number disagree with the one the user entered. It is also never negative: a
 * structure charges or it does not.
 *
 * @class Structure
 */
class Structure {
  /**
   * @param {Object} [existingValue] - Stored structure data, or nothing for a new one
   * @param {string} [existingValue.id] - Structure id
   * @param {number} [existingValue.jobType] - One of `structureKinds`
   * @param {string} [existingValue.name] - Structure name
   * @param {number} [existingValue.systemType] - System security type id
   * @param {number} [existingValue.structureType] - Structure type id
   * @param {number} [existingValue.tax] - Tax as a percentage, so 2.5 means 2.5%
   * @param {boolean} [existingValue.default] - Whether this is its kind's default
   * @param {number} [existingValue.rigSlot1] - First rig slot id
   * @param {number} [existingValue.rigSlot2] - Second rig slot id
   * @param {number} [existingValue.implant] - Implant id, on the kinds that have one
   * @param {number} [existingValue.systemID] - System id, on the kinds that have one
   * @param {number} [jobType] - The kind, for a new structure that does not name its own
   */
  constructor(existingValue, jobType) {
    this.jobType = existingValue?.jobType ?? jobType ?? 0;
    this.id =
      existingValue?.id ??
      `${customStructureLocationMap[this.jobType]}-${crypto.randomUUID()}`;
    this.name = existingValue?.name ?? "";
    this.default = existingValue?.default ?? false;

    const fields = this.fields;
    if (fields.built) {
      this.systemType = existingValue?.systemType ?? 0;
      this.structureType = existingValue?.structureType ?? 0;
      this.tax = coerceTaxPercentage(existingValue?.tax);
    }
    if (fields.rigSlots) {
      this.rigSlot1 = existingValue?.rigSlot1 ?? 0;
      this.rigSlot2 = existingValue?.rigSlot2 ?? 0;
    }
    if (fields.implant) {
      this.implant = existingValue?.implant ?? 0;
    }
    if (fields.systemID) {
      this.systemID = coerceFiniteNumber(
        existingValue?.systemID,
        DEFAULT_SYSTEM,
      );
    }
  }

  /**
   * Which optional fields this structure's kind carries.
   *
   * @returns {{built?: boolean, rigSlots?: boolean, implant?: boolean,
   *   systemID?: boolean}}
   */
  get fields() {
    return fieldsByJobType[this.jobType] ?? {};
  }

  /**
   * Sets the structure name. The name is what a user typed, so it is sanitised
   * here rather than at each place that collects it.
   *
   * @param {string} name - Structure name to set
   */
  setName(name) {
    this.name = DOMPurify.sanitize(name, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  }

  /**
   * @param {number} structureType - Structure type id
   */
  setStructureType(structureType) {
    this.structureType = structureType;
  }

  /**
   * @param {number} systemType - System security type id
   */
  setSystemType(systemType) {
    this.systemType = systemType;
  }

  /**
   * @param {number} rigSlot1 - First rig slot id
   */
  setRigSlot1(rigSlot1) {
    this.rigSlot1 = rigSlot1;
  }

  /**
   * @param {number} rigSlot2 - Second rig slot id
   */
  setRigSlot2(rigSlot2) {
    this.rigSlot2 = rigSlot2;
  }

  /**
   * @param {number} implant - Implant id
   */
  setImplant(implant) {
    this.implant = implant;
  }

  /**
   * @param {number} systemID - System id
   */
  setSystemID(systemID) {
    this.systemID = coerceFiniteNumber(systemID, DEFAULT_SYSTEM);
  }

  /**
   * @param {number} tax - Tax as a percentage, so 2.5 means 2.5%
   */
  setTax(tax) {
    this.tax = coerceTaxPercentage(tax);
  }

  /**
   * @param {boolean} isDefault - Whether this is its kind's default
   */
  setDefault(isDefault) {
    this.default = isDefault;
  }

  /**
   * What this structure's two rigs give, taken per axis.
   *
   * Answers zeros for a kind that carries no rig slots, so a caller holding a
   * mixed list does not have to ask what kind it is holding first.
   *
   * @returns {{material: number, time: number, cost: number, value: number}}
   */
  get rigBonuses() {
    if (!this.fields.rigSlots) {
      return { material: 0, time: 0, cost: 0, value: 0 };
    }
    return rigSlotBonuses(this.jobType, this.rigSlot1, this.rigSlot2);
  }

  /**
   * The bonus this structure's rigs give one reprocessing item type.
   *
   * Reprocessing rigs are the one kind whose value depends on what is being
   * worked on, so this asks each rig whether it applies before taking the
   * better of the two. Every other kind reads {@link Structure#rigBonuses}.
   *
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} The rig bonus, or 0 when none applies
   */
  rigBonusFor(itemType = 0) {
    if (!this.fields.rigSlots) return 0;

    const rigObjects = [
      getRigInfoFromID(this.jobType, this.rigSlot1),
      getRigInfoFromID(this.jobType, this.rigSlot2),
    ];
    let maxValue = 0;

    for (const rig of rigObjects) {
      if (rig && rig.appliesTo?.includes(itemType)) {
        maxValue = Math.max(rig.value, maxValue);
      }
    }
    return maxValue;
  }

  /**
   * The bonus the structure itself gives an item type.
   *
   * @param {number} itemType - Reprocessing item type (ore, gas, ice, moon ore)
   * @returns {number} The structure bonus, or 0 when it gives none
   */
  structureBonusFor(itemType = 0) {
    const structureObject = getStructureInfoFromID(
      this.jobType,
      this.structureType,
    );
    if (!structureObject) return 0;

    if (
      itemType === reprocessingItemTypes.ore ||
      itemType === reprocessingItemTypes.moonOre ||
      itemType === reprocessingItemTypes.ice
    ) {
      return structureObject.ore ?? 0;
    }
    if (itemType === reprocessingItemTypes.gas) {
      return structureObject.gas ?? 0;
    }
    return 0;
  }

  /**
   * Converts the structure to a document object for storage.
   *
   * Carries the optional fields its kind uses and leaves out the rest, so a
   * stored row holds what its kind means and nothing it does not.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    const fields = this.fields;
    return {
      id: this.id,
      jobType: this.jobType,
      name: this.name,
      default: this.default,
      ...(fields.built
        ? {
            systemType: this.systemType,
            structureType: this.structureType,
            tax: this.tax,
          }
        : {}),
      ...(fields.rigSlots
        ? { rigSlot1: this.rigSlot1, rigSlot2: this.rigSlot2 }
        : {}),
      ...(fields.implant ? { implant: this.implant } : {}),
      ...(fields.systemID ? { systemID: this.systemID } : {}),
    };
  }
}

export default Structure;
