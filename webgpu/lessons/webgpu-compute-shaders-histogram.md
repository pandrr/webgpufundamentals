Title: WebGPU Compute Shaders - Image Histogram
Description: Efficiently compute an image histogram.
TOC: Image Histogram

This article continues from [the article on compute shader basics](webgpu-compute-shaders.html).

This is going to be a long 2 part article and unfortunately we're going to take many steps to optimize
things. This optimization will make things faster but the output will not change so each step
will look the same as the previous step. Further, we're going to
mention speed and timing but the articles and examples would get
even longer if we added the code to do the timing so we'll leave
timing to [another article](webgpu-timing.html) and in these articles
I'll just mention my own timing and provide some run-able examples.
Hopefully this article will provide a good example of making
a compute shader.

An image histogram is where you sum up all the pixels in an image by their values or
by some measure of their values.

For example, this 6x7 image

<div class="center">
  <div>
    <div data-diagram="image" style="display: inline-block; width: 240px; max-width: 100%;"></div>
    <div style="text-align: center;">6x7</div>
  </div>
</div>

It has these colors.

<div class="center">
  <div>
    <div data-diagram="colors" style="display: inline-block; width: 240px; max-width: 100%;"></div>
  </div>
</div>

For each color we can compute a luminance level, (how bright it is). Looking online I found this
formula

```js
// Returns a value from 0 to 1 for luminance.
// where r, g, b each go from 0 to 1.
function srgbLuminance(r, g, b) {
  // from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
  return r * 0.2126 +
         g * 0.7152 +
         b * 0.0722;
}
```

Using that we can convert each value to a luminance level

<div class="center">
  <div>
    <div data-diagram="luminance" style="display: inline-block; width: 240px; max-width: 100%;"></div>
  </div>
</div>

We can decide on a number "bins". Let's decide on 3 bins. 
We can then quantize those luminance values so they select a "bin"
and add up the number of pixels that fit in each bin.

<div class="center">
  <div>
    <div data-diagram="imageHistogram" style="display: inline-block; width: 40px; max-width: 100%;"></div>
  </div>
</div>

Finally we can graph the values in those bins

<div class="center">
  <div>
    <div data-diagram="imageHistogramGraph" style="display: inline-block; width: 256px; max-width: 100%;"></div>
  </div>
</div>

That's not so interesting with just 3 bins. I graphed it with curves since there are only 3 bins.
But, if we take a picture like this

<div class="center">
  <div>
    <div><img src="../resources/images/pexels-francesco-ungaro-96938-mid.jpg" style="max-width: 700px;"></div>
    <div style="text-align: center;"><a href="https://www.pexels.com/photo/cute-kitten-hiding-behind-a-pillow-96938/">Photo by Francesco Ungaro</a></div>
  </div>
</div>

and we count up the pixel luminance values, separate them into say 256 bins, and graph them, we get something like this

<div class="webgpu_center center">
  <div>
    <div><img src="resources/histogram-luminosity-photoshop.png" style="width: 237px;" class="nobg"></div>
  </div>
</div>

Computing an image histogram is pretty simple. Let's first do it in JavaScript

Let's make a function that given an `ImageData` object, generates
a histogram. We'll actually make 4 of them. One for red values,
one for green, one for blue, and one for luminosity.

```js
function computeHistogram(numBins, imgData) {
  const {width, height, data} = imgData;
  const bins = new Array(numBins).fill(0);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const offset = (y * width + x) * 4;

      const r = data[offset + 0] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const v = srgbLuminance(r, g, b);

      const bin = Math.min(numBins - 1, v * numBins) | 0;
      ++bins[bin];
    }
  }
  return histogram;
}
```

As you can see above, we walk through each pixel. We extra r, g, and b.
We compute a luminance value. We convert that to a bin index and increment
that bin's count.

Once we have that data we can graph it. The main graph function just
draws a line for each bin multiplied by some scale and the height of
the canvas.

```js
  ctx.fillStyle = '#fff';

  for (let x = 0; x < numBins; ++x) {
    const v = histogram[x] * scale * height;
    ctx.fillRect(x, height - v, 1, v);
  }

```

Deciding on a scale appears to be just a personal choice. If you know of a good
formula for choosing a scale level a comment. Based on looking around the net
I came up with this formula for scale

```js
  const numBins = histogram.length;
  const max = Math.max(...histogram);
  const scale = Math.max(1 / max, 0.2 * numBins / numEntries);
```

Where `numEntries` is the total number of pixels in the image (ie, width * height),
and basically we're trying to scale so the bin with the most values touches the
top of the graph but, if that bin is too large then we have some ratio that appears
to produce a pleasant graph.

Putting it all together we create a 2D canvas and draw

```js
function drawHistogram(histogram, numEntries, height = 100) {
  const numBins = histogram.length;
  const max = Math.max(...histogram);
  const scale = Math.max(1 / max, 0.2 * numBins / numEntries);

  const canvas = document.createElement('canvas');
  canvas.width = numBins;
  canvas.height = height;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';

  for (let x = 0; x < numBins; ++x) {
    const v = histogram[x] * scale * height;
    ctx.fillRect(x, height - v, 1, v);
  }
}
```

Now we need to load an image. We'll use the code we
wrote in [the article on loading images](webgpu-importing-textures.html).

```js
async function main() {
  const imgBitmap = await loadImageBitmap('resources/images/pexels-francesco-ungaro-96938-mid.jpg');
```

We need get the data from an image. To do that we can draw the image
to a 2d canvas and then use `getImageData`.

```js
function getImageData(img) {
  const canvas = document.createElement('canvas');

  // make the canvas the same size as the image
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
```

We'll also write a function to display an `ImageBitmap`

```js
function showImageBitmap(imageBitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const bm = canvas.getContext('bitmaprenderer');
  bm.transferFromImageBitmap(imageBitmap);
  document.body.appendChild(canvas);
}
```

Let's add some CSS so things not displayed too big

```css
canvas {
  display: block;
  max-width: 256px;
  border: 1px solid #888;
}
```

And then what's left to do is to call the functions we wrote above.

```js
async function main() {
  const imgBitmap = await loadImageBitmap('resources/images/pexels-francesco-ungaro-96938-mid.jpg');

  const imgData = getImageData(imgBitmap);
  const numBins = 256;
  const histogram = computeHistogram(numBins, imgData);

  showImageBitmap(imgBitmap);

  const numEntries = imgData.width * imgData.height;
  drawHistogram(histogram, numEntries);
}
```

And here's the image histogram.

<!-- {{{example url="../webgpu-compute-shaders-histogram-javascript.html"}}} -->

Hopefully it was easy to follow what the JavaScript code is doing.
Let's convert it to WebGPU!

# <a id="a-comptuing-a-histogram"></a>Computing a histogram on the GPU

Let's start with the most obvious solution. We'll directly
convert the JavaScript `computeHistogram` function to WGSL.

The luminance function is pretty straight forward. Here the
JavaScript again

```js
// Returns a value from 0 to 1 for luminance.
// where r, g, b each go from 0 to 1.
function srgbLuminance(r, g, b) {
  // from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
  return r * 0.2126 +
         g * 0.7152 +
         b * 0.0722;
}
```

and here's the corresponding WGSL

```wgsl
// from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}
```

The `dot` function, which is short for "dot product", multiplies every element
of one vector with the corresponding element of another vector and then adds
the results. For `vec3f` like above, it could be defined as

```wgsl
fn dot(a: vec3f, b: vec3f) -> f32 { return a.x * b.x + a.y * b.y + a.z * b.z; }
```

Which is what we had in JavaScript. The major difference is in WGSL we'll
pass in the color as a `vec3f` instead of the individual channels.

For the main part of computing a histogram, here's the JavaScript again

```js
function computeHistogram(numBins, imgData) {
  const {width, height, data} = imgData;
  const bins = new Array(numBins).fill(0);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const offset = (y * width + x) * 4;

      const r = data[offset + 0] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const v = srgbLuminance(r, g, b);

      const bin = Math.min(numBins - 1, v * numBins) | 0;
      ++bins[bin];
    }
  }
  return bins;
}
```

Here's the corresponding WGSL

```js
@group(0) @binding(0) var<storage, read_write> bins: array<u32>;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

// from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}

@compute @workgroup_size(1) fn cs() {
  let size = textureDimensions(ourTexture, 0);
  let numBins = f32(arrayLength(&histogram));
  let lastBinIndex = u32(numBins - 1);
  for (var y = 0u; y < size.y; y++) {
    for (var x = 0u; x < size.x; x++) {
      let position = vec2u(x, y);
      let color = textureLoad(ourTexture, position, 0);
      let v = srgbLuminance(color.rgb);
      let bin = min(u32(v * numBins), lastBinIndex);
      bins[bin] += 1;
    }
  }
}
```

Above, not much changed. In JavaScript we get the data, width, and height
from `imgData`. In WGSL we get the width and height from the texture by
passing it to the `textureDimensions` function.

```wgsl
  let size = textureDimensions(ourTexture, 0);
```

`textureDimensions` takes a texture and a mip level (the `0` above) and returns the
size of the mip level for that texture.

We loop through all of the pixels of the texture, just like we did in
JavaScript.

```wgsl
  for (var y = 0u; y < size.y; y++) {
    for (var x = 0u; x < size.x; x++) {
```

We call `textureLoad` to get the color from the texture.

```wgsl
      let position = vec2u(x, y);
      let color = textureLoad(ourTexture, position, 0);
```

`textureLoad` returns a single texel from a single mip level of a texture.
It takes a texture, an unsigned integer texel coordinate, and a mip level
(the `0`).

We compute a luminance value, convert it to a bin index and increment that bin.

```wgsl
      let position = vec2u(x, y);
      let color = textureLoad(ourTexture, position, 0);
+      let v = srgbLuminance(color.rgb);
+      let bin = min(u32(v * numBins), lastBinIndex);
+      bins[bin] += 1;
```

Now the we have a compute shader, let's use it

We have our pretty standard initialization code

```js
async function main() {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail('need a browser that supports WebGPU');
    return;
  }
```

then we create our shader

```js
  const module = device.createShaderModule({
    label: 'histogram shader',
    code: `
      @group(0) @binding(0) var<storage, read_write> bins: array<u32>;
      @group(0) @binding(1) var ourTexture: texture_2d<f32>;

      // from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
      const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
      fn srgbLuminance(color: vec3f) -> f32 {
        return saturate(dot(color, kSRGBLuminanceFactors));
      }

      @compute @workgroup_size(1) fn cs() {
        let size = textureDimensions(ourTexture, 0);
        let numBins = f32(arrayLength(&histogram));
        let lastBinIndex = u32(numBins - 1);
        for (var y = 0u; y < size.y; y++) {
          for (var x = 0u; x < size.x; x++) {
            let position = vec2u(x, y);
            let color = textureLoad(ourTexture, position, 0);
            let v = srgbLuminance(color.rgb);
            let bin = min(u32(v * numBins), lastBinIndex);
            bins[bin] += 1;
          }
        }
      }
    `,
  });
```

We create a compute pipeline to run the shader

```js
  const pipeline = device.createComputePipeline({
    label: 'histogram',
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'cs',
    },
  });
```

After we load the image we need to make a texture and copy the data to it.
We'll use the `createTextureFromSource` function we wrote in
[the article on loading images into textures](webgpu-importing-textures.html#a-create-texture-from-source).

```js
  const imgBitmap = await loadImageBitmap('resources/images/pexels-francesco-ungaro-96938-mid.jpg');
  const texture = createTextureFromSource(device, imgBitmap);
```

We need to create a storage buffer for the shader to sum up the color values with

```js
  const numBins = 256;
  const histogramBuffer = device.createBuffer({
    size: numBins * 4 * 4, // 256 entries * 4 bytes per (u32)
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
```

and a buffer to get back the results so we can draw them

```js
  const resultBuffer = device.createBuffer({
    size: histogramBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
```

We need a bind group to pass the texture and histogram buffer to
our pipeline

```js
  const bindGroup = device.createBindGroup({
    label: 'histogram bindGroup',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: histogramBuffer }},
      { binding: 1, resource: texture.createView() },
    ],
  });
```

We can now setup the commands to run the compute shader

```js
  const encoder = device.createCommandEncoder({ label: 'histogram encoder' });
  const pass = encoder.beginComputePass(encoder);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();
```

We need to copy the histogram buffer to the result buffer

```js
  const encoder = device.createCommandEncoder({ label: 'histogram encoder' });
  const pass = encoder.beginComputePass(encoder);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();

+  encoder.copyBufferToBuffer(histogramBuffer, 0, resultBuffer, 0, resultBuffer.size);
```

and then execute the commands

```js
  const encoder = device.createCommandEncoder({ label: 'histogram encoder' });
  const pass = encoder.beginComputePass(encoder);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();

  encoder.copyBufferToBuffer(histogramBuffer, 0, resultBuffer, 0, resultBuffer.size);

+  const commandBuffer = encoder.finish();
+  device.queue.submit([commandBuffer]);
```

Then we can get the data from the result buffer and pass it to our existing functions
to draw the histogram

```js
  await resultBuffer.mapAsync(GPUMapMode.READ);
  const histogram = new Uint32Array(resultBuffer.getMappedRange());

  showImageBitmap(imgBitmap);

  const histogram = new Uint32Array(resultBuffer.getMappedRange());

  showImageBitmap(imgBitmap);

  const numEntries = texture.width * texture.height;
  drawHistogram(histogram, numEntries);

  resultBuffer.unmap();
```

And it should work

<!-- {{{example url="../webgpu-compute-shaders-histogram-slow-draw-in-js.html"}}} -->

Timing the results I found **this is about 30x slower than the JavaScript version!!!** 😱😱😱

What's up with that? We designed our solution above with a single loop and used
a single workgroup invocation with a size of 1. That means just a single "core" of
the GPU was used to compute the histogram. GPU cores are generally not as fast
as CPU cores. CPU cores have tons of extra circuitry to try to speed them up.
GPUs get their speed from massive parallelization but need to keep their design simpler.
Given our shader above we didn't take advantage of any parallelization.

Here's a diagram of what's happening using our small example texture.

<div class="webgpu_center compute-diagram">
  <div data-diagram="single"></div>
</div>

> ## Diagram vs Shader Differences
>
> These diagrams are not a perfect representation of our shaders
>
> * They show only 3 bins where as our shader has 256 bins
> * The code is simplified.
> * ▢ is the texel color
> * ◯ is the bin represented as luminance
> * Many things are abbreviated.
>   * `wid` = `workgroup_id`
>   * `gid` = `global_invocation_id`
>   * `lid` = `local_invocation_id`
>   * `ourTex` = `ourTexture`
>   * `texLoad` = `textureLoad`
>   * etc...
>
> Many of these changes are because there is only so much room to try
> to display many details. While this first example uses a single
> invocation, as we progress we'll need to cram more info in less space.
> I hope the diagrams aid in understanding rather than make things more
> confusing. 😅

Given a single GPU invocation is slower than a CPU we need to find a way to
parallelize our approach.

## Optimize - More Invocations

Possibly the easiest and most obvious way to speed this up use to use one
workgroup per pixel. In our code above we have for loop

```js
for (y) {
   for (x) {
      ...
   }
}
```

We could change the code use instead use `global_invocation_id.x` and `global_invocation_id.y`
as inputs and then process every single pixel in a separate invocation.

Here's needed the changes to the shader

```wgsl
@group(0) @binding(0) var<storage, read_write> histogram: array<vec4u>;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}

@compute @workgroup_size(1, 1, 1)
-fn cs() {
+fn cs(@builtin(global_invocation_id) global_invocation_id: vec3u) {
-  let size = textureDimensions(ourTexture, 0);
+  let position = global_invocation_id.xy;
  let numBins = f32(arrayLength(&histogram));
  let lastBinIndex = u32(numBins - 1);
-  for (var y = 0u; y < size.y; y++) {
-    for (var x = 0u; x < size.x; x++) {
-      let position = vec2u(x, y);
  var channels = textureLoad(ourTexture, position, 0);
  channels.w = srgbLuminance(color.rgb);
  for (var ch = 0; ch < 4; ch++) {
    let bin = min(u32(channels[ch] * numBins), lastBinIndex);
    histogram[bin][ch] += 1;
  }
-    }
-  }
}
```

As you can see, we got rid of the loop, instead we use the
`@builtin(global_invocation_id)` value to make each workgroup
responsible for a single pixel. Theoretically this would mean
all of the pixels could be processed in parallel.
Our image is 4896 x 3010 which is almost 15 million pixels so
there are lots of chances for parallelization.

The only other change needed is to actually run one workgroup
per pixel.

```js
  const encoder = device.createCommandEncoder({ label: 'histogram encoder' });
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
-  pass.dispatchWorkgroups(1);
+  pass.dispatchWorkgroups(texture.width, texture.height);
  pass.end();
```

Here it is running

<!-- {{{example url="../webgpu-compute-shaders-histogram-with-race.html"}}} -->

What's wrong? Why doesn't this histogram match the previous histogram
and why don't the totals match? Note: your computer might get different
results than mine. On mine, these are the histograms from the previous
version on the left, and this version on the right

<style>
.local-img img {
  border: 1px solid #888;
  margin: 0.5em;
}
</style>
<div class="webgpu_center side-by-side local-img">
  <div style="display: flex; flex-direction: column">
      <img src="resources/histogram-slow-color.png" class="histogram-img">
      <img src="resources/histogram-slow-luminosity.png" class="histogram-img">
      <div style="text-align: center;">Previous</div>
  </div>
  <div style="display: flex; flex-direction: column">
      <img src="resources/histogram-race-color.png" class="histogram-img">
      <img src="resources/histogram-race-luminosity.png" class="histogram-img">
      <div style="text-align: center;">Current</div>
  </div>
</div>

Further, the totals don't match

```text
previous: -> total: (4) [14736960, 14736960, 14736960, 14736960]
current:  -> total: (4) [75969, 69135, 72956, 58363]
```

What happened?

This is a classic *race condition* like we mentioned in [the previous article](../webgpu-compute-shaders.html#a-race-conditions).

This line in our shader

```wgsl
        histogram[bin][ch] += 1;
```

Actually translates to this

```wgsl
   let value = histogram[bin][ch];
   histogram[bin][ch] = value + 1;
```

What happens when 2 or more invocations are running in parallel
and happen to have the same `bin` and `ch`.

Imagine 2 invocations, where in both `bin = 1` and `ch = 2` and
`histogram[1][2] = 3`. If they run in parallel both invocations will load
3 and both invocations will write 4, when the correct answer would be
5.

<div class="webgpu_center data-table">
  <style>
    .local-race th { text-align: center; }
    .local-race .step { background-color: var(--table-line-head-bg); }
  </style>
  <div>
  <table class="local-race">
    <thead>
      <th>Invocation 1</th>
      <th>Invocation 2</th>
    </thead>
    <tbody>
      <tr>
        <td>value = histogram[bin][ch]&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="step">// loads 3</span></td>
        <td>value = histogram[bin][ch]&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="step">// loads 3</span></td>
      </tr>
      <tr>
        <td>histogram[bin][ch] = value + 1 <span class="step">// stores 4</span></td>
        <td>histogram[bin][ch] = value + 1 <span class="step">// stores 4</span></td>
      </tr>
    </tbody>
  </table>
  </div>
</div>

It's probably actually worse than that. `histogram` is defined as `array<vec4u>`. GPUs generally
load an entire `vec4` of values at a time. That means if 2 or more invocations are writing to
the same bin but different channels, they may still be stepping on each other.

In other words, what's really happening in the code is this

```wgsl
   let value = histogram[bin];    // get the entire vec4 bin
   value[ch] = value[ch] + 1;     // update a single channel of value locally
   histogram[bin] = value;        // put back the entire bin, all 4 channels worth.
```

You can see the problem visually in the diagram below. You'll see several invocations
go and fetch the current value in the bin, add one to it, and put it back, each of
oblivious that another invocation is reading and updating the same bin at the same time.

<div class="webgpu_center compute-diagram"><div data-diagram="race"></div></div>

WGSL has special "atomic" instructions to solve this issue. This case we
can use `atomicAdd`. `atomicAdd` makes the addition "atomic" which
means rather than 3 operations, load->add->store, all 3 operations
happen at once "atomically". This effectively prevents more than
two invocations from updating the value at the same time.

atomic functions have the requirement that they only work on
`i32` or `u32` and they require to data itself to be of type `atomic`.

Here's the changes to our shaders

```wgsl
-@group(0) @binding(0) var<storage, read_write> histogram: array<vec4u>;
+@group(0) @binding(0) var<storage, read_write> histogram: array<array<atomic<u32>, 4>>;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}

@compute @workgroup_size(1, 1, 1)
fn cs(@builtin(global_invocation_id) global_invocation_id: vec3u) {
  let position = global_invocation_id.xy;
  let numBins = f32(arrayLength(&histogram));
  let lastBinIndex = u32(numBins - 1);
  let color = textureLoad(ourTexture, position, 0);
  let luminance = srgbLuminance(color.rgb);
  for (var ch = 0; ch < 4; ch++) {
    let v = select(color[ch], luminance, ch == 3);
    let ndx = min(u32(v * numBins), lastBinIndex);
-    histogram[bin][ch] += 1;
+    atomicAdd(&histogram[ndx][ch], 1u);
  }
}
```

With that our compute shader, that uses 1 workgroup invocation per pixel, works!

<!-- {{{example url="../webgpu-compute-shaders-histogram-race-fixed.html"}}} -->

Unfortunately we have a new problem. `atomicAdd` effectively needs to block
another invocation from updating the same bin at the same time. We can see
the issue here. The diagram below shows `atomicAdd` as 3 operations
but when an invocation is doing an `atomicAdd` it "locks the bin"
so that another invocation has to wait until it's done.

<div class="webgpu_center compute-diagram">
  <div>Two workgroups, one locking the blue bin, the other blocked from using the same blue bin</div>
  <div data-diagram="lockedBin"></div>
</div>

When
an invocation is locking a bin it will have a line from the invocation
to the bin in the color of the bin. Invocations that are waiting for
that bin to unlock will have a stop sign on them.

<div class="webgpu_center compute-diagram"><div data-diagram="noRace"></div></div>

## Workgroups

Can we go faster? As mentioned in [the previous article](../webgpu-compute-shaders.html),
the "workgroup" is the smallest unit of work we can ask the GPU can do. You define the size of a workgroup
in 3 dimensions, and then you call `dispatchWorkgroups` to run a bunch of these workgroups.

Workgroups can share internal storage and coordinate that storage with in the workgroup
itself. How could we take advantage of that fact?

Let's try this. We'll make our workgroup size, 256x1 (so 256 invocations). We'll have
each invocation work on at 256x1 section of the image. This will make it



chunks
<div class="webgpu_center compute-diagram"><div data-diagram="chunks"></div></div>

sum
<div class="webgpu_center compute-diagram"><div data-diagram="sum"></div></div>

reduce
<div class="webgpu_center compute-diagram"><div data-diagram="reduce"></div></div>


# Drawing a histogram

# M1

* JavaScript: 43ms ???
* Compute Shader: 1 workgroup 1x1x1 : 1500ms
* Compute Shader: 1 workgroup per pixel : 12ms
* 256x1 + sum = 12.5ms
* 256x1 + reduce = 1em



* Cleanup drawHistogram (we don't need totals or max?)
* Write Timing Article and add Timing?
* Fix totals

<!-- keep this at the bottom of the article -->
<link rel="stylesheet" href="webgpu-compute-shaders-histogram.css">
<script type="module" src="webgpu-compute-shaders-histogram.js"></script>
