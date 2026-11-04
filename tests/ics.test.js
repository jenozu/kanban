"use strict";
// Run with: TZ=America/Toronto node tests/ics.test.js
const assert = require("assert");
const ICS = require("../calendar-import.js");
const api = require("../api/ics.js")._test;

assert.strictEqual(process.env.TZ, "America/Toronto", "run this test with TZ=America/Toronto");

const wrap = (...events) => "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + events.join("\r\n") + "\r\nEND:VCALENDAR\r\n";
const ev = (...lines) => ["BEGIN:VEVENT"].concat(lines, ["END:VEVENT"]).join("\r\n");
const run = (text, from, to) => ICS.parse(text, { from: from || "2026-11-01", to: to || "2026-11-30" });
const dates = (res) => res.items.map((i) => i.date + (i.time ? " " + i.time : ""));

// 1. UTC, TZID and floating times land in the viewer's local time (Toronto is UTC-5 in November).
{
  const res = run(wrap(
    ev("UID:a", "SUMMARY:UTC call", "DTSTART:20261104T143000Z"),
    ev("UID:b", "SUMMARY:Zoned", "DTSTART;TZID=America/Toronto:20261105T093000"),
    ev("UID:c", "SUMMARY:Tokyo morning", "DTSTART;TZID=Asia/Tokyo:20261106T090000"),
    ev("UID:d", "SUMMARY:Floating", "DTSTART:20261107T170000"),
    ev("UID:e", "SUMMARY:Unknown zone", "DTSTART;TZID=Eastern Standard Time:20261108T080000")
  ));
  assert.deepStrictEqual(dates(res), [
    "2026-11-04 09:30", "2026-11-05 09:30", "2026-11-05 19:00", "2026-11-07 17:00", "2026-11-08 08:00"
  ]);
}

// 2. All-day events have no time; folded lines and escapes are decoded; VALARM text is ignored.
{
  const res = run(wrap(ev(
    "UID:allday", "SUMMARY:Dentist\\, Dr. Lee", "DTSTART;VALUE=DATE:20261110",
    "DESCRIPTION:Bring forms\\nand ID, fold", " ed line",
    "LOCATION:Room 4\\; 2nd floor",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder text", "TRIGGER:-PT5M", "END:VALARM"
  )));
  assert.strictEqual(res.items.length, 1);
  const item = res.items[0];
  assert.strictEqual(item.title, "Dentist, Dr. Lee");
  assert.strictEqual(item.date, "2026-11-10");
  assert.strictEqual(item.time, "");
  assert.strictEqual(item.allDay, true);
  assert.strictEqual(item.description, "Bring forms\nand ID, folded line");
  assert.strictEqual(item.location, "Room 4; 2nd floor");
  const f = ICS.taskFields(item);
  assert.strictEqual(f.due, "2026-11-10");
  assert.strictEqual(f.source, "ics:allday|2026-11-10");
  assert.ok(f.description.includes("All day") && f.description.includes("Where: Room 4; 2nd floor") && f.description.includes("Bring forms"));
}

// 3. Weekly BYDAY with COUNT and EXDATE (an excluded date still uses up a COUNT slot).
{
  const res = run(wrap(ev(
    "UID:w", "SUMMARY:Gym", "DTSTART:20261102T090000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", "EXDATE:20261104T090000"
  )));
  assert.deepStrictEqual(dates(res), ["2026-11-02 09:00", "2026-11-09 09:00", "2026-11-11 09:00"]);
}

// 4. Daily with UNTIL and INTERVAL.
{
  assert.deepStrictEqual(dates(run(wrap(ev("UID:d", "SUMMARY:Standup", "DTSTART:20261101T080000", "RRULE:FREQ=DAILY;UNTIL=20261103T235959"))))
    .map((s) => s.slice(0, 10)), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepStrictEqual(dates(run(wrap(ev("UID:i", "SUMMARY:Fortnightly", "DTSTART:20261102T100000", "RRULE:FREQ=WEEKLY;INTERVAL=2"))))
    .map((s) => s.slice(0, 10)), ["2026-11-02", "2026-11-16", "2026-11-30"]);
}

// 5. Overrides: one instance moved, one cancelled.
{
  const res = run(wrap(
    ev("UID:o", "SUMMARY:Review", "DTSTART:20261102T090000", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("UID:o", "SUMMARY:Review (moved)", "RECURRENCE-ID:20261109T090000", "DTSTART:20261110T100000"),
    ev("UID:o", "SUMMARY:Review", "RECURRENCE-ID:20261116T090000", "DTSTART:20261116T090000", "STATUS:CANCELLED")
  ));
  assert.deepStrictEqual(res.items.map((i) => i.title + " " + i.date), ["Review 2026-11-02", "Review (moved) 2026-11-10"]);
}

// 6. Cancelled events are dropped.
assert.strictEqual(run(wrap(ev("UID:x", "SUMMARY:Nope", "DTSTART:20261110T090000", "STATUS:CANCELLED"))).items.length, 0);

// 7. Monthly on the 31st skips short months without using up COUNT; yearly handles the window.
{
  const res = run(wrap(ev("UID:m", "SUMMARY:Rent", "DTSTART:20261031T120000", "RRULE:FREQ=MONTHLY;COUNT=3")), "2026-10-01", "2027-03-01");
  assert.deepStrictEqual(res.items.map((i) => i.date), ["2026-10-31", "2026-12-31", "2027-01-31"]);
  const yearly = run(wrap(ev("UID:y", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20100315", "RRULE:FREQ=YEARLY")), "2027-03-01", "2027-03-31");
  assert.deepStrictEqual(yearly.items.map((i) => i.date), ["2027-03-15"]);
}

// 8. Patterns we do not expand are counted, and only their first date can appear.
{
  const res = run(wrap(ev("UID:u", "SUMMARY:Board meeting", "DTSTART:20261110T090000", "RRULE:FREQ=MONTHLY;BYDAY=2TU")));
  assert.strictEqual(res.skippedRecurring, 1);
  assert.deepStrictEqual(res.items.map((i) => i.date), ["2026-11-10"]);
}

// 9. Window filtering and ordering; events without UIDs still get stable keys.
{
  const res = run(wrap(
    ev("SUMMARY:Late", "DTSTART:20261120T150000"),
    ev("SUMMARY:Early", "DTSTART:20261103T150000"),
    ev("SUMMARY:Outside", "DTSTART:20261201T150000")
  ));
  assert.deepStrictEqual(res.items.map((i) => i.title), ["Early", "Late"]);
  assert.ok(res.items[0].key.length > 5);
  assert.strictEqual(ICS.parse("not a calendar", { from: "2026-11-01", to: "2026-11-30" }).items.length, 0);
}

// 10. Feed proxy: private and unusual targets are refused.
{
  const bad = ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1", "not-an-ip"];
  bad.forEach((ip) => assert.strictEqual(api.isPrivateAddress(ip), true, ip + " should be blocked"));
  ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"].forEach((ip) => assert.strictEqual(api.isPrivateAddress(ip), false, ip + " should be allowed"));

  assert.strictEqual(api.parseTarget("webcal://example.com/cal.ics").protocol, "https:");
  ["http://example.com/a.ics", "ftp://example.com/a.ics", "https://user:pw@example.com/a.ics", "https://example.com:8443/a.ics",
    "https://127.0.0.1/a.ics", "https://[::1]/a.ics", "https://2130706433/a.ics", "", "nonsense"]
    .forEach((u) => assert.throws(() => api.parseTarget(u), (e) => e.status === 400, u + " should be rejected"));
}

console.log("calendar import tests passed");
