import useUsersStore from "../../Zustand/usersStore";

/**
 * Parses a number string or number that may contain thousands separators and decimal points (US, European, etc.).
 *
 * @param {string|number} str - The number string or number to parse
 * @returns {number} - The parsed number, or 0 if parsing fails
 */
export function parseNumberWithSeparators(str) {
  // If a number is passed, return it directly
  if (typeof str === "number") {
    return isNaN(str) ? NaN : str;
  }
  
  // If not a string, try to convert to string
  if (typeof str !== "string") {
    return isNaN(Number(str)) ? NaN : Number(str);
  }

  // Remove all non-digit separators except . and ,
  const cleaned = str.replace(/[^\d.,\-+]/g, "");

  // If both comma and dot exist → last one is decimal
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let decimalSeparator = null;

  if (lastComma > -1 && lastDot > -1) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma > -1) {
    // If comma appears and it's likely decimal (based on digits after it)
    if (cleaned.length - lastComma - 1 <= 2) {
      decimalSeparator = ",";
    }
  } else if (lastDot > -1) {
    if (cleaned.length - lastDot - 1 <= 2) {
      decimalSeparator = ".";
    }
  }

  let normalized = cleaned;

  if (decimalSeparator) {
    // remove thousand separators
    if (decimalSeparator === ",") {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else {
    // No decimal separator detected - treat commas as thousands separators and remove them
    normalized = normalized.replace(/,/g, "");
  }

  return Number(normalized);
}

/**
 * Formats a number according to the specified locale
 *
 * @param {number} number - The number to format
 * @param {Object} options - Formatting options
 * @param {number} options.min - Minimum decimal places (default: 2)
 * @param {number} options.max - Maximum decimal places (default: same as min)
 *
 * @returns {string} - The formatted number string
 */
export function formatNumberForLocale(number, options) {
  // Set default values
  const defaultMin = 2;
  const defaultMax = 2;

  let minDigits, maxDigits;

  if (options?.min !== undefined && options?.max !== undefined) {
    // Both min and max are defined - use them as specified
    minDigits = options.min;
    maxDigits = options.max;
  } else if (options?.max !== undefined) {
    // Only max is defined - use max for both min and max
    minDigits = options.max;
    maxDigits = options.max;
  } else if (options?.min !== undefined) {
    // Only min is defined - use min for min, default for max
    minDigits = options.min;
    maxDigits = defaultMax;
  } else {
    // Neither is defined - use defaults
    minDigits = defaultMin;
    maxDigits = defaultMax;
  }

  // Ensure maxDigits is at least as large as minDigits
  const finalMaxDigits = Math.max(minDigits, maxDigits);

  // Use Intl.NumberFormat for locale-specific formatting
  // This preserves existing locale behaviour while using numbro for parsing
  const locale = useUsersStore
    .getState()
    .applicationSettings.actions.getCurrentLocale();

  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: minDigits,
    maximumFractionDigits: finalMaxDigits,
  }).format(number);
}

/**
 * Parses a number string and returns both the parsed number and formatted string
 *
 * @param {string} str - The number string to parse
 * @param {Object} options - Formatting options
 * @param {number} options.min - Minimum decimal places (default: 2)
 * @param {number} options.max - Maximum decimal places (default: same as min)
 *
 * @returns {string} - The formatted number string
 */
export function parseAndFormatNumber(str, options) {
  return formatNumberForLocale(parseNumberWithSeparators(str), options);
}

export function formatDateForLocale(date) {
  // Validate the date input
  if (!date) {
    return "Invalid Date";
  }

  // Try to create a Date object and check if it's valid
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return "Invalid Date";
  }

  return new Intl.DateTimeFormat(
    useUsersStore.getState().applicationSettings.actions.getCurrentLocale(),
    {
      dateStyle: "short",
    }
  ).format(dateObj);
}

/**
 * Converts a number to a short text format with units (thousand, million, billion, trillion)
 * Rounds DOWN to the specified number of decimal places.
 *
 * @param {number|string} num - The number to convert
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} - The formatted number with unit suffix
 */
export function numberToShortText(num, decimals = 2) {
  // Handle edge cases
  if (typeof num === "string") {
    num = parseNumberWithSeparators(num);
  }

  if (isNaN(num)) {
    return "Invalid Number";
  }

  if (num === 0) return "0";
  if (num < 0) {
    return `-${numberToShortText(Math.abs(num), decimals)}`;
  }
  if (num < 1000) {
    // Format small numbers with proper decimal handling
    return decimals > 0 ? num.toFixed(decimals) : Math.floor(num).toString();
  }

  const units = ["", "Thousand", "Million", "Billion", "Trillion"];

  let unitIndex = 0;
  let value = num;

  // Determine correct unit, but stop at trillion
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  // Round DOWN to the desired decimal places
  const factor = Math.pow(10, decimals);
  const roundedDown = Math.floor(value * factor) / factor;

  // Format the number with proper decimal places
  const formattedValue =
    decimals > 0
      ? roundedDown.toFixed(decimals)
      : Math.floor(roundedDown).toString();

  return `${formattedValue} ${units[unitIndex]}`;
}

/**
 * Formats a time duration in seconds to a human-readable string
 *
 * @param {number|string} seconds - The time duration in seconds (can be a number or string)
 * @param {Object} options - Formatting options
 * @param {boolean} options.days - Include days in output (default: true)
 * @param {boolean} options.hours - Include hours in output (default: true)
 * @param {boolean} options.minutes - Include minutes in output (default: true)
 * @param {boolean} options.seconds - Include seconds in output (default: true)
 * @param {boolean} options.showZeros - Show zero values for included units (default: false)
 * @returns {string} - Formatted time string (e.g., "2D 5H 30M 15S")
 */
export function formatTimeDuration(seconds, options = {}) {
  // Convert string to number if needed
  if (typeof seconds === "string") {
    seconds = parseNumberWithSeparators(seconds);
  }

  // Validate the converted number
  if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) {
    return "";
  }

  // Set default options
  const {
    days = true,
    hours = true,
    minutes = true,
    seconds: includeSeconds = true,
    showZeros = false,
  } = options;

  let returnArray = [];
  let d = Math.floor(seconds / (3600 * 24));
  let h = Math.floor((seconds % (3600 * 24)) / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  let s = Math.floor(seconds % 60);

  if (days && (d > 0 || showZeros)) {
    returnArray.push(`${d}D`);
  }
  if (hours && (h > 0 || showZeros)) {
    returnArray.push(`${h}H`);
  }
  if (minutes && (m > 0 || showZeros)) {
    returnArray.push(`${m}M`);
  }
  if (includeSeconds && (s > 0 || showZeros)) {
    returnArray.push(`${s}S`);
  }

  return returnArray.join(" ");
}

/**
 * Calculates and formats the time remaining until a given timestamp
 *
 * @param {number|string} inputTime - The target timestamp in milliseconds (can be a number or string)
 * @param {Object} options - Formatting options (passed to formatTimeDuration)
 * @param {boolean} options.days - Include days in output (default: true)
 * @param {boolean} options.hours - Include hours in output (default: true)
 * @param {boolean} options.minutes - Include minutes in output (default: true)
 * @param {boolean} options.seconds - Include seconds in output (default: false)
 * @param {boolean} options.showZeros - Show zero values for included units (default: false)
 * @returns {string} - Formatted time remaining string, "Complete" if time has passed, or error messages
 */
export function formatTimeRemaining(inputTime, options = {}) {
  // Convert string to number if needed
  if (typeof inputTime === "string") {
    inputTime = parseNumberWithSeparators(inputTime);
  }

  // Validate the converted number
  if (isNaN(inputTime)) {
    return "Invalid input time";
  }

  try {
    const now = Date.now();
    const timeLeft = inputTime - now;

    if (timeLeft <= 0) {
      return "Complete";
    }

    // Convert milliseconds to seconds and use formatTimeDuration
    // Default to not showing seconds (matching original behaviour)
    const formatOptions = {
      seconds: false,
      ...options,
    };
 
    const formatted = formatTimeDuration(timeLeft / 1000, formatOptions);

    // Return formatted string (empty string if less than a minute, matching original behaviour)
    return formatted;
  } catch (err) {
    return "Time Not Available";
  }
}

