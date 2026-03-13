// app.js — Orchestrator for Number Trainer v6 "Jony Ive Edition"
// Adapted from v5: same architecture, updated for bottom sheet settings,
// play button (not breathing circle), reading card (not focus card),
// and Jony Ive's cool blue design language.

import { initSettings, getSetting, setSetting, onSettingChange, showSettings, hideSettings, initSettingsUI, getThemeForSystem } from './settings.js';
import { initI18n, t, applyTranslations, setUILang, setLearnLang, getLearnLang, getUILang, getCategoryLabel, getCategoryDesc } from './i18n.js';
import { initProgress, getUnlockedCategories, getMasteredCategories, isCategoryUnlocked, recordSession, getNextUnlock, getPrerequisiteCategory, unlockAll, isOnboardingDone, UNLOCK_ORDER } from './progress.js';
import { shouldShowOnboarding, runOnboarding, handleOnboardingAnswer } from './onboarding.js';
import { CATEGORY_META } from './categories.js';
import * as game from './game.js';
import * as tts from './tts.js';
const { speakReinforcement } = tts;
import * as sound from './sound.js';
import * as haptics from './haptics.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CONTEMPLATION_PAUSE_MS = 600;
const OPTION_STAGGER_MS = 100;
const CORRECT_HOLD_MS = 1200;
const WRONG_HOLD_MS = 1800;
const TTS_REINFORCE_DELAY_MS = 200;

// ── SVG Icons (Jony Ive spec) ──────────────────────────────────────────────

const ICONS = {
  cardinals: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>`,
  ordinals: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="14" width="5" height="7" rx="1"/><rect x="9.5" y="6" width="5" height="15" rx="1"/><rect x="16" y="10" width="5" height="11" rx="1"/></svg>`,
  years: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/></svg>`,
  fractions: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="7" y1="17" x2="17" y2="7"/></svg>`,
  decimals: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="16" y2="12"/><circle cx="19" cy="17" r="1.5" fill="currentColor" stroke="none"/><line x1="16" y1="8" x2="20" y2="8"/><line x1="16" y1="16" x2="20" y2="16"/></svg>`,
  currencies: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  percentages: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="16" r="2.5"/></svg>`,
  roomBus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="11" height="16" rx="2"/><path d="M17 12h4"/><polyline points="19 9 22 12 19 15"/><circle cx="12" cy="13" r="1" fill="currentColor" stroke="none"/></svg>`,
  sports: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="7" height="12" rx="1.5"/><rect x="14" y="6" width="7" height="12" rx="1.5"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/></svg>`,
  temperatures: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
  large: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/></svg>`,
  mixed: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
};

// ── State ──────────────────────────────────────────────────────────────────

let currentCategory = null;
let sessionLength = 10;
let isProcessingAnswer = false;
let onboardingFlow = null;

// ── Boot Sequence ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 0. Check first launch BEFORE initSettings writes defaults
  const isFirstLaunch = !localStorage.getItem('nlt-settings');

  // 1. Init settings
  initSettings();

  // 2. Init i18n
  const uiLang = getSetting('uiLang');
  initI18n();
  if (uiLang && uiLang !== getUILang()) setUILang(uiLang);

  // 3. Init progress
  initProgress();

  // 4. Apply theme
  applyTheme(getThemeForSystem());

  // 5. System theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSetting('theme') === 'auto') applyTheme(getThemeForSystem());
  });

  // 6. Init TTS
  await tts.init();

  // 7. Init settings UI (bottom sheet)
  initSettingsUI();

  // 8. Wire settings changes
  onSettingChange((key, value) => {
    switch (key) {
      case 'theme':
        applyTheme(getThemeForSystem());
        break;
      case 'uiLang':
        setUILang(value);
        applyTranslations();
        renderCategoryMenu();
        break;
      case 'learnLang':
        setLearnLang(value);
        break;
      case 'sessionLength':
        sessionLength = value;
        break;
    }
  });

  // Load session length
  sessionLength = getSetting('sessionLength');

  // 9. Wire global events
  wireEvents();

  // 10. Register service worker
  registerSW();

  // 11. Decide first screen (no onboarding — straight to menu after lang select)
  if (isFirstLaunch) {
    showScreen('lang-select');
  } else {
    showScreen('menu');
    renderCategoryMenu();
  }
});

// ── Screen Management ──────────────────────────────────────────────────────

const SCREENS = ['lang-select', 'menu', 'training', 'summary', 'onboarding'];

function showScreen(screenId) {
  for (const id of SCREENS) {
    const el = document.getElementById('screen-' + id);
    if (!el) continue;
    if (id === screenId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
  if (screenId === 'menu') renderCategoryMenu();
}

// ── Theme ──────────────────────────────────────────────────────────────────

function applyTheme(resolvedTheme) {
  document.documentElement.removeAttribute('data-theme');
  if (resolvedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else if (resolvedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  // True black for dark in Jony Ive Edition
  const color = resolvedTheme === 'dark' ? '#000000' : '#f5f5f7';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
}

// ── Language Selection ─────────────────────────────────────────────────────

function wireLangSelect() {
  const container = document.getElementById('screen-lang-select');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    const lang = btn.dataset.lang;
    setSetting('uiLang', lang);
    setSetting('learnLang', lang);
    setUILang(lang);
    setLearnLang(lang);
    applyTranslations();

    showScreen('menu');
  });
}

// ── Onboarding ─────────────────────────────────────────────────────────────

function startOnboarding() {
  const circleEl = document.getElementById('onboarding-circle');
  const optionsEl = document.getElementById('onboarding-options');
  const messageEl = document.getElementById('onboarding-message');

  if (!circleEl || !optionsEl || !messageEl) return;

  optionsEl.innerHTML = '';
  messageEl.textContent = '';
  messageEl.classList.add('hidden');

  onboardingFlow = runOnboarding({
    async onPlay(text) {
      circleEl.classList.add('playing');
      const mode = getSetting('mode');
      if (mode === 'reading') {
        // In reading mode, show the text on the button
        circleEl.innerHTML = `<span style="font-size:1.5rem;font-weight:700;color:#fff;">${text}</span>`;
        await delay(1500);
      } else {
        await tts.speak(text, getSetting('speed')).catch(() => {
          circleEl.innerHTML = `<span style="font-size:1.5rem;font-weight:700;color:#fff;">${text}</span>`;
        });
      }
      circleEl.classList.remove('playing');
    },

    onShowOptions(options, correctIndex) {
      optionsEl.innerHTML = '';
      options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn onboarding-option';
        btn.textContent = opt.display;
        btn.style.opacity = '1';
        btn.style.transform = 'none';

        btn.addEventListener('click', () => {
          if (isProcessingAnswer) return;
          isProcessingAnswer = true;
          const isCorrect = i === correctIndex;

          handleOnboardingAnswer(isCorrect, {
            async onResult(correct) {
              if (correct) {
                btn.classList.add('correct');
                const other = optionsEl.children[1 - i];
                if (other) other.classList.add('dimmed');
                if (getSetting('sounds')) sound.playCorrect();
                if (getSetting('haptics')) haptics.hapticCorrect();
                messageEl.textContent = t('onboarding.perfect');
              } else {
                btn.classList.add('wrong');
                const correctBtn = optionsEl.children[correctIndex];
                if (correctBtn) correctBtn.classList.add('reveal-correct');
                if (getSetting('sounds')) sound.playWrong();
                if (getSetting('haptics')) haptics.hapticWrong();

                const q = onboardingFlow.question;
                if (getSetting('mode') !== 'reading') {
                  await delay(300);
                  await tts.speak(q.ttsText, getSetting('speed')).catch(() => {});
                }
                messageEl.textContent = t('onboarding.now_you_know');
              }
              messageEl.classList.remove('hidden');
            },

            onComplete() {
              isProcessingAnswer = false;
              showScreen('menu');
              renderCategoryMenu();
            },
          });
        });

        optionsEl.appendChild(btn);
      });
    },

    onResult() {},
    onComplete() {},
  });

  onboardingFlow.start();
}

// ── Category Menu ──────────────────────────────────────────────────────────

function renderCategoryMenu() {
  const container = document.getElementById('category-grid');
  if (!container) return;

  const unlocked = getUnlockedCategories();
  const mastered = getMasteredCategories();
  const allCategories = UNLOCK_ORDER;
  const totalVisible = allCategories.length;

  container.setAttribute('data-count', String(totalVisible));
  container.innerHTML = '';

  for (const catId of allCategories) {
    const meta = CATEGORY_META[catId];
    if (!meta) continue;

    const isUnlocked = unlocked.includes(catId);
    const isMastered = mastered.includes(catId);
    const isMixed = catId === 'mixed';

    const card = document.createElement('button');
    card.className = 'category-card' + (isUnlocked ? '' : ' locked') + (isMixed ? ' category-card--mixed' : '');
    card.dataset.category = catId;

    // Icon (SVG from ICONS map)
    const iconEl = document.createElement('span');
    iconEl.className = 'category-card-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = ICONS[catId] || '';
    card.appendChild(iconEl);

    // Label + desc wrapper (for mixed: inline)
    const textWrap = document.createElement('span');

    const label = document.createElement('span');
    label.className = 'category-card-label';
    label.textContent = getCategoryLabel(catId);
    textWrap.appendChild(label);

    if (!isMixed) {
      const desc = document.createElement('span');
      desc.className = 'category-card-desc';
      desc.textContent = getCategoryDesc(catId);
      desc.style.display = 'block';
      textWrap.appendChild(desc);
    }

    card.appendChild(textWrap);

    // Mastery checkmark
    if (isMastered) {
      const check = document.createElement('span');
      check.className = 'category-checkmark';
      check.textContent = '✓';
      check.setAttribute('aria-label', 'Mastered');
      card.appendChild(check);
    }

    // Lock icon
    if (!isUnlocked) {
      const lock = document.createElement('span');
      lock.className = 'category-lock';
      lock.textContent = '🔒';
      card.appendChild(lock);
    }

    card.addEventListener('click', () => {
      if (isUnlocked) {
        startTraining(catId);
      } else {
        const prereq = getPrerequisiteCategory(catId);
        const prereqName = prereq ? getCategoryLabel(prereq) : '...';
        showToast(t('categories.unlock_hint').replace('{category}', prereqName));
      }
    });

    container.appendChild(card);
  }
}

// ── Training Loop ──────────────────────────────────────────────────────────

function startTraining(categoryId) {
  currentCategory = categoryId;
  sessionLength = getSetting('sessionLength');
  isProcessingAnswer = false;

  game.startSession(categoryId);
  sound.ensureContext();

  showScreen('training');

  // Update header
  const catLabel = document.getElementById('training-category');
  if (catLabel) catLabel.textContent = getCategoryLabel(categoryId);

  updateProgressBar(0);
  updateStreakDisplay(0);
  updateScoreDisplay(0, 0);
  document.body.style.filter = '';

  playNextRound();
}

function playNextRound() {
  if (game.isSessionComplete(sessionLength)) {
    showSummary();
    return;
  }

  isProcessingAnswer = false;

  const round = game.generateQuestion();
  if (!round) {
    console.error('game.generateQuestion() returned null');
    showScreen('menu');
    return;
  }

  // Clear options
  const optionsGrid = document.getElementById('options-grid');
  if (optionsGrid) optionsGrid.innerHTML = '';

  // Update streak + progress + score
  const streak = game.getStreak();
  updateStreakDisplay(streak.current);
  const score = game.getScore();
  updateProgressBar(score.total);
  updateScoreDisplay(score.total, score.correct);

  const mode = getSetting('mode');

  if (mode === 'reading') {
    showReadingCard(round.target.ttsText);
    hidePlayButton();
    setTimeout(() => renderOptions(round.options, round.target), CONTEMPLATION_PAUSE_MS);
  } else {
    hideReadingCard();
    showPlayButton();
    playAudioRound(round);
  }
}

async function playAudioRound(round) {
  const playBtn = document.getElementById('play-button');
  if (playBtn) {
    playBtn.classList.remove('pulse');
    void playBtn.offsetWidth;
    playBtn.classList.add('pulse');
  }

  if (playBtn) playBtn.classList.add('playing');

  try {
    const sentence = game.getCurrentSentence();
    if (sentence) {
      await tts.speak(sentence, getSetting('speed'));
    }
  } catch {
    showReadingCard(round.target.ttsText);
    hidePlayButton();
  }

  if (playBtn) playBtn.classList.remove('playing');

  await delay(CONTEMPLATION_PAUSE_MS);
  renderOptions(round.options, round.target);
}

function renderOptions(options, target) {
  const grid = document.getElementById('options-grid');
  if (!grid) return;
  grid.innerHTML = '';

  options.forEach((displayText, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = displayText;

    // Long text handling
    if (displayText.length > 8) btn.classList.add('long-text');

    // Start invisible for stagger
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(8px)';

    btn.addEventListener('click', () => handleAnswer(displayText, i, options, target));
    grid.appendChild(btn);

    // Stagger reveal
    setTimeout(() => {
      btn.style.transition = 'opacity 200ms ease-out, transform 200ms ease-out';
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0)';
    }, i * OPTION_STAGGER_MS);
  });
}

async function handleAnswer(selectedDisplay, buttonIndex, options, target) {
  if (isProcessingAnswer) return;
  isProcessingAnswer = true;

  const result = game.recordAnswer(selectedDisplay);
  if (!result) { isProcessingAnswer = false; return; }

  const grid = document.getElementById('options-grid');
  const buttons = grid ? Array.from(grid.children) : [];
  const soundsOn = getSetting('sounds');
  const hapticsOn = getSetting('haptics');

  // Update score display
  updateScoreDisplay(result.total, result.score);

  if (result.isCorrect) {
    if (buttons[buttonIndex]) buttons[buttonIndex].classList.add('correct');
    buttons.forEach((btn, i) => { if (i !== buttonIndex) btn.classList.add('dimmed'); });

    if (soundsOn) sound.playCorrect();
    if (hapticsOn) haptics.hapticCorrect();

    handleStreakEffects(result.streak);

    if (getSetting('mode') !== 'reading') {
      // Wait, then speak reinforcement AND wait for it to FULLY finish
      await delay(TTS_REINFORCE_DELAY_MS);
      try {
        await speakReinforcement(target.ttsText);
      } catch { /* TTS failed, continue */ }
      // Pause after reinforcement completes before next round
      await delay(500);
    } else {
      await delay(CORRECT_HOLD_MS);
    }

    playNextRound();

  } else {
    if (buttons[buttonIndex]) buttons[buttonIndex].classList.add('wrong');
    buttons.forEach((btn, i) => {
      if (i !== buttonIndex && i !== result.correctIndex) btn.classList.add('dimmed');
    });

    if (soundsOn) sound.playWrong();
    if (hapticsOn) haptics.hapticWrong();

    await delay(300);
    if (buttons[result.correctIndex]) buttons[result.correctIndex].classList.add('reveal-correct');

    if (getSetting('mode') !== 'reading') {
      // Speak correct answer and wait for it to FULLY finish
      try {
        await speakReinforcement(target.ttsText);
      } catch { /* TTS failed */ }
      await delay(600);
    } else {
      await delay(WRONG_HOLD_MS - 300);
    }

    document.body.style.filter = '';
    updateStreakDisplay(0);
    playNextRound();
  }
}

// ── Streak Effects ─────────────────────────────────────────────────────────

function handleStreakEffects(streak) {
  const playBtn = document.getElementById('play-button');
  const soundsOn = getSetting('sounds');
  const hapticsOn = getSetting('haptics');

  if (playBtn) {
    if (streak >= 10) playBtn.style.filter = 'brightness(1.25)';
    else if (streak >= 5) playBtn.style.filter = 'brightness(1.15)';
    else if (streak >= 3) playBtn.style.filter = 'brightness(1.08)';
    else playBtn.style.filter = '';
  }

  if (streak === 5 || (streak >= 10 && streak % 5 === 0)) {
    if (playBtn) {
      playBtn.classList.remove('bloom');
      void playBtn.offsetWidth;
      playBtn.classList.add('bloom');
      setTimeout(() => playBtn.classList.remove('bloom'), 400);
    }
    if (soundsOn) sound.playStreak();
    if (hapticsOn) haptics.hapticStreak();
  }

  if (streak >= 10) {
    const extraFives = Math.floor((streak - 10) / 5);
    const deg = Math.min(5 + extraFives, 15);
    document.body.style.transition = 'filter 2s ease';
    document.body.style.filter = `hue-rotate(${deg}deg)`;
  }

  updateStreakDisplay(streak);
}

function updateStreakDisplay(streak) {
  const counter = document.getElementById('streak-counter');
  if (!counter) return;

  if (streak >= 3) {
    counter.textContent = t('streak.counter').replace('{n}', String(streak));
    counter.classList.add('visible');
  } else {
    counter.classList.remove('visible');
  }
}

// ── Score Display ──────────────────────────────────────────────────────────

function updateScoreDisplay(total, correct) {
  const fractionEl = document.getElementById('score-fraction');
  const percentEl = document.getElementById('score-percent');
  if (fractionEl) fractionEl.textContent = `${correct}/${total}`;
  if (percentEl) {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    percentEl.textContent = `${pct}%`;
  }
}

// ── Progress Bar ───────────────────────────────────────────────────────────

function updateProgressBar(currentTotal) {
  const fill = document.getElementById('progress-fill');
  const bar = document.getElementById('progress-bar');
  if (!fill || !bar) return;

  if (sessionLength === Infinity || sessionLength <= 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = '';
    const pct = Math.min((currentTotal / sessionLength) * 100, 100);
    fill.style.width = pct + '%';
  }
}

// ── Reading / Play Button ──────────────────────────────────────────────────

function showReadingCard(text) {
  const card = document.getElementById('reading-card');
  const numberEl = document.getElementById('reading-card-number');
  if (card && numberEl) {
    numberEl.textContent = text;
    card.classList.remove('hidden');
  }
}

function hideReadingCard() {
  const card = document.getElementById('reading-card');
  if (card) card.classList.add('hidden');
}

function showPlayButton() {
  const btn = document.getElementById('play-button');
  if (btn) btn.classList.remove('hidden');
}

function hidePlayButton() {
  const btn = document.getElementById('play-button');
  if (btn) btn.classList.add('hidden');
}

// ── Summary Screen ─────────────────────────────────────────────────────────

function showSummary() {
  showScreen('summary');

  const stats = game.getSessionStats();
  const pct = stats.percent;

  const pctEl = document.getElementById('summary-percent');
  if (pctEl) {
    pctEl.className = 'summary-percent';
    if (pct >= 90) pctEl.classList.add('excellent');
    else if (pct >= 60) pctEl.classList.add('good');
    else pctEl.classList.add('learning');
    pctEl.classList.add('animate');
    countUp(pctEl, pct);
  }

  // Score detail
  const correctEl = document.getElementById('summary-correct');
  if (correctEl) correctEl.textContent = stats.correct;
  const totalEl = document.getElementById('summary-total');
  if (totalEl) totalEl.textContent = stats.total;

  // Category name
  const catEl = document.getElementById('summary-category');
  if (catEl) catEl.textContent = getCategoryLabel(currentCategory);

  // Motivation text for low scores
  const motivEl = document.getElementById('summary-motivation');
  if (motivEl) {
    if (pct < 60) {
      motivEl.textContent = t('summary.motivation');
      motivEl.classList.remove('hidden');
    } else {
      motivEl.classList.add('hidden');
    }
  }

  // Update button text
  const againBtn = document.getElementById('btn-new-session');
  if (againBtn) {
    againBtn.textContent = t('summary.again_category').replace('{category}', getCategoryLabel(currentCategory));
  }
  const homeBtn = document.getElementById('btn-home');
  if (homeBtn) {
    homeBtn.textContent = t('summary.all_categories');
  }

  // Record to progress
  const { newUnlocks, newMastery } = recordSession(
    currentCategory, stats.correct, stats.total, stats.maxStreak
  );

  if (getSetting('sounds')) sound.playComplete();
  if (getSetting('haptics')) haptics.hapticComplete();

  if (newUnlocks.length > 0) {
    const unlockName = getCategoryLabel(newUnlocks[0]);
    setTimeout(() => {
      showToast(t('summary.new_unlock').replace('{category}', unlockName));
    }, 1200);
  }

  document.body.style.filter = '';
}

function countUp(element, target, durationMs = 800) {
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(eased * target) + '%';
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(message, durationMs = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), durationMs);
}

// ── Event Wiring ───────────────────────────────────────────────────────────

function wireEvents() {
  wireLangSelect();

  // Settings button → open bottom sheet
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSettings();
    });
  }

  // Back button
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      tts.stop();
      game.stopSession();
      document.body.style.filter = '';
      showScreen('menu');
    });
  }

  // Play button tap → replay audio
  const playBtn = document.getElementById('play-button');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (isProcessingAnswer) return;
      if (!game.isActive()) return;
      const mode = getSetting('mode');
      if (mode !== 'reading') {
        const sentence = game.getCurrentSentence();
        if (sentence) {
          playBtn.classList.add('playing');
          tts.speak(sentence, getSetting('speed'))
            .then(() => playBtn.classList.remove('playing'))
            .catch(() => playBtn.classList.remove('playing'));
        }
      }
    });
  }

  // Summary buttons
  const againBtn = document.getElementById('btn-new-session');
  if (againBtn) {
    againBtn.addEventListener('click', () => {
      if (currentCategory) startTraining(currentCategory);
    });
  }

  const menuBtn = document.getElementById('btn-home');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => showScreen('menu'));
  }

  // Unlock all
  document.addEventListener('nlt-unlock-all', () => {
    unlockAll();
    renderCategoryMenu();
    showToast(t('settings.unlocked_all'));
  });
}

// ── Service Worker ─────────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
