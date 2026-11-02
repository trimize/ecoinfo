import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFigures } from "../src/lib/numbers";

const SOURCE = `Tel: +33 6 79 11 49 71 — Page | 1
Succès de l’émission obligataire de 6,0 milliards d’euros, maturité moyenne de 8,2 ans, coupon moyen d’environ 4,3 %.
Montant Maturité Coupon Taux implicite
€750 millions Novembre 2028 Euribor 3m +0,45 % NA
€1 000 millions Novembre 2030 4,000 % 4,084 %
Revenue of $1,297 million, up 12.4% year-on-year.
Chiffre d'affaires (en M€) 2 345,6`;

const status = (brief: string) => Object.fromEntries(checkFigures(brief, SOURCE).map((f) => [f.raw, f.status]));

test("exact matches with units", () => {
  const s = status("6,0 milliards d'euros, 8,2 ans, 4,3 %");
  assert.deepEqual(s, { "6,0 Md": "verified", "8,2": "verified", "4,3 %": "verified" });
});

test("exact unit conversion and trailing zeros", () => {
  const s = status("1 milliard d'euros à 4 %, soit 0,75 milliard");
  assert.equal(s["1 Md"], "verified");
  assert.equal(s["4 %"], "verified");
  assert.equal(s["0,75 Md"], "verified");
});

test("rounding is reported separately", () => {
  const s = status("taux de 4,08 % et 1,3 milliard de dollars, hausse de 12 %");
  assert.equal(s["4,08 %"], "rounded");
  assert.equal(s["1,3 Md"], "rounded");
  assert.equal(s["12 %"], "rounded");
});

test("English notation in source", () => {
  assert.equal(status("hausse de 12,4 %")["12,4 %"], "verified");
});

test("unitless table cell needs the same precision", () => {
  assert.equal(status("2 345,6 millions d'euros")["2 345,6 M"], "verified");
});

test("invented figures and coincidences are not verified", () => {
  const s = status("7,5 milliards, 25 milliards, 3 %, 6 milliards, 79 millions");
  assert.equal(s["7,5 Md"], "not_found");
  assert.equal(s["25 Md"], "not_found");
  assert.equal(s["3 %"], "not_found"); // "3m" in Euribor 3m is not a percentage
  assert.equal(s["6 Md"], "verified");
  assert.equal(s["79 M"], "not_found"); // "79" only exists in the phone number // same value as "6,0 milliards" - not the "6" of the phone number
});
