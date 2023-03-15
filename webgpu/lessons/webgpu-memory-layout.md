Title: WebGPU Data Memory Layout
Description: How to layout and prepare data for WebGPU
TOC: Data Memory Layout

In WebGPU, nearly all of the data you provide to it needs to
be layed out in memory to match what you define in your shaders.
This is a big contrast to JavaScript and TypeScript where memory
layout issues rarely come up.

In WGSL when you write your shaders, it's common to define `struct`s.
Structs are kind of line JavaScript objects, you declare members of
a struct, similar to properties of a JavaScript object. But, on top
of giving each property a name, you also have to give it a type.
**AND**, when providing the data it's up to you to compute where
in a buffer that particular member of the struct will appear.

In WGSL v1, there are only 4 base types

* `f32` (a 32bit floating point number)
* `i32` (a 32bit integer)
* `u32` (a 32bit unsigned integer)
* `f16` (a 16bit floating point number) <sup>only as an optional feature</sup>

A byte is 8 bits so a 32 bit value takes 4 bytes and a 16 bit value takes 2 bytes.

If we declare a struct like this

```wgsl
struct OurStruct {
  velocity: f32,
  acceleration: f32,
  frameCount: u32,
};
```

A visual representation of that structure might look something like this

<div class="webgpu_center" data-diagram="ourStructV1"></div>

Then, prepare data in a shader to match `OurStruct` we'd need to make a
`TypedArray` and then fill it out something like this

```js
const kOurStructSizeBytes =
  4 + // velocity
  4 + // acceleration
  4 ; // frameCount
const ourStructData = new ArrayBuffer(kOurStructSizeBytes);
const ourStructValuesAsF32 = new Float32Array(ourStructData);
const ourStructValuesAsU32 = new Uint32Array(ourStructData);
```

Above, `ourStructData` is an `ArrayBuffer` which is a chunk of memory.
To look at the contents of this memory we an create views of it.
`ourStructValuesAsF32` is a view of the memory as 32bit floating point
values. `outStructValuesAsU32` is a view of **the same memory** as
32bit unsigned integer values.

<div class="webgpu_center data-table" data-diagram="wgslTypeTable"></div>

Now that we have a buffer and 2 views we can set the data in the structure.

```
const kVelocityOffset = 0;
const kAccelerationOffset = 1;
const kFrameCountOffset = 2;

ourStructValuesAsF32[kVelocityOffset] = 1.2;
ourStructValuesAsF32[kAccelerationOffset] = 3.4;
outStructValuesAsU32[kFrameCountOffset] = 56;    // an integer value
```

<pre class="prettyprint" data-diagram="ourStructCodeV1"></pre>


<script type="module" src="webgpu-memory-layout.js"></script>
