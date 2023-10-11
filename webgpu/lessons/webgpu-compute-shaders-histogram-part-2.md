Title: WebGPU Compute Shaders - Image Histogram Part 2
Description: Using an image histogram to adjust video in real time.
TOC: Image Histogram Part 2

In [the previous article](webgpu-compute-shaders-histogram.html) we covered
how to make an image histogram in JavaScript and then converted it to use WebGPU
and went through several steps of optimizing it.

Let's do a few more things with it

## Generate 4 histograms at once.

Given an image like this

<div class="center">
  <div>
    <div><img src="../resources/images/pexels-francesco-ungaro-96938-mid.jpg" style="max-width: 700px;"></div>
    <div style="text-align: center;"><a href="https://www.pexels.com/photo/cute-kitten-hiding-behind-a-pillow-96938/">Photo by Francesco Ungaro</a></div>
  </div>
</div>

It's common to generate multiple histograms

<div class="webgpu_center side-by-side">
  <div>
    <div><img src="resources/histogram-colors-photoshop.png" style="width: 237px;" class="nobg"></div>
  </div>
  <div>
    <div><img src="resources/histogram-luminosity-photoshop.png" style="width: 237px;" class="nobg"> </div>
  </div>
</div>

On the left we have 3 histograms, one for red values, one for green, and one for blue. They're drawn
to overlap. On the right we have a luminance histogram like the one we generated in  [the previous article](webgpu-compute-shaders-histogram.html).

It's a tiny change to generate all 4 at once.

In JavaScript, here's the changes to generate 4 histograms at once

```js
function computeHistogram(numBins, imgData) {
  const {width, height, data} = imgData;
-  const bins = new Array(numBins).fill(0);
+  const bins = new Array(numBins * 4).fill(0);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const offset = (y * width + x) * 4;

-      const r = data[offset + 0] / 255;
-      const g = data[offset + 1] / 255;
-      const b = data[offset + 2] / 255;
-      const v = srgbLuminance(r, g, b);
-
-      const bin = Math.min(numBins - 1, v * numBins) | 0;
-      ++bins[bin];

+       for (const ch = 0; ch < 4; ++ch) {
+          const v = ch < 3
+             ? data[offset + ch] / 255
+             : srgbLuminance(data[offset + 0] / 255,
+                             data[offset + 1] / 255,
+                             data[offset + 2] / 255);
+          const bin = Math.min(numBins - 1, v * numBins) | 0;
+          ++bins[bin * 4 + ch];
+       }
    }
  }
  return bins;
}
```

This will generate the histograms interleaved, r, g, b, l, r, g, b, l, r, g, b, l ....

We can update the code to render them like this

```js
function drawHistogram(histogram, numEntries, channels, height = 100) {
-  const numBins = histogram.length;
-  const max = Math.max(...histogram);
-  const scale = Math.max(1 / max);//, 0.2 * numBins / numEntries);
+  // find the highest value for each channel
+  const numBins = histogram.length / 4;
+  const max = [0, 0, 0, 0];
+  histogram.forEach((v, ndx) => {
+    const ch = ndx % 4;
+    max[ch] = Math.max(max[ch], v);
+  });
+  const scale = max.map(max => Math.max(1 / max, 0.2 * numBins / numEntries));

  const canvas = document.createElement('canvas');
  canvas.width = numBins;
  canvas.height = height;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

+  const colors = [
+    'rgb(255, 0, 0)',
+    'rgb(0, 255, 0)',
+    'rgb(0, 0, 255)',
+    'rgb(255, 255, 255)',
+  ];

-  ctx.fillStyle = '#fff';
+  ctx.globalCompositeOperation = 'screen';

  for (let x = 0; x < numBins; ++x) {
-    const v = histogram[x] * scale * height;
-    ctx.fillRect(x, height - v, 1, v);
+    const offset = x * 4;
+    for (const ch of channels) {
+      const v = histogram[offset + ch] * scale[ch] * height;
+      ctx.fillStyle = colors[ch];
+      ctx.fillRect(x, height - v, 1, v);
+    }
  }
}
```

And then call that function twice, once to render the
color histograms and once for the luminance histogram

```js
  const histogram = computeHistogram(numBins, imgData);

  showImageBitmap(imgBitmap);

+  // draw the red, green, and blue channels
  const numEntries = imgData.width * imgData.height;
-  drawHistogram(histogram, numEntries);
+ drawHistogram(histogram, numEntries, [0, 1, 2]);
+
+  // draw the luminosity channel
+  drawHistogram(histogram, numEntries, [3]);
```

And now we get these results.

{{{example url="../webgpu-compute-shaders-histogram-4ch-javascript.html"}}}

Doing the same to our WGSL examples is even simpler

For example the our first example that was too slow would
change like this

```wgsl
-@group(0) @binding(0) var<storage, read_write> bins: array<vec4u>;
+@group(0) @binding(0) var<storage, read_write> bins: array<u32>;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

// from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}

@compute @workgroup_size(1, 1, 1) fn cs() {
  let size = textureDimensions(ourTexture, 0);
  let numBins = f32(arrayLength(&bins));
  let lastBinIndex = u32(numBins - 1);
  for (var y = 0u; y < size.y; y++) {
    for (var x = 0u; x < size.x; x++) {
      let position = vec2u(x, y);
-      let color = textureLoad(ourTexture, position, 0);
-      let v = srgbLuminance(color.rgb);
-      let bin = min(u32(v * numBins), lastBinIndex);
-      bins[bin] += 1;
+      var channels = textureLoad(ourTexture, position, 0);
+      channels.w = srgbLuminance(channels.rgb);
+      for (var ch = 0; ch < 4; ch++) {
+        let v = channels[ch];
+        let bin = min(u32(v * numBins), lastBinIndex);
+        bins[bin][ch] += 1;
+      }
    }
  }
}

```

We needed to make room for all 4 channels by changing bins
from `array<u32>` to `array<vec4u>`.

Then we pulled out the color from the texture, computed a
luminance and put it in the `w` element of `channels`

```wgsl
  var channels = textureLoad(ourTexture, position, 0);
  channels.w = srgbLuminance(channels.rgb);
```

This way we could just loop over the 4 channels and increment
the correct bin.

The only other change we need is allocating 4x the memory
for our buffer

```js
  const histogramBuffer = device.createBuffer({
-    size: numBins * 4, // 256 entries * 4 bytes per (u32)
+    size: 256 * 4 * 4, // 256 entries * 4 (rgba) * 4 bytes per (u32)
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
```

And here's our slow WebGPU version generating 4 histograms

{{{example url="../webgpu-compute-shaders-histogram-4ch-slow.html"}}}

Making similar changes to our fastest version:

```wgsl
const chunkWidth = 256;
const chunkHeight = 1;
const chunkSize = chunkWidth * chunkHeight;
-var<workgroup> bins: array<atomic<u32>, chunkSize>;
-@group(0) @binding(0) var<storage, read_write> chunks: array<array<u32, chunkSize>>;
+var<workgroup> bins: array<array<atomic<u32>, 4>, chunkSize>;
+@group(0) @binding(0) var<storage, read_write> chunks: array<array<vec4u, chunkSize>>;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

const kSRGBLuminanceFactors = vec3f(0.2126, 0.7152, 0.0722);
fn srgbLuminance(color: vec3f) -> f32 {
  return saturate(dot(color, kSRGBLuminanceFactors));
}

@compute @workgroup_size(chunkWidth, chunkHeight, 1)
fn cs(
  @builtin(workgroup_id) workgroup_id: vec3u,
  @builtin(local_invocation_id) local_invocation_id: vec3u,
) {
  let size = textureDimensions(ourTexture, 0);
  let position = workgroup_id.xy * vec2u(chunkWidth, chunkHeight) + 
                 local_invocation_id.xy;
  if (all(position < size)) {
    let numBins = f32(chunkSize);
    let lastBinIndex = u32(numBins - 1);
-    let color = textureLoad(ourTexture, position, 0);
-    let v = srgbLuminance(color.rgb);
-    let bin = min(u32(v * numBins), lastBinIndex);
-    atomicAdd(&bins[bin], 1u);
+    var channels = textureLoad(ourTexture, position, 0);
+    channels.w = srgbLuminance(channels.rgb);
+    for (var ch = 0; ch < 4; ch++) {
+      let v = channels[ch];
+      let bin = min(u32(v * numBins), lastBinIndex);
+      atomicAdd(&bins[bin][ch], 1u);
+    }
  }

  workgroupBarrier();

  let chunksAcross = (size.x + chunkWidth - 1) / chunkWidth;
  let chunk = workgroup_id.y * chunksAcross + workgroup_id.x;
  let bin = local_invocation_id.y * chunkWidth + local_invocation_id.x;

-  chunks[chunk][bin] = atomicLoad(&bins[bin]);
+  chunks[chunk][bin] = vec4u(
+    atomicLoad(&bins[bin][0]),
+    atomicLoad(&bins[bin][1]),
+    atomicLoad(&bins[bin][2]),
+    atomicLoad(&bins[bin][3]),
+  );
}
```

And for our reduce shader

```wgsl
const chunkWidth = 256;
const chunkHeight = 1;
const chunkSize = chunkWidth * chunkHeight;

struct Uniforms {
  stride: u32,
};

-@group(0) @binding(0) var<storage, read_write> chunks: array<array<u32, chunkSize>>;
+@group(0) @binding(0) var<storage, read_write> chunks: array<array<vec4u, chunkSize>>;
@group(0) @binding(1) var<uniform> uni: Uniforms;

@compute @workgroup_size(chunkSize, 1, 1) fn cs(
  @builtin(local_invocation_id) local_invocation_id: vec3u,
  @builtin(workgroup_id) workgroup_id: vec3u,
) {
  let chunk0 = workgroup_id.x * uni.stride * 2;
  let chunk1 = chunk0 + uni.stride;

  let sum = chunks[chunk0][local_invocation_id.x] +
            chunks[chunk1][local_invocation_id.x];
  chunks[chunk0][local_invocation_id.x] = sum;
}
```

Like the previous example, we need to increase the buffer sizes

```js
  const histogramChunksBuffer = device.createBuffer({
-    size: chunkSize * 4,  // 4 bytes per (u32)
+    size: numChunks * chunkSize * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const resultBuffer = device.createBuffer({
-    size: chunkSize * 4,
+    size: chunkSize * 4 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
```

That's it.

{{{example url="../webgpu-compute-shaders-histogram-4ch-optimized-more.html"}}}

There were 2 other steps we tried in the previous article.
One used a single workgroup per pixel. Another summed the
chunks with an invocation per bin instead of reducing the bins.

Here's some timing info I got testing these versions.


## Drawing the histogram on the GPU

Let's draw the histogram on the GPU. In JavaScript we used the
canvas 2d API to draw a 1✖️height rect handle for each bin which
was very easy. We could do that using WebGPU as well but I think
there's a better approach for the particular issue of drawing a
histogram.

Let's instead just draw a rectangle.
Drawing rectangles we've covered in many places. For example, most of
the examples from [the articles on textures](webgpu-textures.html) use
a rectangle.

For a histogram, in the fragment shader we'll
look up the height for that column of pixels. If the pixel is above
the height then we can draw 0, if it's below the height we'll draw
a color.

Here's a fragment shader that does that

```wgsl
@group(0) @binding(0) var<storage, read> bins: array<vec4u>;

@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
  let numBins = arrayLength(bins);
  let lastBinIndex = u32(numBins - 1);
  let bin = clamp(
      u32(fsInput.texcoord.x * numBins)
      0,
      lastBinIndex));
  let heights = bins[bin];
  
}

@fragment fs(v) -> vec4f {
  let numBins = arrayLength(bins);
  let lastBinIndex = u32(numBins - 1);
  



}

```


