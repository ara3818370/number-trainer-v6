// number-utils.js — Shared language-dispatching wrappers for number-to-words
// Eliminates duplication between categories.js and confuser.js

import {
  cardinalToWords as enCardinal, ordinalToWords as enOrdinal, ordinalSuffix as enOrdinalSuffix,
  yearToWords as enYear, decadeToWords as enDecade, fractionToWords as enFraction,
  decimalToWords as enDecimal, currencyToWords as enCurrency,
  percentageToWords as enPercentage, roomBusToWords as enRoomBus,
  scoreToWords as enScore, temperatureToWords as enTemperature,
  largeNumberToWords as enLarge
} from './numbers-en.js';

import {
  cardinalToWords as deCardinal, ordinalToWords as deOrdinal, ordinalSuffix as deOrdinalSuffix,
  yearToWords as deYear, decadeToWords as deDecade, fractionToWords as deFraction,
  decimalToWords as deDecimal, currencyToWords as deCurrency,
  percentageToWords as dePercentage, roomBusToWords as deRoomBus,
  scoreToWords as deScore, temperatureToWords as deTemperature,
  largeNumberToWords as deLarge
} from './numbers-de.js';

import {
  cardinalToWords as ukCardinal, ordinalToWords as ukOrdinal, ordinalSuffix as ukOrdinalSuffix,
  yearToWords as ukYear, decadeToWords as ukDecade, fractionToWords as ukFraction,
  decimalToWords as ukDecimal, currencyToWords as ukCurrency,
  percentageToWords as ukPercentage, roomBusToWords as ukRoomBus,
  scoreToWords as ukScore, temperatureToWords as ukTemperature,
  largeNumberToWords as ukLarge
} from './numbers-uk.js';

import { getLearnLang } from './i18n.js';

// ── Language-aware helpers ─────────────────────────────────────────────────

/**
 * Get the current learning language.
 * @returns {'en'|'de'|'uk'}
 */
export function lang() {
  return getLearnLang();
}

/**
 * Helper to dispatch by language (en/de/uk).
 * Passes all arguments through to the language-specific function.
 */
export function dispatch(enFn, deFn, ukFn, ...args) {
  const l = lang();
  if (l === 'uk') return ukFn(...args);
  if (l === 'de') return deFn(...args);
  return enFn(...args);
}

// ── Language-dispatched number-to-words wrappers ───────────────────────────
// All wrappers use ...args to pass through extra parameters (gender, case, etc.)

export function cardinalToWords(n, ...args) { return dispatch(enCardinal, deCardinal, ukCardinal, n, ...args); }
export function ordinalToWords(n, ...args) { return dispatch(enOrdinal, deOrdinal, ukOrdinal, n, ...args); }
export function ordinalSuffix(n, ...args) { return dispatch(enOrdinalSuffix, deOrdinalSuffix, ukOrdinalSuffix, n, ...args); }
export function yearToWords(year, ...args) { return dispatch(enYear, deYear, ukYear, year, ...args); }
export function decadeToWords(decade, qualifier) { return dispatch(enDecade, deDecade, ukDecade, decade, qualifier); }
export function fractionToWords(whole, num, den) { return dispatch(enFraction, deFraction, ukFraction, whole, num, den); }
export function decimalToWords(n) { return dispatch(enDecimal, deDecimal, ukDecimal, n); }
export function currencyToWords(amount) { return dispatch(enCurrency, deCurrency, ukCurrency, amount); }
export function percentageToWords(n) { return dispatch(enPercentage, dePercentage, ukPercentage, n); }
export function roomBusToWords(type, number) { return dispatch(enRoomBus, deRoomBus, ukRoomBus, type, number); }
export function scoreToWords(home, away, sport) { return dispatch(enScore, deScore, ukScore, home, away, sport); }
export function temperatureToWords(temp) { return dispatch(enTemperature, deTemperature, ukTemperature, temp); }
export function largeNumberToWords(n) { return dispatch(enLarge, deLarge, ukLarge, n); }

// ── Random helpers ─────────────────────────────────────────────────────────

/**
 * Random integer in [min, max] inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 * @param {Array} arr
 * @returns {*}
 */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
