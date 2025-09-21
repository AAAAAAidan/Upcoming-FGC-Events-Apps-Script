/**
 * Find and delete tournament rows where the event dates is before the current date.
 */
function deleteOldTournamentRows() {
  const spreadsheet = SpreadsheetApp.openById(getSpreadsheetId())
  const sheet = spreadsheet.getSheetByName("Events")
  // Freeze the header row and sort the sheet by date ascending
  sheet.setFrozenRows(1)
  sheet.sort(1)
  const currentDate = new Date()
  const dateStrings = sheet.getRange("A2:A").getValues()
  let numberOfRowsToDelete = 0
  // Find out how many of the event dates are before the current date
  dateStrings.forEach(dateString => {
    const eventDate = new Date(dateString)
    // If the current date is more recent than the event date, then this row will be deleted 
    if (currentDate.getTime() > eventDate.getTime()) {
      numberOfRowsToDelete++
    }
  })
  if (numberOfRowsToDelete > 0) {
    console.log(`Deleting ${numberOfRowsToDelete} rows`)
    sheet.deleteRows(2, numberOfRowsToDelete)
  }
}
