// ThemeManager — светлая / тёмная тема. По умолчанию следует системной настройке,
// выбор пользователя сохраняется.

import { EventEmitter } from './EventEmitter.js';
import { storage } from '../ui/dom.js';

const KEY = 'fl.theme';

export class ThemeManager extends EventEmitter {
  constructor() {
    super();
    this.pref = storage.get(KEY, 'system'); // 'light' | 'dark' | 'system'
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.media.addEventListener('change', () => {
      if (this.pref === 'system') this.apply();
    });
    this.apply();
  }

  get resolved() {
    if (this.pref === 'light' || this.pref === 'dark') return this.pref;
    return this.media.matches ? 'dark' : 'light';
  }

  set(pref) {
    this.pref = pref;
    storage.set(KEY, pref);
    this.apply();
  }

  toggle() {
    this.set(this.resolved === 'dark' ? 'light' : 'dark');
  }

  apply() {
    const theme = this.resolved;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0f17' : '#f4f6fa');
    this.emit('change', theme);
  }
}
