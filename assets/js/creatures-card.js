// creatures-card.js
class CreatureCard {
  constructor(container, creatureData, options = {}) {
    this.container = container;
    this.data = creatureData;
    this.options = {
      imageUrl: '/assets/images/creatures/',
      placeholderText: 'Изображение отсутствует',
      ...options
    };
    this.init();
  }

  init() {
    this.render();
    this.relocateContent();
  }

  formatLabel(key) {
    const labels = {
      hp: 'Хиты',
      armor: 'Класс Доспеха',
      speed: 'Скорость',
      STR: 'СИЛ',
      AGI: 'ЛОВ',
      CON: 'ТЕЛ',
      INT: 'ИНТ',
      WIS: 'МДР',
      CHA: 'ХАР',
      skills: 'Навыки',
      dmg_res: 'Сопротивление к урону',
      dmg_imn: 'Иммунитет к урону',
      con_imn: 'Иммунитет к состоянию',
      sens: 'Чувства',
      languages: 'Языки',
      danger: 'Опасность',
      mastery: 'Бонус мастерства',
      type: 'Тип',
      saves: 'Спасброски',
      dmg_vul: 'Уязвимость к урону'
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }

  render() {
    const { data } = this;

    this.container.innerHTML = `
      <div class="creature-card-container">
        <article class="creature-card" data-creature="${data.key}">
          ${this.renderImage()}
          <div class="card-content">
            <h3 class="card-title">${data.name}</h3>
            ${data.type ? `<p class="card-type">${data.type}</p>` : ''}
            <p class="card-description">${data.description}</p>
          </div>
          ${data.stats ? this.renderStats() : ''}
          ${data.lore ? this.renderLore() : ''}
        </article>
      </div>
      <div class="creature-text-content"></div>
    `;
  }

  renderImage() {
    const { placeholderText, imageUrl } = this.options;
    const { image, name, cr, danger } = this.data;

    // ✅ Если нет изображения - не рендерим блок
    if (!image) {
      return '';
    }

    const imgSrc = `${imageUrl}${image}`;
    const badgeValue = cr || danger;

    return `
      <div class="card-image">
        <img src="${imgSrc}" alt="${name}" loading="lazy">
        ${badgeValue ? `<span class="card-badge">CR ${badgeValue}</span>` : ''}
      </div>
    `;
  }

  renderStats() {
    const { stats } = this.data;
    if (!stats) return '';

    let html = '<div class="card-stats">';

    // ✅ Basic stats - только если есть значения
    if (stats.hp || stats.armor || stats.speed) {
      html += '<div class="stat-group basic-stats">';
      if (stats.hp) {
        html += `
          <div class="stat-row full-width">
            <span class="stat-label">${this.formatLabel('hp')}:</span>
            <span class="stat-value">${stats.hp}</span>
          </div>
        `;
      }
      if (stats.armor) {
        html += `
          <div class="stat-row full-width">
            <span class="stat-label">${this.formatLabel('armor')}:</span>
            <span class="stat-value">${stats.armor}</span>
          </div>
        `;
      }
      if (stats.speed) {
        html += `
          <div class="stat-row full-width">
            <span class="stat-label">${this.formatLabel('speed')}:</span>
            <span class="stat-value">${stats.speed}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    // ✅ Ability scores - только если есть значения
    const abilityKeys = ['STR', 'AGI', 'CON', 'INT', 'WIS', 'CHA'];
    const hasAbilities = abilityKeys.some(key => stats[key] !== undefined);

    if (hasAbilities) {
      html += '<div class="stat-group ability-scores">';
      abilityKeys.forEach(key => {
        if (stats[key] !== undefined) {
          const value = stats[key];
          const modifier = typeof value === 'number' ? Math.floor((value - 10) / 2) : 0;
          const sign = modifier >= 0 ? '+' : '';
          const formatted = typeof value === 'number' ? `${value} (${sign}${modifier})` : value;

          html += `
            <div class="ability-score">
              <span class="ability-key">${this.formatLabel(key)}</span>
              <span class="ability-value">${formatted}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    // ✅ Saves - только если есть
    if (stats.saves) {
      html += `
        <div class="stat-row full-width">
          <span class="stat-label">${this.formatLabel('saves')}:</span>
          <span class="stat-value">${stats.saves}</span>
        </div>
      `;
    }

    // ✅ Skills - только если есть
    if (stats.skills) {
      html += `
        <div class="stat-row full-width">
          <span class="stat-label">${this.formatLabel('skills')}:</span>
          <span class="stat-value">${stats.skills}</span>
        </div>
      `;
    }

    // ✅ Defense stats - только если есть значения
    const defenseKeys = ['dmg_res', 'dmg_imn', 'con_imn', 'dmg_vul'];
    const hasDefense = defenseKeys.some(key => stats[key] !== undefined);

    if (hasDefense) {
      html += '<div class="stat-group defense-stats">';
      defenseKeys.forEach(key => {
        if (stats[key] !== undefined) {
          html += `
            <div class="stat-row full-width">
              <span class="stat-label">${this.formatLabel(key)}:</span>
              <span class="stat-value">${stats[key]}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    // ✅ Other stats - только если есть значения
    const otherKeys = ['sens', 'languages', 'danger', 'mastery'];
    otherKeys.forEach(key => {
      if (stats[key] !== undefined) {
        html += `
          <div class="stat-row full-width">
            <span class="stat-label">${this.formatLabel(key)}:</span>
            <span class="stat-value">${stats[key]}</span>
          </div>
        `;
      }
    });

    html += '</div>';
    return html;
  }

  renderLore() {
    if (!this.data.lore) return '';
    return `<div class="card-lore">${this.data.lore}</div>`;
  }

  relocateContent() {
    const wrapper = this.container;
    const textContainer = wrapper.querySelector('.creature-text-content');

    if (!textContainer) {
      console.error('creature-text-content не найден');
      return;
    }

    let nextSibling = wrapper.nextSibling;
    const contentToMove = [];
    const stopTags = ['h2', 'hr'];

    while (nextSibling) {
      const tagName = nextSibling.tagName?.toLowerCase();

      if (stopTags.includes(tagName)) {
        break;
      }

      if (nextSibling.nodeType === Node.TEXT_NODE && !nextSibling.textContent.trim()) {
        nextSibling = nextSibling.nextSibling;
        continue;
      }

      contentToMove.push(nextSibling);
      nextSibling = nextSibling.nextSibling;
    }

    if (contentToMove.length > 0) {
      contentToMove.forEach(node => {
        textContainer.appendChild(node);
      });
    }
  }

  updateData(newData) {
    this.data = { ...this.data, ...newData };
    this.render();
    this.relocateContent();
  }

  destroy() {
    this.container.innerHTML = '';
  }

  static createAll(containerSelector, creaturesData, options = {}) {
    const containers = document.querySelectorAll(containerSelector);
    containers.forEach((container, index) => {
      const creatureKey = container.dataset.creatureKey || Object.keys(creaturesData)[index];
      const creature = creaturesData[creatureKey];
      if (creature) {
        new CreatureCard(container, { ...creature, key: creatureKey }, options);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const containers = document.querySelectorAll('[data-creature-module]');

  if (window.creaturesData && containers.length) {
    CreatureCard.createAll(
      '[data-creature-module]',
      window.creaturesData.creatures,
      { imageUrl: window.creaturesConfig?.imageUrl || '/assets/images/creatures/' }
    );
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CreatureCard;
}