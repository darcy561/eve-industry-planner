/**
 * ESI Token Groups Configuration
 * 
 * This file defines the configuration for ESI token rate limiting groups:
 * - Defines token pools with different limits and window sizes
 * - Maps group names to numeric IDs for efficient processing
 * - Configures rate limiting parameters for different API endpoints
 * 
 * @fileoverview ESI token rate limiting configuration
 */

/**
 * ESI Token Groups configuration object.
 * 
 * Defines rate limiting groups for different ESI API endpoints:
 * - Each group has a unique ID, name, token limit, and window size
 * - Groups can be enabled/disabled independently
 * - Token limits are enforced per window size period
 * 
 * @type {Object<number, Object>}
 * @property {number} id - Unique group identifier
 * @property {string} groupName - Human-readable group name
 * @property {number} maxTokens - Maximum tokens allowed per window
 * @property {number} windowSize - Time window in milliseconds
 * @property {boolean} disabled - Whether the group is disabled
 */
export const ESI_TOKEN_GROUPS =
{
    0: {
        id: 0,
        groupName: "status",
        maxTokens: 600,
        windowSize: 15 * 60 * 1000,
        disabled: false,
    },
    1: {
        id: 1,
        groupName: "industry",
        maxTokens: 600,
        windowSize: 15 * 60 * 1000,
        disabled: false,
    },

}

/**
 * ESI Token Group Name to ID mapping.
 * 
 * Provides reverse lookup from group names to numeric IDs:
 * - Used for easy group identification in code
 * - Maps string constants to numeric group IDs
 * - Enables type-safe group references
 * 
 * @type {Object<string, number>}
 */
export const ESI_TOKEN_GROUP_MAP =
{
    "STATUS": 0,
    "INDUSTRY": 1,
}