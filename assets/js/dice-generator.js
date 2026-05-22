/**
 * DiceGenerator - Универсальный генератор бросков кубиков
 * Поддерживает таблицы с произвольным количеством кубиков (d6, d10 и др.)
 * Автоматически определяет конфигурацию броска на основе ключей таблицы.
 */
class DiceGenerator {
    constructor() {
        this.tables = {};
        this.isInitialized = false;
        this.init();
    }

    /**
     * Инициализация генератора
     */
    init() {
        if (this.isInitialized) return;
        this.loadTables();
        this.bindEvents();
        this.isInitialized = true;
    }

    /**
     * Загрузка данных таблиц из глобальной области видимости
     */
    loadTables() {
        this.tables = window.diceTables || {};
        if (Object.keys(this.tables).length === 0) {
            console.warn('DiceGenerator: Таблицы не найдены в window.diceTables');
        }
    }

    /**
     * Привязка событий к DOM
     */
    bindEvents() {
        document.addEventListener('click', (e) => {
            const button = e.target.closest('.roll-button');
            if (button) {
                this.handleRoll(button);
            }
        });
    }

    /**
     * Обработка клика по кнопке броска
     */
    handleRoll(button) {
        const generator = button.closest('.dice-generator');
        if (!generator) return;

        const tableName = generator.dataset.table;
        const result = this.rollTable(tableName);

        if (result) {
            this.displayResult(generator, result);
            this.animateButton(button);
        } else {
            console.error(`Ошибка броска для таблицы "${tableName}"`);
        }
    }

    /**
     * Выполнение броска для указанной таблицы
     */
    rollTable(tableName) {
        const tableData = this.tables[tableName];
        if (!tableData || !tableData.table) {
            console.error(`Таблица "${tableName}" не найдена или имеет некорректную структуру`);
            return null;
        }

        const { table, name } = tableData;
        const config = this.analyzeTableConfig(table);
        const { key, rolls } = this.generateRollKey(config, table);

        const resultText = table[key];
        if (!resultText) {
            console.warn(`Результат для комбинации "${key}" не найден в таблице "${tableName}"`);
            return null;
        }

        return {
            tableName: name || tableName,
            key,
            rolls,
            text: resultText
        };
    }

    /**
     * Анализ структуры таблицы для определения параметров броска
     * @param {Object} tableObj - Объект таблицы из данных
     * @returns {Object} { numDice, sides, useZeroForTen }
     */
    analyzeTableConfig(tableObj) {
        const keys = Object.keys(tableObj);
        if (keys.length === 0) throw new Error('Таблица пуста');

        // Определяем количество кубиков по длине наибольшего ключа
        const numDice = Math.max(...new Set(keys.map(el => el.length)));

        // Проверяем наличие цифр 9 или 0 для определения d10
        const hasHighDigit = keys.some(k => /[90]/.test(k));
        const useZeroForTen = keys.some(k => k.includes('0'));

        // Если есть 9 или 0, предполагаем d10, иначе d6 (или меньше)
        const sides = hasHighDigit ? 10 : 6;

        return { numDice, sides, useZeroForTen };
    }

    /**
     * Генерация бросков и формирование ключа
     * @param {Object} config - Конфигурация кубиков
     * @param {Object} tableObj - Объект таблицы для валидации формата
     * @returns {Object} { key, rolls }
     */
    generateRollKey(config, tableObj) {
        const { numDice, sides, useZeroForTen } = config;
        const rolls = [];
        let key = '';

        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);

            // Форматируем значение для ключа
            if (sides === 10 && roll === 10) {
                key += useZeroForTen ? '0' : '10';
            } else {
                key += roll.toString();
            }
        }

        // Фоллбэк: если сгенерированный ключ не найден, пытаемся найти ближайшее совпадение
        // (полезно если в таблице используется '0' вместо '10', но анализ не сработал)
        if (!(key in tableObj) && sides === 10 && !useZeroForTen) {
            const altKey = key.replace(/10/g, '0');
            if (altKey in tableObj) {
                key = altKey;
            }
        }

        if (!(key in tableObj)) {
            key = Object.keys(tableObj).at(-1);
        }

        return { key, rolls };
    }

    /**
     * Отображение результата в UI
     */
    displayResult(generator, result) {
        const resultEl = generator.querySelector('.dice-result');
        const detailEl = generator.querySelector('.dice-detail');

        if (resultEl) {
            resultEl.textContent = result.text;
            // Анимация появления
            resultEl.classList.remove('show');
            void resultEl.offsetWidth; // trigger reflow
            resultEl.classList.add('show');
        }

        if (detailEl) {
            detailEl.textContent = `Бросок: [${result.rolls.join(', ')}] → ${result.key}`;
        }
    }

    /**
     * Анимация кнопки при броске
     */
    animateButton(button) {
        if (button.classList.contains('rolling')) return;

        button.classList.add('rolling');
        button.disabled = true;

        setTimeout(() => {
            button.classList.remove('rolling');
            button.disabled = false;
        }, 600);
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    window.diceGenerator = new DiceGenerator();
});

// Экспорт для модульного использования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiceGenerator;
}