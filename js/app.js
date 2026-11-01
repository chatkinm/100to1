/**
 * Главный модуль управления приложением "Сто к одному"
 */
import { registerServiceWorker } from './sw-register.js';
import { initDefaultPacks, getPacks, getPack, importPackFromJson, DEFAULT_PACK_ID } from './db.js';
import { sound } from './sound.js';
import { GameEngine } from './game.js';
import { initEditor, openPackForm, saveCurrentPack, closePackForm, addNewRoundToCurrentPack } from './editor.js';

// Инициализация игрового движка
const game = new GameEngine();

// Глобальное состояние таймера Большой игры
let timerInterval = null;
let currentTimerSeconds = 15;
let currentPlayerNum = 1;

// =================== НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ ===================

function showScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.add('hidden'));

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove('hidden');
    window.scrollTo(0, 0);
  }
}

// =================== ЗВУКОВОЙ РЕЖИМ ===================

function updateSoundUI() {
  const isMuted = sound.isMuted();
  const icon = isMuted ? '🔇' : '🔊';

  const soundBtnIcon = document.getElementById('sound-status-icon');
  if (soundBtnIcon) soundBtnIcon.textContent = icon;

  const gameSoundBtn = document.getElementById('btn-game-sound');
  if (gameSoundBtn) gameSoundBtn.textContent = icon;
}

// =================== РЕНДЕР ИГРОВОГО ТАБЛО ===================

function renderGameUI() {
  if (!game.roundData) return;

  // Если раунд — Большая игра, переключаем на спец-экран
  if (game.roundData.isFinal) {
    showScreen('biggame-screen');
    renderBigGameUI();
    return;
  }

  showScreen('game-screen');

  // 1. Счет и команды
  const t1Card = document.getElementById('team1-card');
  const t2Card = document.getElementById('team2-card');
  const t1Name = document.getElementById('team1-display-name');
  const t2Name = document.getElementById('team2-display-name');
  const t1Score = document.getElementById('team1-display-score');
  const t2Score = document.getElementById('team2-display-score');

  if (t1Name) t1Name.textContent = game.teams[0].name;
  if (t2Name) t2Name.textContent = game.teams[1].name;
  if (t1Score) t1Score.textContent = game.teams[0].score;
  if (t2Score) t2Score.textContent = game.teams[1].score;

  if (game.activeTeamIndex === 0) {
    t1Card.classList.add('active');
    t2Card.classList.remove('active');
  } else {
    t2Card.classList.add('active');
    t1Card.classList.remove('active');
  }

  // 2. Банк
  const bankEl = document.getElementById('bank-display-amount');
  if (bankEl) bankEl.textContent = game.roundBank;

  // 3. Метаданные раунда и вопрос
  const roundBadge = document.getElementById('round-name-badge');
  const questionEl = document.getElementById('current-question-text');
  const simpleTag = document.getElementById('simple-mode-tag');

  if (simpleTag) {
    if (game.rulesMode === 'simple') {
      simpleTag.classList.remove('hidden');
    } else {
      simpleTag.classList.add('hidden');
    }
  }

  let multiplierText = `(x${game.roundData.multiplier || 1})`;
  if (game.roundData.isReverse) multiplierText = '(ИГРА НАОБОРОТ)';

  if (roundBadge) {
    roundBadge.textContent = `РАУНД ${game.currentRoundIdx + 1}: ${(game.roundData.name || 'Раунд').toUpperCase()} ${multiplierText}`;
  }
  if (questionEl) {
    questionEl.textContent = game.roundData.question || 'Вопрос не задан';
  }

  // Обновление состояния кнопки "Пред. раунд"
  const prevBtn = document.getElementById('btn-prev-round');
  if (prevBtn) {
    prevBtn.style.opacity = game.currentRoundIdx === 0 ? '0.4' : '1';
    prevBtn.disabled = game.currentRoundIdx === 0;
  }

  // 4. Промахи (крестики)
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`strike-${i}`);
    if (dot) {
      if (i <= game.strikes) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    }
  }

  // 5. Отрисовка плашек табло (до 6 строк)
  const board = document.getElementById('main-scoreboard');
  if (!board) return;
  board.innerHTML = '';

  const answers = game.answersState;
  const totalSlots = Math.max(6, answers.length);

  for (let i = 0; i < totalSlots; i++) {
    const item = answers[i];
    const slat = document.createElement('div');
    slat.className = `slat-row ${item && item.revealed ? 'revealed' : ''}`;

    if (item) {
      slat.innerHTML = `
        <div class="slat-inner">
          <div class="slat-front">
            <span class="slat-number">${i + 1}</span>
          </div>
          <div class="slat-back">
            <span class="slat-text">${escapeHtml(item.text)}</span>
            <span class="slat-points">${item.points}</span>
          </div>
        </div>
      `;

      slat.addEventListener('click', () => {
        if (!item.revealed) {
          game.revealAnswer(i);
        }
      });
    } else {
      // Пустой закрытый слот, если в вопросе меньше 6 ответов
      slat.innerHTML = `
        <div class="slat-inner">
          <div class="slat-front">
            <span class="slat-number" style="opacity: 0.3;">${i + 1}</span>
          </div>
          <div class="slat-back">
            <span class="slat-text">—</span>
            <span class="slat-points">0</span>
          </div>
        </div>
      `;
    }

    board.appendChild(slat);
  }

  // 6. Подписи кнопок передачи банка
  const awardT1Btn = document.getElementById('btn-award-team1');
  const awardT2Btn = document.getElementById('btn-award-team2');
  if (awardT1Btn) awardT1Btn.textContent = `🏆 Банк: ${game.teams[0].name}`;
  if (awardT2Btn) awardT2Btn.textContent = `🏆 Банк: ${game.teams[1].name}`;
}

// =================== АНИМАЦИЯ ПРОМАХА (КРЕСТ НА ЭКРАНЕ) ===================

function showStrikeOverlay(strikeCount) {
  const overlay = document.getElementById('strike-overlay');
  const wrap = document.getElementById('giant-crosses-wrap');
  if (!overlay || !wrap) return;

  wrap.innerHTML = '';
  for (let i = 0; i < strikeCount; i++) {
    const cross = document.createElement('span');
    cross.className = 'giant-cross';
    cross.textContent = '✕';
    wrap.appendChild(cross);
  }

  overlay.classList.add('active');

  setTimeout(() => {
    overlay.classList.remove('active');
  }, 1100);
}

// =================== РЕНДЕР БОЛЬШОЙ ИГРЫ ===================

function renderBigGameUI() {
  const tbody = document.getElementById('biggame-tbody');
  const totalScoreEl = document.getElementById('biggame-total-score');
  const playerBadge = document.getElementById('biggame-player-badge');

  if (!tbody || !game.bigGameState) return;
  tbody.innerHTML = '';

  if (playerBadge) {
    playerBadge.textContent = currentPlayerNum === 1 ? 'ИГРОК 1 (15 СЕК)' : 'ИГРОК 2 (20 СЕК)';
  }

  game.bigGameState.questions.forEach((q, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'biggame-row';

    tr.innerHTML = `
      <td class="biggame-q">${idx + 1}. ${escapeHtml(q.question)}</td>
      <td>
        <div class="player-ans-box ${q.player1Revealed ? 'revealed' : ''}" data-q="${idx}" data-p="1">
          <span>${q.player1Revealed ? (escapeHtml(q.player1Answer) || '—') : (q.player1Answer ? '•••••' : '—')}</span>
          <strong style="color: var(--color-gold);">${q.player1Revealed ? q.player1Points : '?'}</strong>
        </div>
      </td>
      <td>
        <div class="player-ans-box ${q.player2Revealed ? 'revealed' : ''}" data-q="${idx}" data-p="2">
          <span>${q.player2Revealed ? (escapeHtml(q.player2Answer) || '—') : (q.player2Answer ? '•••••' : '—')}</span>
          <strong style="color: var(--color-gold);">${q.player2Revealed ? q.player2Points : '?'}</strong>
        </div>
      </td>
    `;

    // Клик для ввода ответа или открытия очков
    tr.querySelector('[data-p="1"]').addEventListener('click', () => {
      handleBigGameAnswerClick(idx, 1);
    });

    tr.querySelector('[data-p="2"]').addEventListener('click', () => {
      handleBigGameAnswerClick(idx, 2);
    });

    tbody.appendChild(tr);
  });

  if (totalScoreEl) {
    totalScoreEl.textContent = `${game.bigGameState.totalPoints} / 200`;
    if (game.bigGameState.totalPoints >= 200) {
      totalScoreEl.style.color = 'var(--color-success)';
    } else {
      totalScoreEl.style.color = 'var(--color-gold)';
    }
  }
}

function handleBigGameAnswerClick(qIdx, playerNum) {
  const q = game.bigGameState.questions[qIdx];
  const isRevealed = playerNum === 1 ? q.player1Revealed : q.player2Revealed;

  if (!isRevealed) {
    // Если ответ еще не задан, спрашиваем ведущего
    const currentAns = playerNum === 1 ? q.player1Answer : q.player2Answer;
    if (!currentAns) {
      const entered = prompt(`Вопрос: ${q.question}\nВведите ответ Игрока ${playerNum}:`);
      if (entered !== null) {
        // Поиск совпадения в заготовленных ответах
        const cleanEntered = entered.trim().toLowerCase();
        let matchedPoints = 0;
        if (q.answers) {
          const match = q.answers.find(a => cleanEntered.includes(a.text.toLowerCase()) || a.text.toLowerCase().includes(cleanEntered));
          if (match) matchedPoints = match.points;
        }

        const ptsStr = prompt(`Ответ: "${entered}"\nСколько очков дать? (В базе найдено: ${matchedPoints}):`, matchedPoints);
        const pts = parseInt(ptsStr) || 0;

        game.setBigGameAnswer(qIdx, playerNum, entered.trim(), pts);
        renderBigGameUI();
      }
    } else {
      // Открыть на табло
      game.revealBigGameAnswer(qIdx, playerNum);
      renderBigGameUI();
    }
  }
}

// Таймер Большой игры
function toggleBigGameTimer() {
  const toggleBtn = document.getElementById('btn-timer-toggle');
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    if (toggleBtn) toggleBtn.textContent = '▶ СТАРТ';
  } else {
    if (toggleBtn) toggleBtn.textContent = '⏸ СТОП';
    timerInterval = setInterval(() => {
      if (currentTimerSeconds > 0) {
        currentTimerSeconds--;
        sound.playTick();
        const display = document.getElementById('biggame-timer-display');
        if (display) display.textContent = currentTimerSeconds;
      } else {
        clearInterval(timerInterval);
        timerInterval = null;
        if (toggleBtn) toggleBtn.textContent = '▶ СТАРТ';
        sound.playGong();
      }
    }, 1000);
  }
}

function resetBigGameTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const toggleBtn = document.getElementById('btn-timer-toggle');
  if (toggleBtn) toggleBtn.textContent = '▶ СТАРТ';

  // Переключение между 15 и 20 секундами
  currentPlayerNum = currentPlayerNum === 1 ? 2 : 1;
  currentTimerSeconds = currentPlayerNum === 1 ? 15 : 20;

  const display = document.getElementById('biggame-timer-display');
  if (display) display.textContent = currentTimerSeconds;

  renderBigGameUI();
}

// =================== ФИНАЛ И ПОБЕДА ===================

function showGameOverScreen() {
  showScreen('gameover-screen');

  const title = document.getElementById('winner-title');
  const subtitle = document.getElementById('winner-subtitle');
  const t1Name = document.getElementById('final-team1-name');
  const t2Name = document.getElementById('final-team2-name');
  const t1Score = document.getElementById('final-team1-score');
  const t2Score = document.getElementById('final-team2-score');

  const s1 = game.teams[0].score;
  const s2 = game.teams[1].score;

  if (t1Name) t1Name.textContent = game.teams[0].name;
  if (t2Name) t2Name.textContent = game.teams[1].name;
  if (t1Score) t1Score.textContent = s1;
  if (t2Score) t2Score.textContent = s2;

  if (s1 > s2) {
    if (title) title.textContent = `ПОБЕДА: ${game.teams[0].name}!`;
    if (subtitle) subtitle.textContent = `С блестящим отрывом и счетом ${s1}!`;
  } else if (s2 > s1) {
    if (title) title.textContent = `ПОБЕДА: ${game.teams[1].name}!`;
    if (subtitle) subtitle.textContent = `С блестящим отрывом и счетом ${s2}!`;
  } else {
    if (title) title.textContent = 'НИЧЬЯ!';
    if (subtitle) subtitle.textContent = `Обе команды набрали по ${s1} очков! Дружба победила!`;
  }

  sound.playRoundWin();
}

// =================== ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ПРИЛОЖЕНИЯ ===================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Регистрация Service Worker
  registerServiceWorker();

  // 2. Инициализация базы данных и дефолтного пака
  await initDefaultPacks();

  // 3. Звук
  updateSoundUI();
  const toggleSoundBtns = [document.getElementById('btn-toggle-sound'), document.getElementById('btn-game-sound')];
  toggleSoundBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        sound.toggleMute();
        updateSoundUI();
      });
    }
  });

  // 4. Настройка связи движка с UI
  game.onStateChange = renderGameUI;
  game.onStrikeTriggered = (strikes) => showStrikeOverlay(strikes);
  game.onGameOver = showGameOverScreen;

  // 5. Главное меню -> Лобби
  const btnToLobby = document.getElementById('btn-to-lobby');
  if (btnToLobby) {
    btnToLobby.addEventListener('click', () => {
      populateLobbyPacks();
      showScreen('lobby-screen');
    });
  }

  // 6. Главное меню -> Редактор
  const btnToEditor = document.getElementById('btn-to-editor');
  if (btnToEditor) {
    btnToEditor.addEventListener('click', () => {
      initEditor(() => populateLobbyPacks());
      showScreen('editor-screen');
    });
  }

  // 7. Кнопки возврата в меню
  document.querySelectorAll('.btn-to-menu').forEach(btn => {
    btn.addEventListener('click', () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      showScreen('menu-screen');
    });
  });

  // 8. Модальное окно правил
  const rulesModal = document.getElementById('rules-modal');
  const btnOpenRules = document.getElementById('btn-open-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');

  if (btnOpenRules && rulesModal) {
    btnOpenRules.addEventListener('click', () => rulesModal.classList.add('active'));
  }
  if (btnCloseRules && rulesModal) {
    btnCloseRules.addEventListener('click', () => rulesModal.classList.remove('active'));
  }
  if (rulesModal) {
    rulesModal.addEventListener('click', (e) => {
      if (e.target === rulesModal) rulesModal.classList.remove('active');
    });
  }

  // 8.5. Переключатель карточек режима в Лобби
  const modeCards = [document.getElementById('mode-card-classic'), document.getElementById('mode-card-simple')];
  modeCards.forEach(card => {
    if (card) {
      card.addEventListener('click', () => {
        modeCards.forEach(c => c?.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    }
  });

  // 9. Старт игры из Лобби
  const btnStartGame = document.getElementById('btn-start-gameplay');
  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      const select = document.getElementById('lobby-pack-select');
      const packId = select ? select.value : DEFAULT_PACK_ID;
      const pack = getPack(packId) || getPacks()[0];

      const t1 = document.getElementById('team1-name-input')?.value || 'Команда 1';
      const t2 = document.getElementById('team2-name-input')?.value || 'Команда 2';

      const rulesMode = document.querySelector('input[name="game-rules-mode"]:checked')?.value || 'classic';
      const enableBigGame = document.getElementById('setting-enable-biggame')?.checked !== false;

      game.startNewGame(pack, {
        team1Name: t1,
        team2Name: t2,
        rulesMode,
        enableBigGame
      });
      renderGameUI();
    });
  }

  // 10. Кнопки игрового процесса
  document.getElementById('btn-strike')?.addEventListener('click', () => game.addStrike());
  document.getElementById('btn-switch-team')?.addEventListener('click', () => game.toggleActiveTeam());
  document.getElementById('team1-card')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-adjust')) return;
    game.setActiveTeam(0);
  });
  document.getElementById('team2-card')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-adjust')) return;
    game.setActiveTeam(1);
  });

  // Быстрая корректировка очков
  document.getElementById('btn-adjust-sub-t1')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustScore(0, -10);
  });
  document.getElementById('btn-adjust-add-t1')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustScore(0, 10);
  });
  document.getElementById('btn-adjust-sub-t2')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustScore(1, -10);
  });
  document.getElementById('btn-adjust-add-t2')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustScore(1, 10);
  });

  document.getElementById('btn-award-team1')?.addEventListener('click', () => game.awardBankToTeam(0));
  document.getElementById('btn-award-team2')?.addEventListener('click', () => game.awardBankToTeam(1));
  document.getElementById('btn-reveal-all')?.addEventListener('click', () => game.revealAll());
  document.getElementById('btn-prev-round')?.addEventListener('click', () => game.prevRound());
  document.getElementById('btn-next-round')?.addEventListener('click', () => game.nextRound());

  // Большая игра кнопки
  document.getElementById('btn-timer-toggle')?.addEventListener('click', toggleBigGameTimer);
  document.getElementById('btn-timer-reset')?.addEventListener('click', resetBigGameTimer);
  document.getElementById('btn-biggame-next')?.addEventListener('click', () => showGameOverScreen());

  // Играть еще раз
  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    if (game.pack) {
      game.startNewGame(game.pack, {
        team1Name: game.teams[0].name,
        team2Name: game.teams[1].name
      });
      renderGameUI();
    } else {
      showScreen('lobby-screen');
    }
  });

  // Полноэкранный режим
  document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Редактор событий
  setupEditorListeners();
});

// Заполнение выпадающего списка пакетов в лобби
function populateLobbyPacks() {
  const select = document.getElementById('lobby-pack-select');
  if (!select) return;

  const packs = getPacks();
  select.innerHTML = '';

  packs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.rounds ? p.rounds.length : 0} раундов)`;
    select.appendChild(opt);
  });
}

// Настройка кнопок конструктора вопросов
function setupEditorListeners() {
  document.getElementById('btn-create-pack')?.addEventListener('click', () => {
    openPackForm(null, () => populateLobbyPacks());
  });

  document.getElementById('btn-cancel-editor')?.addEventListener('click', () => {
    closePackForm();
  });

  document.getElementById('btn-save-pack')?.addEventListener('click', () => {
    if (saveCurrentPack()) {
      alert('Игра успешно сохранена в библиотеку!');
      closePackForm();
      initEditor(() => populateLobbyPacks());
    }
  });

  document.getElementById('btn-add-regular-round')?.addEventListener('click', () => addNewRoundToCurrentPack('normal'));
  document.getElementById('btn-add-reverse-round')?.addEventListener('click', () => addNewRoundToCurrentPack('reverse'));
  document.getElementById('btn-add-final-round')?.addEventListener('click', () => addNewRoundToCurrentPack('final'));

  // Импорт JSON
  const importInput = document.getElementById('input-import-pack');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          importPackFromJson(event.target.result);
          alert('Пакет успешно импортирован!');
          initEditor(() => populateLobbyPacks());
        } catch (err) {
          alert('Ошибка чтения файла: ' + err.message);
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
