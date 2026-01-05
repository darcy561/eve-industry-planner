// Import necessary modules
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import {
  DEFAULT_API_MAX_SERVER_INSTANCES,
  DEFAULT_API_REQUEST_TIMEOUT_SECONDS,
  FIREBASE_SERVER_REGION,
} from "../global-config-functions.js";
import verifyEveToken from "../Middleware/eveTokenVerify.js";
import generateFirebaseToken from "./endpoints-v1/generateToken.js";
import retrieveItemRecipe from "./endpoints-v1/retrieveItemRecipe.js";
import retrieveMultipleItemRecipies from "./endpoints-v1/retrieveMultipleItemRecipies.js";
import marketData from "./endpoints-v1/marketData.js";
import checkMarketDataStatus from "./endpoints-v1/checkMarketDataStatus.js";
import retrieveSystemIndex from "./endpoints-v1/singleSystemIndex.js";
import retrieveMultipleSystemIndexes from "./endpoints-v1/multipleSystemIndexes.js";
import appCheckVerification from "../Middleware/AppCheck.js";
import requestLogging from "../Middleware/requestLogging.js";
import { initializeApp } from "firebase-admin/app";

initializeApp();

/**
 * Express application for EVE Industry Planner API v1.
 * 
 * This Express app provides RESTful API endpoints for EVE Online industry planning:
 * - Authentication endpoints for EVE Online OAuth integration
 * - Item recipe retrieval for manufacturing and reactions
 * - Market data access for pricing information
 * - System index data for industry cost calculations
 * - Comprehensive middleware stack for security and logging
 * 
 * Middleware Stack:
 * - CORS: Cross-origin resource sharing configuration
 * - Helmet: Security headers
 * - App Check: Firebase App Check verification
 * - Request Logging: Comprehensive request/response logging
 * - EVE Token Verification: EVE Online OAuth token validation
 * 
 * @type {express.Application}
 */
const expressApp = express();

expressApp.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://eve-industry-planner-dev.firebaseapp.com",
      "https://eve-industry-planner-dev.cloudfunctions.net",
      "https://www.eveindustryplanner.com",
      "https://eveindustryplanner.com",
    ],
    methods: "GET,POST",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
expressApp.use(express.json());
expressApp.use(helmet());
expressApp.use(appCheckVerification);
expressApp.use(requestLogging);

// API Routes Documentation

/**
 * Authentication endpoint for generating Firebase tokens from EVE Online OAuth.
 * 
 * @route POST /auth/generate-token
 * @middleware verifyEveToken - Validates EVE Online OAuth token
 * @returns {Object} Firebase custom token for authenticated user
 */
expressApp.post("/auth/generate-token", verifyEveToken, (req, res) =>
  generateFirebaseToken(req, res)
);

/**
 * Retrieves recipe data for a single item.
 * 
 * @route GET /item/:itemID
 * @param {string} itemID - EVE Online type ID
 * @returns {Object} Item recipe data including materials and quantities
 */
expressApp.get("/item/:itemID", (req, res) => retrieveItemRecipe(req, res));

/**
 * Retrieves recipe data for multiple items.
 * 
 * @route POST /item
 * @param {Array<number>} body.typeIDs - Array of EVE Online type IDs
 * @returns {Object} Recipe data for all requested items
 */
expressApp.post("/item", (req, res) => retrieveMultipleItemRecipies(req, res));

/**
 * Retrieves market data for specified items and regions.
 * 
 * @route POST /market-data
 * @param {Array<number>} body.typeIDs - Array of EVE Online type IDs
 * @param {Array<number>} body.regionIDs - Array of EVE Online region IDs
 * @returns {Object} Market price data for requested items and regions
 */
expressApp.post("/market-data", (req, res) => marketData(req, res));

/**
 * Checks the status of market data for specified items.
 * 
 * @route POST /market-data/status
 * @param {Array<number>} body.typeIDs - Array of EVE Online type IDs
 * @returns {Object} Market data status information
 */
expressApp.post("/market-data/status", (req, res) => checkMarketDataStatus(req, res));

/**
 * Retrieves system cost index for a single system.
 * 
 * @route GET /system-indexes/:systemID
 * @param {string} systemID - EVE Online solar system ID
 * @returns {Object} System cost index data for industry calculations
 */
expressApp.get("/system-indexes/:systemID", (req, res) =>
  retrieveSystemIndex(req, res)
);

/**
 * Retrieves system cost indices for multiple systems.
 * 
 * @route POST /system-indexes
 * @param {Array<number>} body.systemIDs - Array of EVE Online solar system IDs
 * @returns {Object} System cost index data for all requested systems
 */
expressApp.post("/system-indexes", (req, res) =>
  retrieveMultipleSystemIndexes(req, res)
);

/**
 * Firebase Cloud Function for EVE Industry Planner API v1.
 * 
 * This function provides the main API service for EVE Online industry planning:
 * - Hosts Express application with comprehensive middleware stack
 * - Provides authentication, recipe, market, and system index endpoints
 * - Implements security measures including App Check and EVE token verification
 * - Supports CORS for web application integration
 * - Provides comprehensive request logging and error handling
 * 
 * Configuration:
 * - Max instances: Configurable via DEFAULT_API_MAX_SERVER_INSTANCES
 * - Timeout: Configurable via DEFAULT_API_REQUEST_TIMEOUT_SECONDS
 * - Memory: 256MiB
 * - Region: Configurable via FIREBASE_SERVER_REGION
 * 
 * @function apiV1
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>} Express app handles the request/response
 * 
 * @example
 * // API endpoints available:
 * // POST /auth/generate-token - Generate Firebase token from EVE OAuth
 * // GET /item/:itemID - Get single item recipe
 * // POST /item - Get multiple item recipes
 * // POST /market-data - Get market data
 * // POST /market-data/status - Check market data status
 * // GET /system-indexes/:systemID - Get single system index
 * // POST /system-indexes - Get multiple system indices
 */
export default onRequest(
  {
    region: FIREBASE_SERVER_REGION,
    maxInstances: DEFAULT_API_MAX_SERVER_INSTANCES,
    timeoutSeconds: DEFAULT_API_REQUEST_TIMEOUT_SECONDS,
    memory: "256MiB",
  },
  expressApp
);
