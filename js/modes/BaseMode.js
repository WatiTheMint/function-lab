// Базовый класс режима. Режим строит свои панели, рисует сцену на плоскости
// и (по желанию) перехватывает ввод на ней — см. PlaneController.

export class BaseMode {
  /** @param {import('../app/App.js').App} app */
  constructor(app) {
    this.app = app;
    this.cleanups = [];
  }

  get cs() { return this.app.cs; }
  get renderer() { return this.app.renderer; }

  /** Прямоугольник, который показывается при входе в режим и по «Сбросить масштаб». */
  defaultView() {
    return { xMin: -10, xMax: 10, yMin: -7, yMax: 7, uniform: true };
  }

  mount() {}

  unmount() {
    for (const fn of this.cleanups.splice(0)) fn();
  }

  /** Подписка, которая автоматически снимается при выходе из режима. */
  listen(emitter, type, fn) {
    this.cleanups.push(emitter.on(type, fn));
  }

  redraw() {
    this.app.renderer.requestRender();
  }

  draw() {}
}
