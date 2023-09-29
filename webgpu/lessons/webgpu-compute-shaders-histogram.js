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
  '🟦🟨🟨🟨🟨🟦',
  '🟦🟨🟥🟥🟨🟦',
  '🟦🟦🟥🟥🟦🟦',
  '🟥🟥🟥🟥🟥🟥',
  '🟦🟦🟥🟥🟦🟦',
  '🟦🟥🟦🟦🟥🟦',
  '🟨🟥🟦🟦🟥🟨',
  /*
  '🟦🟥🟥🟥🟥🟦',
  '🟥🟥🟦🟦🟥🟥',
  '🟥🟨🟦🟦🟨🟥',
  '🟥🟦🟦🟦🟦🟥',
  '🟥🟨🟦🟦🟨🟥',
  '🟥🟥🟨🟨🟥🟥',
  '🟦🟥🟥🟥🟥🟦',
  */
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


const imgChunkData = [];

{
  const numBins = 3;
  const numChunks = 14;
  for (let chunkNdx = 0; chunkNdx < numChunks; ++chunkNdx) {
    const data = new Array(numBins).fill(0);
    const xOff = (chunkNdx % 2) * numBins;
    const yOff = chunkNdx / 2 | 0;
    for (let x = 0; x < numBins; ++x) {
      const color = image[yOff][xOff + x];
      const binNdx = texelColorToBinNdx[color];
      ++data[binNdx];
    }
    imgChunkData.push(data);
  }
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
  const cover = group.rect(size, size).fill(rgba(0, 0, 0, 0.25)).hide();
  return {
    group,
    text,
    rect,
    lock,
    lockText,
    cover,
  };
}

// [0]
// [0]
// [0]
const kBins = '🟥🟨🟦'.match(/../g);
const numBins = kBins.length;
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

class CoroutineManager {
  #stepCount = 0;
  #runners = [];
  #targetStepCount = -1;
  #haveStep = false;

  get stepCount() {
    return this.#stepCount;
  }

  get targetStepCount() {
    return this.#targetStepCount;
  }
  set targetStepCount(v) {
    this.#targetStepCount = Math.max(0, v);
  }
  get isSeeking() {
    return this.#targetStepCount >= this.stepCount;
  }

  reset() {
    this.#stepCount = 0;
    this.#targetStepCount = -1;
    this.#haveStep = false;
    this.#runners.forEach(runner => runner.reset());
  }

  addStep() {
    this.#haveStep = true;
  }

  update() {
    this.#runners.forEach(runner => runner.update());
    if (this.#haveStep) {
      this.#haveStep = false;
      ++this.#stepCount;
    }
  }

  createRunner() {
    const runner = new CoroutineRunner(this);
    this.#runners.push(runner);
    return runner;
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
  #generatorStacks = [];
  #addQueue = [];
  #removeQueue = new Set();
  #manager = undefined;

  constructor(manager) {
    this.#manager = manager;
  }
  isBusy() {
    return this.#addQueue.length + this.#generatorStacks.length > 0;
  }
  add(generator) {
    const genStack = [generator];
    this.#addQueue.push(genStack);
  }
  remove(generator) {
    this.removeQueue.add(generator);
  }
  reset() {
    this.#generatorStacks.length = 0;
    this.#addQueue.length = 0;
    this.#removeQueue.clear();
  }
  update() {
    this.#addQueued();
    this.#removeQueued();
    for (const genStack of this.#generatorStacks) {
      const main = genStack[0];
      // Handle if one coroutine removes another
      if (this.#removeQueue.has(main)) {
        continue;
      }
      while (genStack.length) {
        const topGen = genStack[genStack.length - 1];
        const {value, done} = topGen.next();
        if (done) {
          if (genStack.length === 1) {
            this.#removeQueue.add(topGen);
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
    this.#removeQueued();
  }
  #addQueued() {
    if (this.#addQueue.length) {
      this.#generatorStacks.splice(this.#generatorStacks.length, 0, ...this.#addQueue);
      this.#addQueue = [];
    }
  }
  #removeQueued() {
    if (this.#removeQueue.size) {
      this.#generatorStacks = this.#generatorStacks.filter(genStack => !this.#removeQueue.has(genStack[0]));
      this.#removeQueue.clear();
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

function makeComputeDiagram(diagramDiv, uiDiv, {type}) {
  let elapsedTime = 0;
  let deltaTime = 0;
  let speed = 1;
  let playing = true;

  const speeds = [0.25, 0.5, 1, 2, 4];

  let diagram = createComputeDiagram();

  const reset = () => {
    elapsedTime = 0;
    deltaTime = 0;
    diagram.close();
    diagram = createComputeDiagram();
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
    el('button', {type: 'button', onClick: playPause }, [
      el('img', { dataset: {id: 'pause'}, src: '/webgpu/lessons/resources/pause.svg'}),
      el('img', { style: { display: 'none' }, dataset: {id: 'play'}, src: '/webgpu/lessons/resources/play.svg'}),
    ]),
    select('', ['¼x', '½x', '1x', '2x', '4x'], 2, function(ndx) {
      speed = speeds[ndx];
    }),
  ]));

  let then = 0;
  const update = (now) => {
    now *= 0.001;
    deltaTime = Math.min(0.1, now - then);
    elapsedTime += deltaTime;
    then = now;
    diagram.update();
  };
  createRequestAnimationFrameLoop(diagramDiv, update);

  function createComputeDiagram() {
    const size = 20;

    const {
      kWaveSize,
      chunksAcross,
      chunksDown,
      showImage,
      numWorkgroups,
      hasWorkgroupMem,
      useImageData,
    } = {
      single: {
        numWorkgroups: 1,
        kWaveSize: 1,
        hasWorkgroupMem: false,
        chunksAcross: 1,
        chunksDown: 1,
        showImage: true,
      },
      race: {
        numWorkgroups: 4,
        kWaveSize: 1,
        hasWorkgroupMem: false,
        chunksAcross: 1,
        chunksDown: 1,
        showImage: true,
      },
      noRace: {
        numWorkgroups: 4,
        kWaveSize: 1,
        hasWorkgroupMem: false,
        chunksAcross: 1,
        chunksDown: 1,
        showImage: true,
      },
      chunks: {
        numWorkgroups: 4,
        kWaveSize: 3,
        hasWorkgroupMem: true,
        chunksAcross: 7,
        chunksDown: 2,
        showImage: true,
      },
      sum: {
        numWorkgroups: 1,
        hasWorkgroupMem: false,
        kWaveSize: 3,
        chunksAcross: 7,
        chunksDown: 2,
        showImage: false,
        useImageData: true,
      },
      reduce: {
        numWorkgroups: 4,
        kWaveSize: 3,
        hasWorkgroupMem: false,
        chunksAcross: 7,
        chunksDown: 2,
        showImage: false,
        useImageData: true,
      },
    }[type];

    const numChunks = chunksAcross * chunksDown;
    const pixelsAcross = image[0].length;
    const pixelsDown = image.length;
    const imageWidthH = pixelsAcross * size;
    const imageWidth = showImage ? imageWidthH : 0;
    const imageHeight = showImage ? pixelsDown * size : 0;
    const kChunksDrawWidth = chunksAcross * size;
    const kChunkDrawHeight = size * 3.5;
    const imgPlusChunksDrawWidth = imageWidth + kChunksDrawWidth + (chunksAcross - 1) * size * 0 + size * 2.5;
    const kInvocationWidth = 2;
    const kInvocationHeight = 1.75;
    const kInvocationDrawWidth = size * (kInvocationWidth + (hasWorkgroupMem ? 0 : 1.5));
    const kWorkgroupDrawWidth  = size * (hasWorkgroupMem ? 4 : 4);
    const kWorkgroupDrawHeight = size * (kWaveSize * kInvocationHeight + 0.25);
    const kWorkgroupHeight = kInvocationHeight * kWaveSize * size;
    const drawingWidth = imageWidthH + size * 12;
    const drawingHeight = showImage
        ? imageHeight + size * 3 + kWorkgroupDrawHeight
        : kWorkgroupDrawHeight + size * 3 + chunksDown * kChunkDrawHeight + (chunksDown - 1) * size * 0.25;
    const imgX = drawingWidth / 2 - imgPlusChunksDrawWidth / 2;
    const imgY = kWorkgroupHeight + size * 2;
    const kChunksDrawX = showImage
      ? imgX + imageWidth + size * 2.5
      : drawingWidth / 2 - kChunksDrawWidth / 2;

    const coMgr = new CoroutineManager();

    function* lerpStep(fn, duration = 1) {
      let time = 0;
      for (let t = 0; t < 1;) {
        time += deltaTime * speed * (playing ? 1 : 0);
        t = coMgr.isSeeking ? 1 : clamp01(time / duration);
        fn(t, t === 1);
        if (t < 1) {
          yield;
        }
      }
    }

    function* waitSeconds(duration) {
      yield lerpStep(_ => _, duration);
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

    // [-]
    // [-]
    // [-]
    function createInvocation(draw, size, id) {
      const group = draw.group();
      const kWidth = kInvocationDrawWidth;
      group.rect(kWidth, size * 1.5).fill('#444').stroke('#000');
      group.rect(kWidth, size * 0.5).fill('#ccc');
      const maskGroup = group.group();
      const instructionsGroup = maskGroup.group();
      instructionsGroup.font({
        family: 'monospace',
        weight: 'bold',
        size: '6',
      });
      const instructions = range(2, i => instructionsGroup.text('-').move(2, 1.8 + i * 8));
      const mask = group.rect(kWidth, size * 0.5).fill('#fff');
      maskGroup.maskWith(mask);

      const color = group.group().transform({translate: [kWidth / 2 + size / 4, size * 1.5 / 2]}).rect(size / 2, size / 2).fill('#888').stroke({color: '#000', width: 0.5});
      const text = makeText(group, '0').font({anchor: 'middle', size: '8'});
      //group.text(id).font({
      //  family: 'monospace',
      //  weight: 'bold',
      //  size: '8',
      //}).move(0, -2).fill('rgba(0, 0, 0, 0.5)');
      setTranslation(text, kWidth / 2 - size * 0.5, size * (1.25 - 0.1));
      const lock = group
          .polygon([[0, 0], [1, 0], [1, 1], [0, 1]])
          .move(size, size * 0.5)
          .fill(hsl(1 / 12 + id * 0.1, 0.7, lerp(0.4, 0.8, id / 2)))
          .stroke({width: 0.5})
          .hide();
      const lockLine = group
          .line(0, 0, 1, 1)
          .stroke({color: 'red', width: size / 4})
          .hide();
      const lockStop = group.image('/webgpu/lessons/resources/stop.svg').size(size, size).move((kWidth - size) / 2, size * 0.5).hide();
      const barrier = group.image('/webgpu/lessons/resources/barrier.svg').size(size, size).move((kWidth - size) / 2, size * 0.5).hide();
      const plus = group.group();
      plus.rect(size / 4, size / 2).center(kWidth / 2 - size / 2, size);
      plus.rect(size / 2, size / 4).center(kWidth / 2 - size / 2, size);
      plus.hide();
      return {
        group,
        color,
        text,
        lock,
        lockLine,
        lockStop,
        barrier,
        plus,
        setInstructions: text => setInstructions(instructionsGroup, instructions, text),
        reset: () => {
          instructions.forEach(i => i.text('-'));
          lock.hide();
          lockStop.hide();
          lockLine.hide();
          barrier.hide();
          plus.hide();
        },
      };
    }

    function* setInstructions(instructionGroup, instructions, text) {
      coMgr.addStep();
      yield scrollText(instructionGroup, instructions, text);
    }

    function createWorkgroup(draw, size, lockColor) {
      const group = draw.group();
      group.rect(kWorkgroupDrawWidth, kWorkgroupDrawHeight).move(size * 0, size * -0.25).fill('#555');
      const invocations = [];
      for (let i = 0; i < kWaveSize; ++i) {
        const invocation = createInvocation(group, size, i);
        invocation.group.transform({translateX: size * 0.25, translateY: i * size * 1.75});
        invocations.push(invocation);
      }
      const workgroup = {
        group,
        invocations,
      };
      if (hasWorkgroupMem) {
        const chunk = createChunk(group, size, lockColor);
        chunk.group.transform({translate: [size * (kInvocationWidth + 0.75), size * 1]});
        workgroup.chunk = chunk;
      }
      return workgroup;
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

    const draw = svg().addTo(diagramDiv).viewbox(0, 0, drawingWidth, drawingHeight);

    const oMarker = draw.marker(size + 2, size + 2, function(add) {
      add.circle(size).fill('none').stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)').attr({orient: 'auto'});
    });

    const lockGradient = draw.gradient('linear', function(add) {
      add.stop(0, '#fd0');
      add.stop(0.3, '#f80');
      add.stop(1, '#640');
    }).from(0, 0).to(0.5, 1);

    if (showImage) {
      const img = createImage(draw, image, size);
      img.group.transform({translateX: imgX, translateY: imgY});
      setTranslation(createLabel(draw, 'texture'), imgX + imageWidth / 2, imageHeight + imgY + size * 0.5);
    }

    setTranslation(
        createLabel(draw, 'bins'),
        kChunksDrawX + kChunksDrawWidth / 2,
        showImage
          ? imageHeight + imgY + size * 0.5
          : imgY + kChunkDrawHeight * chunksDown + size * 0.5);

    const chunks = [];
    const chunkStorage = [];
    for (let i = 0; i < numChunks; ++i) {
      const x = i % (numChunks / 2);
      const y = chunksDown > 1 ? (i / (numChunks / 2) | 0) : 0.5;
      const chunk = createChunk(draw, size, lockGradient);
      chunk.group.transform({
        translateX: kChunksDrawX + x * size,
        translateY: imgY + size * 0.25 + kChunkDrawHeight * y});
      chunks.push(chunk);
      chunkStorage.push(new Array(kBins).fill(0));
      if (useImageData) {
        const chunkData = imgChunkData[i];
        chunkData.forEach((v, ndx) => chunk.bins[ndx].text.text(v));
      }
    }

    setTranslation(createLabel(draw, 'workgroups'), drawingWidth / 2, size * 0.5);
    const workGroups = [];
    for (let i = 0; i < numWorkgroups; ++i) {
      const workGroup = createWorkgroup(draw, size, lockGradient);
      const fullWidth = kWorkgroupDrawWidth * numWorkgroups + size * (numWorkgroups - 1) * 0.5;
      const x = (kWorkgroupDrawWidth + size * 0.5) * i;
      workGroup.group.transform({translateX: drawingWidth / 2 - fullWidth / 2 + x, translateY: size * 1.5});
      workGroups.push(workGroup);
    }

    // draw.rect(kWorkgroupDrawWidth, 8).move(drawingWidth / 2, 10).fill('green');
    // draw.rect(4, 20).move(drawingWidth / 2 - 2, 0).fill('orange');
    // draw.rect(drawingWidth - 4, 4).move(2, 0).fill('pink');

    function getChunkInfo(chunkNdx, binNdx) {
      const chunk = chunks[chunkNdx];
      const chunkBin = chunk.bins[binNdx];
      const chunkBinPosition = getBinPosition(draw, chunkBin, size);
      const chunkValue = parseInt(chunkBin.text.text());
      return {
        chunk,
        chunkBin,
        chunkBinPosition,
        chunkValue,
      };
    }

    const workForWorkgroups = [];
    const storageBinLocked = new Array(numBins).fill(0);
    let activeWorkgroupCount = 0;
    let uniformStride = 0;

    workGroups.forEach((workgroup, workgroupId) => {
      const workForCores = [];
      const workgroupStorage = new Array(kWaveSize).fill(0);
      let activeInvocationCount = 0;
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
        const toColor = getTransformToElement(draw.node, invocation.color.node);
        const toText = getTransformToElement(draw.node, invocation.text.node);
        const invPoint = new DOMPoint(kInvocationDrawWidth / 2, size).matrixTransform(toInvocation);
        // why doesn't this work?
        const colorPoint = new DOMPoint(size / 4, size / 4).matrixTransform(toColor);
        const numPoint = new DOMPoint(0, 0).matrixTransform(toText);

        const ig = draw.group();
        const sx = invPoint.x;
        const sy = invPoint.y;
        const numX = numPoint.x;
        const numY = numPoint.y - 3;
        const colX = colorPoint.x;
        const colY = colorPoint.y;
        let ex = sx;
        let ey = sy;

        let markerCircle;
        const oMarker = draw.marker(size + 2, size + 2, function(add) {
          markerCircle = add.circle(size).fill('none').stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.25)').attr({orient: 'auto'});
        });

        const line = ig.line(sx, sy, ex, ey)
          .stroke(/*colorScheme.main*/'rgba(255, 255, 255, 0.5)')
          .marker('end', oMarker)
          .hide();
        line.node.style.mixBlendMode = 'difference';
        const rect = ig.rect(10, 10).center(0, 0).fill('none').stroke({color: '#000', width: 0.5}).hide();
        const text = makeText(ig, '').font({anchor: 'middle'});
        text.attr({cx: 0, cy: 0, 'dominant-baseline': 'central'});
        text.transform({translate: colorPoint});

        function* goto(targetX, targetY, duration = 1) {
          line.show();
          markerCircle.show();
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

        function* fadeLine() {
          ex = sx;
          ey = sy;
          yield lerpStep(t => {
            const color = rgba(255, 255, 255, (1 - t) * 0.25);
            line.stroke(color);
            markerCircle.stroke(color);
          }, 0.5);
          line.hide();
          line.stroke(rgba(255, 255, 255, 0.25));
          markerCircle.stroke(rgba(255, 255, 255, 0.25));
        }

        function* scaleAndFade(group) {
          group.show();
          yield lerpStep(t => {
            group.fill(rgba(255, 255, 255, 1 - t)).transform({scale: 1 + t});
          });
          group.hide();
        }

        function* textureLoad(tx, ty, texel) {
          yield invocation.setInstructions('textureLoad(...)');
          yield goto(imgX + (tx + 0.5) * size, imgY + (ty + 0.5) * size);
          const color = unicodeColorsToCSS[texel];
          rect.show();
          rect.fill(color);
          yield goto(colX, colY);
          invocation.color.fill(color);
          rect.hide();
        }

        function* doOne(tx, ty, useBarrier) {
          // read texture
          const texel = image[ty][tx];
          const color = unicodeColorsToCSS[texel];
          yield textureLoad(tx, ty, texel);
          const binNdx = texelColorToBinNdx[texel];
          const chunk = chunks[0];
          const storageBin = chunk.bins[binNdx];

          if (useBarrier) {
            line.hide();
            markerCircle.hide();

            // wait for bin to be free
            yield invocation.setInstructions('atomicAdd(&bin[color], 1)');
            invocation.lockStop.show();
            while (storageBinLocked[binNdx]) {
              yield;
            }
            invocation.lockStop.hide();

            // lock bin
            storageBinLocked[binNdx] = true;
            storageBin.lock.show();
            {
              const toInvocation = getTransformToElement(invocation.group.node, storageBin.group.node);
              const toColor = getTransformToElement(invocation.group.node, invocation.color.node);
              const p2 = new DOMPoint(size / 2, size / 2).matrixTransform(toInvocation);
              const p1 = new DOMPoint(size / 4, size / 4).matrixTransform(toColor);
              invocation.lockLine
                .show()
                .plot(p2.x, p2.y, p1.x, p1.y)
                .stroke(color)
                .css({
                  opacity: '0.5',
                });
            }
          } else {
            yield invocation.setInstructions('bin[color] += 1');
          }

          // get value for bin
          const chunkBin = chunk.bins[binNdx];
//                const toInvocation = getTransformToElement(invocation.group.node, chunkBin.group.node);
          const chunkBinPosition = getBinPosition(draw, chunkBin, size);
          yield goto(...chunkBinPosition);

          text.text(chunkBin.text.text());

          yield goto(numX, numY);
          invocation.text.text(text.text());
          text.text('');

          // inc
          invocation.text.text(parseInt(invocation.text.text()) + 1);
          yield scaleAndFade(invocation.plus);

          // put in bin
          text.text(invocation.text.text());
          yield goto(...chunkBinPosition);
          chunkBin.text.text(text.text());
          text.text('');
          yield;

          if (useBarrier) {
            storageBinLocked[binNdx] = false;
            storageBin.lock.hide();
            storageBin.lockText.hide();
            invocation.lockLine.hide();
          }

          yield fadeLine();
          invocation.color.fill('#888');
          invocation.text.text('');
          yield invocation.setInstructions('-');
        }

        const shaders = {
          single: function*() {
            for (let ty = 0; ty < pixelsDown; ++ty) {
              for (let tx = 0; tx < pixelsAcross; ++tx) {
                yield doOne(tx, ty, false);
              }
            }
          },
          race: function*({global_invocation_id}) {
            const tx = global_invocation_id.x;
            const ty = global_invocation_id.y;
            yield doOne(tx, ty, false);
          },
          noRace: function*({global_invocation_id}) {
            const tx = global_invocation_id.x;
            const ty = global_invocation_id.y;
            yield doOne(tx, ty, true);
          },
          chunks: function*({global_invocation_id, local_invocation_id}) {
            workgroupStorage[local_invocation_id.x] = 0;
            workgroup.chunk.bins[local_invocation_id.x].text.text('0');

            const tx = global_invocation_id.x * kWaveSize + local_invocation_id.x;
            const ty = global_invocation_id.y;

            // read texture
            const texel = image[ty][tx];
            const color = unicodeColorsToCSS[texel];
            yield textureLoad(tx, ty, texel);

            const binNdx = texelColorToBinNdx[texel];
            // wait for bin to be free
            yield invocation.setInstructions('atomicAdd(bin[color], 1)');
            invocation.lockStop.show();
            while (workgroupBinLocked[binNdx]) {
              yield;
            }
            invocation.lockStop.hide();

            // lock bin
            workgroupBinLocked[binNdx] = true;
            const workgroupBin = workgroup.chunk.bins[binNdx];
            const binPosition = getBinPosition(draw, workgroupBin, size);
            workgroupBin.lock.show();
            {
              const toInvocation = getTransformToElement(invocation.group.node, workgroupBin.group.node);
              const toColor = getTransformToElement(invocation.group.node, invocation.color.node);
              const p2 = new DOMPoint(size / 2, size / 2).matrixTransform(toInvocation);
              const p1 = new DOMPoint(size / 4, size / 4).matrixTransform(toColor);
              invocation.lockLine
                .show()
                .plot(p2.x, p2.y, p1.x, p1.y)
                .stroke(color)
                .css({
                  opacity: '0.5',
                });
            }

            // get bin value
            yield goto(...binPosition);
            const value = workgroupStorage[binNdx];
            text.text(value);
            yield goto(numX, numY);

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
            //yield goto(sx, sy, 0);
            yield fadeLine();

            // unlock bin
            workgroupBinLocked[binNdx] = false;
            workgroupBin.lock.hide();
            workgroupBin.lockText.hide();
            invocation.lockLine.hide();

            // wait for others
            invocation.color.fill('#888');
            invocation.barrier.show();
            yield invocation.setInstructions('wGroupBarrier');
            yield workgroupBarrier();
            invocation.barrier.hide();

            // copy bin to chunk
            yield invocation.setInstructions('chunks[bin]=');
            const srcBin = workgroup.chunk.bins[local_invocation_id.x];
            const srcBinPosition = getBinPosition(draw, srcBin, size);
            yield goto(...srcBinPosition);
            const binTotal = workgroupStorage[local_invocation_id.x];
            text.text(binTotal);
            yield goto(numX, numY);
            invocation.text.text(binTotal);

            const chunkAcross = (pixelsAcross / kWaveSize);
            const chunkNdx = global_invocation_id.x + global_invocation_id.y * chunkAcross;
            const chunk = chunks[chunkNdx];
            const chunkBin = chunk.bins[local_invocation_id.x];
            const chunkBinPosition = getBinPosition(draw, chunkBin, size);
            yield goto(...chunkBinPosition);
            chunkBin.text.text(binTotal);
            text.text('');
            //yield goto(sx, sy, 0);
            yield fadeLine();
            invocation.color.fill('#888');
            invocation.text.text('');
            yield invocation.setInstructions('-');
          },
          sum: function*({global_invocation_id, local_invocation_id}) {

            for (let chunkNdx = 0; chunkNdx < numChunks; ++chunkNdx) {
              yield invocation.setInstructions(`total += chunks[${chunkNdx}]`);
              const { chunkBinPosition, chunkValue } = getChunkInfo(chunkNdx, local_invocation_id.x);
              yield goto(...chunkBinPosition);
              text.text(chunkValue);

              yield goto(numX, numY);
              text.text('');
              line.hide();
              markerCircle.hide();

              const total = parseInt(invocation.text.text());
              invocation.text.text(total + chunkValue);
              yield scaleAndFade(invocation.plus);
            }

            {
              text.text(invocation.text.text());
              yield invocation.setInstructions(`chunks[0][${local_invocation_id.x}] = total`);
              const { chunkBinPosition, chunkBin } = getChunkInfo(0, local_invocation_id.x);
              yield goto(...chunkBinPosition);
              chunkBin.text.text(invocation.text.text());

              for (let chunkNdx = 1; chunkNdx < numChunks; ++chunkNdx) {
                const { chunkBin } = getChunkInfo(chunkNdx, local_invocation_id.x);
                chunkBin.cover.show();
              }

              yield fadeLine();
            }
            yield invocation.setInstructions('-');
          },
          reduce: function*({global_invocation_id, local_invocation_id}) {
            //
          },
        };

        const runner = coMgr.createRunner();
        runner.add(function* doit() {
          for (;;) {
            while (workForCores.length === 0) {
              yield;
            }
            ++activeInvocationCount;
            const { global_invocation_id, local_invocation_id } = workForCores.shift();
            yield shaders[type]({global_invocation_id, local_invocation_id});
            --activeInvocationCount;
          }
        }());

        invocation.runner = runner;
      });

      const runner = coMgr.createRunner();
      runner.add(function* startInvocations() {
        for (;;) {
          while (workForWorkgroups.length === 0) {
            yield;
          }
          ++activeWorkgroupCount;
          const global_invocation_id = workForWorkgroups.shift();
          for (let i = 0; i < kWaveSize; ++i) {
            workForCores.push({global_invocation_id, local_invocation_id: {x: i}});
          }
          yield;
          while (activeInvocationCount > 0) {
            yield;
          }
          --activeWorkgroupCount;
        }
      }());
    });

    function dispatchWorkgroups(width, depth) {
      for (let y = 0; y < depth; ++y) {
        for (let x = 0; x < width; ++x) {
          workForWorkgroups.push({x, y});
        }
      }
    }

    function* waitForWorkgroups() {
      yield;
      while (activeWorkgroupCount > 0) {
        yield;
      }
      yield;
    }

    const dispatchers = {
      single: function*() {
        dispatchWorkgroups(1, 1);
      },
      race: function*() {
        dispatchWorkgroups(pixelsAcross, pixelsDown);
      },
      noRace: function*() {
        dispatchWorkgroups(pixelsAcross, pixelsDown);
      },
      chunks: function*() {
        dispatchWorkgroups(pixelsAcross / kWaveSize, pixelsDown);
      },
      sum: function*() {
        dispatchWorkgroups(1, 1);
      },
      reduce: function*() {
        let chunksLeft = numChunks;
        let i = 0;
        while (chunksLeft) {
          uniformStride = 2 ** i;
          ++i;
          const dispatchCount = Math.floor(chunksLeft / 2);
          chunksLeft -= dispatchCount;
          dispatchWorkgroups(dispatchCount, 1);
          yield waitForWorkgroups();
        }
      },
    };

    // None of this code makes any sense. Don't look at it as an example
    // of how the GPU actually runs.
    const runner = coMgr.createRunner();
    runner.add(function* dispatcher() {
  //      const waves = [...workGroups];

      // make list of workgroup to dispatch
      yield dispatchers[type]();

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

    let closed = false;

    return {
      update() {
        if (!closed) {
          coMgr.update();
        }
      },
      close() {
        if (!closed) {
          closed = true;
          draw.node.remove();
        }
      },
    };
  }
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
   []
   []
   []
  */
 imageHistogram(elem) {
    const size = 20;
    const draw = svg().addTo(elem).viewbox(0, 0, size, size * 3);
    const chunk = createChunk(draw, size, 'red');
    const pixels = image.flat();
    kBins.forEach((color, bin) => {
      const count = pixels.filter(v => v === color).length;
      chunk.bins[bin].text.text(count);
    });
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
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'single',
    });
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
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'race',
    });
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
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'noRace',
    });
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
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'chunks',
    });
  },
  /*
    [][][][][][][][][][]
    [][][][][][][][][][]
    [][][][][][][][][][]
  */
  sum(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'sum',
    });
  },
  reduce(elem) {
    const diagramDiv = el('div');
    const uiDiv = el('div');
    const div = el('div', {}, [diagramDiv, uiDiv]);
    elem.appendChild(div);
    makeComputeDiagram(diagramDiv, uiDiv, {
      type: 'reduce',
    });
  },
});

