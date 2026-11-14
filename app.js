(function () {
  "use strict";

  var cfg = window.DASHBOARD_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  // ---------------- Clock & date ----------------

  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function renderClock(now) {
    var h = now.getHours();
    var m = pad(now.getMinutes());
    // Like the Lock Screen: no AM/PM in 12-hour mode
    $("time").textContent = (cfg.clock24h ? pad(h) : (h % 12 || 12)) + ":" + m;
    $("date").textContent = DAYS[now.getDay()] + ", " + MONTHS[now.getMonth()] + " " + now.getDate();
  }

  // ---------------- Night mode ----------------

  function toMinutes(hhmm) {
    var p = String(hhmm).split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || "0", 10);
  }

  function isNight(now) {
    var t = now.getHours() * 60 + now.getMinutes();
    var start = toMinutes(cfg.nightStart || "21:30");
    var end = toMinutes(cfg.nightEnd || "06:00");
    // Window wraps past midnight when start > end
    return start > end ? (t >= start || t < end) : (t >= start && t < end);
  }

  function applyNight(now) {
    var forced = /[?&]night=(1|0)/.exec(location.search);
    var night = forced ? forced[1] === "1" : isNight(now);
    var was = document.body.classList.contains("night");
    if (night !== was) document.body.classList.toggle("night", night);
  }

  // ---------------- Weather (Open-Meteo, no API key) ----------------

  // Condition names worded the way Apple's Weather app words them
  var WMO = {
    0: "Clear", 1: "Mostly Clear", 2: "Partly Cloudy", 3: "Cloudy",
    45: "Foggy", 48: "Foggy",
    51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
    56: "Freezing Drizzle", 57: "Freezing Drizzle",
    61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
    66: "Freezing Rain", 67: "Freezing Rain",
    71: "Light Snow", 73: "Snow", 75: "Heavy Snow", 77: "Snow",
    80: "Showers", 81: "Showers", 82: "Heavy Showers",
    85: "Snow Showers", 86: "Snow Showers",
    95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms"
  };

  // ---- Weather glyphs, drawn in the style of SF Symbols (36x36 grid) ----

  function sunGlyph(cx, cy, r) {
    var out = "";
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      out += '<line class="s-ray" x1="' + (cx + Math.cos(a) * (r + 2.6)).toFixed(1) +
        '" y1="' + (cy + Math.sin(a) * (r + 2.6)).toFixed(1) +
        '" x2="' + (cx + Math.cos(a) * (r + 5)).toFixed(1) +
        '" y2="' + (cy + Math.sin(a) * (r + 5)).toFixed(1) + '"/>';
    }
    return out + '<circle class="s-sun" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
  }

  function moonGlyph(cx, cy, r) {
    return '<mask id="moonCut"><rect width="36" height="36" fill="#fff"/>' +
      '<circle cx="' + (cx + r * 0.6) + '" cy="' + (cy - r * 0.5) + '" r="' + (r * 0.82) + '" fill="#000"/></mask>' +
      '<circle class="s-moon" cx="' + cx + '" cy="' + cy + '" r="' + r + '" mask="url(#moonCut)"/>';
  }

  // Cloud spans roughly x 6–31, y 8–26 before translating
  function cloudGlyph(cls, dx, dy) {
    return '<g class="' + cls + '" transform="translate(' + dx + ' ' + dy + ')">' +
      '<circle cx="12" cy="20" r="5.5"/><circle cx="19" cy="15.5" r="7.5"/>' +
      '<circle cx="25.5" cy="20.5" r="5"/><rect x="12" y="19" width="13.5" height="6.5"/></g>';
  }

  function weatherGlyph(code, isDay) {
    var g;
    if (code === 0) {
      g = isDay ? sunGlyph(18, 18, 7) : moonGlyph(18, 18, 10);
    } else if (code <= 2) {
      g = (isDay ? sunGlyph(12, 12, 4.6) : moonGlyph(12, 11, 6.5)) + cloudGlyph("s-cloud", 2, 5);
    } else if (code === 3) {
      g = cloudGlyph("s-cloud-dim", 5, -3) + cloudGlyph("s-cloud", -1, 3);
    } else if (code === 45 || code === 48) {
      g = cloudGlyph("s-cloud", 0, -4) + '<line class="s-fog" x1="8" y1="27" x2="28" y2="27"/>' +
        '<line class="s-fog" x1="11" y1="31.5" x2="25" y2="31.5"/>';
    } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      g = cloudGlyph("s-cloud", 0, -4) + '<circle class="s-snow" cx="12" cy="27" r="1.7"/>' +
        '<circle class="s-snow" cx="18" cy="30" r="1.7"/><circle class="s-snow" cx="24" cy="27" r="1.7"/>' +
        '<circle class="s-snow" cx="15" cy="33.5" r="1.7"/><circle class="s-snow" cx="21" cy="33.5" r="1.7"/>';
    } else if (code >= 95) {
      g = cloudGlyph("s-cloud", 0, -5) + '<path class="s-bolt" d="M19.5 22.5 13.6 30h4.2l-2.3 6 7.4-8.6h-4.4l2.6-4.9z"/>';
    } else {
      // Drizzle, rain, showers
      g = cloudGlyph("s-cloud", 0, -4) + '<line class="s-rain" x1="13" y1="26" x2="11.4" y2="31"/>' +
        '<line class="s-rain" x1="19" y1="26" x2="17.4" y2="31"/><line class="s-rain" x1="25" y1="26" x2="23.4" y2="31"/>';
    }
    return '<svg viewBox="0 0 36 36" aria-hidden="true">' + g + "</svg>";
  }

  // ---- Low/high bar: colored by temperature, like the Weather app ----

  var TEMP_COLORS = [ // °F → color
    [10, "#5e5ce6"], [32, "#0a84ff"], [50, "#64d2ff"], [62, "#30d158"],
    [72, "#ffd60a"], [85, "#ff9f0a"], [100, "#ff453a"]
  ];

  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function tempColor(f) {
    if (f <= TEMP_COLORS[0][0]) return TEMP_COLORS[0][1];
    for (var i = 1; i < TEMP_COLORS.length; i++) {
      if (f <= TEMP_COLORS[i][0]) {
        var a = TEMP_COLORS[i - 1], b = TEMP_COLORS[i];
        var t = (f - a[0]) / (b[0] - a[0]);
        var ca = hexToRgb(a[1]), cb = hexToRgb(b[1]);
        return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(ca[k] + (cb[k] - ca[k]) * t); }).join(",") + ")";
      }
    }
    return TEMP_COLORS[TEMP_COLORS.length - 1][1];
  }

  function trackGradient(lo, hi) {
    var toF = cfg.temperatureUnit === "celsius" ? function (c) { return c * 9 / 5 + 32; } : function (f) { return f; };
    var loF = toF(lo), hiF = toF(hi);
    if (hiF - loF < 1) return tempColor(loF);
    var stops = [tempColor(loF) + " 0%"];
    TEMP_COLORS.forEach(function (c) {
      if (c[0] > loF && c[0] < hiF) stops.push(c[1] + " " + ((c[0] - loF) / (hiF - loF) * 100).toFixed(1) + "%");
    });
    stops.push(tempColor(hiF) + " 100%");
    return "linear-gradient(90deg, " + stops.join(", ") + ")";
  }

  // The chosen city is saved on this device; config.js is the fallback
  var LOCATION_KEY = "dashboard.location";

  function getLocation() {
    try {
      var saved = JSON.parse(localStorage.getItem(LOCATION_KEY));
      if (saved && isFinite(saved.latitude) && isFinite(saved.longitude)) return saved;
    } catch (e) {}
    return { name: cfg.locationName || "", latitude: cfg.latitude, longitude: cfg.longitude };
  }

  function saveLocation(loc) {
    try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch (e) {}
  }

  var weatherRequest = 0;

  function loadWeather() {
    var loc = getLocation();
    var request = ++weatherRequest;
    $("place").textContent = loc.name || "Set location";

    var url = "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + encodeURIComponent(loc.latitude) +
      "&longitude=" + encodeURIComponent(loc.longitude) +
      "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max" +
      "&current=temperature_2m,weather_code,is_day" +
      "&temperature_unit=" + (cfg.temperatureUnit === "celsius" ? "celsius" : "fahrenheit") +
      "&timezone=auto&forecast_days=6";

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (request !== weatherRequest) return; // a newer city was picked meanwhile
        var d = data.daily;
        var cur = data.current || {};
        var hi = d.temperature_2m_max[0], lo = d.temperature_2m_min[0];
        $("hi").textContent = Math.round(hi) + "°";
        $("lo").textContent = Math.round(lo) + "°";

        var code = cur.weather_code != null ? cur.weather_code : d.weather_code[0];
        $("wicon").innerHTML = weatherGlyph(code, cur.is_day !== 0);

        var parts = [];
        if (WMO[code]) parts.push(WMO[code]);
        if (cur.temperature_2m != null) parts.push("Now " + Math.round(cur.temperature_2m) + "°");
        var pop = d.precipitation_probability_max && d.precipitation_probability_max[0];
        if (pop >= 20) parts.push(pop + "% Chance of Rain");
        $("conditions").textContent = parts.join(" · ");
        renderForecast(d);

        $("track").style.background = trackGradient(lo, hi);
        var dot = $("nowDot");
        if (cur.temperature_2m != null && hi > lo) {
          var pct = Math.max(0, Math.min(1, (cur.temperature_2m - lo) / (hi - lo)));
          dot.style.left = (pct * 100).toFixed(1) + "%";
          dot.style.display = "block";
        } else {
          dot.style.display = "none";
        }
        relayout();
      })
      .catch(function (err) {
        // Keep the last good values on screen; just note that it's stale
        console.warn("Weather failed:", err);
        if ($("hi").textContent === "--°") $("conditions").textContent = "Weather unavailable";
      });
  }

  // Next five days (skipping today), side by side
  function renderForecast(d) {
    var list = $("forecast");
    list.innerHTML = "";
    for (var i = 1; i < d.time.length && i <= 5; i++) {
      var p = d.time[i].split("-");
      var date = new Date(+p[0], +p[1] - 1, +p[2]);
      var pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;

      var li = document.createElement("li");
      li.innerHTML = '<span class="f-day"></span>' +
        '<span class="f-icon">' + weatherGlyph(d.weather_code[i], true) + "</span>" +
        '<span class="f-temps"><span class="f-hi"></span> <span class="f-lo"></span></span>' +
        '<span class="f-rain"></span>';
      li.querySelector(".f-day").textContent = DAYS[date.getDay()].slice(0, 3);
      li.querySelector(".f-hi").textContent = Math.round(d.temperature_2m_max[i]) + "°";
      li.querySelector(".f-lo").textContent = Math.round(d.temperature_2m_min[i]) + "°";
      var rain = li.querySelector(".f-rain");
      rain.textContent = pop != null ? pop + "%" : "";
      if (pop == null || pop < 20) rain.className += " dry";
      list.appendChild(li);
    }
  }

  // ---------------- City picker (tap the weather) ----------------

  var searchTimer, searchRequest = 0;

  function placeLabel(r) {
    // "Nashville, Tennessee" in the US, "Paris, France" elsewhere
    var region = r.country_code === "US" ? r.admin1 : r.country;
    return region && region !== r.name ? r.name + ", " + region : r.name;
  }

  function openPicker() {
    $("picker").hidden = false;
    $("pickerInput").value = "";
    $("pickerResults").innerHTML = "";
    $("pickerStatus").textContent = "Current: " + (getLocation().name || "not set");
    $("pickerInput").focus(); // must run inside the tap for iOS to show the keyboard
  }

  function closePicker() {
    $("pickerInput").blur();
    $("picker").hidden = true;
  }

  function searchCities(query) {
    var request = ++searchRequest;
    var status = $("pickerStatus");
    var list = $("pickerResults");
    if (query.length < 2) {
      list.innerHTML = "";
      status.textContent = "";
      return;
    }
    status.textContent = "Searching…";

    fetch("https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=" +
        encodeURIComponent(query))
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (request !== searchRequest) return;
        var results = data.results || [];
        list.innerHTML = "";
        status.textContent = results.length ? "" : "No matches";
        results.forEach(function (r) {
          var li = document.createElement("li");
          var btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = r.name;
          var sub = document.createElement("span");
          sub.className = "sub";
          sub.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
          btn.appendChild(sub);
          btn.addEventListener("click", function () {
            saveLocation({ name: placeLabel(r), latitude: r.latitude, longitude: r.longitude });
            closePicker();
            loadWeather();
          });
          li.appendChild(btn);
          list.appendChild(li);
        });
      })
      .catch(function (err) {
        if (request !== searchRequest) return;
        console.warn("City search failed:", err);
        status.textContent = "Search failed. Check the connection.";
      });
  }

  $("weather").addEventListener("click", openPicker);
  $("pickerClose").addEventListener("click", closePicker);
  $("picker").addEventListener("click", function (e) {
    if (e.target === $("picker")) closePicker(); // tap outside the panel
  });
  $("pickerInput").addEventListener("input", function () {
    var q = this.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { searchCities(q); }, 300);
  });

  // ---------------- Quotes ----------------

  var quotes = [];
  var lastIndex = -1;

  // quotes.txt format: one quote per blank-line-separated block,
  // ending in "- Author", optionally preceded by "(Source)".
  function parseQuotes(text) {
    var blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim();
      if (!block) continue;
      if (i === 0 && /^quotes\b/i.test(block)) block = block.replace(/^quotes\s*/i, "").trim();
      if (!block || block.charAt(0) === "￼") continue; // header or pasted-image placeholder

      var body = block, author = "", source = "";

      // Author: text after the last " - " (no further dashes in it)
      var m = /^([\s\S]*?)\s+[-–—]\s*([^\s\-–—][^\-–—]*)$/.exec(body);
      // Fallback for authors that contain a dash themselves ("... 3:12-13")
      if (!m) m = /^([\s\S]*\S)\s+[-–—](?=\S)([^\n]+)$/.exec(body);
      if (m) {
        body = m[1];
        author = m[2].trim();
        // Drop a stray unmatched closing paren, e.g. "Spurgeon)"
        if (/\)$/.test(author) && author.indexOf("(") === -1) author = author.slice(0, -1).trim();
      }

      // Source: trailing "(...)" on the quote body
      var s = /\(\s*([^()]+?)\s*\)\s*[-–—]?\s*$/.exec(body);
      if (s) {
        source = s[1];
        body = body.slice(0, s.index);
      }
      body = body.replace(/\s*[-–—]\s*$/, "").trim()
        // Keep intentional line breaks (dialogue), but rejoin lines wrapped mid-sentence
        .replace(/([^.?!:"”’])[ \t]*\n[ \t]*/g, "$1 ");
      if (!body) continue;

      out.push({ text: body, author: author, source: source });
    }
    return out;
  }

  function loadQuotes() {
    return fetch("quotes.txt?t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        var parsed = parseQuotes(text);
        if (parsed.length) quotes = parsed;
      })
      .catch(function (err) { console.warn("Quotes failed:", err); });
  }

  function pickQuote() {
    if (!quotes.length) return null;
    var forced = /[?&]quote=(\d+)/.exec(location.search);
    var i;
    if (forced) {
      i = Math.min(parseInt(forced[1], 10), quotes.length - 1);
    } else {
      do { i = Math.floor(Math.random() * quotes.length); }
      while (quotes.length > 1 && i === lastIndex);
    }
    lastIndex = i;
    return quotes[i];
  }

  // Shrink the font until the quote fits its box (long quotes get smaller text)
  function fitQuote() {
    var box = $("quoteBody");
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    var max = 1.55 * rem;
    var min = 0.78 * rem;
    var size = max;
    box.style.fontSize = size + "px";
    var inner = $("quoteInner");
    var style = getComputedStyle(box);
    var room = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    while (size > min && inner.offsetHeight > room) {
      size *= 0.94;
      box.style.fontSize = size + "px";
    }
    // If it still doesn't fit, anchor it to the top so the start stays readable
    var fits = inner.offsetHeight <= room;
    box.style.justifyContent = fits ? "" : "flex-start";
    return fits;
  }

  function renderQuote(q) {
    if (!q) return;
    $("quoteText").textContent = q.text;
    var cite = $("quoteCite");
    cite.innerHTML = "";
    if (q.author) {
      var a = document.createElement("span");
      a.className = "author";
      a.textContent = "— " + q.author;
      cite.appendChild(a);
    }
    if (q.source) {
      var s = document.createElement("span");
      s.className = "source";
      s.textContent = (q.author ? ",  " : "") + q.source;
      cite.appendChild(s);
    }
    relayout(); // a longer quote may need calendar rows back, or fewer
  }

  function nextQuote() {
    var box = $("quoteBody");
    box.classList.add("fading");
    setTimeout(function () {
      // Re-read the file each time so edits on the server show up without a reload
      loadQuotes().then(function () {
        renderQuote(pickQuote());
        box.classList.remove("fading");
      });
    }, 1200);
  }

  // ---------------- Calendar (served by the calendar container) ----------------

  var calData = null;

  // Parse "2026-11-03", "2026-11-03T15:00:00Z" or a floating "2026-11-03T15:00:00"
  // by hand, since older Safari handles ISO strings inconsistently
  function parseWhen(s) {
    var m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?(Z)?)?$/.exec(s || "");
    if (!m) return null;
    if (m[7]) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function clockTime(d) {
    var h = d.getHours(), m = pad(d.getMinutes());
    if (cfg.clock24h) return pad(h) + ":" + m;
    return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM");
  }

  function dayLabel(day, today) {
    var diff = Math.round((day - today) / 86400000);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return DAYS[day.getDay()] + ", " + MONTHS[day.getMonth()].slice(0, 3) + " " + day.getDate();
  }

  function eventTime(ev, start, end, now) {
    if (ev.allDay) return "All Day";
    if (start <= now && end > now) return "Now · until " + clockTime(end);
    return end > start ? clockTime(start) + " – " + clockTime(end) : clockTime(start);
  }

  // Shows up to maxRows events (as many as fit); returns how many it showed
  function renderCalendar(maxRows) {
    if (!calData || !calData.configured) {
      document.body.classList.remove("has-cal");
      return 0;
    }
    document.body.classList.add("has-cal");

    var body = $("calBody");
    var now = new Date();
    var today = startOfDay(now);
    var horizon = new Date(today.getTime() + (cfg.calendarDays || 7) * 86400000);
    var events = [];
    (calData.events || []).forEach(function (ev) {
      var start = parseWhen(ev.start), end = parseWhen(ev.end) || start;
      if (!start || end <= now && !(ev.allDay && end > today) || start >= horizon) return;
      events.push({ ev: ev, start: start, end: end, day: start < today ? today : startOfDay(start) });
    });
    events.sort(function (a, b) {
      return a.day - b.day || (b.ev.allDay - a.ev.allDay) || a.start - b.start;
    });

    body.innerHTML = "";
    if (!events.length) {
      var msg = document.createElement("div");
      msg.className = "cal-empty";
      msg.textContent = calData.error && !calData.updated ? calData.error : "No upcoming events";
      body.appendChild(msg);
      return 0;
    }

    // Add events until the card is full
    var lastDay = null, shown = 0;
    for (var i = 0; i < events.length && shown < (maxRows || Infinity); i++) {
      var e = events[i], header = null;
      if (!lastDay || e.day - lastDay !== 0) {
        header = document.createElement("div");
        header.className = "cal-day";
        header.textContent = dayLabel(e.day, today);
        body.appendChild(header);
      }
      var row = document.createElement("div");
      row.className = "cal-ev";
      row.innerHTML = '<span class="cal-bar"></span><div class="cal-text"><div class="cal-title"></div><div class="cal-time"></div></div>';
      if (e.ev.color) row.firstChild.style.background = e.ev.color;
      row.querySelector(".cal-title").textContent = e.ev.title;
      row.querySelector(".cal-time").textContent = eventTime(e.ev, e.start, e.end, now);
      body.appendChild(row);

      if (body.scrollHeight > body.clientHeight + 1 && i > 0) {
        body.removeChild(row);
        if (header) body.removeChild(header);
        break;
      }
      lastDay = e.day;
      shown++;
    }
    return shown;
  }

  // Fit the calendar and quote together. In portrait they share the height,
  // so drop calendar rows one at a time until the quote fits too.
  function relayout() {
    var shown = renderCalendar();
    var portrait = window.innerHeight > window.innerWidth;
    while (!fitQuote() && portrait && shown > 1) {
      shown = renderCalendar(shown - 1);
    }
  }

  function loadCalendar() {
    fetch("api/calendar?t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        calData = data;
        relayout();
      })
      .catch(function (err) {
        // No calendar container (or it's down): keep the last events, or hide the card
        console.warn("Calendar failed:", err);
        relayout();
      });
  }

  // ---------------- Burn-in protection ----------------
  // Nudge the whole layout a few pixels every so often.
  function shiftPixels() {
    var x = Math.round(Math.random() * 8 - 4);
    var y = Math.round(Math.random() * 8 - 4);
    $("dash").style.transform = "translate(" + x + "px," + y + "px)";
  }

  // ---------------- Boot ----------------

  function tick() {
    var now = new Date();
    renderClock(now);
    applyNight(now);
  }

  tick();
  // Align updates to the start of each minute
  setTimeout(function () {
    tick();
    setInterval(tick, 60 * 1000);
  }, (60 - new Date().getSeconds()) * 1000 + 50);
  // Safety net in case the iPad throttled timers while the screen was off
  setInterval(tick, 15 * 1000);

  loadWeather();
  setInterval(loadWeather, (cfg.weatherMinutes || 30) * 60 * 1000);

  loadQuotes().then(function () { renderQuote(pickQuote()); });
  setInterval(nextQuote, (cfg.quoteMinutes || 60) * 60 * 1000);
  $("quoteBox").addEventListener("click", nextQuote);

  loadCalendar();
  setInterval(loadCalendar, 5 * 60 * 1000);

  setInterval(shiftPixels, 5 * 60 * 1000);

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 150);
  });

  // Refresh weather right away when the iPad wakes / the tab comes back
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { tick(); loadWeather(); loadCalendar(); }
  });

  // Full reload once a day (3:00 AM) to pick up any changes to the dashboard itself
  setInterval(function () {
    var n = new Date();
    if (n.getHours() === 3 && n.getMinutes() === 0) location.reload();
  }, 60 * 1000);
})();
