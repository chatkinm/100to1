/**
 * Модуль редактора / конструктора вопросов для "Сто к одному"
 */
import { getPacks, getPack, savePack, deletePack, duplicatePack, exportPackToJson, importPackFromJson, DEFAULT_PACK_ID } from './db.js';

let currentEditingPack = null;

export function initEditor(renderCallback) {
  // Инициализация при переходе на экран редактора
  renderPacksList(renderCallback);
}

/**
 * Отрисовка списка существующих пакетов
 */
export function renderPacksList(onEditCallback) {
  const container = document.getElementById('editor-packs-list');
  if (!container) return;

  const packs = getPacks();
  container.innerHTML = '';

  if (packs.length === 0) {
    container.innerHTML = '<p class="text-muted">Нет сохраненных пакетов. Создайте новый!</p>';
    return;
  }

  packs.forEach(pack => {
    const isDefault = pack.id === DEFAULT_PACK_ID;
    const card = document.createElement('div');
    card.className = 'pack-card';

    const roundsCount = pack.rounds ? pack.rounds.length : 0;

    card.innerHTML = `
      <div class="pack-info">
        <div class="pack-title-row">
          <h4 class="pack-name">${escapeHtml(pack.name || 'Без названия')}</h4>
          ${isDefault ? '<span class="badge badge-accent">Встроенный</span>' : ''}
        </div>
        <p class="pack-desc">${escapeHtml(pack.description || 'Нет описания')}</p>
        <span class="pack-meta">Раундов: ${roundsCount}</span>
      </div>
      <div class="pack-actions">
        <button class="btn btn-sm btn-primary btn-edit-pack" data-id="${pack.id}">✏️ Редактировать</button>
        <button class="btn btn-sm btn-secondary btn-export-pack" data-id="${pack.id}">📥 Скачать JSON</button>
        <button class="btn btn-sm btn-secondary btn-copy-pack" data-id="${pack.id}">📋 Копия</button>
        ${!isDefault ? `<button class="btn btn-sm btn-danger btn-delete-pack" data-id="${pack.id}">🗑️</button>` : ''}
      </div>
    `;

    // Слушатели кнопок
    card.querySelector('.btn-edit-pack').addEventListener('click', () => {
      openPackForm(pack.id, onEditCallback);
    });

    card.querySelector('.btn-export-pack').addEventListener('click', () => {
      exportPackToJson(pack.id);
    });

    card.querySelector('.btn-copy-pack').addEventListener('click', () => {
      duplicatePack(pack.id);
      renderPacksList(onEditCallback);
    });

    const delBtn = card.querySelector('.btn-delete-pack');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (confirm(`Удалить пакет "${pack.name}"?`)) {
          deletePack(pack.id);
          renderPacksList(onEditCallback);
        }
      });
    }

    container.appendChild(card);
  });
}

/**
 * Открыть форму редактирования/создания пакета
 */
export function openPackForm(packId = null, onSavedCallback) {
  const packsListSection = document.getElementById('editor-list-view');
  const packFormSection = document.getElementById('editor-form-view');

  if (packId) {
    const existing = getPack(packId);
    currentEditingPack = JSON.parse(JSON.stringify(existing));
  } else {
    // Новый пакет по умолчанию с 4 базовыми раундами
    currentEditingPack = {
      id: 'pack_' + Date.now(),
      name: 'Новый пакет игры',
      description: 'Авторский набор вопросов',
      rounds: [
        {
          roundNumber: 1,
          name: 'Простая игра',
          multiplier: 1,
          question: '',
          answers: createEmptyAnswers(6)
        },
        {
          roundNumber: 2,
          name: 'Двойная игра',
          multiplier: 2,
          question: '',
          answers: createEmptyAnswers(6)
        },
        {
          roundNumber: 3,
          name: 'Тройная игра',
          multiplier: 3,
          question: '',
          answers: createEmptyAnswers(6)
        },
        {
          roundNumber: 4,
          name: 'Игра наоборот',
          multiplier: 1,
          isReverse: true,
          question: '',
          answers: [
            { text: '', points: 240 },
            { text: '', points: 180 },
            { text: '', points: 120 },
            { text: '', points: 90 },
            { text: '', points: 60 },
            { text: '', points: 15 }
          ]
        }
      ]
    };
  }

  packsListSection.classList.add('hidden');
  packFormSection.classList.remove('hidden');

  renderPackForm();
}

/**
 * Создать пустые ответы
 */
function createEmptyAnswers(count = 6) {
  const res = [];
  for (let i = 0; i < count; i++) {
    res.push({ text: '', points: 0 });
  }
  return res;
}

/**
 * Отрисовка формы редактирования пакета
 */
function renderPackForm() {
  const nameInput = document.getElementById('editor-pack-name');
  const descInput = document.getElementById('editor-pack-desc');
  const roundsContainer = document.getElementById('editor-rounds-container');

  if (nameInput) nameInput.value = currentEditingPack.name || '';
  if (descInput) descInput.value = currentEditingPack.description || '';

  if (!roundsContainer) return;
  roundsContainer.innerHTML = '';

  currentEditingPack.rounds.forEach((round, rIdx) => {
    const roundBox = document.createElement('div');
    roundBox.className = 'card round-editor-card';

    const isFinal = round.isFinal;
    const isReverse = round.isReverse;

    // Подсчет суммы очков
    let pointsSum = 0;
    if (round.answers) {
      pointsSum = round.answers.reduce((acc, curr) => acc + (Number(curr.points) || 0), 0);
    }

    roundBox.innerHTML = `
      <div class="round-editor-header">
        <div class="round-header-left">
          <span class="badge ${isFinal ? 'badge-accent' : (isReverse ? 'badge-warning' : 'badge-primary')}">
            Раунд ${rIdx + 1}: ${escapeHtml(round.name || 'Раунд')}
          </span>
          <span class="round-multiplier-tag">${isReverse ? 'Реверс' : `x${round.multiplier || 1}`}</span>
        </div>
        <div class="round-header-right">
          ${!isFinal ? `<span class="badge sum-badge ${pointsSum === 100 ? 'badge-success' : 'badge-neutral'}">Сумма: ${pointsSum}</span>` : ''}
          <button type="button" class="btn btn-sm btn-icon btn-delete-round" data-ridx="${rIdx}" title="Удалить раунд">✕</button>
        </div>
      </div>

      <div class="form-group">
        <label>Название раунда:</label>
        <input type="text" class="form-control round-name-input" data-ridx="${rIdx}" value="${escapeHtml(round.name || '')}">
      </div>

      <div class="form-group">
        <label>Вопрос раунда:</label>
        <input type="text" class="form-control round-question-input" data-ridx="${rIdx}" placeholder="Например: Что люди чаще всего забывают дома?" value="${escapeHtml(round.question || '')}">
      </div>

      ${!isFinal ? `
        <div class="answers-editor-section">
          <h5>Варианты ответов на табло (до 6 штук):</h5>
          <div class="answers-editor-list" id="round-${rIdx}-answers">
            ${(round.answers || []).map((ans, aIdx) => `
              <div class="answer-row">
                <span class="answer-idx">${aIdx + 1}</span>
                <input type="text" class="form-control ans-text-input" data-ridx="${rIdx}" data-aidx="${aIdx}" placeholder="Ответ (например: Ключи)" value="${escapeHtml(ans.text || '')}">
                <input type="number" class="form-control ans-points-input" data-ridx="${rIdx}" data-aidx="${aIdx}" placeholder="Баллы" value="${ans.points ?? 0}" min="0" max="500">
                <button type="button" class="btn btn-sm btn-icon btn-remove-ans" data-ridx="${rIdx}" data-aidx="${aIdx}">✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-sm btn-secondary btn-add-ans" data-ridx="${rIdx}">+ Добавить строку ответа</button>
        </div>
      ` : `
        <div class="final-editor-section">
          <p class="text-muted">Большая игра (Суперигра) содержит 5 блиц-вопросов.</p>
        </div>
      `}
    `;

    // Слушатели изменений
    roundBox.querySelector('.round-name-input').addEventListener('input', (e) => {
      round.name = e.target.value;
    });

    roundBox.querySelector('.round-question-input').addEventListener('input', (e) => {
      round.question = e.target.value;
    });

    roundBox.querySelector('.btn-delete-round').addEventListener('click', () => {
      if (confirm('Удалить этот раунд?')) {
        currentEditingPack.rounds.splice(rIdx, 1);
        renderPackForm();
      }
    });

    if (!isFinal) {
      // Изменение ответов
      roundBox.querySelectorAll('.ans-text-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const aidx = parseInt(e.target.dataset.aidx);
          round.answers[aidx].text = e.target.value;
        });
      });

      roundBox.querySelectorAll('.ans-points-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const aidx = parseInt(e.target.dataset.aidx);
          round.answers[aidx].points = parseInt(e.target.value) || 0;
          // Обновить бейдж суммы
          const sum = round.answers.reduce((acc, curr) => acc + (Number(curr.points) || 0), 0);
          const badge = roundBox.querySelector('.sum-badge');
          if (badge) {
            badge.textContent = `Сумма: ${sum}`;
            badge.className = `badge sum-badge ${sum === 100 ? 'badge-success' : 'badge-neutral'}`;
          }
        });
      });

      roundBox.querySelectorAll('.btn-remove-ans').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const aidx = parseInt(e.currentTarget.dataset.aidx);
          round.answers.splice(aidx, 1);
          renderPackForm();
        });
      });

      roundBox.querySelector('.btn-add-ans').addEventListener('click', () => {
        if (round.answers.length < 6) {
          round.answers.push({ text: '', points: 0 });
          renderPackForm();
        } else {
          alert('На табло помещается максимум 6 строк ответов.');
        }
      });
    }

    roundsContainer.appendChild(roundBox);
  });
}

/**
 * Сохранить текущий пакет
 */
export function saveCurrentPack() {
  if (!currentEditingPack) return false;

  const nameInput = document.getElementById('editor-pack-name');
  const descInput = document.getElementById('editor-pack-desc');

  if (nameInput) currentEditingPack.name = nameInput.value.trim() || 'Без названия';
  if (descInput) currentEditingPack.description = descInput.value.trim();

  savePack(currentEditingPack);
  return true;
}

/**
 * Добавить новый раунд в текущий пакет
 */
export function addNewRoundToCurrentPack(type = 'normal') {
  if (!currentEditingPack) return;
  const num = currentEditingPack.rounds.length + 1;

  if (type === 'reverse') {
    currentEditingPack.rounds.push({
      roundNumber: num,
      name: `Игра наоборот`,
      multiplier: 1,
      isReverse: true,
      question: '',
      answers: [
        { text: '', points: 240 },
        { text: '', points: 180 },
        { text: '', points: 120 },
        { text: '', points: 90 },
        { text: '', points: 60 },
        { text: '', points: 15 }
      ]
    });
  } else if (type === 'final') {
    currentEditingPack.rounds.push({
      roundNumber: num,
      name: `Большая игра`,
      multiplier: 1,
      isFinal: true,
      question: 'Суперигра',
      finalQuestions: [
        { question: 'Вопрос 1', answers: [{ text: 'Ответ', points: 50 }] },
        { question: 'Вопрос 2', answers: [{ text: 'Ответ', points: 50 }] },
        { question: 'Вопрос 3', answers: [{ text: 'Ответ', points: 50 }] },
        { question: 'Вопрос 4', answers: [{ text: 'Ответ', points: 50 }] },
        { question: 'Вопрос 5', answers: [{ text: 'Ответ', points: 50 }] }
      ]
    });
  } else {
    currentEditingPack.rounds.push({
      roundNumber: num,
      name: `Раунд ${num}`,
      multiplier: Math.min(num, 3),
      isReverse: false,
      question: '',
      answers: createEmptyAnswers(6)
    });
  }

  renderPackForm();
}

/**
 * Закрыть форму и вернуться к списку
 */
export function closePackForm() {
  document.getElementById('editor-form-view').classList.add('hidden');
  document.getElementById('editor-list-view').classList.remove('hidden');
  currentEditingPack = null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
