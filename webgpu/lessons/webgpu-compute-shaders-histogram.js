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
].map(s => s.match(/../g));
const unicodeColorsToCSS = {
  '⬛️': 'black',
  '🟥': 'red',
  '🟧': 'orange',
  '🟨': 'yellow',
  '🟩': 'green',
  '🟦': 'blue',
  '🟪': 'purple',
  '🟫': 'brown',
  '⬜️': 'white',
};

const setTranslation = (e, x, y) => e.attr({transform: `translate(${x}, ${y})`});

function drawImage(draw, image, size) {
  const group = draw.group();
  image.forEach((pixels, y) => {
    pixels.forEach((pixel, x) => {
      group.rect(size, size).move(x * size, y * size).fill(unicodeColorsToCSS[pixel]);
    });
  });
  return {
    group,
  };
}

const makeText = (parent, t) => {
  return parent.text(t)
    .font({
      family: 'monospace',
      weight: 'bold',
      size: '10',
    })
    .css({
      filter: `
        drop-shadow( 1px  0px 0px #fff) 
        drop-shadow( 0px  1px 0px #fff) 
        drop-shadow(-1px  0px 0px #fff) 
        drop-shadow( 0px -1px 0px #fff) 
      `,
    });
};

function drawBin(draw, color, size) {
  // [X]
  const group = draw.group();
  group.rect(size, size).fill(color).stroke('black');
  const text = makeText(group, '0').font({anchor: 'middle'});
  text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
  setTranslation(text, size / 2, size / 2);
  return {
    group,
    text,
  };
}

// [0]
// [0]
// [0]
const kBins = '🟥🟨🟦'.match(/../g);
function drawChunk(draw, size) {
  const group = draw.group();
  const bins = kBins.map((color, binNdx) => {
    const bin = drawBin(group, unicodeColorsToCSS[color], size);
    bin.group.move(0, binNdx * size);
    return bin;
  });
  return {
    group,
    bins,
  };
}

// [-][-][-]
function drawInvocation(draw, size) {
  const group = draw.group();
  group.rect(size, size).fill('#444').stroke('#000');
  const color = group.rect(size, size / 2).fill('#888');
  const text = makeText(group, '0').font({anchor: 'middle', size: '8'});
  setTranslation(text, size / 2, size * 0.9);
  return {
    group,
    color,
    text,
  };
}

const kWaveSize = 3;
function drawWorkgroup(draw, size) {
  const group = draw.group();
  const invocations = [];
  for (let i = 0; i < kWaveSize; ++i) {
    const invocation = drawInvocation(group, size);
    invocation.group.move(i * size, 0);
    invocations.push(invocation);
  }
  return {
    group,
    invocations,
  };
}

function drawLabel(draw, text) {
  return draw.text(text)
    .font({
      family: 'monospace',
      weight: 'bold',
      size: '10',
      anchor: 'middle',
    })
    .attr({
      class: 'svg-main-text-color-fill',
      'dominant-baseline': 'central',
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
    const width = image[0].length;
    const height = image.length;
    const size = 20;
    const totalWidth = width * size;
    const totalHeight = height * size;
    const draw = svg().addTo(diagramDiv).viewbox(0, 0, totalWidth, totalHeight);
    drawImage(draw, image, size);
  },
  /*
   [ | | ] [ | | ]
   [ | | ] [ | | ]

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
    const width = image[0].length;
    const height = image.length;
    const size = 20;
    const imageWidth = width * size;
    const imageHeight = height * size;
    const draw = svg().addTo(diagramDiv).viewbox(0, 0, imageWidth + size * 3, imageHeight + size * 3.5);

    const img = drawImage(draw, image, size);
    img.group.move(0, size * 3.5);

    const chunk = drawChunk(draw, size);
    setTranslation(chunk.group, imageWidth + size * 1.5, size * 5.5);
    setTranslation(drawLabel(draw, 'bins'), imageWidth + size * 2, size * 5);

    setTranslation(drawLabel(draw, 'workgroup'), size * 2.5, size * 0.5);
    const workGroup = drawWorkgroup(draw, size);
    workGroup.group.move(size, size);
    //createRequestAnimationFrameLoop(elem, update);
  },
  /*
   [ | | ] [ | | ]
   [ | | ] [ | | ]

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
   [ | | ] [ | | ]
   [ | | ] [ | | ]

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
   [ | | ] [ | | ]
   [ | | ] [ | | ]

   +-----+
   |.....|          []
   |.....|          []
   |.....|          []
   +-----+

   [ | | ] [ | | ]
   [ | | ] [ | | ]

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

