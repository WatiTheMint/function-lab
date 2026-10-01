// App — собирает модули вместе: тема, плоскость, ввод, режимы, вкладки, справка.

import { ThemeManager } from '../core/ThemeManager.js';
import { CoordinateSystem } from '../core/CoordinateSystem.js';
import { GraphRenderer } from '../core/GraphRenderer.js';
import { PlaneController } from '../core/PlaneController.js';
import { FunctionManager } from '../core/FunctionManager.js';
import { formatNumber } from '../core/format.js';
import { clear, h } from '../ui/dom.js';
import { hydrateIcons, icon } from '../ui/icons.js';
import { resetHints } from '../ui/Hint.js';
import { showToast } from '../ui/Toast.js';
import { createModes } from '../modes/index.js';

const $ = (id) => document.getElementById(id);

export class App {
  constructor() {
    this.theme = new ThemeManager();
    this.cs = new CoordinateSystem();
    this.canvas = $('plane');
    this.renderer = new GraphRenderer(this.canvas, this.cs);
    this.functions = new FunctionManager();
    this.left = $('panel-left');
    this.right = $('panel-right');
    this.footer = $('stage-footer');
    this.overlay = $('plane-overlay');
    this.coordChip = $('coord-chip');
    this.views = {};
    this.mode = null;
    // Пока пользователь сам не двигал плоскость, вид подстраивается под размер окна.
    this.viewTouched = false;

    this.controller = new PlaneController(this.canvas, this.cs, {
      onHover: (p) => this.showCoords(p),
      onReset: () => this.resetView(),
      onUserView: () => { this.viewTouched = true; },
    });
    this.cs.on('resize', () => {
      if (this.mode && !this.viewTouched) this.resetView(false);
    });

    this.modes = createModes(this);
    this.tabs = [...document.querySelectorAll('.modes [role="tab"]')];

    hydrateIcons();
    this.wireHeader();
    this.wirePlaneControls();
    this.wireHelp();
    this.theme.on('change', () => this.onTheme());
    this.onTheme();

    this.renderer.resize();
    window.addEventListener('hashchange', () => this.switchTo(this.modeFromHash()));
    this.switchTo(this.modeFromHash());
  }

  modeFromHash() {
    const id = location.hash.slice(1);
    return this.modes[id] ? id : 'graph';
  }

  // ─────────────── Режимы ───────────────

  switchTo(id) {
    if (!this.modes[id] || this.mode?.id === id) return;
    if (this.mode) {
      this.views[this.mode.id] = this.viewTouched ? this.cs.view : null;
      this.mode.unmount();
    }
    for (const el of [this.left, this.right, this.footer, this.overlay]) clear(el);
    this.showCoords(null);
    this.left.scrollTop = 0;
    this.right.scrollTop = 0;

    this.mode = this.modes[id];
    for (const tab of this.tabs) {
      const active = tab.dataset.mode === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    $('workspace').setAttribute('aria-labelledby', `tab-${id}`);
    this.controller.stopAnimation();
    this.controller.setDelegate(this.mode);
    this.renderer.setScene(this.mode);
    this.mode.mount();
    this.viewTouched = Boolean(this.views[id]);
    if (this.views[id]) this.cs.setView(this.views[id]);
    else this.resetView(false);
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    this.renderer.requestRender();
  }

  resetView(animate = true) {
    this.viewTouched = false;
    const v = this.mode.defaultView();
    const target = this.cs.viewForRect(v.xMin, v.xMax, v.yMin, v.yMax, { uniform: v.uniform !== false });
    if (animate) this.controller.animateTo(target, 320);
    else this.cs.setView(target);
  }

  /** Плашка с формулой задания в углу плоскости (видна и на телефоне, где панели ниже). */
  setBadge(html) {
    let el = this.overlay.querySelector('.plane-badge');
    if (!html) {
      el?.remove();
      return;
    }
    if (!el) {
      el = h('div', { class: 'plane-badge', 'aria-hidden': 'true' });
      this.overlay.prepend(el);
    }
    el.innerHTML = html;
  }

  setPlaneDescription(text) {
    $('plane-desc').textContent = text;
    this.canvas.setAttribute('aria-label', `Координатна площина. ${text}`);
  }

  // ─────────────── Шапка ───────────────

  wireHeader() {
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        location.hash = tab.dataset.mode;
      });
      tab.addEventListener('keydown', (e) => {
        const i = this.tabs.indexOf(tab);
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % this.tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + this.tabs.length) % this.tabs.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = this.tabs.length - 1;
        if (j === null) return;
        e.preventDefault();
        this.tabs[j].focus();
        location.hash = this.tabs[j].dataset.mode;
      });
    }
    $('theme-btn').addEventListener('click', () => this.theme.toggle());
  }

  onTheme() {
    const dark = this.theme.resolved === 'dark';
    const btn = $('theme-btn');
    btn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    btn.setAttribute('aria-label', dark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему');
    btn.title = dark ? 'Світла тема' : 'Темна тема';
    // CSS-переменные обновляются синхронно после смены data-theme
    this.renderer.readColors();
    this.mode?.onTheme?.();
  }

  wirePlaneControls() {
    $('zoom-in').addEventListener('click', () => { this.viewTouched = true; this.controller.zoomBy(1.5); });
    $('zoom-out').addEventListener('click', () => { this.viewTouched = true; this.controller.zoomBy(1 / 1.5); });
    $('zoom-reset').addEventListener('click', () => this.resetView());
  }

  showCoords(p) {
    const chip = this.coordChip;
    if (!p) {
      chip.classList.remove('is-visible');
      return;
    }
    const x = formatNumber(p.x, { decimals: this.cs.decimalsX() }) ?? '—';
    const y = formatNumber(p.y, { decimals: this.cs.decimalsY() }) ?? '—';
    chip.innerHTML = `<span><i>x</i> = ${x}</span><span><i>y</i> = ${y}</span>`;
    chip.classList.add('is-visible');
  }

  wireHelp() {
    const dialog = $('help-dialog');
    $('help-btn').addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
    $('hints-reset').addEventListener('click', () => {
      resetHints();
      dialog.close();
      const id = this.mode.id;
      this.mode = null;
      this.switchTo(id);
      showToast('Підказки знову видно');
    });
  }
}
