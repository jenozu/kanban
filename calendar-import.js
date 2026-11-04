/*
 * Driftboard calendar import: a small, dependency-free iCalendar (.ics) reader.
 *
 * Browser: exposes window.DriftboardICS. Node: module.exports (used by tests).
 *
 * parse(text, {from, to}) returns upcoming occurrences between two local date
 * keys ("YYYY-MM-DD"). Recurring events (DAILY / WEEKLY with BYDAY / MONTHLY /
 * YEARLY, INTERVAL, COUNT, UNTIL, EXDATE, RECURRENCE-ID overrides) are expanded.
 * Rules this reader does not understand (for example "second Tuesday of the
 * month") are not guessed at: only their first date is considered and they are
 * counted in `skippedRecurring` so the UI can say so.
 */
(function (root) {
  "use strict";

  var DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var MAX_ITERATIONS = 20000;

  function pad(n) { return String(n).padStart(2, "0"); }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function unfold(text) {
    return String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  }
  function unescapeText(v) {
    return String(v).replace(/\\([nN,;\\])/g, function (m, c) { return c === "n" || c === "N" ? "\n" : c; });
  }

  // "NAME;PARAM=x:VALUE" -> {name, params, value}. Colons inside quoted params are ignored.
  function splitLine(line) {
    var i, ch, inQuote = false, colon = -1;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ":" && !inQuote) { colon = i; break; }
    }
    if (colon < 0) return null;
    var head = line.slice(0, colon), value = line.slice(colon + 1);
    var parts = [], cur = "", q = false;
    for (i = 0; i < head.length; i++) {
      ch = head.charAt(i);
      if (ch === '"') { q = !q; cur += ch; }
      else if (ch === ";" && !q) { parts.push(cur); cur = ""; }
      else cur += ch;
    }
    parts.push(cur);
    var name = parts.shift().toUpperCase(), params = {};
    parts.forEach(function (p) {
      var eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    });
    return { name: name, params: params, value: value };
  }

  // Offset (ms) of `tz` from UTC at the instant `utcMs`. Throws RangeError for unknown zones.
  function tzOffsetMs(utcMs, tz) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
    });
    var p = {};
    f.formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }
  function zonedToDate(y, mo, d, h, mi, s, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s);
    var off = tzOffsetMs(guess, tz);
    var t = guess - off;
    var off2 = tzOffsetMs(t, tz);
    if (off2 !== off) t = guess - off2; // landed across a DST change: use the offset at the result
    return new Date(t);
  }

  // -> {date: Date, allDay: bool} in the viewer's local time, or null.
  function parseDateValue(value, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (m[4] === undefined) return { date: new Date(y, mo - 1, d, 12, 0, 0), allDay: true };
    var h = +m[4], mi = +m[5], s = +(m[6] || 0);
    if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
    if (params && params.TZID) {
      try { return { date: zonedToDate(y, mo, d, h, mi, s, params.TZID), allDay: false }; }
      catch (e) { /* Unknown zone name (e.g. a Windows name): fall back to floating local time. */ }
    }
    return { date: new Date(y, mo - 1, d, h, mi, s), allDay: false };
  }

  function parseRrule(value) {
    var raw = {};
    String(value).split(";").forEach(function (part) {
      var i = part.indexOf("=");
      if (i > 0) raw[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    });
    var rule = {
      freq: (raw.FREQ || "").toUpperCase(),
      interval: Math.max(1, parseInt(raw.INTERVAL || "1", 10) || 1),
      count: raw.COUNT ? parseInt(raw.COUNT, 10) : null,
      until: null,
      byday: [],
      unsupported: false
    };
    if (raw.UNTIL) {
      var u = parseDateValue(raw.UNTIL, {});
      if (u) rule.until = keyOf(u.date);
    }
    if (raw.BYDAY) {
      raw.BYDAY.split(",").forEach(function (tok) {
        var t = tok.trim().toUpperCase();
        if (Object.prototype.hasOwnProperty.call(DAY, t)) rule.byday.push(DAY[t]);
        else rule.unsupported = true; // ordinals like 1MO or -1FR
      });
    }
    if (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].indexOf(rule.freq) < 0) rule.unsupported = true;
    if (rule.freq !== "WEEKLY" && rule.byday.length) rule.unsupported = true;
    if (raw.BYMONTHDAY || raw.BYSETPOS || raw.BYWEEKNO || raw.BYYEARDAY || (raw.BYMONTH && rule.freq !== "YEARLY")) rule.unsupported = true;
    return rule;
  }

  function parseEvents(text) {
    var events = [], cur = null, depth = 0;
    unfold(text).split("\n").forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      if (!line) return;
      var up = line.toUpperCase();
      if (up === "BEGIN:VEVENT") { cur = { exdates: [] }; depth = 0; return; }
      if (up === "END:VEVENT") { if (cur && cur.start) events.push(cur); cur = null; return; }
      if (!cur) return;
      if (up.indexOf("BEGIN:") === 0) { depth++; return; } // e.g. VALARM: ignore its properties
      if (up.indexOf("END:") === 0) { depth--; return; }
      if (depth > 0) return;
      var p = splitLine(line);
      if (!p) return;
      switch (p.name) {
        case "UID": cur.uid = p.value.trim(); break;
        case "SUMMARY": cur.title = unescapeText(p.value).trim(); break;
        case "DESCRIPTION": cur.description = unescapeText(p.value).trim(); break;
        case "LOCATION": cur.location = unescapeText(p.value).trim(); break;
        case "STATUS": cur.status = p.value.trim().toUpperCase(); break;
        case "DTSTART": {
          var s = parseDateValue(p.value, p.params);
          if (s) { cur.start = s.date; cur.allDay = s.allDay; }
          break;
        }
        case "RRULE": cur.rrule = parseRrule(p.value); break;
        case "EXDATE":
          p.value.split(",").forEach(function (v) {
            var x = parseDateValue(v, p.params);
            if (x) cur.exdates.push(keyOf(x.date));
          });
          break;
        case "RECURRENCE-ID": {
          var r = parseDateValue(p.value, p.params);
          if (r) cur.recurrenceKey = keyOf(r.date);
          break;
        }
      }
    });
    return events;
  }

  // Start Dates of a master event between two date keys (inclusive).
  function expand(ev, fromKey, toKey) {
    var base = ev.start, hh = base.getHours(), mm = base.getMinutes();
    var startKey = keyOf(base), out = [];
    function at(y, m, d) { return new Date(y, m, d, hh, mm, 0); }
    function inWindow(k) { return k >= fromKey && k <= toKey; }

    var r = ev.rrule;
    if (!r || r.unsupported) return inWindow(startKey) ? [base] : [];

    var n = 0, i, y = base.getFullYear(), m = base.getMonth(), d = base.getDate();
    // Returns false once nothing further can fall inside the window / rule.
    function emit(date) {
      var k = keyOf(date);
      if (k < startKey) return true;
      if (r.until && k > r.until) return false;
      n++;
      if (r.count && n > r.count) return false;
      if (k > toKey) return false;
      if (k >= fromKey) out.push(date);
      return true;
    }

    if (r.freq === "DAILY") {
      for (i = 0; i < MAX_ITERATIONS; i++) if (!emit(at(y, m, d + i * r.interval))) break;
    } else if (r.freq === "WEEKLY") {
      var days = r.byday.length ? r.byday.slice() : [base.getDay()];
      days.sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }); // Monday-first week
      var weekStartDay = d - ((base.getDay() + 6) % 7), done = false;
      for (i = 0; i < MAX_ITERATIONS && !done; i++) {
        for (var j = 0; j < days.length; j++) {
          if (!emit(at(y, m, weekStartDay + i * 7 * r.interval + ((days[j] + 6) % 7)))) { done = true; break; }
        }
      }
    } else if (r.freq === "MONTHLY") {
      for (i = 0; i < MAX_ITERATIONS; i++) {
        if (keyOf(new Date(y, m + i * r.interval, 1)) > toKey) break;
        var md = at(y, m + i * r.interval, d);
        if (md.getDate() !== d) continue; // e.g. the 31st in a 30-day month is skipped, per RFC 5545
        if (!emit(md)) break;
      }
    } else { // YEARLY
      for (i = 0; i < MAX_ITERATIONS; i++) {
        if (keyOf(new Date(y + i * r.interval, 0, 1)) > toKey) break;
        var yd = at(y + i * r.interval, m, d);
        if (yd.getDate() !== d) continue; // Feb 29 in a non-leap year
        if (!emit(yd)) break;
      }
    }
    return out;
  }

  function makeItem(ev, start) {
    var date = keyOf(start);
    var uid = ev.uid || ("noid-" + (ev.title || "") + "-" + keyOf(ev.start));
    return {
      key: uid + "|" + date,
      uid: uid,
      title: ev.title || "(No title)",
      description: ev.description || "",
      location: ev.location || "",
      date: date,
      allDay: !!ev.allDay,
      time: ev.allDay ? "" : pad(start.getHours()) + ":" + pad(start.getMinutes()),
      start: start
    };
  }

  function parse(text, opts) {
    opts = opts || {};
    var now = new Date();
    var fromKey = opts.from || keyOf(now);
    var toKey = opts.to || keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    var events = parseEvents(text);
    var overrides = {}, masters = [], items = [], seen = {}, skippedRecurring = 0;

    events.forEach(function (ev) {
      if (ev.recurrenceKey) overrides[(ev.uid || "") + "|" + ev.recurrenceKey] = ev;
      else masters.push(ev);
    });

    function push(item) {
      if (seen[item.key]) return;
      seen[item.key] = true;
      items.push(item);
    }

    masters.forEach(function (ev) {
      if (ev.status === "CANCELLED") return;
      if (ev.rrule && ev.rrule.unsupported) skippedRecurring++;
      var hasOverrides = !!ev.uid;
      expand(ev, fromKey, toKey).forEach(function (start) {
        var k = keyOf(start);
        if (ev.exdates.indexOf(k) >= 0) return;
        if (hasOverrides && overrides[ev.uid + "|" + k]) return; // handled below
        push(makeItem(ev, start));
      });
    });

    Object.keys(overrides).forEach(function (id) {
      var ev = overrides[id];
      if (ev.status === "CANCELLED") return;
      var k = keyOf(ev.start);
      if (k >= fromKey && k <= toKey) push(makeItem(ev, ev.start));
    });

    items.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
    });
    return { items: items, skippedRecurring: skippedRecurring, totalEvents: events.length };
  }

  // Fields for a Kanban task created from an occurrence.
  function taskFields(item) {
    var when = item.allDay ? "All day" : item.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    var lines = ["Calendar event · " + when];
    if (item.location) lines.push("Where: " + item.location);
    if (item.description) lines.push("", item.description);
    return {
      title: item.title,
      description: lines.join("\n"),
      due: item.date,
      source: "ics:" + item.key
    };
  }

  var api = { parse: parse, taskFields: taskFields };
  root.DriftboardICS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
