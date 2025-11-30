/**
 * Update and/or add upcoming events in FGC Event Listing sheets.
 */
function updateEventListing() {
  const startTime = Date.now()
  const sheet = SpreadsheetApp.openById(getSpreadsheetId()).getSheetByName("Events")
  let pageNumber = Number(PropertiesService.getScriptProperties().getProperty("pageNumber"))
  let rows = []
  // Update the sheet until there are no results left or 4 minutes have passed
  do {
    const tournaments = getTournaments(++pageNumber)
    rows = getRowValues(tournaments)
    updateSheetData(sheet, rows)
  } while (rows.length > 0 && Date.now() - startTime < 1000 * 60 * 4)
  // Freeze the header row and sort the sheet by date ascending
  sheet.setFrozenRows(1)
  sheet.sort(1)
  if (rows.length === 0) {
    pageNumber = 0
  }
  PropertiesService.getScriptProperties().setProperty("pageNumber", pageNumber)
}

/**
 * Get a 10 result page of upcoming tournaments.
 * @param {Number} pageNumber - A page number.
 * @return {Array[Object]} An array of tournaments. Refer to start.gg's GraphQL schema.
 */
function getTournaments(pageNumber) {
  const tournamentsByStartTimeQuery = `
    query tournamentsByStartTime(\$page: Int = 1, \$startAt: Timestamp!, \$endAt: Timestamp!) {
      tournaments(
        query: {
          page: \$page, 
          perPage: 100, 
          filter: {
            afterDate: \$startAt, 
            beforeDate: \$endAt, 
            published: true, 
            publiclySearchable: true, 
            hasOnlineEvents: false
          }
        }
      ) {
        nodes {
          id
          slug
          name
          startAt
          countryCode
          addrState
          venueAddress
          events {
            id
            videogame {
              id
              name
            }
          }
        }
      }
    }
  `
  // Convert the start time from a JavaScript date to a Unix timestamp
  const startAt = Math.floor(Date.now() / 1000)
  // Set the end time to the start time plus 90 days
  const endAt = startAt + (60 * 60 * 24 * 90)
  const queryVariables = {
    "page": pageNumber,
    "startAt": startAt,
    "endAt": endAt
  }
  const formData = {
    "operationName": "tournamentsByStartTime",
    "query": tournamentsByStartTimeQuery,
    "variables": JSON.stringify(queryVariables),
  }
  const apiKey = PropertiesService.getScriptProperties().getProperty("startGgApiKey")
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
  }
  const options = {
    "method": "POST",
    "headers": headers,
    "payload": formData,
  }
  const url = "https://api.start.gg/gql/alpha"
  const response = UrlFetchApp.fetch(url, options)
  const json = JSON.parse(response.getContentText())
  // If errors were returned, log them and return an empty array
  if (json.errors) {
    json.errors.forEach(error => {
      console.error(error.message)
    })
    return []
  }
  console.log(`${json.data.tournaments.nodes.length} upcoming tournaments found on page ${pageNumber}`)
  return json.data.tournaments.nodes
}

/**
 * Convert an array of tournaments from the start.gg API to an array of rows for the Google Sheets API.
 * @param {Array[Object]} tournaments - An array of tournaments. Refer to start.gg's GraphQL schema.
 * @return {Array[Array[Object]]} An array of row and column values.
 */
function getRowValues(tournaments) {
  const rows = []
  tournaments.forEach(tournament => {
    const tournamentUrl = "https://www.start.gg/" + tournament.slug + "/details"
    console.log(`Tournament: ${tournament.name} (${tournamentUrl})`)
    // Ignore any tournaments that don't have any events
    if (tournament.events === null) {
      console.log("No listed events")
      return
    }
    // Convert the start time from a Unix timestamp to a JavaScript date
    const startAt = new Date(tournament.startAt * 1000)
    // Create a forward slash separated list of games in the events, using a set to exclude duplicates
    const gamesArray = tournament.events.map(event => event.videogame.name)
    const gamesString = Array.from(new Set(gamesArray)).join(" / ")
    rows.push([startAt, tournament.name, tournamentUrl, tournament.countryCode, tournament.addrState, tournament.venueAddress, gamesString])
  })
  return rows
}

/**
 * Update or insert rows on the given sheet.
 * @param {Sheet} sheet - The sheet to update.
 * @param {Array[Array[Object]]} rows - An array of row and column values.
 */
function updateSheetData(sheet, rows) {
  console.log(`Updating/inserting ${rows.length} rows in sheet`)
  rows.forEach(columns => {
    const existingRow = sheet.createTextFinder(columns[2]).findNext()
    // If a row for this tournament has already been created, update that row, else insert a new row
    if (existingRow) {
      sheet.getRange(existingRow.getRowIndex(), 1, 1, columns.length).setValues([columns])
    } else {
      sheet.insertRowsBefore(2, 1)
      sheet.getRange(2, 1, 1, columns.length).setValues([columns])
    }
  })
}
