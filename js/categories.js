// categories.js — Category registry and metadata
// Phase 3: slim facade that re-exports from generators.js and sentences.js
// All existing imports from this module continue to work.

export { getGenerator } from './generators.js';
export { getSentence } from './sentences.js';

/**
 * List of all available category IDs (for UI).
 * @type {string[]}
 */
export const ALL_CATEGORIES = [
  'cardinals', 'ordinals', 'years', 'fractions', 'decimals',
  'currencies', 'percentages', 'roomBus', 'sports', 'temperatures',
  'large', 'mixed'
];

/**
 * Category groups for the menu UI.
 * @type {Array<{id: string, labelKey: string, categories: string[]}>}
 */
export const CATEGORY_GROUPS = [
  { id: 'basic', labelKey: 'group.basic', categories: ['cardinals', 'ordinals'] },
  { id: 'context', labelKey: 'group.context', categories: ['years', 'fractions', 'decimals', 'percentages', 'large', 'mixed'] },
  { id: 'realworld', labelKey: 'group.realworld', categories: ['currencies', 'roomBus', 'sports', 'temperatures'] },
];

/**
 * Category metadata (icon + i18n keys).
 * Label and desc are now fetched via i18n.
 * @type {Object<string, {icon: string, labelKey: string, descKey: string}>}
 */
export const CATEGORY_META = {
  cardinals:    { icon: '🔢', labelKey: 'cat.cardinals.label', descKey: 'cat.cardinals.desc' },
  ordinals:     { icon: '🏅', labelKey: 'cat.ordinals.label', descKey: 'cat.ordinals.desc' },
  years:        { icon: '📅', labelKey: 'cat.years.label', descKey: 'cat.years.desc' },
  fractions:    { icon: '🍕', labelKey: 'cat.fractions.label', descKey: 'cat.fractions.desc' },
  decimals:     { icon: '📐', labelKey: 'cat.decimals.label', descKey: 'cat.decimals.desc' },
  currencies:   { icon: '💵', labelKey: 'cat.currencies.label', descKey: 'cat.currencies.desc' },
  percentages:  { icon: '📊', labelKey: 'cat.percentages.label', descKey: 'cat.percentages.desc' },
  roomBus:      { icon: '🚌', labelKey: 'cat.roomBus.label', descKey: 'cat.roomBus.desc' },
  sports:       { icon: '⚽', labelKey: 'cat.sports.label', descKey: 'cat.sports.desc' },
  temperatures: { icon: '🌡️', labelKey: 'cat.temperatures.label', descKey: 'cat.temperatures.desc' },
  large:        { icon: '💰', labelKey: 'cat.large.label', descKey: 'cat.large.desc' },
  mixed:        { icon: '🎲', labelKey: 'cat.mixed.label', descKey: 'cat.mixed.desc' },
};
