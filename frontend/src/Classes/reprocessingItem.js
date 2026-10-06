import { reprocessingItemTypes } from "../Context/defaultValues";
import {
  reprocessingSetupFrom,
  yieldFor,
} from "../Functions/Reprocessing/engine/reprocessingSetup";
import { reprocessedQuantity } from "../Functions/Reprocessing/engine/reprocess";

/** One reprocessable item held in some quantity, and what it reprocesses into in a given setup. */
class ReprocessingItem {
  /**
   * @param {Object} ore - Ore/item data object
   * @param {number} ore.id - Item ID
   * @param {string} ore.name - Item name
   * @param {Object} ore.materials - Materials output object (typeID: quantity)
   * @param {number} ore.batchSize - Batch size for reprocessing
   * @param {number} ore.itemType - Item type (ore, gas, ice, moon ore)
   * @param {number} ore.reprocessingSkill - Required reprocessing skill type ID
   */
  constructor(ore) {
    this.id = ore.id;
    this.name = ore.name;
    this.materials = { ...ore.materials };
    this.reprocessedMaterials = { ...ore.materials };
    this.batchSize = ore.batchSize;
    this.itemType = ore.itemType;
    this.reprocessingSkill = ore.reprocessingSkill;
    this.totalQuantity = 0;
    this.percentageYield = 50;
    this.unitPrice = 0;
  }

  /**
   * @param {number} inputNumber - Quantity to add
   */
  addToTotalQuantity(inputNumber) {
    this.totalQuantity += inputNumber;
  }

  /**
   * @param {number} inputNumber - Total quantity to set
   */
  setTotalQuantity(inputNumber) {
    this.totalQuantity = inputNumber;
  }

  /**
   * How much of what is held can go through the reprocessing plant: whole
   * batches only.
   *
   * @returns {number}
   */
  get reprocessableQuantity() {
    return Math.floor(this.totalQuantity / this.batchSize) * this.batchSize;
  }

  /**
   * What is left over once the whole batches are taken out.
   *
   * @returns {number}
   */
  get remainingQuantity() {
    return this.totalQuantity % this.batchSize;
  }

  /**
   * How many batches will be reprocessed.
   *
   * @returns {number}
   */
  get batchCount() {
    return Math.floor(this.totalQuantity / this.batchSize);
  }

  /**
   * Works out the yield and what the held batches give, in a setup resolved once by the caller.
   *
   * @param {ReturnType<typeof reprocessingSetupFrom>} [setup] - an NPC station with no skills when absent
   */
  reprocessMaterials(setup = reprocessingSetupFrom()) {
    this.percentageYield = yieldFor(setup, this);

    const batches =
      this.itemType === reprocessingItemTypes.gas ? this.batchCount : 1;
    for (let [id, value] of Object.entries(this.materials)) {
      this.reprocessedMaterials[id] = reprocessedQuantity(
        value,
        batches,
        this.percentageYield,
        this.itemType,
      );
    }
  }
}

export default ReprocessingItem;
