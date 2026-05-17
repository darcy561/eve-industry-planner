import useUsersStore from "../Zustand/usersStore";

/**
 * ShoppingList class for EVE Online industry material purchasing management.
 * 
 * This class represents a shopping list for industry job materials:
 * - Material requirement aggregation from multiple jobs
 * - Asset quantity tracking and purchasing calculations
 * - Volume and value calculations for logistics planning
 * - Child job material visibility management
 * - Clipboard import/export functionality
 * - Asset integration for inventory management
 * 
 * The ShoppingList class provides comprehensive material management:
 * - Aggregates material requirements from selected jobs
 * - Calculates quantities needed after accounting for existing assets
 * - Provides volume and value calculations for logistics
 * - Manages visibility of child job materials
 * - Supports clipboard operations for external tools
 * - Integrates with asset management systems
 * 
 * @class ShoppingList
 * @example
 * // Create shopping list from jobs
 * const shoppingList = new ShoppingList([job1, job2, job3]);
 * 
 * @example
 * // Calculate totals and visibility
 * shoppingList.calculateTotalVolume();
 * shoppingList.calculateVisibleItems({ displayChildJobMaterials: true });
 * shoppingList.calculateTotalValue();
 * 
 * @example
 * // Export to clipboard
 * const clipboardText = shoppingList.buildStringForClipboard();
 * 
 * @example
 * // Import assets
 * shoppingList.importAssetsFromClipboard(importedAssets);
 * shoppingList.applyAssetsFromMap(assetsMap, countFunction);
 */
class ShoppingList {

    /**
     * Creates a new ShoppingList instance from job objects.
     * 
     * @param {Array<Job>} [inputJobs=[]] - Array of job objects to build shopping list from
     */
    constructor(inputJobs = []) {

        this.items = buildShoppingList(inputJobs);
        this.totalVolume = 0;
        this.totalValue = 0;

    }

    /**
     * Calculates the total volume of visible items that need to be purchased.
     * 
     * This method calculates the total volume by:
     * - Iterating through all visible items
     * - Calculating volume for items that need purchasing (quantity - assets)
     * - Summing up the total volume
     */
    calculateTotalVolume() {
        this.totalVolume = 0;
        this.items.forEach((item) => {
            if (!item.isVisible || !item.includeWhenCopying) return;

            this.totalVolume += item.volume * Math.max(item.quantityToPurchase - item.assetQuantity, 0);
        });
    }

    /**
     * Calculates visibility of items based on display settings.
     * 
     * This method determines which items should be visible based on:
     * - Whether items have quantities to purchase (after accounting for assets)
     * - Whether child job materials should be displayed
     * - Sets the isVisible property for each item
     * 
     * @param {Object} options - Display options
     * @param {boolean} options.displayChildJobMaterials - Whether to show child job materials
     */
    calculateVisibleItems({ displayChildJobMaterials }) {

        this.items.forEach((item) => {

            const quantityZeroOrLess = Math.max(item.quantityToPurchase - item.assetQuantity, 0) > 0 ? false : true;
            const hideIntermediaryItems = !displayChildJobMaterials && item.hasChild ? true : false;

            if (quantityZeroOrLess) {
                item.isVisible = false;
                return
            }

            if (hideIntermediaryItems) {
                item.isVisible = false;
                return
            }

            item.isVisible = true;
        });
    }

    /**
     * Calculates the total value of visible items that need to be purchased.
     * 
     * This method calculates the total value by:
     * - Getting market data for each visible item
     * - Using default market and order settings
     * - Calculating value based on quantity still needed (after assets), matching volume
     * - Summing up the total value
     * 
     * @param {Object} [alternativePriceLocation={}] - Alternative price location for market data
     */
    calculateTotalValue(alternativePriceLocation = {}) {
        const { defaultMarketLocation, defaultOrderType } =
          useUsersStore.getState().applicationSettings;
        this.totalValue = 0;
        this.items.forEach((item) => {
            if (!item.isVisible || !item.includeWhenCopying) return;
            const quantityAfterAssets = Math.max(
                item.quantityToPurchase - item.assetQuantity,
                0,
            );
            this.totalValue +=
                quantityAfterAssets *
                useUsersStore.getState().worldData.actions.findMarketData(
                    item.typeID,
                    alternativePriceLocation,
                )[defaultMarketLocation][defaultOrderType];
        });
    }

    /**
     * Builds a string representation of visible items for clipboard export.
     * 
     * This method creates a formatted string suitable for clipboard operations:
     * - Filters to only visible items
     * - Filters to only items where includeWhenCopying is true
     * - Formats as "ItemName Quantity" per line
     * - Uses quantity that needs to be purchased (after assets)
     * 
     * @returns {string} Formatted string for clipboard
     */
    buildStringForClipboard() {
        return this.items
            .filter((item) => item.isVisible && item.includeWhenCopying)
            .map((item) => `${item.name} ${Math.max(item.quantityToPurchase - item.assetQuantity, 0)}`)
            .join("\n");
    }
    

    /**
     * Imports asset quantities from clipboard data.
     * 
     * This method updates asset quantities based on imported data:
     * - Matches items by name
     * - Updates assetQuantity for matching items
     * 
     * @param {Object} [importedAssets={}] - Object mapping item names to quantities
     */
    importAssetsFromClipboard(importedAssets = {}) {
        this.items.forEach((item) => {
            if (!importedAssets[item.name]) return;
            item.assetQuantity = importedAssets[item.name];
        });
    }

    /**
     * Applies asset quantities from a map of type IDs.
     * 
     * This method updates asset quantities using a counting function:
     * - Uses the provided counting function to get quantities
     * - Updates assetQuantity for each item based on type ID
     * 
     * @param {Map} [assetsByTypeID=new Map()] - Map of type IDs to asset quantities
     * @param {Function} countAssetsFunction - Function to count assets by type ID
     */
    applyAssetsFromMap(assetsByTypeID = new Map(),  countAssetsFunction) {
        this.items.forEach((item) => {
            item.assetQuantity = countAssetsFunction(assetsByTypeID, item.typeID);
        });

    }

    /**
     * Clears all asset quantities, resetting them to zero.
     */
    clearAssetQuantities() {
        this.items.forEach((item) => {
            item.assetQuantity = 0;
        });
    }

    /**
     * Toggles the includeWhenCopying flag for a specific item by type ID.
     * 
     * @param {number} typeID - Type ID of the item to toggle
     */
    toggleIncludeWhenCopying(typeID) {
        const item = this.items.find((item) => item.typeID === typeID);
        if (item) {
            item.includeWhenCopying = !item.includeWhenCopying;
        }
    }

    /**
     * Gets an array of all item type IDs in the shopping list.
     * 
     * @returns {Array<number>} Array of type IDs
     */
    getItemIDs() {
        return this.items.map((item) => {
            return item.typeID;
        });
    }
}

/**
 * Builds a shopping list from selected job objects.
 * 
 * This function aggregates material requirements from multiple jobs:
 * - Processes materials from each job that haven't been fully purchased
 * - Groups materials by type ID and child job status
 * - Calculates total quantities needed across all jobs
 * - Sorts the final list alphabetically by name
 * 
 * @param {Array<Job>} [selectedJobObjects=[]] - Array of job objects to process
 * @returns {Array<Object>} Array of shopping list item objects
 * 
 * @example
 * // Build shopping list from jobs
 * const shoppingList = buildShoppingList([job1, job2, job3]);
 */
function buildShoppingList(selectedJobObjects = []) {
    const finalShoppingList = [];
    selectedJobObjects.forEach((job) => {
        job.build.materials.forEach((material) => {
            if (material.quantityPurchased >= material.quantity) {
                return;
            }
            const childState = job.build.childJobs[material.typeID].length > 0 ? true : false;
            const shoppingListEntries = finalShoppingList.filter((item) => item.typeID === material.typeID);

            // If no shopping list entries, create a new one
            if (shoppingListEntries.length === 0) {
                finalShoppingList.push(buildShoppingListObject(material, childState));
                return;
            }

            const childJobPresent = shoppingListEntries.find((item) => item.hasChild === childState);

            if (!childJobPresent) {
                // if the material has no child jobs, create a new shopping list entry
                finalShoppingList.push(buildShoppingListObject(material, childState));
                return;
            } else {
                // if the material has child jobs, add the child job quantity to the shopping list entry total
                childJobPresent.quantityToPurchase += material.quantity - material.quantityPurchased;
            }
        });
    });

    // Sort the shopping list by name
    finalShoppingList.sort((a, b) => {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    });

    return finalShoppingList;
}

/**
 * Builds a shopping list item object from material data.
 * 
 * @param {Object} material - Material object from job
 * @param {string} material.name - Material name
 * @param {number} material.typeID - Material type ID
 * @param {number} material.quantity - Required quantity
 * @param {number} material.quantityPurchased - Already purchased quantity
 * @param {number} material.volume - Material volume
 * @param {boolean} childJobPresent - Whether this material has child jobs
 * @returns {Object} Shopping list item object
 */
function buildShoppingListObject(material, childJobPresent) {
    return {
        name: material.name,
        typeID: material.typeID,
        quantityRequired: material.quantity,
        quantityToPurchase: material.quantity - material.quantityPurchased,
        assetQuantity: 0,
        volume: material.volume,
        hasChild: childJobPresent,
        isVisible: false,
        includeWhenCopying: true,
    };
}

export default ShoppingList;

