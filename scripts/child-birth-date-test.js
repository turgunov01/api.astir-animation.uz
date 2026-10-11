import assert from "node:assert/strict";
import { ageFromBirthDate, formatBirthDate, parseBirthDate } from "../app/lib/childAge.js";
import { childAge } from "../app/legacy/adminChildStats.js";

const now = new Date(2026, 9, 11); // 11 Oct 2026
const invalid = () => new Error("invalid");

// Age counts full years: the birthday has to have passed this year.
assert.equal(ageFromBirthDate("2020-10-11", now), 6);
assert.equal(ageFromBirthDate("2020-10-12", now), 5);
assert.equal(ageFromBirthDate(new Date(2019, 0, 31), now), 7);
assert.equal(ageFromBirthDate(null, now), null);

assert.equal(formatBirthDate(new Date(2021, 2, 5)), "2021-03-05");
assert.equal(formatBirthDate("2021-03-05T00:00:00.000Z"), "2021-03-05");

assert.equal(parseBirthDate(undefined, { now, onInvalid: invalid }), undefined);
assert.equal(parseBirthDate("", { now, onInvalid: invalid }), null);
assert.equal(parseBirthDate("2018-02-28", { now, onInvalid: invalid }), "2018-02-28");
assert.throws(() => parseBirthDate("2027-01-01", { now, onInvalid: invalid }), /invalid/);
assert.throws(() => parseBirthDate("2019-02-30", { now, onInvalid: invalid }), /invalid/);
assert.throws(() => parseBirthDate("1990-01-01", { now, onInvalid: invalid }), /invalid/);
assert.throws(() => parseBirthDate("soon", { now, onInvalid: invalid }), /invalid/);

// Stats prefer the birth date over the stored age (or legacy birth year).
assert.equal(childAge(0, now.getTime(), "2020-01-01"), 6);
assert.equal(childAge(2018, now.getTime()), 8);

console.log("child birth date tests passed");
