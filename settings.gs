/**
 * Get the status of development mode.
 * @return {Boolean} True if development mode is enabled, else false.
 */
function isDevelopmentModeEnabled() {
  // Set to true when testing
  return false
}

/**
 * Get the upcoming FGC events spreadsheet ID.
 * @return {String} A spreadsheet ID string.
 */
function getSpreadsheetId() {
  return isDevelopmentModeEnabled() ? "1MZfWoS2bUUpnvHfZDCPUc0DnscJSIac7BVQNvSBIEMg" : "1AIMZepfkEIUmTYFgFY4t4wTQSXrP_YvETAB-WAwyCyM"
}
