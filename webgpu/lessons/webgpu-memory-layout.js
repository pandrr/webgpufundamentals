import {
  makeShaderDataDefinitions,
} from '/3rdparty/webgpu-utils.module.js';
import {
  renderDiagrams
} from './resources/diagrams.js';
import {
  createByteDiagramForType,
  getCodeForUniform,
} from './resources/data-byte-diagram.js';
import {
  makeTable,
} from './resources/elem.js';
import typeInfo from './resources/wgsl-data-types.js';

renderDiagrams({
  ourStructV1(elem) {
    const wgsl = `
      struct OurStruct {
        velocity: f32,
        acceleration: f32,
        frameCount: u32,
      };
      @group(0) @binding(0) var<uniform> foo: OurStruct;
    `;
    const defs = makeShaderDataDefinitions(wgsl);
    elem.appendChild(createByteDiagramForType('OurStruct', defs.uniforms.foo));
  },

  ourStructCodeV1(elem) {
    const wgsl = `
      struct OurStruct {
        velocity: f32,
        acceleration: f32,
        frameCount: u32,
      };
      @group(0) @binding(0) var<uniform> OurStruct: OurStruct;
    `;
    const defs = makeShaderDataDefinitions(wgsl);
    elem.textContent = getCodeForUniform('ourStruct', defs.uniforms.OurStruct);
  },

  wgslTypeTable(elem) {
    const addRow = makeTable(elem, 'type', 'size', 'align');
    for (const [name, {size, align}] of Object.entries(typeInfo)) {
      addRow(name, size, align);
    }
  },
});