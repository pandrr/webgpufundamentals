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

You can see we multiple the triangle position by scale and then add an offset.
This will let us set the size of a triangle and position it.

We also change the fragment shader to return the color from our uniforms

```wgsl
      @fragment fn fs() -> @location(0) vec4f {
        return ourUniforms.color;
      }
```

Now have we've setup the shader to use uniforms we need to create
a buffer on the GPU to hold values for them.

This is an area where, if you never dealt with native data and sizes
there's a bunch to learn. We need to figure out what size to make this
buffer and we need to figure out where in that buffer the data for each
member of our uniform struct goes.

Looking at our struct

```wgsl
      struct OurUniforms {
        color: vec4f,
        scale: vec2f,
        offset: vec2f,
      };
```

The first member is `color` which is a vec4f so it start. A vec4f is four 32bit values. a 32bit value takes 4 bytes
so in total we need 16 bytes for this member