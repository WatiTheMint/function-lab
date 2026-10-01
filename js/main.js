// Точка входа Function Lab.

import { App } from './app/App.js';

function boot() {
  try {
    window.functionLab = new App();
  } catch (err) {
    console.error(err);
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:auto 16px 16px;padding:16px;border-radius:12px;background:#fdeceb;color:#991b1b;font:14px system-ui';
    box.textContent = `Не удалось запустить приложение: ${err.message}`;
    document.body.append(box);
  }
}

boot();
