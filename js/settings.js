// settings.js — Bottom Sheet Settings Panel
// Number Trainer v6 "Jony Ive Edition"
//
// Same data model (getSetting, setSetting, onSettingChange).
// UI: iOS-style bottom sheet with drag-to-dismiss and segmented controls.

import { t } from './i18n.js';

const STORAGE_KEY = 'nlt-settings';

const DEFAULTS = {
  speed: 'normal',
  sessionLength: 10,
  mode: 'audio',
  theme: 'auto',
  uiLang: 'en',
  learnLang: 'en',
  sounds: true,
  haptics: true,
};

/** @type {Object} */
let settings = null;

/** @type {Set<function>} */
const listeners = new Set();

// ── Persistence ────────────────────────────────────────────────────────────

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Restore Infinity (JSON.stringify turns it to null)
      if (parsed && parsed.sessionLength === null) parsed.sessionLength = Infinity;
      if (parsed && parsed.sessionLength === 'infinity') parsed.sessionLength = Infinity;
      return parsed;
    }
  } catch { /* corrupt */ }
  return null;
}

function save() {
  try {
    // Serialize Infinity as string (JSON.stringify(Infinity) → null)
    const toSave = { ...settings };
    if (toSave.sessionLength === Infinity) toSave.sessionLength = 'infinity';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch { /* quota */ }
}

// ── Initialization ─────────────────────────────────────────────────────────

export function initSettings() {
  const saved = load();
  settings = { ...DEFAULTS, ...(saved || {}) };
  save();
}

// ── Getters / Setters ──────────────────────────────────────────────────────

export function getSetting(key) {
  if (!settings) initSettings();
  return key in settings ? settings[key] : DEFAULTS[key];
}

export function setSetting(key, value) {
  if (!settings) initSettings();
  const oldValue = settings[key];
  settings[key] = value;
  save();

  if (oldValue !== value) {
    for (const cb of listeners) {
      try { cb(key, value, oldValue); } catch (e) { console.error('Settings listener error:', e); }
    }
  }
}

export function onSettingChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ── Theme helpers ──────────────────────────────────────────────────────────

export function toggleTheme() {
  const current = getSetting('theme');
  const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
  setSetting('theme', next);
}

export function getThemeForSystem() {
  const theme = getSetting('theme');
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── Bottom Sheet UI ────────────────────────────────────────────────────────

let panelEl = null;
let scrimEl = null;
let isDragging = false;
let dragStartY = 0;
let dragCurrentY = 0;

export function initSettingsUI() {
  panelEl = document.getElementById('settings-panel');
  scrimEl = document.getElementById('settings-scrim');

  if (!panelEl || !scrimEl) return;

  // Close button
  const closeBtn = document.getElementById('settings-close');
  if (closeBtn) closeBtn.addEventListener('click', hideSettings);

  // Scrim tap
  scrimEl.addEventListener('click', hideSettings);

  // Drag to dismiss
  const handle = panelEl.querySelector('.settings-drag-handle');
  if (handle) {
    handle.addEventListener('touchstart', onDragStart, { passive: true });
    handle.addEventListener('touchmove', onDragMove, { passive: false });
    handle.addEventListener('touchend', onDragEnd, { passive: true });
  }

  // Render controls
  renderControls();
}

export function showSettings() {
  if (!panelEl || !scrimEl) return;
  renderControls(); // refresh state
  scrimEl.classList.add('active');
  panelEl.classList.add('open');
}

export function hideSettings() {
  if (!panelEl || !scrimEl) return;
  panelEl.style.transform = '';
  scrimEl.classList.remove('active');
  panelEl.classList.remove('open');
}

export function isSettingsVisible() {
  return panelEl && panelEl.classList.contains('open');
}

// ── Drag-to-dismiss ────────────────────────────────────────────────────────

function onDragStart(e) {
  isDragging = true;
  dragStartY = e.touches[0].clientY;
  dragCurrentY = dragStartY;
  panelEl.style.transition = 'none';
}

function onDragMove(e) {
  if (!isDragging) return;
  dragCurrentY = e.touches[0].clientY;
  const dy = Math.max(0, dragCurrentY - dragStartY);
  panelEl.style.transform = `translateX(-50%) translateY(${dy}px)`;
  e.preventDefault();
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  panelEl.style.transition = '';
  const dy = dragCurrentY - dragStartY;
  if (dy > 80) {
    hideSettings();
  } else {
    panelEl.style.transform = '';
    if (panelEl.classList.contains('open')) {
      panelEl.style.transform = 'translateX(-50%) translateY(0)';
      // Let CSS transition handle snap-back
      requestAnimationFrame(() => {
        panelEl.style.transform = '';
      });
    }
  }
}

// ── Render Controls ────────────────────────────────────────────────────────

function renderControls() {
  // Mode
  renderSegmented('mode-control', [
    { label: '🔊 ' + t('settings.audio'), value: 'audio' },
    { label: '📖 ' + t('settings.reading'), value: 'reading' },
  ], getSetting('mode'), (val) => setSetting('mode', val));

  // Learning Language
  renderSegmented('learn-lang-control', [
    { label: '🇬🇧 EN', value: 'en' },
    { label: '🇩🇪 DE', value: 'de' },
    { label: '🇺🇦 UK', value: 'uk' },
  ], getSetting('learnLang'), (val) => setSetting('learnLang', val));

  // Speed
  renderSegmented('speed-control', [
    { label: t('settings.slow'), value: 'slow' },
    { label: t('settings.normal'), value: 'normal' },
    { label: t('settings.fast'), value: 'fast' },
  ], getSetting('speed'), (val) => setSetting('speed', val));

  // Session Length
  renderSegmented('session-control', [
    { label: '10', value: 10 },
    { label: '20', value: 20 },
    { label: '50', value: 50 },
    { label: '∞', value: Infinity },
  ], getSetting('sessionLength'), (val) => setSetting('sessionLength', val));

  // UI Language
  renderSegmented('ui-lang-control', [
    { label: 'English', value: 'en' },
    { label: 'Deutsch', value: 'de' },
    { label: 'Українська', value: 'uk' },
  ], getSetting('uiLang'), (val) => setSetting('uiLang', val));

  // Theme
  renderSegmented('theme-control', [
    { label: 'Light', value: 'light' },
    { label: 'Auto', value: 'auto' },
    { label: 'Dark', value: 'dark' },
  ], getSetting('theme'), (val) => setSetting('theme', val));

  // Unlock all
  const unlockBtn = document.getElementById('unlock-all-btn');
  if (unlockBtn) {
    unlockBtn.textContent = t('settings.unlock_all');
    unlockBtn.onclick = () => {
      document.dispatchEvent(new CustomEvent('nlt-unlock-all'));
      hideSettings();
    };
  }
}

function renderSegmented(containerId, items, activeValue, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'segmented-control__item' + (item.value === activeValue ? ' active' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.segmented-control__item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(item.value);
    });
    container.appendChild(btn);
  }
}
