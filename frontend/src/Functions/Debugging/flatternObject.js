/**
 * Recursively flattens a nested object into a single-level object with dot notation keys.
 * Converts arrays to JSON strings and preserves primitive values.
 * 
 * @param {Object} obj - The object to flatten
 * @param {string} [parentKey=""] - The parent key for nested objects (used internally)
 * @param {Object} [result={}] - The result object to build (used internally)
 * @returns {Object} Flattened object with dot notation keys
 * 
 * @example
 * const nested = {
 *   user: {
 *     name: "John",
 *     settings: { theme: "dark" }
 *   },
 *   items: [1, 2, 3]
 * };
 * const flattened = flattenObject(nested);
 * // Result: { "user.name": "John", "user.settings.theme": "dark", "items": "[1,2,3]" }
 */
function flattenObject(obj, parentKey = "", result = {}) {
  for (const key in obj) {
    // Create a new key name
    const newKey = parentKey ? `${parentKey}.${key}` : key;

    // If the value is an object and not null, recurse
    if (typeof obj[key] === "object" && obj[key] !== null) {
      flattenObject(obj[key], newKey, result);
    } else {
      // Convert arrays to string and keep other primitive values
      result[newKey] = Array.isArray(obj[key])
        ? JSON.stringify(obj[key])
        : obj[key];
    }
  }
  return result;
}

export default flattenObject
