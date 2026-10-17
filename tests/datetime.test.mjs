// The one date/time formatter (site/datetime.mjs): the formats the family
// chose, the same in every process time zone, across midnight and DST.
import test from "node:test";
import assert from "node:assert/strict";
import { date, dayMonth, time, at, timeRange, nextDayNote, capitalize, parts } from "../site/datetime.mjs";

const ceremony = "2027-01-15T16:00:00-06:00",
  dinnerEnd = "2027-01-15T19:30:00-06:00",
  receptionEnd = "2027-01-16T00:30:00-06:00",
  deadline = "2026-11-15T23:59:00-06:00";

test("long dates: English with commas, Spanish lowercase with 'de'", () => {
  assert.equal(date(ceremony, "en"), "Friday, January 15, 2027");
  assert.equal(date(ceremony, "es"), "viernes 15 de enero de 2027");
  assert.equal(capitalize(date(ceremony, "es")), "Viernes 15 de enero de 2027");
  assert.equal(date(deadline, "en", { year: false }), "Sunday, November 15");
  assert.equal(date(deadline, "es", { year: false }), "domingo 15 de noviembre");
  assert.equal(date(ceremony, "en", { weekday: false }), "January 15, 2027");
  assert.equal(date(ceremony, "es", { weekday: false }), "15 de enero de 2027");
  assert.equal(dayMonth("2026-10-16T12:00:00-05:00", "en"), "October 16");
  assert.equal(dayMonth("2026-10-16T12:00:00-05:00", "es"), "16 de octubre");
});

test("times: '4:00 PM' and '4:00 p. m.', with 'a la 1' in Spanish", () => {
  assert.equal(time(ceremony, "en"), "4:00 PM");
  assert.equal(time(ceremony, "es"), "4:00 p. m.");
  assert.equal(time(receptionEnd, "en"), "12:30 AM");
  assert.equal(time(receptionEnd, "es"), "12:30 a. m.");
  assert.equal(time("2027-01-15T12:00:00-06:00", "en"), "12:00 PM");
  assert.equal(at(ceremony, "en"), "at 4:00 PM");
  assert.equal(at(ceremony, "es"), "a las 4:00 p. m.");
  assert.equal(at("2027-01-15T13:00:00-06:00", "es"), "a la 1:00 p. m.");
  assert.equal(at(receptionEnd, "es"), "a las 12:30 a. m.");
});

test("ranges, including the reception that ends after midnight", () => {
  assert.equal(timeRange(ceremony, "2027-01-15T17:00:00-06:00", "en"), "4:00 PM – 5:00 PM");
  assert.equal(timeRange(dinnerEnd, receptionEnd, "en"), "7:30 PM – 12:30 AM (Jan 16)");
  assert.equal(timeRange(dinnerEnd, receptionEnd, "es"), "7:30 p. m. – 12:30 a. m. (16 de enero)");
  assert.equal(timeRange("2027-01-15T18:30:00-06:00", dinnerEnd, "en", { prose: true }), "from 6:30 PM to 7:30 PM");
  assert.equal(timeRange("2027-01-15T18:30:00-06:00", dinnerEnd, "es", { prose: true }), "de 6:30 p. m. a 7:30 p. m.");
  assert.equal(timeRange(ceremony, null, "es"), "4:00 p. m.");
});

test("on web pages, a time and its day note never split across lines", () => {
  const r = timeRange(dinnerEnd, receptionEnd, "en", { nbsp: true });
  assert.equal(r, "7:30 PM – 12:30 AM (Jan 16)");
  assert.equal(nextDayNote(receptionEnd, "es", { nbsp: true }), "(16 de enero)");
  assert.equal(time(ceremony, "es", { nbsp: true }), "4:00 p. m.");
  // Plain text keeps ordinary spaces (emails, calendar files, SMS).
  assert.doesNotMatch(timeRange(dinnerEnd, receptionEnd, "es"), /[  ]/);
});

test("Fort Worth time, whatever the process time zone, across the November DST change", () => {
  assert.deepEqual(parts("2026-11-01T01:30:00-05:00"), { year: 2026, month: 11, day: 1, weekday: 0, hour: 1, minute: 30 });
  assert.deepEqual(parts("2026-11-01T01:30:00-06:00"), { year: 2026, month: 11, day: 1, weekday: 0, hour: 1, minute: 30 });
  assert.equal(date("2027-01-16T05:00:00Z", "en"), "Friday, January 15, 2027");
});
