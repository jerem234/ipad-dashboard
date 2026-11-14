// Dashboard settings. Edit these, then reload the page on the iPad.
window.DASHBOARD_CONFIG = {
  // Default weather location. You can also tap the temperatures on the
  // dashboard to search for a city; that choice is saved on the iPad.
  locationName: "Nashville, Tennessee",
  latitude: 36.1627,
  longitude: -86.7816,

  // "fahrenheit" or "celsius"
  temperatureUnit: "fahrenheit",

  // false = 9:41 PM, true = 21:41
  clock24h: false,

  // Night mode window (24-hour "HH:MM", local time on the iPad)
  nightStart: "21:30",
  nightEnd: "06:00",

  // How often to show a new random quote (minutes). Tapping the quote also changes it.
  quoteMinutes: 60,

  // How often to refresh the weather (minutes)
  weatherMinutes: 30
};
