import {
  renderDiagrams
} from './resources/diagrams.js';
import {
  createRequestAnimationFrameLoop,
} from './resources/good-raf.js';
import { SVG as svg } from '/3rdparty/svg.esm.js';
import {
  createElem as el, select, radio, checkbox, makeTable,
} from './resources/elem.js';
import { clamp01, hsl, lerp, rgba } from './resources/utils.js';

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
  '🟨': 1,
  '🟦': 2,
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

const unicodeBinColorsToCSS = {
  '🟥': '#800',
  '🟨': '#880',
  '🟦': '#008',
};

const setTranslation = (e, x, y) => e.attr({transform: `translate(${x}, ${y})`});
const range = (n, fn) => new Array(n).fill(0).map((_, v) => fn(v));
const sineOut = t => 1 - Math.cos(t * Math.PI * 0.5);

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
  add(generator) {
    const genStack = [generator];
    this.addQueue.push(genStack);
  }
  remove(generator) {
    this.removeQueue.add(generator);
  }
  reset() {
    this.generatorStacks.length = 0;
    this.addQueue.length = 0;
    this.removeQueue.clear();
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
};

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

function makeComputeDiagram(diagramDiv, uiDiv) {
  let elapsedTime = 0;
  let deltaTime = 0;
  let speed = 1;
  let stepCount = 0;
  let targetStepCount = -1;
  let playing = true;

  const speeds = [0.25, 0.5, 1, 2];

  const resetSteps = [];
  const runners = [];

  const reset = () => {
    stepCount = 0;
    elapsedTime = 0;
    deltaTime = 0;
    runners.forEach(runner => runner.reset());
    resetSteps.forEach(fn => fn());
  };
  const stepBack = () => {
    const targetStepCount = stepCount - 1;
    reset();
  };
  const stepForward = () => {
    const targetStepCount = stepCount + 1;
  };
  const playPause = function() {
    playing = !playing;
    const play = this.querySelector('[data-id=play]');
    const pause = this.querySelector('[data-id=pause]');
    play.style.display = playing ? 'none' : '';
    pause.style.display = playing ? '' : 'none';
  };

  uiDiv.appendChild(el('div', { className: 'ui'}, [
    el('button', {type: 'button', onClick: reset }, [el('img', {src: '/webgpu/lessons/resources/rewind.svg'})]),
    el('button', {type: 'button', onClick: stepBack }, [el('img', {src: '/webgpu/lessons/resources/stepbackward.svg'})]),
    el('button', {type: 'button', onClick: stepForward }, [el('img', {src: '/webgpu/lessons/resources/stepforward.svg'})]),
    el('button', {type: 'button', onClick: playPause }, [
      el('img', { dataset: {id: 'pause'}, src: '/webgpu/lessons/resources/pause.svg'}),
      el('img', { style: { display: 'none' }, dataset: {id: 'play'}, src: '/webgpu/lessons/resources/play.svg'}),
    ]),
    select('', ['¼x', '½x', '1x', '2x'], 2, function(ndx) {
      speed = speeds[ndx];
    }),
  ]));

  function* lerpStep(fn, duration = 1) {
    let time = 0;
    for (let t = 0; t < 1;) {
      time += deltaTime * speed * (playing ? 1 : 0);
      t = targetStepCount >= 0 ? 1 : clamp01(time / duration);
      fn(t, t === 1);
      if (t < 1) {
        yield;
      }
    }
  }

  function* waitSeconds(duration) {
    yield lerpStep(_ => _, duration);
  }

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

  function createBin(draw, color, size, lockColor) {
    // [X]
    const group = draw.group();
    const rect = group.rect(size, size).fill(color).stroke('black');
    const text = makeText(group, '0').font({anchor: 'middle'});
    text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
    text.transform({translateX: size / 2, translateY: size / 2});
    const lock = group.rect(size - 4, size - 4).move(2, 2).fill('none').stroke(lockColor).attr({'stroke-width': 4}).hide();
    const lockText = group.text('0').font({
      family: 'monospace',
      weight: 'bold',
      size: '8',
    }).move(0, -2).fill('rgba(0, 0, 0, 0.5)').hide();
    return {
      group,
      text,
      rect,
      lock,
      lockText,
    };
  }

  // [0]
  // [0]
  // [0]
  const kBins = '🟥🟨🟦'.match(/../g);
  function createChunk(draw, size, lockColor) {
    const group = draw.group();
    const bins = kBins.map((color, binNdx) => {
      const bin = createBin(group, unicodeBinColorsToCSS[color], size, lockColor);
      bin.group.transform({translateY: binNdx * size});
      return bin;
    });
    return {
      group,
      bins,
    };
  }

  function* scrollText(instructionGroup, instructions, text, duration = 0.5) {
    instructions[1].text(text);
    yield lerpStep(t => {
      const y = lerp(0, -8, sineOut(t));
      instructionGroup.transform({translateY: y});
    }, duration);
    instructions[0].text(text);
    instructions[1].text('');
    instructionGroup.transform({translateY: 0});
  }

  function* setInstructions(instructionGroup, instructions, text) {
    yield scrollText(instructionGroup, instructions, text);
  }

  // [-]
  // [-]
  // [-]
  function createInvocation(draw, size, id) {
    const group = draw.group();
    group.rect(size, size * 1.5).fill('#444').stroke('#000');
    group.rect(size, size * 0.5).fill('#ccc');
    const maskGroup = group.group();
    const instructionsGroup = maskGroup.group();
    instructionsGroup.font({
      family: 'monospace',
      weight: 'bold',
      size: '6',
    });
    const instructions = range(2, i => instructionsGroup.text('-').move(2, 1.8 + i * 8));
    const mask = group.rect(size, size * 0.5).fill('#fff');
    maskGroup.maskWith(mask);

    const color = group.rect(size, size / 2).move(0, size / 2).fill('#888');
    const text = makeText(group, '0').font({anchor: 'middle', size: '8'});
    //group.text(id).font({
    //  family: 'monospace',
    //  weight: 'bold',
    //  size: '8',
    //}).move(0, -2).fill('rgba(0, 0, 0, 0.5)');
    setTranslation(text, size / 2, size * 1.4);
    const lock = group
        .polygon([[0, 0], [1, 0], [1, 1], [0, 1]])
        .move(size, size * 0.5)
        .fill(hsl(1 / 12 + id * 0.1, 0.7, lerp(0.4, 0.8, id / 2)))
        .stroke({width: 0.5})
        .hide();
    const lockStop = group.image('/webgpu/lessons/resources/stop.svg').size(size, size).move(0, size * 0.5).hide();
    const barrier = group.image('/webgpu/lessons/resources/barrier.svg').size(size, size).move(0, size * 0.5).hide();
    const plus = group.group();
    plus.rect(size / 4, size / 2).center(size / 2, size);
    plus.rect(size / 2, size / 4).center(size / 2, size);
    plus.hide();
    return {
      group,
      color,
      text,
      lock,
      lockStop,
      barrier,
      plus,
      setInstructions: text => setInstructions(instructionsGroup, instructions, text),
    };
  }

  const size = 20;
  const kWaveSize = 3;
  const kInvocationHeight = 1.75;
  const kWorkgroupHeight = kInvocationHeight * kWaveSize * size;

  function createWorkgroup(draw, size, lockColor) {
    const group = draw.group();
    group.rect(size * 3, size * 5.5).move(size * -0.25, size * -0.25).fill('rgba(255, 255, 255, 0.125)');
    const invocations = [];
    for (let i = 0; i < kWaveSize; ++i) {
      const invocation = createInvocation(group, size, i);
      invocation.group.transform({translateX: 0, translateY: i * size * 1.75});
      invocations.push(invocation);
    }
    const chunk = createChunk(group, size, lockColor);
    chunk.group.transform({translate: [size * 1.5, size * 1]});
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

  const width = image[0].length;
  const height = image.length;
  const imageWidth = width * size;
  const imageHeight = height * size;
  const draw = svg().addTo(diagramDiv).viewbox(0, 0, imageWidth + size * 9, imageHeight + size * 8.5);

  const oMarker = draw.marker(size + 2, size + 2, function(add) {
    add.circle(size).fill('none').stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)').attr({orient: 'auto'});
  });

  const lockGradient = draw.gradient('linear', function(add) {
    add.stop(0, '#fd0');
    add.stop(0.3, '#f80');
    add.stop(1, '#640');
  }).from(0, 0).to(0.5, 1);

  const img = createImage(draw, image, size);
  const imgY = kWorkgroupHeight + size * 2;
  img.group.transform({translateY: imgY});

  setTranslation(createLabel(draw, 'texture'), imageWidth / 2, imageHeight + imgY + size * 0.5);
  setTranslation(createLabel(draw, 'bins'), imageWidth + size * 5, imageHeight + imgY + size * 0.5);

  const numChunks = 14;
  const chunks = [];
  const chunkStorage = [];
  for (let i = 0; i < numChunks; ++i) {
    const x = i % (numChunks / 2);
    const y = i / (numChunks / 2) | 0;
    const chunk = createChunk(draw, size, lockGradient);
    chunk.group.transform({translateX: imageWidth + size * 1.5 + x * size, translateY: imgY + size * 0.25 + size * 3.5 * y});
    chunks.push(chunk);
    chunkStorage.push(new Array(kBins).fill(0));
  }

  setTranslation(createLabel(draw, 'workgroups'), size * 7.5, size * 0.5);
  const numWorkgroups = 4;
  const workGroups = [];
  for (let i = 0; i < numWorkgroups; ++i) {
    const workGroup = createWorkgroup(draw, size, lockGradient);
    workGroup.group.transform({translateX: size * 1 + size * (kWaveSize + .5) * i, translateY: size * 1.5});
    workGroups.push(workGroup);
  }

  const workForWorkgroups = [];

  workGroups.forEach((workgroup, workgroupId) => {
    const workForCores = [];
    const workgroupStorage = new Array(kWaveSize).fill(0);
    let activeCount = 0;
    const workgroupBinLocked = new Array(workgroup.invocations.length).fill(false);
    let workgroupBarrierCount = 0;

    function* workgroupBarrier() {
      ++workgroupBarrierCount;
      while (workgroupBarrierCount !== workgroup.invocations.length) {
        yield;
      }
      yield;  // need to wait for all invocations to exit loop
      --workgroupBarrierCount;
    }

    workgroup.invocations.map((invocation, id) => {
      const toInvocation = getTransformToElement(draw.node, invocation.group.node);
      const p = new DOMPoint(size / 2, size).matrixTransform(toInvocation);

      const ig = draw.group();
      const sx = p.x;
      const sy = p.y;
      let ex = sx;
      let ey = sy;

      let markerCircle;
      const oMarker = draw.marker(size + 2, size + 2, function(add) {
        markerCircle = add.circle(size).fill('none').stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)').attr({orient: 'auto'});
      });
      const line = ig.line(sx, sy, ex, ey)
        .stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)')
        .marker('end', oMarker);
      const rect = ig.rect(10, 10).center(0, 0).fill('none').stroke('#000').hide();
      const text = makeText(ig, '').font({anchor: 'middle'});
      text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
      text.transform({translate: p});

      function* goto(targetX, targetY, duration = 1) {
        yield lerpStep(t => {
          const x = lerp(ex, targetX, t);
          const y = lerp(ey, targetY, t);
          line.plot(sx, sy, x, y);
          rect.transform({translate: [x, y]});
          text.transform({translate: [x, y]});
        }, duration);
        yield waitSeconds(0.25);
        ex = targetX;
        ey = targetY;
      }

      function* scaleAndFade(group) {
        group.show();
        yield lerpStep(t => {
          group.fill(rgba(255, 255, 255, 1 - t)).transform({scale: 1 + t});
        });
        group.hide();
      }

      const runner = new CoroutineRunner();
      runner.add(function* doit() {
        for (;;) {
          while (workForCores.length === 0) {
            yield;
          }
          ++activeCount;
          const { global_invocation_id, local_invocation_id } = workForCores.shift();
          workgroupStorage[local_invocation_id.x] = 0;
          workgroup.chunk.bins[local_invocation_id.x].text.text('0');

          const tx = global_invocation_id.x * kWaveSize + local_invocation_id.x;
          const ty = global_invocation_id.y;

          // read texture
          yield invocation.setInstructions('texSamp');
          yield goto((tx + 0.5) * size, imgY + (ty + 0.5) * size);
          const texel = image[ty][tx];
          const color = unicodeColorsToCSS[texel];
          rect.show();
          rect.fill(color);
          yield goto(sx, sy);
          invocation.color.fill(color);
          rect.hide();

          const binNdx = texelColorToBinNdx[texel];

          // wait for bin to be free
          yield invocation.setInstructions('atmc+');
          invocation.lockStop.show();
          while (workgroupBinLocked[binNdx]) {
//            markerCircle.stroke({width: 5, color: 'red'});//rgba(255, 255, 0, ${elapsedTime * 10 % 1 * 0.5})`);
            yield;
          }
          invocation.lockStop.hide();
//          markerCircle.stroke('rgba(255, 255, 255, 0.25)');

          // lock bin
          workgroupBinLocked[binNdx] = true;
          const workgroupBin = workgroup.chunk.bins[binNdx];
          const binPosition = getBinPosition(draw, workgroupBin, size);
          workgroupBin.lock.show();
          //workgroupBin.lockText.text(local_invocation_id.x).show();
          {
            const toInvocation = getTransformToElement(invocation.group.node, workgroupBin.group.node);
            const p = new DOMPoint(0, 0).matrixTransform(toInvocation);
            invocation.lock.show();
            const lx0 = size;
            const ly0 = size * 0.5;
            const [lx1, ly1] = [p.x, p.y];
            invocation.lock.plot([
              [lx0, ly0],
              [lx1, ly1 + size * 0.25],
              [lx1, ly1 + size * 0.75],
              [lx0, ly0 + size * 0.5],
            ]).fill(color);
          }

          // get bin value
          yield goto(...binPosition);
          const value = workgroupStorage[binNdx];
          text.text(value);
          yield goto(sx, sy);

          // store bin value
          text.text('');
          invocation.text.text(value);
          yield;
          // inc
          invocation.text.text(value + 1);
          text.text('');
          yield scaleAndFade(invocation.plus);
          text.text(value + 1);
          yield goto(...binPosition);
          workgroupStorage[binNdx] = value + 1;
          workgroupBin.text.text(value + 1);
          text.text('');
          yield goto(sx, sy);

          // unlock bin
          workgroupBinLocked[binNdx] = false;
          workgroupBin.lock.hide();
          workgroupBin.lockText.hide();
          invocation.lock.hide();

          // wait for others
          invocation.color.fill('#888');
          invocation.barrier.show();
          yield invocation.setInstructions('wkbarrier');
//          markerCircle.stroke('rgba(0, 0, 0, 0.25)');
          yield workgroupBarrier();
//          markerCircle.stroke('rgba(255, 255, 255, 0.25)');
          invocation.barrier.hide();

          // copy bin to chunk
          yield invocation.setInstructions('bin=');
          const srcBin = workgroup.chunk.bins[local_invocation_id.x];
          const srcBinPosition = getBinPosition(draw, srcBin, size);
          yield goto(...srcBinPosition);
          const binTotal = workgroupStorage[local_invocation_id.x];
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
          yield invocation.setInstructions('-');

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
        yield;
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

  let then = 0;
  const update = (now) => {
    now *= 0.001;
    deltaTime = Math.min(0.1, now - then);
    elapsedTime += deltaTime;
    then = now;

   // debugger;
    runners.forEach(runner => runner.update());
  };

  createRequestAnimationFrameLoop(diagramDiv, update);
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
    //createImage(draw, image, size);
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
    makeComputeDiagram(diagramDiv, uiDiv);
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
    //createImage(draw, image, 20);
  },
});

