Title: WebGPU Uniforms
Description: Passing Constant Data to a Shader
TOC: Uniforms

The previous article was about [inter-stage variables](webgpu-inter-stage-variables.html).
This article will be about uniforms.

Uniforms are kind of like global variables for your shader. You can set their
values before you execute the shader and they'll have those values for every
iteration of the shader. You can them set them to something else the next time
you ask the GPU to execute the shader.

We'll start again with the triangle example from [the first article](webgpu-fundamentals.html) and modify it to use some uniforms

```js
  const module = device.createShaderModule({
    label: 'triangle shaders with uniforms',
    code: `
+      struct OurUniforms {
+        color: vec4f,
+        scale: vec2f,
+        offset: vec2f,
+      };
+
+      @group(0) @binding(0) var<uniform> ourUniforms: OurUniforms;

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(
          vec2f( 0.0,  0.5),  // top center
          vec2f(-0.5, -0.5),  // bottom left
          vec2f( 0.5, -0.5)   // bottom right
        );

-        return vec4f(pos[vertexIndex], 0.0, 1.0);
+        return vec4f(
+          pos[vertexIndex] * ourUniforms.scale + ourUniforms.offset, 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
-        return vec4f(1, 0, 0, 1);
+        return ourUniforms.color;
      }
    `,
  });

  });
```

First we declared a struct with 3 members

```wsgl
      struct OurUniforms {
        color: vec4f,
        scale: vec2f,
        offset: vec2f,
      };
```

Then we declared a uniform variable with a type of that struct.
The variable is `ourUniforms` and its type is `OurUniforms`.

```wsgl
      @group(0) @binding(0) var<uniform> ourUniforms: OurUniforms;
```

Next we changed what is returned from the vertex shader to use
the uniforms

```wgsl
      @vertex fn vs(
         ...
      ) ... {
        ...
        return vec4f(
          pos[vertexIndex] * ourUniforms.scale + ourUniforms.offset, 0.0, 1.0);
      }
```

You can see we multiply the vertex position by scale and then add an offset.
This will let us set the size of a triangle and position it.

We also change the fragment shader to return the color from our uniforms

```wgsl
      @fragment fn fs() -> @location(0) vec4f {
        return ourUniforms.color;
      }
```

Now that we've setup the shader to use uniforms we need to create
a buffer on the GPU to hold values for them.

This is an area where, if you never dealt with native data and sizes
there's a bunch to learn. It's a big topic so [here is an separate
article about the topic](webgpu-memory-layout.html). If you don't
know how to layout structs in memory, please [go read the article](webgpu-memory-layout.html). Then come back here. This article
will assume you already read [it](webgpu-memory-layout.html).

Having read [the article](webgpu-memory-layout.html), we can
now go ahead fill out a buffer with data that matches the
struct in our shader.

First we make a buffer and assign it usage flags so it can
be used with uniforms, and so that we can update by copying
data to it.

```js
  const uniformBufferSize =
    4 * 4 + // color is 4 32bit floats (4bytes each)
    2 * 4 + // scale is 2 32bit floats (4bytes each)
    2 * 4;  // offset is 2 32bit floats (4bytes each)
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
```

Then we make a `TypedArray` so we can set values in JavaScript

```js
  // create a typedarray to hold the values for the uniforms in JavaScript
  const uniformValues = new Float32Array(uniformBufferSize / 4);
```

Next, [as the diagram showed in the first article](webgpu-fundamentals.html#webgpu-draw-diagram), to tell a shader about our buffer we need
to create a bind group and bind the buffer to the same `@binding(?)`
we set in our shader.

```js
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer }},
    ],
  });
```

Now, sometime before we submit our command buffer, we need to set
the values `uniformValues` and then copy those values to the buffer.
We'll do it at the top of our `render` function. The offsets
were computed using what we covered in [the article on memory-layout](webgpu-memory-layout.html).

```js
  // offsets to the various uniform values in float32 indices
  const kColorOffset = 0;
  const kScaleOffset = 4;
  const kOffsetOffset = 6;

  function render() {
    // The the uniform values in our JavaScript side Float32Array
    const aspect = canvas.width / canvas.height;
    uniformValues.set([0, 1, 0, 1], kColorOffset);        // set the color
    uniformValues.set([0.5 / aspect, 0.5], kScaleOffset); // set the scale
    uniformValues.set([-0.5, -0.25], kOffsetOffset);      // set the offset

    // copy the values from JavaScript to the GPU
    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
```

Above we're setting the color to green, we're setting the scale
to half size AND taking into account the aspect of the canvas
so the triangle will keep the same width to height ratio regardless
of the size of the canvas. Finally, the offset will move the triangle
left 1/4th of the canvas and down 1/8th. (remember, clip space goes
from -1 to 1 which is 2 units wide so 0.25 is 1/8 of 2). 

Finally, we need to set the bind group before drawing

```js
    pass.setPipeline(pipeline);
+    pass.setBindGroup(0, bindGroup);
    pass.draw(3);  // call our vertex shader 3 times
    pass.end();
```

And with that we get a green triangle as described

{{{example url="../webgpu-simple-triangle-uniforms.html"}}}

For this single triangle our state when the draw command is
executed is something like this

<div class="webgpu_center"><img src="resources/webgpu-draw-diagram-triangle-uniform.svg" style="width: 863px;"></div>

Up until now, all of the data we've used in our shaders was either
hardcoded (the triangle vertex positions, and the color).
Now that we're able to pass values into our shader we can call `draw`
multiple times with different data.

We could draw in different places with different offsets, scales,
and colors by updating our single buffer. It's important to remember
though that our commands get put in a command buffer, they are not
actually executed until we submit them. So, we can **NOT* do this

```js
    for (let x = -1; x < 1; x += 0.1) {
      uniformValues.set([x, x], kOffsetOffset);
      device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
      pass.draw(3);
    }
    pass.end();

    // Finish encoding and submit the commands
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
```

Because as you can see above, the `device.queue.xxx` functions happen on
a "queue" but the `pass.xxx` functions just encode a command in the the command buffer. When we actually called `submit` with our command buffer,
the only thing in our buffer would be the last values we wrote.

We could change it to this 

```js
    // BAD! Slow!
    for (let x = -1; x < 1; x += 0.1) {
      uniformValues.set([x, 0], kOffsetOffset);
      device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass(renderPassDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();

      // Finish encoding and submit the commands
      const commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);
    }
```

The code above is slow for multiple reasons. The biggest is it's
best practice to do more work in a single command buffer.

So, instead, we could to create one uniform buffer per thing we want
to draw. And, since buffers are used indirectly through bind groups,
we'll also need one bind group per thing we want to draw.

Let's do it




