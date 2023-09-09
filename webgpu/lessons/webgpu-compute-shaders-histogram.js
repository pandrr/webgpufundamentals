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
import { clamp01, lerp } from './resources/utils.js';

const image = [
  '🟦🟥🟥🟥🟥🟦',
  '🟥🟦🟦🟦🟦🟥',
  '🟥🟨🟦🟦🟨🟥',
  '🟥🟦🟦🟦🟦🟥',
  '🟥🟨🟦🟦🟨🟥',
  '🟥🟦🟨🟨🟦🟥',
  '🟦🟥🟥🟥🟥🟦',
].map(s => s.match(/../g));

const texelColorToBinNdx = {
  '🟥': 0,
  '🟦': 1,
  '🟨': 2,
};

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

const darkColors = {
  main: '#fff',
  point: '#80DDFF80',
};
const lightColors = {
  main: '#000',
  point: '#8000FF20',
};
const darkMatcher = window.matchMedia('(prefers-color-scheme: dark)');
let colorScheme;

function* waitSeconds(duration) {
  while (duration > 0) {
    duration -= globals.deltaTime;
    yield;
  }
}

/**
 * To use
 *
 * ```
 * function* do5(msg) {
 *   for (let i = 0; i < 5; ++i) {
 *     console.log(i, msg);
 *     yield;
 *   }
 * }
 * function* do5By5() {
 *   for (let i = 0; i < 5; ++i) {
 *     yield* do5();
 *   }
 * }
 *
 * const runner = new CoroutineRunner();
 * runner.add(do5by5());
 * setInterval(() => runner.update(), 1000);
 * ```
 *
 * yielding a generator starts executing that generator until it finishes
 * runner.add adds the next step to the current sequence. In other words
 *
 * ```
 * runner.add(do5('foo'))
 * runner.add(do5('bar'))
 * ```
 *
 * Will print foo 5 times followed by bar 5 times
 *
 *
 */
class CoroutineRunner {
  constructor() {
    this.generatorStacks = [];
    this.addQueue = [];
    this.removeQueue = new Set();
  }
  isBusy() {
    return this.addQueue.length + this.generatorStacks.length > 0;
  }
  add(generator, delay = 0) {
    const genStack = [generator];
    if (delay) {
      genStack.push(waitSeconds(delay));
    }
    this.addQueue.push(genStack);
  }
  remove(generator) {
    this.removeQueue.add(generator);
  }
  update() {
    this._addQueued();
    this._removeQueued();
    for (const genStack of this.generatorStacks) {
      const main = genStack[0];
      // Handle if one coroutine removes another
      if (this.removeQueue.has(main)) {
        continue;
      }
      while (genStack.length) {
        const topGen = genStack[genStack.length - 1];
        const {value, done} = topGen.next();
        if (done) {
          if (genStack.length === 1) {
            this.removeQueue.add(topGen);
            break;
          }
          genStack.pop();
        } else if (value) {
          genStack.push(value);
        } else {
          break;
        }
      }
    }
    this._removeQueued();
  }
  _addQueued() {
    if (this.addQueue.length) {
      this.generatorStacks.splice(this.generatorStacks.length, 0, ...this.addQueue);
      this.addQueue = [];
    }
  }
  _removeQueued() {
    if (this.removeQueue.size) {
      this.generatorStacks = this.generatorStacks.filter(genStack => !this.removeQueue.has(genStack[0]));
      this.removeQueue.clear();
    }
  }
}

const getTransformToElement = (toElement, fromElement) =>
    toElement.getScreenCTM().inverse().multiply(fromElement.getScreenCTM());

const getBinPosition = (draw, bin, size) => {
  const toInvocation = getTransformToElement(draw.node, bin.group.node);
  const p = new DOMPoint(size / 2, size / 2).matrixTransform(toInvocation);
  return [p.x, p.y];
}

const updateColorScheme = () => {
  const isDarkMode = darkMatcher.matches;
  colorScheme = isDarkMode ? darkColors : lightColors;
  //hLine.stroke(colorScheme.main);
  //vLine.stroke(colorScheme.main);
  //marker.fill(colorScheme.main);
  //pointOuter.stroke(colorScheme.main);
  //pointInner.fill(colorScheme.point);
};
updateColorScheme();


function createImage(draw, image, size) {
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

function createBin(draw, color, size) {
  // [X]
  const group = draw.group();
  const rect = group.rect(size, size).fill(color).stroke('black');
  const text = makeText(group, '0').font({anchor: 'middle'});
  text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
  text.transform({translateX: size / 2, translateY: size / 2});
  return {
    group,
    text,
    rect,
  };
}

// [0]
// [0]
// [0]
const kBins = '🟥🟨🟦'.match(/../g);
function createChunk(draw, size) {
  const group = draw.group();
  const bins = kBins.map((color, binNdx) => {
    const bin = createBin(group, unicodeColorsToCSS[color], size);
    bin.group.transform({translateY: binNdx * size});
    return bin;
  });
  return {
    group,
    bins,
  };
}

// [-]
// [-]
// [-]
function createInvocation(draw, size) {
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
function createWorkgroup(draw, size) {
  const group = draw.group();
  const invocations = [];
  for (let i = 0; i < kWaveSize; ++i) {
    const invocation = createInvocation(group, size);
    invocation.group.transform({translateX: 0, translateY: i * size});
    invocations.push(invocation);
  }
  const chunk = createChunk(group, size);
  chunk.group.transform({translateX: size * 1.5});
  return {
    group,
    invocations,
    chunk,
  };
}

function createLabel(draw, text) {
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
    createImage(draw, image, size);
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
    const draw = svg().addTo(diagramDiv).viewbox(0, 0, imageWidth + size * 9, imageHeight + size * 6.0);

    const oMarker = draw.marker(size + 2, size + 2, function(add) {
      add.circle(size).fill('none').stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)').attr({orient: 'auto'});
    });

    setTranslation(createLabel(draw, 'texture'), imageWidth / 2, imageHeight + size * 5.5);

    const img = createImage(draw, image, size);
    img.group.transform({translateY: size * 5});

    setTranslation(createLabel(draw, 'bins'), imageWidth + size * 5, size * (5.5 + height));

    const numChunks = 14;
    const chunks = [];
    for (let i = 0; i < numChunks; ++i) {
      const x = i % (numChunks / 2);
      const y = i / (numChunks / 2) | 0;
      const chunk = createChunk(draw, size);
      chunk.group.transform({translateX: imageWidth + size * 1.5 + x * size, translateY: size * 5.5 + size * 3.5 * y});
      chunks.push(chunk);
    }

    setTranslation(createLabel(draw, 'workgroups'), size * 7.5, size * 0.5);
    const numWorkgroups = 4;
    const workGroups = [];
    for (let i = 0; i < numWorkgroups; ++i) {
      const workGroup = createWorkgroup(draw, size);
      workGroup.group.transform({translateX: size * 1 + size * (kWaveSize + .5) * i, translateY: size});
      workGroups.push(workGroup);
    }

    const workForWorkgroups = [];

    const runners = [];
    workGroups.forEach((workgroup, workgroupId) => {
      const workForCores = [];
      let activeCount = 0;

      workgroup.invocations.forEach((invocation, id) => {
        const toInvocation = getTransformToElement(draw.node, invocation.group.node);
        const p = new DOMPoint(size / 2, size / 2).matrixTransform(toInvocation);

        const ig = draw.group();
        const sx = p.x;
        const sy = p.y;
        let ex = sx;
        let ey = sy;

        const line = ig.line(sx, sy, ex, ey)
          .stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)')
          .marker('end', oMarker);
        const rect = ig.rect(10, 10).center(0, 0).fill('none');
        const text = makeText(ig, '').font({anchor: 'middle'});
        text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
        text.transform({translate: p});

          function* goto(targetX, targetY, duration = 1) {
          const start = performance.now() * 0.001;
          for (;;) {
            const t = clamp01((performance.now() * 0.001 - start) / duration);
            const x = lerp(ex, targetX, t);
            const y = lerp(ey, targetY, t);
            line.plot(sx, sy, x, y);
            rect.transform({translate: [x, y]});
            text.transform({translate: [x, y]});
            if (t === 1) {
              break;
            }
            yield;
          }
          ex = targetX;
          ey = targetY;
        }

        const runner = new CoroutineRunner();
        runner.add(function* doit() {
          for (;;) {
            while (workForCores.length === 0) {
              yield;
            }
            ++activeCount;
            const { global_invocation_id, local_invocation_id } = workForCores.shift();
console.log(global_invocation_id, local_invocation_id);

            const tx = global_invocation_id.x * kWaveSize + local_invocation_id.x;
            const ty = global_invocation_id.y;

            // read texture
            rect.fill('none');
            yield goto((tx + 0.5) * size, (ty + 5.5) * size);
            const texel = image[ty][tx];
            const color = unicodeColorsToCSS[texel];
            rect.fill(color);
            yield goto(sx, sy);
            invocation.color.fill(color);
            rect.fill('none');

            const binNdx = texelColorToBinNdx[texel];
            const workgroupBin = workgroup.chunk.bins[binNdx];
            const binPosition = getBinPosition(draw, workgroupBin, size);

            // wait for bin to be free
            // lock bin
            workgroupBin.rect.stroke('red');

            // get bin value
            yield goto(...binPosition);
            const value = 0;
            text.text(value);
            yield goto(sx, sy);

            // store bin value
            text.text('');
            invocation.text.text(value);
            yield;
            invocation.text.text(value + 1);
            text.text(value + 1);
            yield goto(...binPosition);
            workgroupBin.text.text(value + 1);
            text.text('');
            yield goto(sx, sy);

            // unlock bin
            workgroupBin.rect.stroke('black');

            // wait for others
            // copy bin to chunk
            const srcBin = workgroup.chunk.bins[local_invocation_id.x];
            const srcBinPosition = getBinPosition(draw, srcBin, size);
            yield goto(...srcBinPosition);
            const binTotal = 5;
            text.text(binTotal);
//            yield goto(sx, sy);
//            invocation.text.text(binTotal);

            const chunkAcross = (width / kWaveSize);
            const chunkNdx = global_invocation_id.x + global_invocation_id.y * chunkAcross;
            const chunk = chunks[chunkNdx];
            const chunkBin = chunk.bins[local_invocation_id.x];
            const chunkBinPosition = getBinPosition(draw, chunkBin, size);
            yield goto(...chunkBinPosition);
            chunkBin.text.text(binTotal);
            text.text('');
            yield goto(sx, sy);
            invocation.color.fill('#888');
            invocation.text.text('');

            --activeCount;
          }
        }());

        invocation.runner = runner;
        runners.push(runner);
      });

      const runner = new CoroutineRunner();
      runners.push(runner);
      runner.add(function* startInvocations() {
        for (;;) {
          while (workForWorkgroups.length === 0) {
            yield;
          }
          const global_invocation_id = workForWorkgroups.shift();
          for (let i = 0; i < kWaveSize; ++i) {
            workForCores.push({global_invocation_id, local_invocation_id: {x: i}});
          }
          while (activeCount > 0) {
            yield;
          }
        }
      }());
    });

    // None of this code makes any sense. Don't look at it as an example
    // of how the GPU actually runs.
    const runner = new CoroutineRunner();
    runners.push(runner);
    runner.add(function* dispatcher() {
//      const waves = [...workGroups];

      function dispatchWorkgroups(width, depth) {
        for (let y = 0; y < depth; ++y) {
          for (let x = 0; x < width; ++x) {
            workForWorkgroups.push({x, y});
          }
        }
      }

      // make list of workgroup to dispatch
      dispatchWorkgroups(width / kWaveSize, height);
      console.log(workForWorkgroups.slice());

      for (;;) {
        yield;
      }
      /*
      while (workForWorkgroups.length) {
        // wait for a workgroup
        while (waves.length === 0) {
          yield;
        }

        const wave = waves.shift();
        const work = work.shift();

        if ()
      }
      */

    }());

    if (false) {
      const sx = 10;
      const sy = 10;
      let ex = 50;
      let ey = 60;

      let logCount = 1000;
      const log = (...args) => {
        if (logCount > 0) {
          --logCount;
          console.log(...args);
        }
      };

        const line = draw.line(sx, sy, ex, ey)
          .stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)')
          .marker('end', oMarker);

        function* goto(targetX, targetY, duration = 1) {
          log('goto-start');
          const start = performance.now() * 0.001;
          for (;;) {
            const t = clamp01((performance.now() * 0.001 - start) / duration);
            const x = lerp(ex, targetX, t);
            const y = lerp(ey, targetY, t);
            log('goto:', t, x, y);
            line.plot(sx, sy, x, y);
            if (t === 1) {
              break;
            }
            yield;
          }
          ex = targetX;
          ey = targetY;
          log('goto-end');
        }

        const runner = new CoroutineRunner();
        runner.add(function* doit() {
          for (;;) {
            log('start');
            yield goto(100, 110);
            log('middle');
            yield goto(50, 60);
            log('end');
          }
        }());
        runners.push(runner);
    }


    const update = () => {
     // debugger;
      runners.forEach(runner => runner.update());
    };


    createRequestAnimationFrameLoop(elem, update);
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
    createImage(draw, image, 20);
  },
});

