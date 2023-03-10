Title: WebGPU Fundamentals
Description: The fundamentals of WebGPU
TOC: Fundamentals

This article will try to teach you the very fundamentals of WebGPU.

<div class="warn">
It is expected you already know JavaScript before
you read this article. Concepts like
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map">mapping arrays</a>,
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment">destructuring assignment</a>,
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax">spreading values</a>,
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function">async/await</a>,
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules">es6 modules</a>,
and more will be used extensively.
</div>

WebGPU is an API that lets you do 2 basic things.

1. Draw triangles/points/lines to textures

2. Run computations on the GPU

That is it!

Everything about WebGPU after that is up to you. It's like learning a computer
language like JavaScript or C++. First you learn the basics, then it's up to
you to creatively use those basic to solve your problem. 

WebGPU is an extremely low-level API. While you can make some small examples,
for many apps it will likely require a large amount of code and some serious
organization of data. As an example, [three.js](https://threejs.org) which
supports WebGPU consists of ~600k minified JavaScript, and that's just its
base library. That does not include loaders, controls, post processing, and
many other features.

The point being, if you just want to get something on the screen you're far
better off choosing a library that provides the large amount of code you're
going to have to write when doing it yourself.

On the other hand, maybe you have a custom use case or maybe you want to modify
an existing library or maybe you're just curious how it all works. In those
cases, read on!

# Getting Started

Like mentioned above, WebGPU has 2 basic things it can do

1. Draw triangles/points/lines to textures

2. Run computations on the GPU

This page will provide the smallest example of doing each of those things.
The following articles will show the various ways of providing data to
these things. Note that this will be very basic. We need to build up a
foundation of these basics. Later we'll show how to use them to do things
people typically do with GPUs like 2D graphics, 3D graphics, etc...

# Drawing triangles to textures

To draw triangles with WebGPU we have to supply 2 "shaders". Shaders
are functions that run on the GPU. These 2 shaders are

1. Vertex Shaders

   Vertex shaders are functions that compute vertex positions for drawing
   triangles/lines/points

2. Fragment Shaders

   Fragment shaders are functions that compute the color (or other data)
   for each pixel to be drawn/rasterized when drawing triangles/lines/points

Let's start with a very small WebGPU program to draw a triangle.

We need a canvas to display our triangle

```html
<canvas></canvas>
```

WebGPU is an asynchronous API so it's easiest to use in an async function.
We start off by checking for `navigator.gpu`, requesting an adaptor, and requesting
a device.

```js
async function main() {
  const gpu = navigator.gpu;
  if (!gpu) {
    fail('this browser does not support webgpu');
    return;
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    fail('this browser appears to support WebGPU but it\'s disabled');
    return;
  }

  const device = await adapter.requestDevice();
}
main();
```

The code above is fairly self explanatory. First we check if `navigator.gpu` exists.
If not then the browser doesn't support WebGPU. Next we request an adaptor. And adaptor
represents the GPU itself. If the WebGPU api exists but requesting an adaptor fails
then WebGPU is probably disabled. Either the browser disabled it because of a bug or
possibly the user disabled it.

Finally we request a device. Requesting a device can fail as well but that seems rare.

Next up we look up the canvas and create a `webgpu` context for it. This will let
us get a texture to render to that will be used to render the canvas in the webpage.

```js
  const context = document.querySelect('canvas').getContext('webgpu');
  const presentationFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  });
```

Again the code above is pretty self explanatory. We get the context. We ask the
system what the preferred canvas format is. This will be either `"rgba8unorm"`
or `"bgra8unorm"`. It's not really that important what it is but by querying it
it will make things fastest for the user's system.

We pass that into the webgpu canvas context by calling `configure`. We pass in
the `device`, the `format`, and an `alphaMode` which can be either `"opaque"` or
`"premultiplied"`.

Next we create a shader module. A shader module contains one or more shader
functions. In our case we'll make 1 vertex shader function and 1 fragment shader
function.

```js
  const module = device.createShaderModule({
    code: `
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(
          vec2f( 0.0,  0.5),  // top center
          vec2f(-0.5, -0.5),  // bottom left
          vec2f( 0.5, -0.5)   // bottom right
        );

        return vec4f(pos[vertexIndex], 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
      }
    `,
  });
```

Shaders are written in a language called
[WebGPU Shading Language (WGSL)](https://gpuweb.github.io/gpuweb/wgsl/) which is
often pronounced wig-sil. WGSL is a strongly typed language
which we'll try to go over more details in [another article](webgpu-wgsl-basics.html).
For now I'm hoping with a little explanation you can infer some basics.

Above we see a function called `vs` is declared with the `@vertex` attribute. This
designates it as a vertex shader function.

```wgsl
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> @builtin(position) vec4f {
         ...
```

It excepts one parameter we named `vertexIndex`.
`vertexIndex` is a `u32` which means a *32bit unsigned integer*. It gets its value
from the builtin called `vertex_index`. `vertex_index` is the iteration number just like
`index` in JavaScript's `Array.map(function(value, index) { ... })`. If we tell the GPU to
execute this function 10 times, the first time `vertex_index` would be `0`, the 2nd time
it would be `1`, the 3rd time it would be `2`, etc...

Our `vs` function is declared as returning a `vec4f` which is vector of four 32bit
floating point values. Think of it as an array of 4 values or an object with 4 properties like 
`{x: 0, y: 0, z: 0, w: 0}`. This returned value
will be assigned to the `position` builtin. In "triangle-list" mode, every 3
times the vertex shader is executed a triangle will be drawn connecting the 3
`position` values we return.

Positions in WebGPU need to be returned in *clip space* where X goes from -1.0
on the left to +1.0 on the right, Y goes from -1.0 at the bottom to +1.0 at the
top. This is true regardless of the size of the texture we are drawing to.

<div class="webgpu_center"><img src="resources/clipspace.svg" style="width: 500px"></div>

The `vs` function declares an array of 3 `vec2f`s. Each `vec2f` consists of two 32bit floating point
values. The code then fills out that array with 3 `vec2f`s.

```wgsl
        var pos = array<vec2f, 3>(
          vec2f( 0.0,  0.5),  // top center
          vec2f(-0.5, -0.5),  // bottom left
          vec2f( 0.5, -0.5)   // bottom right
        );
```

Finally it uses `vertexIndex` to return one of the 3 values from the array.
Since the function requires 4 floating point values for its return type, and
since `pos` is an array of `vec2f`, the code supplies `0.0` and `1.0` for
the remaining 2 values.

```wgsl
        return vec4f(pos[vertexIndex], 0.0, 1.0);
```

The shader module also declares a function called `fs` that is declared with
`@fragment` attribute making it a fragment shader function.

```wgsl
      @fragment fn fs() -> @location(0) vec4f {
```

This function takes no parameters and returns a `vec4f` at `location(0)`.
This means it will write to the first render target. We'll make the first
render target our canvas later.

```wgsl
        return vec4f(1, 0, 0, 1);
```

The code returns `1, 0, 0, 1` which is red. Colors in WebGPU are usually
specified as floating point values from `0.0` to `1.0` where the 4 values above
correspond to red, green, blue, and alpha respectively.

When the GPU rasterizes the triangle (draws it with pixels), it will call
the fragment shader to find out what color to make each pixel. In our case
we're just returning red.

Now that we've created a shader module, we next need to make a render pipeline

```js
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
    },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: presentationFormat }],
    },
  });
```

In this case there isn't much to see. We set `layout` to `'auto'` which means
to ask WebGPU to derive the layout of data from the shaders. We're not using
any data though.

We then tell the render pipeline to use the `vs` function from our shader module
for a vertex shader and the `fs` function for our fragment shader. Otherwise we
tell it the format of the first render target. "render target" means the texture
we will render to. We haven't specified that yet but, when we create a pipeline
we have to specify the format for the texture(s) we'll use this pipeline to
eventually render to.

Element 0 for the `targets` array corresponds to location 0 as we specified for
the fragment shader's return value. Later, well set that target to be a texture
for the canvas.

Now it's time to render.

```js
  function render() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [1, 1, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);

    const iterationCount = 3;
    pass.draw(iterationCount);

    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  render();
```

First we create a command encoder. A command encoder is used to create
a command buffer. We use it to encode commands and then "submit" it to have
the commands executed.

Our first command is `beginRenderPass` which we
need to pass an array of `colorAttachments`. In this case our only attachment
is a texture view from our canvas which we get via the context we created at
the start. Again, element 0 of the `colorAttachments` array corresponds to 
`location(0)` as we specified for the return value of the fragment shader.

Calling `context.getCurrentTexture()` gets a texture that will appear in the
canvas. Calling `createView` gets a view into a specific part of a texture
but with no parameters it will return the default part which is what we want
in this case.

We also setup a clear value, yellow, and a `loadOp` and `storeOp`. `loadOp: 'clear'`
specifies to clear the texture to the clear value before drawing. The other
option is `'load'` which means load the existing contents of the texture into the GPU.
`storeOp: 'store'` means store the result of what we draw. We could also pass
`'discard'` which would throw away what we draw. We'll cover why we might want
to do that in [another article](webgpu-multisampling.html).

We encode the command, `setPipeline`, to set our pipeline and then tell it to
execute our vertex shader 3 times. By default, every 3 times our vertex shader
is executed a triangle will be drawn by connecting the 3 values just returned from
the vertex shader.

Finally we end the render pass, and then finish the encoder. This gives us
a command buffer that represents the steps we just specified. Finally we
submit the command buffer to be executed.

The result

{{{example url="../webgpu-simple-triangle.html"}}}

So, now we've seen a very small working WebGPU example.
It should be pretty obvious that hard coding a triangle inside a shader is
not very flexible. We need ways to provide data and we'll cover those in
the following articles. The points to take away from the code above,

* WebGPU just runs shaders. Its up to use to fill them with code to do useful things
* Shaders are specified in a shader module and then turned into a pipeline
* WebGPU can draw triangles
* WebGPU works by encoding commands and the submitting them.

# Run computations on the GPU

Let's write a basic example for doing some computation on the GPU

We start off with the same code to get a WebGPU device

```js
async function main() {
  const gpu = navigator.gpu;
  if (!gpu) {
    fail('this browser does not support webgpu');
    return;
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    fail('this browser appears to support WebGPU but it\'s disabled');
    return;
  }

  const device = await adapter.requestDevice();
```

When we create a shader module

```js
  const module = device.createShaderModule({
    code: `
      @group(0) @binding(0) var<storage, read_write> data: array<f32>;

      @compute @workgroup_size(1) fn computeSomething(
        @builtin(global_invocation_id) id: vec3<u32>
      ) {
        let i = id.x;
        data[i] = data[i] * 2.0;
      }
    `,
  });
```

First we declare a variable called `data` of type `storage` that we want to be able to both read from and write to.

```wgsl
      @group(0) @binding(0) var<storage, read_write> data: array<f32>;
```

We declare its type as `array<f32>` which means an array of 32bit floating point values. We tell it we're
going to specify this array on binding location 0 (the `binding(0)`) in bindGroup 0 (the `@group(0)`).

Then we declare a function called `computeSomething` with the `@compute` attribute which makes it a
compute shader. 

```wgsl
      @compute @workgroup_size(1) fn computeSomething(
        @builtin(global_invocation_id) id: vec3u
      ) {
        ...
```

Compute shaders are required to declare a workgroup size which we will cover later.
For now we'll just set it to 1 with the attribute `@workgroup_size(1)`. We declare
it to have one parameter `id` which use a `vec3u`. A vec3u is three unsigned 32 integer values.
Like our vertex shader above, this is the iteration number. It's different in that compute shader
iteration numbers are 3 dimensional (have 3 values). We declare `id` to get its value from
the builtin `global_invocation_id`.

You can *kind of* think of compute shaders as running like this. 
This is an over simplification but it will do for now.

```js
// pseudo code
for (z = 0; z < depth; ++z) {
  for (y = 0; y < height; ++y) {
    for (x = 0; x < width; ++x) {
      const global_invocation_id = {x, y, z};
      computeShaderFn(global_invocation_id);
    }
  }
}
```

Finally we use the `x` property of `id` to index `data` and multiply each value by 2

```wgsl
        let i = id.x;
        data[i] = data[i] * 2.0;
```

Above, `i` is just the first of the 3 iteration numbers.

Now that we've created the shader we need to create a pipeline

```js
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'computeSomething',
    },
  });
```

Here we just tell it we're using a `compute` stage from the shader `module`
we created and we want to call the `computeSomething` function.
`layout` is `'auto'` again telling WebGPU to figure out the layout from the shaders.

Next we need some data

```js
  const input = new Float32Array([1, 3, 5]);
```

That data only exists in JavaScript. For WebGPU to use it we need to make a buffer
and copy the data to the buffer.

```js
  // create a buffer on the GPU to hold our computation
  // input and output
  const buffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  // Copy our input data to that buffer
  device.queue.writeBuffer(buffer, 0, input);
```

Above we call `device.createBuffer` to create a buffer. `size` is the size in bytes, in this
case it will be 12 because size in bytes of a `Float32Array` of 3 values is 12. If you're not
familiar with `Float32Array` and typed arrays then see [this article](webgpu-typedarrays.html).

Every WebGPU buffer we create has to specify a `usage`. There are a bunch of flags we can
pass for usage but not all of them can be used together. Here we say we want this buffer to
be usable as `storage` by passing `GPUBufferUsage.STORAGE`. 
This makes it compatible with `var<storage,...>` from the shader.
Further, we want to able to copy data to this buffer so we include the `GPUBufferUsage.COPY_DST` flag.
And finally we want to be able to copy data from the buffer so we include `GPUBufferUsage.COPY_SRC`.

Note that you can not directly read the contents of a WebGPU buffer from JavaScript. Instead you have
to "map" it which is another way of requesting access to the buffer from WebGPU because the buffer
might be in use and because it might only exist on the GPU.

Buffers that can be mapped in JavaScript can't be used for much else. In other words, we can not
map the buffer we just created above. So, in order to see the result
of our computation, we'll need another buffer. After running the computation, we'll copy the buffer
above to this result buffer and set its flags so we can map it.

```js
  // create a buffer on the GPU to get a copy of the results
  const resultBuffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });
```

In order to tell our shader about the buffer we want it to work on we need to create
a bindGroup

```js
  // Setup a bindGroup to tell the shader which
  // buffer to use for the computation
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer } },
    ],
  });
```

We get the layout for the bindGroup from the pipeline. Then we setup bindGroup entries.
The `{binding: 0 ...` of the `entries` corresponds to the `@binding(0)` in the shader.

Now we can start encoding commands

```js
  // Encode commands to do the computation
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(input.length);
  pass.end();
```

We create a command encoder. We start a compute pass. We set the pipeline, then we set the bindGroup.
Here, the `0` in `pass.setBindGroup(0, bindGroup)` corresponds to `@group(0)` in the shader.
We then `dispatchWorkgroups` and in this case we pass it `input.length` which is `3` telling
WebGPU to run the compute shader 3 times. We then end the pass.

```js
  // Encode a command to copy the results to a mappable buffer.
  encoder.copyBufferToBuffer(buffer, 0, resultBuffer, 0, resultBuffer.size);
```

After the computation is finished we ask the GPU copy from `buffer` to `resultBuffer`

Now we can finish the encoder to get a command buffer and then submit that command buffer

```js
  // Finish encoding and submit the commands
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
```

Now we map the results buffer and get a copy of the data

```js
  // Read the results
  await resultBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(resultBuffer.getMappedRange());

  console.log('input', input);
  console.log('result', result);

  resultBuffer.unmap();
```

To map the results buffer we call `mapAsync` and have to `await` for it to finish.
Once mapped we can call `resultBuffer.getMappedRange()` which with no parameters
will return an `ArrayBuffer` of entire buffer. We put that in a `Float32Array`
typed array view and then we can look at the values. One important detail, the
`ArrayBuffer` returned by `getMappedRange` is only valid until we called `unmap`.
After `unmap` its length with be set to 0 and its data no longer accessible.

Running that we can see we got the result back, all the numbers have been doubled.

{{{example url="../webgpu-simple-compute.html"}}}












