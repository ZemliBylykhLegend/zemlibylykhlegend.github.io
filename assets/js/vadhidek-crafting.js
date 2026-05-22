// vadhidek-crafting.js
class VadhidekCrafting {
    constructor(container) {
        this.container = container;
        this.data = window.vadhidekData || {};
        this.inventory = new Map();
        this.expandedRecipes = new Set();
        this.expandedIngredients = new Set();
        this.selectedRecipe = null;
        this.currentCategory = null;
        this.init();
    }

    init() {
        this.initializeElements();
        if (this.initializationFailed) return;
        this.attachEventListeners();
        this.renderCategories();
        this.updateInventoryDisplay();
    }

    initializeElements() {
        this.categoriesContainer = this.container.querySelector('.vadhidek-categories-container');
        this.itemsList = this.container.querySelector('.vadhidek-items-list');
        this.recipeDetail = this.container.querySelector('.vadhidek-recipe-detail');
        this.inventoryPanel = this.container.querySelector('.vadhidek-inventory-panel');
        this.searchInput = this.container.querySelector('.vadhidek-search-input');
        this.searchBtn = this.container.querySelector('.vadhidek-search-btn');

        if (!this.categoriesContainer || !this.itemsList || !this.recipeDetail) {
            console.error('VadhidekCrafting Error: Essential HTML elements missing.');
            this.initializationFailed = true;
        }
    }

    attachEventListeners() {
        if (this.searchBtn) this.searchBtn.addEventListener('click', () => this.handleSearch(this.searchInput.value));
        if (this.searchInput) this.searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleSearch(this.searchInput.value));

        this.container.addEventListener('click', (e) => {
            const catBtn = e.target.closest('.vadhidek-category-btn');
            if (catBtn) return this.selectCategory(catBtn.dataset.category);

            const itemCard = e.target.closest('.vadhidek-item-card');
            if (itemCard) return this.selectItem(itemCard.dataset.item);

            if (e.target.classList.contains('vadhidek-toggle-gathering')) return this.toggleIngredientGathering(e.target.dataset.ingredient);
            if (e.target.classList.contains('vadhidek-toggle-recipe')) return this.toggleRecipeExpand(e.target.dataset.recipe);
            if (e.target.classList.contains('vadhidek-add-btn')) return this.addToInventory(e.target.dataset.item, parseInt(e.target.dataset.quantity) || 1);
            if (e.target.classList.contains('vadhidek-remove-btn')) return this.removeFromInventory(e.target.dataset.item);
            if (e.target.classList.contains('vadhidek-clear-btn')) return this.clearInventory();
        });
    }

    renderCategories() {
        this.categoriesContainer.innerHTML = (this.data.categories || []).map(c =>
            `<button class="vadhidek-category-btn" data-category="${c.id}">${c.name}</button>`
        ).join('');
        if (this.data.categories?.length) this.selectCategory(this.data.categories[0].id);
    }

    selectCategory(id) {
        this.container.querySelectorAll('.vadhidek-category-btn').forEach(b => b.classList.remove('active'));
        this.container.querySelector(`[data-category="${id}"]`)?.classList.add('active');
        const cat = this.data.categories.find(c => c.id === id);
        if (cat) {
            this.currentCategory = cat;
            this.renderItemsList(cat);
        }
    }

    renderItemsList(category) {
        let items = [];
        if (category.id === 'gathering') {
            items = Object.entries(this.data.materials || {}).map(([k, v]) => ({ key: k, ...v }));
        } else {
            const typeMap = {
                weapons_armor: ['weapon', 'weapon_magic', 'armor', 'armor_magic'],
                alchemy: ['potion', 'poison', 'oil'],
                traps_tools: ['trap', 'tool']
            };
            const allowed = typeMap[category.id] || [];
            items = Object.entries(this.data.recipes || {})
                .filter(([, r]) => allowed.includes(r.type))
                .map(([k, r]) => ({ key: k, ...r }));
        }
        items.sort((a, b) => (parseInt(a.dc) || 0) - (parseInt(b.dc) || 0));

        this.itemsList.innerHTML = items.map(i => `
            <div class="vadhidek-item-card" data-item="${i.key}">
                <div class="vadhidek-item-header">
                    <h3>${i.name}</h3>
                    <div class="vadhidek-item-meta">
                        ${i.dc ? `<span class="vadhidek-dc">СЛ ${i.dc}</span>` : ''}
                        ${i.time ? `<span class="vadhidek-time">⏱ ${i.time}</span>` : ''}
                        ${i.tool ? `<span class="vadhidek-tool">🔧 ${i.tool}</span>` : ''}
                    </div>
                </div>
                <div class="vadhidek-item-preview">
                    ${i.ingredients
                        ? `<span class="vadhidek-ingredients-count">📋 ${i.ingredients.length} ингр.</span>`
                        : `<span class="vadhidek-material-source">📍 ${this.getGatheringMethodName(i.gathering_method)}</span>`}
                </div>
            </div>`).join('');
    }

    /**
     * Преобразует внутренний ключ gathering_method в человекочитаемое название
     * @param {string|string[]} method - Ключ метода сбора (или массив ключей)
     * @returns {string} Человекочитаемое название
     */
    getGatheringMethodName(method) {
        if (!method) return 'Базовый';

        // Если массив (растение растёт в нескольких местах)
        if (Array.isArray(method)) {
            return method.map(m => this.getGatheringMethodName(m)).join(', ');
        }

        // Словарь соответствий
        const methodNames = {
            // Разделка существ
            butchering: 'Разделка существ',
            // Переплавка металлов
            smelting: 'Переплавка руды',

            // Кости Хияла
            hiyal_bones: 'Кости Хияла',

            // Травничество по локациям
            herbs_plains: 'Травничество: Равнины',
            herbs_swamp: 'Травничество: Болота',
            herbs_forest: 'Травничество: Леса',
            herbs_mountains: 'Травничество: Горы',
            herbs_rivers: 'Травничество: Реки и озёра',
            herbs_caves: 'Травничество: Пещеры',
            herbs_omolon: 'Травничество: Омолон',

            // Добыча руды
            vein_iron_copper: 'Шахтёрство: Железо и медь',
            vein_gold_silver: 'Шахтёрство: Золото и серебро',
            vein_ayang_shulay: 'Шахтёрство: Аянг и шулай',
            vein_nasakh: 'Шахтёрство: Насах',
        };

        return methodNames[method] || method;
    }

    selectItem(key) {
        const item = this.data.materials[key] || this.data.recipes[key];
        if (!item) return;
        this.selectedRecipe = { key, ...item };
        this.expandedRecipes.clear();
        this.expandedIngredients.clear();
        this.renderRecipeDetail(key, item);
    }

    renderRecipeDetail(key, item) {
        const isMaterial = !!this.data.materials[key];
        const treeData = isMaterial ? null : this.calculateRecipeTree(key, item);

        this.recipeDetail.innerHTML = `
            <div class="vadhidek-recipe-header">
                <h2>${item.name}</h2>
                <div class="vadhidek-recipe-meta">
                    ${item.type ? `<span class="vadhidek-type vadhidek-type-${item.type}">${this.getTypeName(item.type)}</span>` : ''}
                    ${item.dc ? `<span class="vadhidek-dc">СЛ: ${item.dc}</span>` : ''}
                    ${item.time ? `<span class="vadhidek-time">⏱ ${item.time}</span>` : ''}
                    ${item.tool ? `<span class="vadhidek-tool">🔧 ${item.tool}</span>` : ''}
                </div>
                ${item.description ? `<p class="vadhidek-description">${item.description}</p>` : ''}
            </div>
            ${isMaterial ? this.renderMaterialDetail(item) : this.renderIngredientsList(treeData)}
            <div class="vadhidek-recipe-actions">
                <button class="vadhidek-btn vadhidek-btn-primary">➕ В инвентарь</button>
            </div>
        `;

        this.recipeDetail.querySelector('.vadhidek-btn-primary').onclick = () => this.addToInventory(key, 1);
    }

    renderMaterialDetail(item) {
        const inInv = this.inventory.get(this.selectedRecipe.key) || 0;
        return `
            <div class="vadhidek-material-detail">
                <div class="vadhidek-material-info">
                    <p><strong>Тип:</strong> ${item.gathering_method ? 'Добываемый ресурс' : 'Базовый компонент'}</p>
                    ${item.elements ? `<p><strong>Элементы:</strong> ${item.elements.join(', ')}</p>` : ''}
                </div>
                ${inInv > 0 ? `<div class="vadhidek-inventory-status vadhidek-available">✅ В инвентаре: ${inInv}</div>` : ''}
                ${item.gathering_method ? this.renderGatheringTable(this.selectedRecipe.key) : ''}
            </div>
        `;
    }

    renderIngredientsList(treeData) {
        if (!treeData) return '';

        return `
            <div class="vadhidek-ingredients-section">
                <h3 class="vadhidek-ingredients-title">📋 Ингредиенты</h3>
                <div class="vadhidek-ingredients-content">
                    ${this.renderMaterialsList(treeData.baseMaterials, treeData.elementRequirements)}
                </div>
            </div>
        `;
    }

    calculateRecipeTree(key, recipe, visited = new Set()) {
        if (visited.has(key)) return { baseMaterials: new Map(), elementRequirements: {} };
        visited.add(key);

        const baseMaterials = new Map();
        const elementRequirements = {};

        if (recipe.ingredients) {
            recipe.ingredients.forEach(ing => {
                const code = ing.item;
                const qty = ing.quantity || ing.qty || 1;

                // Проверяем, является ли ингредиент алхимическим элементом (Н, К, Р, М)
                if (['Н','К','Р','М'].includes(code)) {
                    elementRequirements[code] = (elementRequirements[code] || 0) + qty;
                } else {
                    const ingData = this.getIngredientData(code);
                    if (ingData.ingredients?.length) {
                        const sub = this.calculateRecipeTree(code, ingData, new Set(visited));
                        sub.baseMaterials.forEach((q, k) => baseMaterials.set(k, (baseMaterials.get(k) || 0) + (q * qty)));
                    } else {
                        baseMaterials.set(code, (baseMaterials.get(code) || 0) + qty);
                    }
                }
            });
        }
        return { baseMaterials, elementRequirements };
    }

    checkElementAvailability(elementRequirements) {
        if (!elementRequirements || Object.keys(elementRequirements).length === 0) {
            return { canCraft: true, details: {}, herbAssignments: {} };
        }

        const details = {};
        const herbAssignments = {};

        // Создаём рабочую копию инвентаря только с травами
        const workingInv = new Map();
        for (const [key, qty] of this.inventory.entries()) {
            const mat = this.data.materials[key];
            if (mat && mat.elements) {
                workingInv.set(key, qty);
            }
        }

        // Сортируем требования по убыванию (сначала самые сложные)
        const sortedElements = Object.entries(elementRequirements)
            .sort((a, b) => b[1] - a[1]);

        for (const [elemCode, required] of sortedElements) {
            let needed = required;
            let available = 0;

            // Находим все травы, содержащие этот элемент
            const eligibleHerbs = [];
            for (const [herbKey, qty] of workingInv.entries()) {
                if (qty > 0) {
                    const mat = this.data.materials[herbKey];
                    if (mat && mat.elements && mat.elements.includes(elemCode)) {
                        eligibleHerbs.push({
                            key: herbKey,
                            qty,
                            elements: mat.elements,
                            matchCount: mat.elements.filter(e => elementRequirements[e]).length
                        });
                    }
                }
            }

            // Сортируем по специфичности (сначала травы с меньшим количеством нужных элементов)
            eligibleHerbs.sort((a, b) => a.matchCount - b.matchCount);

            // Распределяем травы на этот элемент
            for (const herb of eligibleHerbs) {
                if (needed <= 0) break;

                const useCount = Math.min(herb.qty, needed);
                needed -= useCount;
                available += useCount;

                // Track assignment
                if (!herbAssignments[herb.key]) {
                    herbAssignments[herb.key] = { total: herb.qty, used: 0, assignments: {} };
                }
                herbAssignments[herb.key].used += useCount;
                herbAssignments[herb.key].assignments[elemCode] =
                    (herbAssignments[herb.key].assignments[elemCode] || 0) + useCount;

                // Уменьшаем рабочий инвентарь
                workingInv.set(herb.key, herb.qty - useCount);
            }

            details[elemCode] = {
                required,
                available,
                missing: Math.max(0, needed)
            };
        }

        const canCraft = Object.values(details).every(d => d.missing === 0);
        return { canCraft, details, herbAssignments };
    }

    getIngredientData(key) {
        if (['Н','К','Р','М'].includes(key)) {
            const el = this.data.elements?.find(e => e.code === key);
            return { name: `Элемент ${el?.name || key}`, quantity: 1, ingredients: [] };
        }
        return this.data.recipes[key] || this.data.materials[key] || { name: key, time: '0', ingredients: [] };
    }

    getTypeName(t) {
        const map = { weapon:'Оружие', armor:'Броня', weapon_magic:'Маг. Оружие', armor_magic:'Маг. Броня', potion:'Зелье', poison:'Яд', oil:'Масло', trap:'Ловушка', tool:'Инструмент' };
        return map[t] || t;
    }

    renderMaterialsList(baseMaterialsMap, elementRequirements) {
        let html = '';

        // Рендер обычных материалов
        if (baseMaterialsMap && baseMaterialsMap.size > 0) {
            html += Array.from(baseMaterialsMap.entries()).map(([k, q]) => {
                const inv = this.inventory.get(k) || 0;
                const miss = Math.max(0, q - inv);
                const mat = this.getIngredientData(k);
                return `
                    <div class="vadhidek-material-item ${miss > 0 ? 'vadhidek-missing' : 'vadhidek-available'}">
                        <span class="vadhidek-material-name">${mat.name}</span>
                        <span class="vadhidek-material-quantity">×${q}</span>
                        ${inv > 0 ? `<span class="vadhidek-material-have">Есть: ${inv}</span>` : ''}
                        ${miss > 0 ? `<span class="vadhidek-material-missing">Не хватает: ${miss}</span>` : ''}
                        <button class="vadhidek-add-btn" data-item="${k}" data-quantity="${q}">+ Добавить</button>
                    </div>`;
            }).join('');
        }

        // Рендер алхимических элементов
        if (elementRequirements && Object.keys(elementRequirements).length > 0) {
            const availCheck = this.checkElementAvailability(elementRequirements);

            html += Object.entries(elementRequirements).map(([code, req]) => {
                const det = availCheck.details[code] || { required: req, available: 0, missing: req };
                const elemName = this.data.elements?.find(e => e.code === code)?.name || code;
                const miss = det.missing;

                // Получаем список трав, которые могут предоставить этот элемент
                const availableHerbs = this.getHerbsForElement(code, req);
                const herbsDisplay = availableHerbs.length > 0
                    ? `(${availableHerbs.map(h => `${h.name} ×${h.count}`).join(', ')})`
                    : '';

                return `
                    <div class="vadhidek-material-item ${miss > 0 ? 'vadhidek-missing' : 'vadhidek-available'}">
                        <span class="vadhidek-material-name">🌿 Элемент ${elemName}</span>
                        <span class="vadhidek-material-quantity">×${req}</span>
                        ${det.available > 0 ? `<span class="vadhidek-material-have">Есть: ${det.available} ${herbsDisplay}</span>` : ''}
                        ${miss > 0 ? `<span class="vadhidek-material-missing">Не хватает: ${miss}</span>` : ''}
                    </div>`;
            }).join('');
        }

        return html || '<div class="vadhidek-no-materials">Нет материалов</div>';
    }

    // Новый метод для получения списка трав для элемента
    getHerbsForElement(elementCode, required) {
        const result = [];
        const workingInv = new Map();

        // Копируем инвентарь с травами
        for (const [key, qty] of this.inventory.entries()) {
            const mat = this.data.materials[key];
            if (mat && mat.elements && mat.elements.includes(elementCode)) {
                workingInv.set(key, qty);
            }
        }

        // Собираем информацию о доступных травах
        for (const [herbKey, qty] of workingInv.entries()) {
            const mat = this.data.materials[herbKey];
            if (qty > 0) {
                result.push({
                    name: mat.name,
                    count: Math.min(qty, required)
                });
            }
        }

        return result;
    }

    renderGatheringTable(materialKey) {
        const material = this.data.materials[materialKey];
        if (!material || !material.gathering_method) return '';

        // Поддерживаем как массив, так и строку
        const methods = Array.isArray(material.gathering_method)
            ? material.gathering_method
            : [material.gathering_method];

        // Рендерим все таблицы для этого материала
        return methods.map(methodKey => {
            const table = this.data.gathering_tables[methodKey];
            if (!table) return '';

            const headers = table.short_headers || table.headers;
            let rows = [];

            // 1. Таблицы с поиском строки по имени материала (первая колонка)
            const singleRowTables = ['smelting', 'herbs_plains', 'herbs_swamp', 'herbs_forest',
                                      'herbs_mountains', 'herbs_rivers', 'herbs_caves', 'herbs_omolon'];

            if (singleRowTables.includes(methodKey)) {
                const foundRow = table.rows.find(row => row[0] === material.name);
                if (foundRow) {
                    rows = [foundRow];
                }
            }
            // 2. Таблицы, где показываем ВСЕ строки (справочники)
            else if (['butchering', 'hiyal_bones'].includes(methodKey) || methodKey.startsWith('vein_')) {
                rows = table.rows;
            }

            if (rows.length === 0) return '';

            return `
                <div class="vadhidek-gathering-table">
                    <h4 class="vadhidek-table-title">📖 ${table.name}</h4>
                    <table class="vadhidek-data-table">
                        <thead>
                            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).filter(html => html !== '').join('');
    }

    getSmeltingMaterialName(fullName) {
        // "Единица меди" -> "медь", "Единица железа" -> "железо"
        const parts = fullName.toLowerCase().split(' ');
        return parts[parts.length - 1] || fullName;
    }

    addToInventory(key, qty = 1) {
        this.inventory.set(key, (this.inventory.get(key) || 0) + qty);
        this.updateInventoryDisplay();
        if (this.selectedRecipe) this.selectItem(this.selectedRecipe.key);
    }

    removeFromInventory(key) {
        this.inventory.delete(key);
        this.updateInventoryDisplay();
        if (this.selectedRecipe) this.selectItem(this.selectedRecipe.key);
    }

    updateInventoryDisplay() {
        if (!this.inventoryPanel) return;
        const items = Array.from(this.inventory.entries());
        if (!items.length) { this.inventoryPanel.innerHTML = '<div class="vadhidek-empty-inventory">📦 Инвентарь пуст</div>'; return; }
        this.inventoryPanel.innerHTML = `
            <h3>📦 Инвентарь</h3>
            <div class="vadhidek-inventory-list">
                ${items.map(([k, q]) => `
                    <div class="vadhidek-inventory-item">
                        <span class="vadhidek-item-name">${this.getIngredientData(k).name}</span>
                        <span class="vadhidek-item-quantity">×${q}</span>
                        <button class="vadhidek-remove-btn" data-item="${k}">×</button>
                    </div>`).join('')}
            </div>
            <button class="vadhidek-clear-btn">🗑️ Очистить</button>
        `;
    }

    clearInventory() { this.inventory.clear(); this.updateInventoryDisplay(); if (this.selectedRecipe) this.selectItem(this.selectedRecipe.key); }
    toggleRecipeExpand(path) { this.expandedRecipes.has(path) ? this.expandedRecipes.delete(path) : this.expandedRecipes.add(path); if (this.selectedRecipe) this.selectItem(this.selectedRecipe.key); }
    toggleIngredientGathering(id) { this.expandedIngredients.has(id) ? this.expandedIngredients.delete(id) : this.expandedIngredients.add(id); if (this.selectedRecipe) this.selectItem(this.selectedRecipe.key); }

    handleSearch(q) {
        if (!q?.trim()) return this.renderItemsList(this.currentCategory);
        const f = [...Object.entries(this.data.materials||{}),...Object.entries(this.data.recipes||{})].filter(([,v])=>v.name.toLowerCase().includes(q.toLowerCase()));
        this.itemsList.innerHTML = f.map(([k,v])=>`<div class="vadhidek-item-card" data-item="${k}"><div class="vadhidek-item-header"><h3>${v.name}</h3></div></div>`).join('');
    }

    destroy() { this.inventory.clear(); this.expandedRecipes.clear(); this.expandedIngredients.clear(); }
}

document.addEventListener('DOMContentLoaded', () => { document.querySelectorAll('.vadhidek-module').forEach(c => new VadhidekCrafting(c)); });