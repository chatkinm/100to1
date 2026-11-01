/**
 * Модуль хранения пакетов вопросов в LocalStorage для "Сто к одному"
 */

const STORAGE_KEY = 'sto_k_odnomu_packs';
export const DEFAULT_PACK_ID = 'sto-k-odnomu-default-v1';
export const BDAY_PACK_ID = 'sto-k-odnomu-bday-14';

/**
 * Получить список всех пакетов
 * @returns {Array}
 */
export function getPacks() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('[DB] Ошибка чтения пакетов из localStorage:', err);
    return [];
  }
}

/**
 * Загрузить встроенные пакеты, если их еще нет
 */
export async function initDefaultPacks() {
  const packs = getPacks();
  let updated = false;

  // 1. Базовый демо-пакет
  if (!packs.some(p => p.id === DEFAULT_PACK_ID)) {
    try {
      const response = await fetch('./assets/default_pack.json');
      if (response.ok) {
        const defaultPack = await response.json();
        packs.push(defaultPack);
        updated = true;
      }
    } catch (err) {
      console.warn('[DB] Не удалось загрузить assets/default_pack.json:', err);
    }
  }

  // 2. Праздничный пакет "День рождения брата 14 лет"
  if (!packs.some(p => p.id === BDAY_PACK_ID)) {
    try {
      const response = await fetch('./assets/birthday_14_pack.json');
      if (response.ok) {
        const bdayPack = await response.json();
        // Ставим праздничный пак в начало списка для быстрого выбора
        packs.unshift(bdayPack);
        updated = true;
      }
    } catch (err) {
      console.warn('[DB] Не удалось загрузить assets/birthday_14_pack.json:', err);
    }
  }

  if (updated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
    console.log('[DB] Встроенные пакеты успешно инициализированы.');
  }
}

/**
 * Получить конкретный пакет по ID
 * @param {string} id
 * @returns {Object|null}
 */
export function getPack(id) {
  const packs = getPacks();
  return packs.find(p => p.id === id) || null;
}

/**
 * Сохранить или обновить пакет
 * @param {Object} pack
 */
export function savePack(pack) {
  const packs = getPacks();
  if (!pack.id) {
    pack.id = 'pack_' + Date.now();
  }
  const index = packs.findIndex(p => p.id === pack.id);
  if (index !== -1) {
    packs[index] = pack;
  } else {
    packs.push(pack);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
  return pack;
}

/**
 * Удалить пакет по ID
 * @param {string} id
 */
export function deletePack(id) {
  let packs = getPacks();
  packs = packs.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
}

/**
 * Дублировать пакет
 * @param {string} id
 * @returns {Object|null}
 */
export function duplicatePack(id) {
  const pack = getPack(id);
  if (!pack) return null;

  const copy = JSON.parse(JSON.stringify(pack));
  copy.id = 'pack_' + Date.now();
  copy.name = `${pack.name} (Копия)`;
  return savePack(copy);
}

/**
 * Импорт пакета из JSON-строки
 * @param {string} jsonString
 * @returns {Object}
 */
export function importPackFromJson(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed.name || !Array.isArray(parsed.rounds)) {
    throw new Error('Некорректный формат файла пакета.');
  }
  parsed.id = 'pack_' + Date.now();
  savePack(parsed);
  return parsed;
}

/**
 * Экспорт пакета в скачиваемый JSON-файл
 * @param {string} id
 */
export function exportPackToJson(id) {
  const pack = getPack(id);
  if (!pack) return;

  const jsonStr = JSON.stringify(pack, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const safeName = (pack.name || 'pack').replace(/[^\w\dа-яА-ЯёЁ_-]+/g, '_');
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
