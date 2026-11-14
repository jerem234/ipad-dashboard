# iPad Wall Dashboard

A calm, Apple-style dashboard for an iPad mounted on the wall. It runs on any home server with Docker
(built and tested on ZimaOS) and the iPad just opens it in Safari.

- **Clock and date**, styled like the iPhone/iPad Lock Screen
- **Weather**: today's high and low with a temperature bar, current conditions, and a 5-day forecast
  with highs, lows and chance of rain. Tap it to pick a city. Uses [Open-Meteo](https://open-meteo.com), so no API key or account is needed.
- **Calendar** (optional): an "Up Next" card with your upcoming iCloud events
- **Quote**: a random quote from `quotes.txt`, changing every hour or when you tap it
- **Night mode**: from 9:30 PM to 6:00 AM everything turns dim red on black, like StandBy's night mode
- Works in **landscape and portrait**, and text resizes so long quotes always fit

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The dashboard page |
| `config.js` | Your settings: default city, °F/°C, clock style, night hours, timing |
| `quotes.txt` | The quotes. Edit freely (format below) |
| `icon.svg` | App icon for the ZimaOS tile |
| `nginx.conf` | Web server settings |
| `docker-compose.yml` | Runs the web server and the calendar service |
| `server/calendar_service.py` | Small service that reads iCloud calendars (only needed for the calendar) |
| `caldav.env.example` | Template for the calendar sign-in file |

## What you need

- A home server running Docker. These steps are for **ZimaOS** (CasaOS works the same way); see
  [Other Docker servers](#other-docker-servers) for anything else.
- The server's IP address on your network, for example `192.168.1.50`. It's in the ZimaOS settings or
  your router's device list. Giving the server a **fixed IP** in your router is a good idea, so the iPad's link never breaks.
- An iPad on the same Wi-Fi.

## Setup on ZimaOS

### 1. Download this project

On GitHub, click **Code → Download ZIP** and unzip it, or run:

```bash
git clone https://github.com/jerem234/ipad-dashboard.git
```

### 2. Choose your settings

Open `config.js` in any text editor and set your default city. Find the latitude and longitude at
[latlong.net](https://www.latlong.net). You can also set °F/°C, 12- or 24-hour clock and the night-mode hours.
You can change the city later from the iPad itself, so this is just the starting point.

### 3. Copy the files to the server

The dashboard expects its files at **`/DATA/AppData/ipad-dashboard/`** on the server. Use whichever is easiest:

- **ZimaOS Files app:** open Files in the ZimaOS web page, go to `AppData`, create a folder named
  `ipad-dashboard`, and upload everything from this project into it (keep the `server` folder as a subfolder).
- **Network share (SMB):** if you share AppData in ZimaOS, drag the files there from Finder or Explorer.
- **Command line:** `scp -r ./* your-user@YOUR-SERVER-IP:/DATA/AppData/ipad-dashboard/`

When you're done, the server should have `/DATA/AppData/ipad-dashboard/index.html`,
`/DATA/AppData/ipad-dashboard/server/calendar_service.py`, and so on.

Also create an empty folder **`/DATA/AppData/ipad-dashboard-private/`**. The calendar's sign-in file goes
there later, kept separate from the web folder so it can never be served to a browser.

### 4. Install it as a ZimaOS app

1. Open `docker-compose.yml` and replace `YOUR-SERVER-IP` with your server's IP (this is only used for the tile's icon).
2. In the ZimaOS web page, open the **App Store**, click **+** (Custom Install), then **Import**.
3. Paste in the whole contents of `docker-compose.yml` and click **Install**.

ZimaOS downloads two small images (nginx and Python) and starts them. An **iPad Dashboard** tile appears.

### 5. Check it works

Open `http://YOUR-SERVER-IP:8088` in a browser. You should see the clock, weather and a quote.
If the icon on the tile is blank, refresh the ZimaOS page once.

## Set up the iPad

1. In **Safari**, open `http://YOUR-SERVER-IP:8088`.
2. Tap **Share → Add to Home Screen**, then open the dashboard from the new icon. It runs full-screen without Safari's bars.
3. Tap the **weather** to search for your city. The choice is saved on that iPad.
4. **Settings → Display & Brightness → Auto-Lock → Never**, so the screen stays on.
5. Optional: **Settings → Accessibility → Guided Access → On**. Then, with the dashboard open, triple-click
   the top (or Home) button and tap **Start** to lock the iPad to the dashboard.

## Calendar (optional)

The "Up Next" card shows your next events from iCloud. Until you set it up, the card stays hidden and the layout adjusts.

Apple doesn't offer a public calendar API, so this uses **CalDAV**, the same standard the Calendar app uses to sync,
with an **app-specific password**. That's a separate password just for this, which you can revoke at any time.
Your real Apple ID password is never used or stored.

1. Go to [account.apple.com](https://account.apple.com) → **Sign-In and Security** → **App-Specific Passwords**,
   and create one named "Dashboard". Copy it.
2. On the server, create `/DATA/AppData/ipad-dashboard-private/caldav.env` using `caldav.env.example` as the template:

   ```ini
   CALDAV_USER=your-apple-id@icloud.com
   CALDAV_PASSWORD=abcd-efgh-ijkl-mnop
   CALENDARS=
   ```

   Leave `CALENDARS` empty to show every calendar, or list names to show only those: `CALENDARS=Home,Work`.

   From a Mac or PC terminal, one way is:

   ```bash
   ssh -t your-user@YOUR-SERVER-IP nano /DATA/AppData/ipad-dashboard-private/caldav.env
   ```

   Paste the lines, then save with **Ctrl+O**, **Enter**, and exit with **Ctrl+X**.
3. Wait about a minute. The service re-reads this file every minute, so no restart is needed.
4. To see what it loaded (or the error, like a mistyped password), open `http://YOUR-SERVER-IP:8088/api/calendar`.

Events refresh every 10 minutes. The card shows the next 7 days and fits as many events as there is room for.

**Privacy:** the sign-in file lives only on your server, outside the web folder. Anyone on your home network can
open the dashboard and therefore see your upcoming event titles, so keep that in mind if that matters for your household.

## Adding and editing quotes

Edit `quotes.txt` on the server (`/DATA/AppData/ipad-dashboard/quotes.txt`). Put a blank line between quotes
and end each one with ` - Author`. A source in parentheses before the author is optional and shown in italics:

```text
The first quote goes here. (Book Title p.12) - Author Name

A second quote without a source. - Another Author
```

New quotes show up at the next quote change. Tap the quote on the iPad to change it right away.

## Settings reference (`config.js`)

| Setting | Default | What it does |
|---|---|---|
| `locationName`, `latitude`, `longitude` | Nashville | Weather location until you pick one on the iPad |
| `temperatureUnit` | `"fahrenheit"` | Or `"celsius"` |
| `clock24h` | `false` | `true` for 21:41 instead of 9:41 |
| `nightStart`, `nightEnd` | `"21:30"`, `"06:00"` | Night mode hours (24-hour time) |
| `quoteMinutes` | `60` | How often the quote changes |
| `weatherMinutes` | `30` | How often the weather refreshes |

After editing, reload the dashboard. The iPad also reloads itself every night at 3 AM.

## Updating

Copy the changed files over the old ones on the server. Changes to the page, `config.js` or `quotes.txt` take effect
when the iPad reloads. Changes to `nginx.conf` need the app restarted (tile **⋯ → Restart** in ZimaOS).
To change the containers themselves, use tile **⋯ → Manage → YAML**, edit, **Save**, then **Restart**.

## Other Docker servers

Any machine with Docker Compose works. Put this folder somewhere, for example `/opt/ipad-dashboard`, and in
`docker-compose.yml` change every `/DATA/AppData/ipad-dashboard` to that path and `/DATA/AppData/ipad-dashboard-private`
to a private folder of your choice. You can delete the `x-casaos` section. Then run:

```bash
docker compose up -d
```

## Troubleshooting

- **"Weather unavailable"**: the iPad can't reach `api.open-meteo.com`. Check its internet connection.
- **No calendar card**: open `/api/calendar`. `"configured": false` means the sign-in file is empty or in the wrong place.
  An `"error"` message tells you what iCloud said, such as a wrong password.
- **Changes don't show on the iPad**: close the dashboard and reopen it from the home screen.
- **Testing night mode or a quote**: add `?night=1` (or `?night=0`) to the address to force night or day, or
  `?quote=5` to show a specific quote.
