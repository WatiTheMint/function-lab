// Реестр режимов. Чтобы добавить режим — создайте класс-наследник BaseMode и впишите его сюда
// (и кнопку-вкладку с data-mode в index.html).

import { GraphMode } from './GraphMode.js';
import { InteractivePointMode } from './InteractivePoint.js';
import { FunctionTest } from './FunctionTest.js';
import { TrainingMode } from './TrainingMode.js';

export function createModes(app) {
  return {
    graph: new GraphMode(app),
    fx: new InteractivePointMode(app),
    test: new FunctionTest(app),
    train: new TrainingMode(app),
  };
}
