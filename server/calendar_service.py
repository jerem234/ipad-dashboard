#!/usr/bin/env python3
"""Reads upcoming events from iCloud over CalDAV and serves them as JSON.

The dashboard's nginx forwards /api/calendar here. Credentials are read from
the mounted caldav.env file before every refresh (see caldav.env.example), so
editing that file takes effect within a minute, no restart needed. Environment
variables work too. Uses only the standard library.
"""
import base64
import datetime as dt
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

ENV_FILE = os.environ.get("CALDAV_ENV_FILE", "/secrets/caldav.env")
SERVER = os.environ.get("CALDAV_URL", "https://caldav.icloud.com/").strip()
DAYS = int(os.environ.get("DAYS_AHEAD", "7"))
REFRESH = int(os.environ.get("REFRESH_MINUTES", "10")) * 60
PORT = int(os.environ.get("PORT", "8000"))

NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav", "a": "http://apple.com/ns/ical/"}

USER = PASSWORD = ""
ONLY = []
state = {"configured": False, "updated": None, "events": [], "calendars": [], "error": None}
lock = threading.Lock()
calendars = []  # cached discovery: [(url, name, color)]


def load_settings():
    """Read KEY=value lines from the env file (falling back to real env vars).
    Returns True when the sign-in details changed."""
    global USER, PASSWORD, ONLY
    values = dict(os.environ)
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    user = values.get("CALDAV_USER", "").strip()
    password = values.get("CALDAV_PASSWORD", "").strip()
    only = [n.strip().lower() for n in values.get("CALENDARS", "").split(",") if n.strip()]
    changed = (user, password, only) != (USER, PASSWORD, ONLY)
    USER, PASSWORD, ONLY = user, password, only
    with lock:
        state["configured"] = bool(USER and PASSWORD)
    return changed


# ---------------- CalDAV requests ----------------

def request(method, url, body, depth="0"):
    auth = base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
    # urllib won't follow redirects for PROPFIND/REPORT, so follow them by hand
    for _ in range(4):
        req = urllib.request.Request(url, data=body.encode(), method=method, headers={
            "Authorization": "Basic " + auth,
            "Depth": depth,
            "Content-Type": "application/xml; charset=utf-8",
            "User-Agent": "ipad-dashboard",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.geturl(), ET.fromstring(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 307, 308) and e.headers.get("Location"):
                url = urllib.parse.urljoin(url, e.headers["Location"])
                continue
            if e.code in (401, 403):
                raise RuntimeError("iCloud rejected the sign-in. Check CALDAV_USER and the app-specific password.")
            raise RuntimeError(f"iCloud returned HTTP {e.code} ({method})")
    raise RuntimeError("Too many redirects from iCloud")


def href_at(root, path):
    el = root.find(path, NS)
    return el.text.strip() if el is not None and el.text else None


def discover():
    base, root = request("PROPFIND", SERVER,
        '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>')
    principal = href_at(root, ".//d:current-user-principal/d:href")
    if not principal:
        raise RuntimeError("Couldn't find the iCloud account")

    base, root = request("PROPFIND", urllib.parse.urljoin(base, principal),
        '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
        '<d:prop><c:calendar-home-set/></d:prop></d:propfind>')
    home = href_at(root, ".//c:calendar-home-set/d:href")
    if not home:
        raise RuntimeError("Couldn't find the iCloud calendars")

    base, root = request("PROPFIND", urllib.parse.urljoin(base, home),
        '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
        '<d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/></d:prop>'
        '</d:propfind>', depth="1")

    found = []
    for resp in root.findall("d:response", NS):
        href = resp.findtext("d:href", namespaces=NS)
        if not href or resp.find(".//d:resourcetype/c:calendar", NS) is None:
            continue
        comps = [c.get("name") for c in resp.findall(".//c:supported-calendar-component-set/c:comp", NS)]
        if comps and "VEVENT" not in comps:
            continue  # e.g. Reminders lists
        name = (resp.findtext(".//d:displayname", namespaces=NS) or "").strip() or "Calendar"
        if ONLY and name.lower() not in ONLY:
            continue
        color = (resp.findtext(".//a:calendar-color", namespaces=NS) or "").strip()[:7]
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
            color = ""
        found.append((urllib.parse.urljoin(base, href), name, color))
    return found


def fetch_events(url, name, color, start, end):
    s, e = start.strftime("%Y%m%dT%H%M%SZ"), end.strftime("%Y%m%dT%H%M%SZ")
    # <expand> asks the server to turn repeating events into individual ones
    body = (
        '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
        f'<d:prop><c:calendar-data><c:expand start="{s}" end="{e}"/></c:calendar-data></d:prop>'
        '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
        f'<c:time-range start="{s}" end="{e}"/>'
        '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>'
    )
    _, root = request("REPORT", url, body, depth="1")
    events = []
    for data in root.iter("{urn:ietf:params:xml:ns:caldav}calendar-data"):
        if data.text:
            events += parse_ics(data.text, name, color)
    return events


# ---------------- iCalendar parsing ----------------

DURATION = re.compile(r"P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")


def unescape(text):
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), text).strip()


def parse_time(params, value):
    value = value.strip()
    if "VALUE=DATE" in params.upper() and "DATE-TIME" not in params.upper() or re.fullmatch(r"\d{8}", value):
        return dt.date(int(value[:4]), int(value[4:6]), int(value[6:8])), True
    t = dt.datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
        return t.replace(tzinfo=dt.timezone.utc), False
    tzid = re.search(r'TZID="?([^;"]+)', params)
    if tzid and ZoneInfo:
        try:
            return t.replace(tzinfo=ZoneInfo(tzid.group(1))), False
        except Exception:
            pass
    return t, False  # floating time: shown as local time on the iPad


def iso(t, all_day):
    if all_day or not isinstance(t, dt.datetime):
        return t.isoformat()[:10]
    if t.tzinfo:
        return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return t.strftime("%Y-%m-%dT%H:%M:%S")


def build(ev, cal, color):
    if "DTSTART" not in ev:
        return None
    if ev.get("STATUS", ("", ""))[1].strip().upper() == "CANCELLED":
        return None
    start, all_day = parse_time(*ev["DTSTART"])
    if "DTEND" in ev:
        end, _ = parse_time(*ev["DTEND"])
    else:
        m = DURATION.fullmatch(ev.get("DURATION", ("", ""))[1].strip())
        if m and any(m.groups()):
            w, d, h, mi, s = (int(x or 0) for x in m.groups())
            end = start + dt.timedelta(weeks=w, days=d, hours=h, minutes=mi, seconds=s)
        else:
            end = start + dt.timedelta(days=1) if all_day else start
    return {
        "title": unescape(ev.get("SUMMARY", ("", ""))[1]) or "Untitled",
        "start": iso(start, all_day),
        "end": iso(end, all_day),
        "allDay": all_day,
        "calendar": cal,
        "color": color,
    }


def parse_ics(text, cal, color):
    lines = re.sub(r"\r?\n[ \t]", "", text).splitlines()  # unfold continuation lines
    out, ev, depth = [], None, 0
    for line in lines:
        if line == "BEGIN:VEVENT":
            ev, depth = {}, 0
        elif ev is None:
            continue
        elif depth == 0 and line == "END:VEVENT":
            e = build(ev, cal, color)
            if e:
                out.append(e)
            ev = None
        elif line.startswith("BEGIN:"):
            depth += 1  # nested block such as VALARM
        elif line.startswith("END:"):
            depth = max(0, depth - 1)
        elif depth == 0:
            m = re.match(r"([A-Za-z-]+)((?:;[^:]*)?):(.*)", line)
            if m:
                ev.setdefault(m.group(1).upper(), (m.group(2), m.group(3)))
    return out


# ---------------- Refresh loop & HTTP ----------------

def refresh():
    global calendars
    now = dt.datetime.now(dt.timezone.utc)
    start, end = now - dt.timedelta(days=1), now + dt.timedelta(days=DAYS + 1)
    if not calendars:
        calendars = discover()
    events = []
    for url, name, color in calendars:
        events += fetch_events(url, name, color, start, end)
    events.sort(key=lambda e: e["start"])
    with lock:
        state.update(updated=now.strftime("%Y-%m-%dT%H:%M:%SZ"), events=events[:200],
                     calendars=[c[1] for c in calendars], error=None)
    print(f"Loaded {len(events)} events from {len(calendars)} calendars", flush=True)


def loop():
    global calendars
    last = 0
    while True:
        # Check the settings file every minute; refresh events every REFRESH seconds
        # (or right away when the sign-in details change)
        if load_settings():
            calendars, last = [], 0
            with lock:
                state.update(events=[], calendars=[], updated=None, error=None)
        if state["configured"] and time.time() - last >= REFRESH:
            last = time.time()
            try:
                refresh()
            except Exception as e:
                calendars = []  # rediscover next time
                with lock:
                    state["error"] = str(e)
                print("Calendar refresh failed:", e, flush=True)
        time.sleep(60)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        with lock:
            body = json.dumps(state).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    load_settings()
    if not state["configured"]:
        print(f"No sign-in in {ENV_FILE} yet; serving an empty calendar", flush=True)
    threading.Thread(target=loop, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
