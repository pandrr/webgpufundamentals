import {
  renderDiagrams
} from './resources/diagrams.js';
import {
  createRequestAnimationFrameLoop,
} from './resources/good-raf.js';
import { SVG as svg } from '/3rdparty/svg.esm.js';
import {
  createElem as el, radio, checkbox, makeTable,
} from './resources/elem.js';

const image = [
  '🟦🟥🟥🟥🟦',
  '🟥🟦🟦🟦🟥',
  '🟥🟨🟦🟨🟥',
  '🟥🟦🟦🟦🟥',
  '🟥🟨🟨🟨🟥',
  '🟥🟦🟦🟦🟥',
  '🟦🟥🟥🟥🟦',
];
const unicodeColors = {
  '🟥': 'red',
  '🟨': 'yellow',
  '🟦': 'blue',
  '🟩': 'green',
  '🟫': 'brown',
  '🟧': 'orange',
  '🟪': 'purple',
  '⬜️': 'white',
  '⬛️': 'black',
};

function drawImage(draw, image, size) {
  image.forEach((line, y) => {
    const pixels = line.match(/../g);
    pixels.forEach((pixel, x) => {
      draw.rect(size, size).move(x * size, y * size).fill(unicodeColors[pixel]);
    });
  });
}

renderDiagrams({
  /*
   +-----+
   |.....|
   |.....|
   |.....|
   +-----+
  */
  image(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
    const totalWidth = 100;
    const totalHeight = 140;
    const draw = svg().addTo(diagramDiv).viewbox(0, 0, totalWidth, totalHeight);
    drawImage(draw, image, 20);
  },
  /*
   +-----+
   |.....|          []
   |.....|          []
   |.....|          []
   +-----+
  */
  single(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
  },
  /*
   +-----+
   |.....|          []
   |.....|          []
   |.....|          []
   +-----+
  */
  race(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
  },
  /*
   +-----+
   |.....|          []
   |.....|          []
   |.....|          []
   +-----+
  */
  noRace(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
  },
  /*
   +-----+
   |.....|          []
   |.....|          []
   |.....|          []
   +-----+

   [][][][][][][][][][]
   [][][][][][][][][][]
   [][][][][][][][][][]
  */
  chunks(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
  },
  /*
    [][][][][][][][][][]
    [][][][][][][][][][]
    [][][][][][][][][][]
  */
  reduce(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
    const totalWidth = 400;
    const totalHeight = 400;
    const draw = svg().addTo(diagramDiv).viewbox(0, 0, totalWidth, totalHeight);
    drawImage(draw, image, 20);
  },
});

