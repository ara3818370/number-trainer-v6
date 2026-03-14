// generators.js — All category generator functions
// Extracted from categories.js (Phase 3 refactoring)
// Each generator returns { value, display, ttsText, lastDigit, category }

import {
  lang, cardinalToWords, ordinalToWords, ordinalSuffix,
  yearToWords, decadeToWords, fractionToWords, decimalToWords,
  currencyToWords, percentageToWords, roomBusToWords,
  scoreToWords, temperatureToWords, largeNumberToWords,
  randInt, pick,
} from './number-utils.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Greatest common divisor.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Format decade display based on learning language.
 * @param {number} decade
 * @param {string} qualifier
 * @returns {string}
 */
function formatDecadeDisplay(decade, qualifier) {
  if (lang() === 'uk') {
    // FIX 4: Use full prepositional phrases for Ukrainian decades
    const qualMap = { early: 'на початку', mid: 'у середині', late: 'наприкінці' };
    const decNames = {
      50: "п'ятдесятих", 60: 'шістдесятих', 70: 'сімдесятих',
      80: 'вісімдесятих', 90: "дев'яностих"
    };
    return (qualMap[qualifier] || qualifier) + ' ' + (decNames[decade] || decade + '-х');
  }
  if (lang() === 'de') {
    const qualMap = { early: 'frühen', mid: 'mittleren', late: 'späten' };
    const decNames = { 50: 'Fünfziger', 60: 'Sechziger', 70: 'Siebziger', 80: 'Achtziger', 90: 'Neunziger' };
    if (qualifier === 'mid') {
      return 'Mitte der ' + decNames[decade];
    }
    return 'in den ' + qualMap[qualifier] + ' ' + decNames[decade] + 'n';
  }
  return 'the ' + qualifier + ' ' + decade + 's';
}

// ── Category: Cardinals ────────────────────────────────────────────────────

/**
 * Generate a cardinal number value (1-100).
 * @returns {import('./types').CategoryValue}
 */
function generateCardinal() {
  const n = randInt(1, 100);

  // German needs standalone ("eins") vs before-noun ("ein") forms for n=1
  let cases = null;
  if (lang() === 'de') {
    cases = {
      nom: cardinalToWords(n, true),    // standalone: "eins" for 1
      attr: cardinalToWords(n, false),  // before noun: "ein" for 1
    };
  }

  return {
    value: n,
    display: String(n),
    ttsText: cardinalToWords(n),
    lastDigit: n % 10,
    category: 'cardinals',
    cases,
  };
}

// ── Category: Ordinals ─────────────────────────────────────────────────────

/**
 * Generate an ordinal value (1st-100th).
 * Display format depends on learning language: "1st" (en) vs "1." (de)
 * @returns {import('./types').CategoryValue}
 */
function generateOrdinal() {
  const n = randInt(1, 100);

  // Gender/case forms for Ukrainian ordinals
  let cases = null;
  if (lang() === 'uk') {
    cases = {
      nom: ordinalToWords(n),           // masculine nominative (default)
      f: ordinalToWords(n, 'f'),        // feminine nominative
      n: ordinalToWords(n, 'n'),        // neuter nominative
      loc: ordinalToWords(n, 'loc'),    // locative masculine (на першому)
      instr: ordinalToWords(n, 'instr'), // instrumental masculine (першим)
      finstr: ordinalToWords(n, 'finstr'), // instrumental feminine (першою)
      facc: ordinalToWords(n, 'facc'),  // accusative feminine (першу)
    };
  } else if (lang() === 'de') {
    cases = {
      nom: ordinalToWords(n),           // weak nominative: "erste" (after der/die/das)
      obl: ordinalToWords(n, 'obl'),    // weak oblique: "ersten" (after im/den/dem/unseren)
      sm: ordinalToWords(n, 'sm'),      // mixed nom. masculine: "erster" (after mein/sein/ihr)
      pm: ordinalToWords(n, 'pm'),      // predicative masculine: "Erster" (Er wurde Erster)
      pf: ordinalToWords(n, 'pf'),      // predicative feminine: "Erste" (Sie wurde Erste)
    };
  }

  return {
    value: n,
    display: n + ordinalSuffix(n),
    ttsText: ordinalToWords(n),
    lastDigit: n % 10,
    category: 'ordinals',
    cases,
  };
}

// ── Category: Years ────────────────────────────────────────────────────────

/**
 * Generate a standard year value (1200-2026).
 * @param {number} min
 * @param {number} max
 * @returns {import('./types').CategoryValue}
 */
function generateStandardYear(min, max) {
  const year = randInt(min, max);

  // FIX 2: Ukrainian years need ordinal case forms
  let cases = null;
  if (lang() === 'uk') {
    cases = {
      nom: yearToWords(year),
      loc: yearToWords(year, 'loc'),
      gen: yearToWords(year, 'gen'),
    };
  }

  return {
    value: year,
    display: String(year),
    ttsText: yearToWords(year),
    lastDigit: year % 10,
    category: 'years',
    cases,
  };
}

/**
 * Generate a decade value (the early 90s, etc.).
 * Display depends on learning language.
 * @returns {import('./types').CategoryValue}
 */
function generateDecadeValue() {
  const decade = pick([50, 60, 70, 80, 90]);
  const qualifier = pick(['early', 'mid', 'late']);

  return {
    value: { decade, qualifier, isDecade: true },
    display: formatDecadeDisplay(decade, qualifier),
    ttsText: decadeToWords(decade, qualifier),
    lastDigit: Math.floor(decade / 10),
    category: 'years',
  };
}

/**
 * Generate a year or decade value with weighted distribution.
 * @returns {import('./types').CategoryValue}
 */
function generateYear() {
  const r = Math.random();
  if (r < 0.10) return generateDecadeValue();
  if (r < 0.73) return generateStandardYear(1900, 2026);
  if (r < 0.91) return generateStandardYear(1800, 1899);
  return generateStandardYear(1200, 1799);
}

// ── Category: Fractions ────────────────────────────────────────────────────

/**
 * Generate a fraction value.
 * @returns {import('./types').CategoryValue}
 */
function generateFraction() {
  const r = Math.random();
  let whole, num, den;

  if (r < 0.35) {
    do {
      den = randInt(2, 10);
      num = randInt(1, den - 1);
    } while (gcd(num, den) !== 1);
    whole = 0;
  } else if (r < 0.70) {
    den = randInt(2, 10);
    num = randInt(1, den - 1);
    whole = 0;
  } else {
    whole = randInt(1, 9);
    den = pick([2, 3, 4, 5, 6, 8, 10]);
    num = randInt(1, den - 1);
  }

  const displayFrac = num + '/' + den;
  const display = whole > 0 ? whole + ' ' + displayFrac : displayFrac;

  return {
    value: { whole, num, den },
    display,
    ttsText: fractionToWords(whole, num, den),
    lastDigit: den % 10,
    category: 'fractions',
  };
}

// ── Category: Decimals ─────────────────────────────────────────────────────

/**
 * Generate a decimal value (0.01-99.99).
 * Display uses comma for German, period for English.
 * @returns {import('./types').CategoryValue}
 */
function generateDecimal() {
  const raw = randInt(1, 9999);
  const n = raw / 100;
  const enDisplay = n.toFixed(2);

  // German and Ukrainian use comma as decimal separator
  const display = (lang() === 'de' || lang() === 'uk') ? enDisplay.replace('.', ',') : enDisplay;

  const fracStr = enDisplay.split('.')[1];
  const lastDecDigit = parseInt(fracStr[fracStr.length - 1], 10);

  return {
    value: n,
    display,
    ttsText: decimalToWords(n),
    lastDigit: lastDecDigit,
    category: 'decimals',
  };
}

// ── Category: Currencies ───────────────────────────────────────────────────

/**
 * Generate a currency value.
 * English: $0.01-$999.99, German: €0,01-€999,99
 * @returns {import('./types').CategoryValue}
 */
function generateCurrency() {
  const totalCents = randInt(1, 99999);
  const dollars = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const amount = dollars + cents / 100;

  let display;
  if (lang() === 'uk') {
    display = '₴' + amount.toFixed(2).replace('.', ',');
  } else if (lang() === 'de') {
    display = '€' + amount.toFixed(2).replace('.', ',');
  } else {
    display = '$' + amount.toFixed(2);
  }

  return {
    value: amount,
    display,
    ttsText: currencyToWords(amount),
    lastDigit: cents % 10,
    category: 'currencies',
  };
}

// ── Category: Percentages ──────────────────────────────────────────────────

/**
 * Generate a percentage value (0.01%-100%).
 * @returns {import('./types').CategoryValue}
 */
function generatePercentage() {
  let n;
  if (Math.random() < 0.5) {
    n = randInt(1, 100);
  } else {
    n = randInt(1, 9999) / 100;
  }

  const isWhole = Number.isInteger(n);
  let display;
  if (isWhole) {
    display = n + '%';
  } else {
    const formatted = n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    display = (lang() === 'de' || lang() === 'uk') ? formatted.replace('.', ',') + '%' : formatted + '%';
  }

  let lastDig;
  if (isWhole) {
    lastDig = n % 10;
  } else {
    const str = n.toFixed(2).replace(/0+$/, '');
    lastDig = parseInt(str[str.length - 1], 10);
  }

  return {
    value: n,
    display,
    ttsText: percentageToWords(n),
    lastDigit: lastDig,
    category: 'percentages',
  };
}

// ── Category: Room/Bus ─────────────────────────────────────────────────────

/**
 * Generate a room/bus number value.
 * Display: "Room"/"Bus" (en) vs "Raum"/"Bus" (de)
 * @returns {import('./types').CategoryValue}
 */
function generateRoomBus() {
  const type = pick(['room', 'bus']);
  const hundreds = randInt(1, 9);
  let number;

  if (Math.random() < 0.7) {
    number = hundreds * 100 + randInt(1, 9);
  } else {
    number = hundreds * 100 + randInt(1, 9) * 10;
  }

  let label;
  if (lang() === 'uk') {
    label = type === 'room' ? 'Кімната' : 'Автобус';
  } else if (lang() === 'de') {
    label = type === 'room' ? 'Raum' : 'Bus';
  } else {
    label = type === 'room' ? 'Room' : 'Bus';
  }

  // Case forms for Ukrainian — FIX 7: use word forms instead of raw digits
  let cases = null;
  if (lang() === 'uk') {
    const numWords = cardinalToWords(number);
    const ukForms = type === 'room'
      ? { nom: 'кімната', gen: 'кімнати', acc: 'кімнату', loc: 'кімнаті' }
      : { nom: 'автобус', gen: 'автобуса', acc: 'автобус', loc: 'автобусі' };
    cases = {
      nom: ukForms.nom + ' ' + numWords,
      gen: ukForms.gen + ' ' + numWords,
      acc: ukForms.acc + ' ' + numWords,
      loc: ukForms.loc + ' ' + numWords,
    };
  } else if (lang() === 'de') {
    cases = {
      nom: (type === 'room' ? 'Raum ' : 'Bus ') + number,
      gen: (type === 'room' ? 'des Raums ' : 'des Busses ') + number,
      acc: (type === 'room' ? 'den Raum ' : 'den Bus ') + number,
      loc: (type === 'room' ? 'Raum ' : 'Bus ') + number,
    };
  }

  return {
    value: { type, number },
    display: label + ' ' + number,
    ttsText: roomBusToWords(type, number),
    lastDigit: number % 10,
    category: 'roomBus',
    cases,
  };
}

// ── Category: Sports Scores ────────────────────────────────────────────────

/**
 * Generate a sports score value.
 * @returns {import('./types').CategoryValue}
 */
function generateSportsScore() {
  const TENNIS_SCORES = [0, 15, 30, 40];
  const isTennis = Math.random() < 0.3; // 30% tennis, 70% football

  if (isTennis) {
    const home = pick(TENNIS_SCORES);
    const away = pick(TENNIS_SCORES);
    const display = home + ':' + away;
    return {
      value: { home, away, sport: 'tennis' },
      display,
      ttsText: scoreToWords(home, away, 'tennis'),
      lastDigit: away % 10,
      category: 'sports',
    };
  }

  // Football — bias toward "interesting" scores (nil, all)
  let home, away;
  const r = Math.random();
  if (r < 0.25) {
    // Score with nil (0) — 25%
    home = randInt(1, 7);
    away = 0;
    if (Math.random() < 0.5) { const t = home; home = away; away = t; }
  } else if (r < 0.40) {
    // Draw (X all) — 15%
    home = randInt(0, 5);
    away = home;
  } else {
    // Regular score — 60%
    home = randInt(0, 7);
    away = randInt(0, 5);
  }

  return {
    value: { home, away, sport: 'football' },
    display: home + ':' + away,
    ttsText: scoreToWords(home, away, 'football'),
    lastDigit: away,
    category: 'sports',
  };
}

// ── Category: Temperatures ─────────────────────────────────────────────────

/**
 * Generate a temperature value (-30 to +45 °C).
 * @returns {import('./types').CategoryValue}
 */
function generateTemperature() {
  const temp = randInt(-30, 45);

  return {
    value: temp,
    display: temp + '°C',
    ttsText: temperatureToWords(temp),
    lastDigit: Math.abs(temp) % 10,
    category: 'temperatures',
  };
}

// ── Category: Large Numbers ────────────────────────────────────────────────

/**
 * Generate a large number value (100-999,999).
 * German uses period as thousands separator.
 * @returns {import('./types').CategoryValue}
 */
function generateLarge() {
  const n = randInt(100, 999999);

  let display;
  if (lang() === 'uk') {
    display = n.toLocaleString('uk-UA').replace(/,/g, '\u2009');
  } else if (lang() === 'de') {
    display = n.toLocaleString('de-DE');
  } else {
    display = n.toLocaleString('en-US').replace(/,/g, '\u2009');
  }

  return {
    value: n,
    display,
    ttsText: largeNumberToWords(n),
    lastDigit: n % 10,
    category: 'large',
  };
}

// ── Mixed Mode ─────────────────────────────────────────────────────────────

/** @type {Object<string, number>} Weights summing to 100 */
const MIXED_WEIGHTS = {
  cardinals: 10, ordinals: 10, years: 10, fractions: 10,
  decimals: 9, currencies: 10, percentages: 9, roomBus: 8,
  sports: 8, temperatures: 8, large: 8,
};

/**
 * Select a category based on weighted random.
 * @returns {string}
 */
function weightedRandomCategory() {
  const r = Math.random() * 100;
  let cumulative = 0;
  for (const [cat, weight] of Object.entries(MIXED_WEIGHTS)) {
    cumulative += weight;
    if (r < cumulative) return cat;
  }
  return 'cardinals';
}

/**
 * Generate a mixed-mode value (randomly from any category).
 * @returns {import('./types').CategoryValue}
 */
function generateMixed() {
  const cat = weightedRandomCategory();
  const gen = GENERATORS[cat];
  const result = gen.generate();
  result.mixedCategory = cat;
  result.category = 'mixed';
  return result;
}

// ── Generator registry ─────────────────────────────────────────────────────

/**
 * @type {Object<string, {generate: function, id: string}>}
 */
export const GENERATORS = {
  cardinals: { id: 'cardinals', generate: generateCardinal },
  ordinals: { id: 'ordinals', generate: generateOrdinal },
  years: { id: 'years', generate: generateYear },
  fractions: { id: 'fractions', generate: generateFraction },
  decimals: { id: 'decimals', generate: generateDecimal },
  currencies: { id: 'currencies', generate: generateCurrency },
  percentages: { id: 'percentages', generate: generatePercentage },
  roomBus: { id: 'roomBus', generate: generateRoomBus },
  sports: { id: 'sports', generate: generateSportsScore },
  temperatures: { id: 'temperatures', generate: generateTemperature },
  large: { id: 'large', generate: generateLarge },
  mixed: { id: 'mixed', generate: generateMixed },
};

/**
 * Get a category generator by mode ID.
 * @param {string} mode
 * @returns {{generate: function, id: string}}
 */
export function getGenerator(mode) {
  return GENERATORS[mode] || GENERATORS.cardinals;
}
