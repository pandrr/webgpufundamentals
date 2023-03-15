import {
  makeStructuredView,
} from '/3rdparty/webgpu-utils.module.js';
import typeInfo from './wgsl-data-types.js';
import {
  createElem as el,
} from './elem.js';
import {
  classNames,
} from './classnames.js';

const darkColors = {
  headBgLC: [0.2, 0.8],
  memBgLC: [0.4, 0.7],
  unusedCellBg: '#333',
};
const lightColors = {
  headBgLC: [1, 0.8],
  memBgLC: [0.7, 0.7],
  unusedCellBg: '#CCC',
};
const darkMatcher = window.matchMedia('(prefers-color-scheme: dark)');
const isDarkMode = darkMatcher.matches;
const colorScheme = isDarkMode ? darkColors : lightColors;

function getColor(grid, color) {
  return color === undefined ? grid.getColor() : color;
}

function addGridType(grid, type, name, color) {
  if (type.fields) {
    for (const [fieldName, fieldType] of Object.entries(type.fields)) {
      addGridType(grid, fieldType, `${name}.${fieldName}`);
    }
  } else if (Array.isArray(type)) {
    const elemColor = getColor(grid, color);
    type.forEach((t, i) => {
      addGridType(grid, t, `${name}[${i}]`, elemColor);
    });
  } else if (type.numElements) {
    const elemColor = getColor(grid, color);
    const t = {...type};
    delete t.numElements;
    for (let i = 0; i < type.numElements; ++i) {
      addGridType(grid, t, `${name}[${i}]`, elemColor);
    }
  } else {
    // name, numElements, elementSize, alignment
    grid.addElements(name, type.type, color);
  }
}

const kNumBytesPerRow = 16;

function addTypeToGrid(name, type) {
  const grid = new GridBuilder(kNumBytesPerRow);
  addGridType(grid, type, '');
  return el('div', {className: 'type'}, [
    el('div', {className: 'name', textContent: name}),
    el('div', {className: 'tt'}, [grid.tableElem]),
  ]);
}

// ----

function showTypes(view, arrayBufferName, indent = '') {
  if (Array.isArray(view)) {
    const lines = view.map(elem => addPrefixSuffix(showTypes(elem, arrayBufferName, indent + '  '), indent + '  ', '')).flat();
    return [
      '[',
      ...lines,
      `${indent}]`,
    ];
  } else if (view.buffer instanceof ArrayBuffer) {
    const isWholeBuffer = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength;
    return [
      isWholeBuffer
         ? `new ${Object.getPrototypeOf(view).constructor.name}(${arrayBufferName}})`
         : `new ${Object.getPrototypeOf(view).constructor.name}(${arrayBufferName}, ${view.byteOffset}, ${view.length})`,
    ];
  } else {
    return [
      '{',
      ...showViews(view, arrayBufferName, indent),
      `${indent}}`,
    ];
  }
}
function showViews(views, arrayBufferName, indent = '') {
  indent += '  ';
  return Object.entries(views).map(([name, view]) => {
    const lines = showTypes(view, arrayBufferName, indent);
    return addPrefixSuffix(lines, `${indent}${name}: `, ',');
  }).flat();
}

function addPrefixSuffix(lines, prefix, suffix) {
  lines[0] = `${prefix}${lines[0]}`;
  lines[lines.length - 1] = `${lines[lines.length - 1]}${suffix}`;
  return lines;
}

function showView(values, name, arrayBufferName) {
  const lines = showTypes(values.views, arrayBufferName);
  const [prefix, suffix] = values.views.buffer instanceof ArrayBuffer
     ? [`const ${name}View: ${lines[0]}`, ',']
     : [`const ${name}Views = `, ';'];
  return addPrefixSuffix(lines, prefix, suffix);
}

export function getCodeForUniform(name, uniform) {
  const values = makeStructuredView(uniform);
  const arrayBufferName = `${name}Values`;

  const lines = [
    `const ${arrayBufferName} = new ArrayBuffer(${values.arrayBuffer.byteLength});`,
    ...showView(values, name, arrayBufferName),
  ];

  return lines.join('\n');
}

function align(v, align) {
  return Math.ceil(v / align) * align;
}

function assert(cond, msg = '') {
  if (!cond) {
    throw new Error(msg);
  }
}

const lch = (l, c, h) => `lch(${l * 100} ${c * 250 - 125} ${h * 360})`;
const px = v => `${v}px`;

const kGridSize = window.innerWidth < 400
  ? 16
  : window.innerWidth < 500
    ? 20
    : 30;

class GridBuilder {
  currentHeading;
  currentRow;
  currentCol = 0;
  numAdditions = 0;
  colorNdx = 0;

  constructor(numColumns) {
    this.numColumns = numColumns;
    this.tbodyElem = el('tbody');
    this.tableElem = el('table', {}, [this.tbodyElem]);
  }

  getColor() {
    return this.colorNdx;
  }

  addPadding(num) {
    if (num === 0) {
      return;
    }
    this.currentHeading.appendChild(el('td', {colSpan: num, textContent: '-pad-'}));
    for (let i = 0; i < num; ++i) {
      this.currentRow.appendChild(el('td', {
        style: {
          width: px(kGridSize),
          height: px(kGridSize),
        },
      }));
    }
    this.currentCol += num;
    assert(this.currentCol <= this.numColumns);
    if (this.currentCol === this.numColumns) {
      this.currentRow = undefined;
      this.currentHeading = undefined;
      this.currentCol = 0;
    }
  }

  addElements(name, type, color) {
    const info = typeInfo[type];
    const {
      size,
      align: alignment,
    } = info;
    let numElements = info.numElements;
    const elementSize = size / numElements;
    const [units, pad] = info.pad || [numElements, 0];

    const localColor = getColor(this, color);
    const hue = localColor  * 0.47 * 0.5 % 1;
    if (localColor === this.colorNdx) {
      this.colorNdx++;
    }

    const headBackgroundColor = lch(...colorScheme.headBgLC, hue);
    const memBackgroundColor = lch(...colorScheme.memBgLC, hue);

    const elementsPerUnit = units + pad;

    const aligned = align(this.currentCol, alignment);
    this.addPadding(aligned - this.currentCol);
    while (numElements > 0) {
      this._prepRow();
      const slotsAvailableInRow = this.numColumns - this.currentCol;
      assert(slotsAvailableInRow >= 0);

      const elementsAvailableInRow = Math.floor(slotsAvailableInRow / elementSize);
      assert(elementsAvailableInRow >= 0);
      const elementsInRow = Math.min(numElements, elementsAvailableInRow);
      assert(elementsInRow > 0);
      numElements -= elementsInRow;

      const bytesInRow = elementsInRow * elementSize;
      this.currentHeading.appendChild(el('td', {
          colSpan: bytesInRow,
          style: {
            backgroundColor: headBackgroundColor,
          },
        }, [
          el('div', {className: 'name', textContent: name, style: { width: px(bytesInRow * kGridSize)}}),
      ]));
      for (let e = 0; e < elementsInRow; ++e) {
        const u = e % elementsPerUnit;
        const backgroundColor = u < units ? memBackgroundColor : colorScheme.unusedCellBg;
        for (let i = 0; i < elementSize; ++i) {
          const innerClass = {};
          if (u < units) {
            innerClass[`${info.type}-${i}`] = true;
          }
          this.currentRow.appendChild(el('td', {
            className: classNames('byte', {
              'elem-start': i === 0,
              'elem-end': i === elementSize - 1,
              ...innerClass,
            }),
            style: {
              width: px(kGridSize),
              height: px(kGridSize),
              backgroundColor,
            },
          }));
        }
      }
      this.currentCol += elementsInRow * elementSize;
    }
  }

  _prepRow() {
    if (!this.currentRow || this.currentCol === this.numColumns) {
      this.currentHeading = el('tr', { className: 'field-names'}, [el('td')]);
      this.currentRow = el('tr', {}, [el('td', {class: 'offset', textContent: this.tbodyElem.children.length / 2 * 16})]);
      this.tbodyElem.appendChild(this.currentHeading);
      this.tbodyElem.appendChild(this.currentRow);
      this.currentCol = 0;
    }
  }
}

export function createByteDiagramForType(name, uniform) {
  return el('div', {className: 'byte-diagram'}, [addTypeToGrid(name, uniform)]);
}
