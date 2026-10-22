/**
 * Update and/or add upcoming events in FGC Event Listing sheets.
 */
function updateEventListing() {
  const startTime = Date.now()
  const sheet = SpreadsheetApp.openById(getSpreadsheetId()).getSheetByName("Events")

  //////////////
  // start.gg //
  //////////////
  let startGgPageNumber = Number(PropertiesService.getScriptProperties().getProperty("startGgPageNumber"))
  let rows = []
  // Update the sheet until there are no results left or 4 minutes have passed
  do {
    const startGgTournaments = getStartGgTournaments(++startGgPageNumber)
    rows = getStartGgRowValues(startGgTournaments)
    updateSheetData(sheet, rows)
  } while (rows.length > 0 && Date.now() - startTime < 1000 * 60 * 4)
  if (rows.length === 0) {
    startGgPageNumber = 0
  }
  PropertiesService.getScriptProperties().setProperty("startGgPageNumber", startGgPageNumber)

  //////////////
  // parry.gg //
  //////////////
  let parryGgPageCursor = PropertiesService.getScriptProperties().getProperty("parryGgPageCursor")
  let parryGgRows = []
  if (parryGgPageCursor !== null) {
    parryGgPageCursor = JSON.parse(parryGgPageCursor)
  }
  // Update the sheet until there are no results left or 1 minute has passed
  do {
    const parryGgJson = getParryGgTournaments(parryGgPageCursor)
    parryGgPageCursor = parryGgJson.paginationResponse.nextCursor
    parryGgRows = getParryGgRowValues(parryGgJson)
    updateSheetData(sheet, parryGgRows)
    if (parryGgRows.length === 0) {
      parryGgPageCursor = null
    }
  } while (parryGgRows.length > 0 && Date.now() - startTime < 1000 * 60 * 1)
  PropertiesService.getScriptProperties().setProperty("parryGgPageCursor", JSON.stringify(parryGgPageCursor))

  // Freeze the header row and sort the sheet by date ascending
  sheet.setFrozenRows(1)
  sheet.sort(1)
}

/**
 * Get a 10 result page of upcoming tournaments from start.gg.
 * @param {Number} pageNumber - A page number.
 * @return {Array[Object]} An array of tournaments. Refer to start.gg's GraphQL schema.
 */
function getStartGgTournaments(pageNumber) {
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
  // Set the end time to the start time plus 50 days
  const endAt = startAt + (60 * 60 * 24 * 50)
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
 * Get a 10 result page of upcoming tournaments from parry.gg.
 * @param {String} pageCursor - A page cursor.
 * @return {Array[Object]} JSON containing an array of tournaments. Refer to parry.gg's tournament.proto schema.
 */
function getParryGgTournaments(pageCursor) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("parryGgApiKey")
  const headers = {
    "Content-Type": "application/json",
    "X-API-KEY": apiKey,
  }
  const formData = {
    "pagination_request": {
      "page_size": 100,
      "cursor": pageCursor,
    },
    "sort_order": 1,
  }
  const options = {
    "method": "POST",
    "headers": headers,
    "payload": JSON.stringify(formData),
  }
  const url = "https://grpcweb.parry.gg/parrygg.services.TournamentService/GetTournaments"
  const response = UrlFetchApp.fetch(url, options)
  const json = JSON.parse(response.getContentText())
  console.log(`${json.tournaments.length} tournaments found on page ${pageCursor}`)
  return json
}

/**
 * Convert an array of tournaments from the start.gg API to an array of rows for the Google Sheets API.
 * @param {Array[Object]} tournaments - An array of tournaments. Refer to start.gg's GraphQL schema.
 * @return {Array[Array[Object]]} An array of row and column values.
 */
function getStartGgRowValues(tournaments) {
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
 * Convert an array of tournaments from the parry.gg API to an array of rows for the Google Sheets API.
 * @param {Array[Object]} json - JSON containing an array of tournaments. Refer to parry.gg's tournament.proto schema.
 * @return {Array[Array[Object]]} An array of row and column values.
 */
function getParryGgRowValues(json) {
  const currentDate = new Date()
  const rows = []
  json.tournaments.forEach(tournament => {
    const tournamentUrl = "https://www.parry.gg/" + tournament.slugs[0].slug
    console.log(`Tournament: ${tournament.name} (${tournamentUrl})`)
    // Ignore any tournaments that don't have any events
    if (tournament.events === null) {
      console.log("No listed events")
      return
    }
    // Ignore any tournaments with no address
    if (!tournament.venueAddress) {
      console.log("No listed address")
      return
    }
    const startAt = new Date(tournament.startDate)
    // Ignore any tournaments in the past
    if (startAt < currentDate) {
      console.log("Past tournament")
      return
    }
    // Create a forward slash separated list of games in the events, using a set to exclude duplicates
    const gamesArray = tournament.events.map(event => event.game.name)
    const gamesString = Array.from(new Set(gamesArray)).join(" / ")
    const [stateCode, countryCode] = getStateAbbreviation(tournament.venueAddress)
    rows.push([startAt, tournament.name, tournamentUrl, countryCode, stateCode, tournament.venueAddress, gamesString])
  })
  return rows
}

/**
 * Attempts to determine the state and country from the given address. Only works for US addresses right now.
 * @param {String} address - An address.
 * @return {[String, String]} An array containing either two-letter state and country abbreviations or empty strings.
 */
function getStateAbbreviation(address) {
  const stateAbbreviations = {
    "ALABAMA": "AL",
    "ALASKA": "AK",
    "ARIZONA": "AZ",
    "ARKANSAS": "AR",
    "CALIFORNIA": "CA",
    "COLORADO": "CO",
    "CONNECTICUT": "CT",
    "DELAWARE": "DE",
    "FLORIDA": "FL",
    "GEORGIA": "GA",
    "HAWAII": "HI",
    "IDAHO": "ID",
    "ILLINOIS": "IL",
    "INDIANA": "IN",
    "IOWA": "IA",
    "KANSAS": "KS",
    "KENTUCKY": "KY",
    "LOUISIANA": "LA",
    "MAINE": "ME",
    "MARYLAND": "MD",
    "MASSACHUSETTS": "MA",
    "MICHIGAN": "MI",
    "MINNESOTA": "MN",
    "MISSISSIPPI": "MS",
    "MISSOURI": "MO",
    "MONTANA": "MT",
    "NEBRASKA": "NE",
    "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND",
    "OHIO": "OH",
    "OKLAHOMA": "OK",
    "OREGON": "OR",
    "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN",
    "TEXAS": "TX",
    "UTAH": "UT",
    "VERMONT": "VT",
    "VIRGINIA": "VA",
    "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI",
    "WYOMING": "WY",
    "DISTRICT OF COLUMBIA": "DC",
    "PUERTO RICO": "PR"
  }
  const uppercaseAddress = address.toUpperCase()
  for (const [stateName, stateAbbreviation] of Object.entries(stateAbbreviations)) {
    // If the address includes this state name or abbreviation
    if (uppercaseAddress.includes(stateName) || uppercaseAddress.includes(`, ${stateAbbreviation} `)) {
      return [stateAbbreviation, "US"]
    }
  }
  // Default to no result found
  return ["", ""]
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
