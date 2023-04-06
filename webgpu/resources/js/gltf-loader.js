async function loadGLB(url) {
  const ab = await loadBinary(url);
  const d = new DataView(ab);

  const magic = d.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error('not a gLB file');
  }

  const version = d.getUint32(4, true);
  if (version < 2) {
    throw new Error('version < 2');
  }

  const length = d.getUint32(8, true);
  if (length < d.byteLength) {
    throw new Error('incorrect length:', length, d.byteLength);
  }

  const buffers = [];
  let gltf;
  for (let offset = 12; offset < length;) {
    const chunkLength = d.getUint32(offset, true);
    const chunkType = chunkTypeToString(d.getUint32(offset + 4, true));
    const chunk = new Uint8Array(d.buffer, offset + 8, chunkLength);
    switch (chunkType) {
      case 'JSON': {
        const decoder = new TextDecoder();
        const str = decoder.decode(chunk);
        if (gltf) {
          throw new Error('more than 1 JSON chunk');
        }
        gltf = JSON.parse(str);
        break;
      }
      case 'BIN':
        buffers.push(chunk);
        break;
    }
    offset += 8 + chunkLength;
  }

  if (!gltf) {
    throw new Error('missing JSON chunk');
  }

  gltf.buffers = gltf.buffers.map(b => buffers[0]);  // what is the point of length?

  return gltf;
}

async function loadGLTF(url) {
  const gltf = await loadJson(url);
  gltf.buffers = await loadBuffers(url, gltf.buffers);
  return gltf;
}

async function loadFile(url, typeFunc) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not load: ${url}`);
  }
  return await response[typeFunc]();
}

async function loadBinary(url) {
  return loadFile(url, 'arrayBuffer');
}

async function loadJson(url) {
  return loadFile(url, 'json');
}

async function loadBuffers(url, buffers) {
  // load all the referenced files relative to the gltf file
  const baseURL = new URL(url, location.href);
  return await Promise.all(buffers.map((buffer) => {
    const url = new URL(buffer.uri, baseURL.href);
    return loadBinary(url.href);
  }));
}

// Given an accessor index return an accessor
function getAccessorAndWebGPUBuffer(device, gltf, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  if (!bufferView.webgpuBuffer) {
    const uint8Array = gltf.buffers[bufferView.buffer];
    const data = uint8Array.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
    const usage = GPUBufferUsage.COPY_DST | 
       ((bufferView.target || WebGL2RenderingContext.ARRAY_BUFFER) === WebGL2RenderingContext.ARRAY_BUFFER ? GPUBufferUsage.VERTEX : GPUBufferUsage.INDEX);
    const buffer = device.createBuffer({
      label: `buffer${bufferView.buffer},O:${bufferView.byteOffset},L:${bufferView.byteLength}`,
      size: data.length,
      usage,
    });
    buffer.data = data;
    device.queue.writeBuffer(buffer, 0, data);
    bufferView.webgpuBuffer = buffer;
  }
  return {
    accessor,
    buffer: bufferView.webgpuBuffer,
    stride: bufferView.stride || 0,
  };
}

function throwNoKey(key) {
  throw new Error(`no key: ${key}`);
}
 
const accessorTypeToNumComponentsMap = {
  'SCALAR': 1,
  'VEC2': 2,
  'VEC3': 3,
  'VEC4': 4,
  'MAT2': 4,
  'MAT3': 9,
  'MAT4': 16,
};
 
function accessorTypeToNumComponents(type) {
  return accessorTypeToNumComponentsMap[type] || throwNoKey(type);
}

export async function gltfLoader(device, url) {
  const u = new URL(url, location.href);
  const gltf = u.pathname.endsWith('.glb')
      ? await loadGLB(url)
      : await loadGLTF(url);

  const defaultMaterial = {
    uniforms: {
      u_diffuse: [.5, .8, 1, 1],
    },
  };
 
  // setup meshes
  gltf.meshes.forEach((mesh) => {
    mesh.primitives.forEach((primitive) => {
      const attribs = {};
      let numElements;
      for (const [attribName, index] of Object.entries(primitive.attributes)) {
        const {accessor, buffer, stride} = getAccessorAndWebGPUBuffer(device, gltf, index);
        numElements = accessor.count;
        attribs[`a_${attribName}`] = {
          buffer,
          type: accessor.componentType,
          numComponents: accessorTypeToNumComponents(accessor.type),
          stride,
          offset: accessor.byteOffset | 0,
        };
      }
   
      const bufferInfo = {
        attribs,
        numElements,
      };
   
      if (primitive.indices !== undefined) {
        const {accessor, buffer} = getAccessorAndWebGPUBuffer(device, gltf, primitive.indices);
        bufferInfo.numElements = accessor.count;
        bufferInfo.indices = buffer;
        bufferInfo.elementType = accessor.componentType;
      }
   
      primitive.bufferInfo = bufferInfo;
   
      // save the material info for this primitive
      primitive.material = gltf.materials && gltf.materials[primitive.material] || defaultMaterial;
    });
  });

  return gltf;
}

function toChar(v) {
  return v ? String.fromCodePoint(v) : '';
}

function chunkTypeToString(chunkType) {
  return `${toChar(chunkType & 0xFF)}${toChar((chunkType >> 8) & 0xFF)}${toChar((chunkType >> 16) & 0xFF)}${toChar(chunkType >> 24)}`;
}

