import {
  clamp,
  createMat4,
  perspectiveMat4,
  lookAtMat4,
  multiplyMat4,
  invertMat4,
} from './math.js';
import { getSkyShaderSources, getVoxelShaderSources } from './shaders.js';

const REF_ASPECT = 16 / 9;
const REF_VFOV_RAD = (48 * Math.PI) / 180;
const MAX_VFOV_RAD = (76 * Math.PI) / 180;
const BASE_EYE = [0, 14, 72];
const CAMERA_TARGET = [0, 35, -180];
const CAMERA_UP = [0, 1, 0];
const CAMERA_NEAR = 1.0;
const CAMERA_FAR = 900.0;
const MAX_EXTRA_CAMERA_Z = 20.0;

const FULLSCREEN_TRIANGLE = new Float32Array([
  -1, -1,
   3, -1,
  -1,  3,
]);

// 24 vertices (4 per face) with outward normals and CCW winding
const CUBE_POSITIONS = new Float32Array([
  // +Z (front)
  -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
  // -Z (back)
   0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
  // +X (right)
   0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
  // -X (left)
  -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  // +Y (top)
  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
  // -Y (bottom)
  -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
]);

const CUBE_NORMALS = new Float32Array([
  // +Z
   0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,
  // -Z
   0,  0, -1,   0,  0, -1,   0,  0, -1,   0,  0, -1,
  // +X
   1,  0,  0,   1,  0,  0,   1,  0,  0,   1,  0,  0,
  // -X
  -1,  0,  0,  -1,  0,  0,  -1,  0,  0,  -1,  0,  0,
  // +Y
   0,  1,  0,   0,  1,  0,   0,  1,  0,   0,  1,  0,
  // -Y
   0, -1,  0,   0, -1,  0,   0, -1,  0,   0, -1,  0,
]);

const CUBE_INDICES = new Uint16Array([
   0,  1,  2,   0,  2,  3,
   4,  5,  6,   4,  6,  7,
   8,  9, 10,   8, 10, 11,
  12, 13, 14,  12, 14, 15,
  16, 17, 18,  16, 18, 19,
  20, 21, 22,  20, 22, 23,
]);

function setMat4Result(target, result) {
  if (result && result !== target && typeof result.length === 'number') {
    target.set(result);
  }
}

function computePerspective(out, fovy, aspect, near, far) {
  if (perspectiveMat4.length >= 5) {
    setMat4Result(out, perspectiveMat4(out, fovy, aspect, near, far));
  } else {
    setMat4Result(out, perspectiveMat4(fovy, aspect, near, far));
  }
}

function computeLookAt(out, eye, target, up) {
  if (lookAtMat4.length >= 4) {
    setMat4Result(out, lookAtMat4(out, eye, target, up));
  } else {
    setMat4Result(out, lookAtMat4(eye, target, up));
  }
}

function computeMultiply(out, a, b) {
  if (multiplyMat4.length >= 3) {
    setMat4Result(out, multiplyMat4(out, a, b));
  } else {
    setMat4Result(out, multiplyMat4(a, b));
  }
}

function computeInvert(out, a) {
  if (invertMat4.length >= 2) {
    setMat4Result(out, invertMat4(out, a));
  } else {
    setMat4Result(out, invertMat4(a));
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader object.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl, sources) {
  const vsSource = sources.vertexSource || sources.vertex || sources.vert || sources.vs;
  const fsSource = sources.fragmentSource || sources.fragment || sources.frag || sources.fs;
  if (!vsSource || !fsSource) {
    throw new Error('Shader source missing vertex or fragment code.');
  }
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error('Failed to create shader program.');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

function getUniformLocations(gl, program, names) {
  const locs = Object.create(null);
  for (let i = 0; i < names.length; i += 1) {
    locs[names[i]] = gl.getUniformLocation(program, names[i]);
  }
  return locs;
}

function createStaticBuffer(gl, target, data) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create WebGL buffer.');
  }
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

export function createRenderer(canvas, sceneData) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { supported: false, reason: 'WebGL が利用できない環境です。' };
  }

  const contextAttrs = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  };

  let gl = canvas.getContext('webgl2', contextAttrs);
  let isWebGL2 = Boolean(gl);
  let instancedExt = null;
  let vaoExt = null;

  if (!gl) {
    gl =
      canvas.getContext('webgl', contextAttrs) ||
      canvas.getContext('experimental-webgl', contextAttrs);
    isWebGL2 = false;
  }

  if (!gl) {
    return { supported: false, reason: 'WebGL が利用できない環境です。' };
  }

  if (!isWebGL2) {
    instancedExt = gl.getExtension('ANGLE_instanced_arrays');
    if (!instancedExt) {
      return {
        supported: false,
        reason: 'WebGL インスタンシング拡張（ANGLE_instanced_arrays）が利用できない環境です。',
      };
    }
    vaoExt = gl.getExtension('OES_vertex_array_object');
  }

  const totalInstances = Math.floor(sceneData.positions.length / 3);
  const metaComponents =
    totalInstances > 0
      ? clamp(Math.round(sceneData.metas.length / totalInstances), 1, 4)
      : 4;
  const cloudSpanX =
    sceneData.bounds && typeof sceneData.bounds.cloudSpanX === 'number'
      ? sceneData.bounds.cloudSpanX
      : 260.0;

  let currentQuality = 'medium';
  let isContextLost = false;
  let isDisposed = false;
  let lastCssWidth = Math.max(1, canvas.clientWidth || window.innerWidth || 1280);
  let lastCssHeight = Math.max(1, canvas.clientHeight || window.innerHeight || 720);
  let lastDpr = 1;

  const projMat = createMat4();
  const viewMat = createMat4();
  const viewProjMat = createMat4();
  const invViewProjMat = createMat4();
  const cameraPos = new Float32Array(BASE_EYE);

  const glState = {
    skyProgram: null,
    skyUniforms: null,
    skyPosLoc: -1,
    skyVao: null,
    skyBuffer: null,

    voxelProgram: null,
    voxelUniforms: null,
    voxelAttribs: null,
    voxelVao: null,
    cubePosBuffer: null,
    cubeNormBuffer: null,
    cubeIndexBuffer: null,
    instancePosBuffer: null,
    instanceScaleBuffer: null,
    instanceColorBuffer: null,
    instanceMetaBuffer: null,
  };

  function createVao() {
    if (isWebGL2) {
      return gl.createVertexArray();
    }
    return vaoExt ? vaoExt.createVertexArrayOES() : null;
  }

  function bindVao(vao) {
    if (isWebGL2) {
      gl.bindVertexArray(vao);
    } else if (vaoExt) {
      vaoExt.bindVertexArrayOES(vao);
    }
  }

  function deleteVao(vao) {
    if (!vao) {
      return;
    }
    if (isWebGL2) {
      gl.deleteVertexArray(vao);
    } else if (vaoExt) {
      vaoExt.deleteVertexArrayOES(vao);
    }
  }

  function setAttribDivisor(loc, divisor) {
    if (loc < 0) {
      return;
    }
    if (isWebGL2) {
      gl.vertexAttribDivisor(loc, divisor);
    } else if (instancedExt) {
      instancedExt.vertexAttribDivisorANGLE(loc, divisor);
    }
  }

  function drawElementsInstanced(mode, count, type, offset, primCount) {
    if (isWebGL2) {
      gl.drawElementsInstanced(mode, count, type, offset, primCount);
    } else if (instancedExt) {
      instancedExt.drawElementsInstancedANGLE(mode, count, type, offset, primCount);
    }
  }

  function bindSkyAttributes() {
    gl.bindBuffer(gl.ARRAY_BUFFER, glState.skyBuffer);
    if (glState.skyPosLoc >= 0) {
      gl.enableVertexAttribArray(glState.skyPosLoc);
      gl.vertexAttribPointer(glState.skyPosLoc, 2, gl.FLOAT, false, 0, 0);
      setAttribDivisor(glState.skyPosLoc, 0);
    }
  }

  function bindVoxelAttributes() {
    const a = glState.voxelAttribs;

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.cubePosBuffer);
    if (a.position >= 0) {
      gl.enableVertexAttribArray(a.position);
      gl.vertexAttribPointer(a.position, 3, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.position, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.cubeNormBuffer);
    if (a.normal >= 0) {
      gl.enableVertexAttribArray(a.normal);
      gl.vertexAttribPointer(a.normal, 3, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.normal, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.instancePosBuffer);
    if (a.instancePos >= 0) {
      gl.enableVertexAttribArray(a.instancePos);
      gl.vertexAttribPointer(a.instancePos, 3, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.instancePos, 1);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.instanceScaleBuffer);
    if (a.instanceScale >= 0) {
      gl.enableVertexAttribArray(a.instanceScale);
      gl.vertexAttribPointer(a.instanceScale, 3, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.instanceScale, 1);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.instanceColorBuffer);
    if (a.instanceColor >= 0) {
      gl.enableVertexAttribArray(a.instanceColor);
      gl.vertexAttribPointer(a.instanceColor, 3, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.instanceColor, 1);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.instanceMetaBuffer);
    if (a.instanceMeta >= 0) {
      gl.enableVertexAttribArray(a.instanceMeta);
      gl.vertexAttribPointer(a.instanceMeta, metaComponents, gl.FLOAT, false, 0, 0);
      setAttribDivisor(a.instanceMeta, 1);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glState.cubeIndexBuffer);
  }

  function disableVoxelAttributesFallback() {
    const a = glState.voxelAttribs;
    if (!a) {
      return;
    }
    const locs = [
      a.position,
      a.normal,
      a.instancePos,
      a.instanceScale,
      a.instanceColor,
      a.instanceMeta,
    ];
    for (let i = 0; i < locs.length; i += 1) {
      if (locs[i] >= 0) {
        setAttribDivisor(locs[i], 0);
        gl.disableVertexAttribArray(locs[i]);
      }
    }
  }

  function releaseGLResources() {
    deleteVao(glState.skyVao);
    deleteVao(glState.voxelVao);

    const buffers = [
      glState.skyBuffer,
      glState.cubePosBuffer,
      glState.cubeNormBuffer,
      glState.cubeIndexBuffer,
      glState.instancePosBuffer,
      glState.instanceScaleBuffer,
      glState.instanceColorBuffer,
      glState.instanceMetaBuffer,
    ];
    for (let i = 0; i < buffers.length; i += 1) {
      if (buffers[i]) {
        gl.deleteBuffer(buffers[i]);
      }
    }

    if (glState.skyProgram) {
      gl.deleteProgram(glState.skyProgram);
    }
    if (glState.voxelProgram) {
      gl.deleteProgram(glState.voxelProgram);
    }

    glState.skyProgram = null;
    glState.skyUniforms = null;
    glState.skyPosLoc = -1;
    glState.skyVao = null;
    glState.skyBuffer = null;

    glState.voxelProgram = null;
    glState.voxelUniforms = null;
    glState.voxelAttribs = null;
    glState.voxelVao = null;
    glState.cubePosBuffer = null;
    glState.cubeNormBuffer = null;
    glState.cubeIndexBuffer = null;
    glState.instancePosBuffer = null;
    glState.instanceScaleBuffer = null;
    glState.instanceColorBuffer = null;
    glState.instanceMetaBuffer = null;
  }

  function initGLResources() {
    if (!isWebGL2) {
      instancedExt = gl.getExtension('ANGLE_instanced_arrays');
      vaoExt = gl.getExtension('OES_vertex_array_object');
      if (!instancedExt) {
        throw new Error('ANGLE_instanced_arrays unavailable after context init.');
      }
    }

    // Pass 1: Sky program & fullscreen triangle
    const skySources = getSkyShaderSources(isWebGL2);
    glState.skyProgram = createProgram(gl, skySources);
    glState.skyUniforms = getUniformLocations(gl, glState.skyProgram, [
      'uInvViewProj',
      'uCameraPos',
      'uTime',
      'uSunDir',
      'uSkyZenith',
      'uSkyMid',
      'uSkyHorizon',
      'uSunColor',
      'uGodRayColor',
      'uGodRayIntensity',
      'uStarIntensity',
    ]);
    glState.skyPosLoc = gl.getAttribLocation(glState.skyProgram, 'aPosition');
    if (glState.skyPosLoc < 0) {
      glState.skyPosLoc = gl.getAttribLocation(glState.skyProgram, 'aPos');
    }
    glState.skyBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE);
    glState.skyVao = createVao();
    if (glState.skyVao) {
      bindVao(glState.skyVao);
      bindSkyAttributes();
      bindVao(null);
    }

    // Pass 2: Voxel instanced program & geometry/instance buffers
    const voxelSources = getVoxelShaderSources(isWebGL2);
    glState.voxelProgram = createProgram(gl, voxelSources);
    glState.voxelUniforms = getUniformLocations(gl, glState.voxelProgram, [
      'uViewProj',
      'uCameraPos',
      'uTime',
      'uCloudSpanX',
      'uSunDir',
      'uSunColor',
      'uSunIntensity',
      'uAmbientSky',
      'uAmbientGround',
      'uFogColor',
      'uFogDensity',
      'uCloudTint',
      'uWindowGlow',
      'uParticleGlow',
      'uParticleColor',
    ]);
    glState.voxelAttribs = {
      position: gl.getAttribLocation(glState.voxelProgram, 'aPosition'),
      normal: gl.getAttribLocation(glState.voxelProgram, 'aNormal'),
      instancePos: gl.getAttribLocation(glState.voxelProgram, 'aInstancePos'),
      instanceScale: gl.getAttribLocation(glState.voxelProgram, 'aInstanceScale'),
      instanceColor: gl.getAttribLocation(glState.voxelProgram, 'aInstanceColor'),
      instanceMeta: gl.getAttribLocation(glState.voxelProgram, 'aInstanceMeta'),
    };

    glState.cubePosBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, CUBE_POSITIONS);
    glState.cubeNormBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, CUBE_NORMALS);
    glState.cubeIndexBuffer = createStaticBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES);
    glState.instancePosBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, sceneData.positions);
    glState.instanceScaleBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, sceneData.scales);
    glState.instanceColorBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, sceneData.colors);
    glState.instanceMetaBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, sceneData.metas);

    glState.voxelVao = createVao();
    if (glState.voxelVao) {
      bindVao(glState.voxelVao);
      bindVoxelAttributes();
      bindVao(null);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.clearColor(0.05, 0.08, 0.16, 1.0);
    gl.clearDepth(1.0);
  }

  function updateCameraMatrices(width, height) {
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    let vfov = REF_VFOV_RAD;
    let extraZ = 0.0;

    if (aspect < REF_ASPECT) {
      const refHalfTanH = Math.tan(REF_VFOV_RAD * 0.5) * REF_ASPECT;
      const desiredVfov = 2.0 * Math.atan(refHalfTanH / Math.max(aspect, 0.2));
      vfov = clamp(desiredVfov, REF_VFOV_RAD, MAX_VFOV_RAD);

      if (desiredVfov > MAX_VFOV_RAD) {
        const currentHalfTanH = Math.tan(vfov * 0.5) * aspect;
        const coverageRatio = refHalfTanH / Math.max(currentHalfTanH, 1e-4);
        extraZ = clamp((coverageRatio - 1.0) * 35.0, 0.0, MAX_EXTRA_CAMERA_Z);
      }
    }

    cameraPos[0] = BASE_EYE[0];
    cameraPos[1] = BASE_EYE[1];
    cameraPos[2] = BASE_EYE[2] + extraZ;

    computePerspective(projMat, vfov, aspect, CAMERA_NEAR, CAMERA_FAR);
    computeLookAt(viewMat, cameraPos, CAMERA_TARGET, CAMERA_UP);
    computeMultiply(viewProjMat, projMat, viewMat);
    computeInvert(invViewProjMat, viewProjMat);
  }

  function getInstanceCount() {
    const counts = sceneData.counts || {};
    const requested =
      typeof counts[currentQuality] === 'number'
        ? counts[currentQuality]
        : typeof counts.medium === 'number'
          ? counts.medium
          : totalInstances;
    return clamp(Math.floor(requested), 0, totalInstances);
  }

  try {
    initGLResources();
  } catch (err) {
    releaseGLResources();
    return {
      supported: false,
      reason: `WebGL シェーダー初期化に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  function resize(cssWidth, cssHeight, dpr) {
    if (isDisposed) {
      return;
    }
    const safeWidth = Math.max(1, Math.floor(cssWidth || 1));
    const safeHeight = Math.max(1, Math.floor(cssHeight || 1));
    const safeDpr = Math.max(0.5, Number.isFinite(dpr) ? dpr : 1);

    lastCssWidth = safeWidth;
    lastCssHeight = safeHeight;
    lastDpr = safeDpr;

    const pixelWidth = Math.max(1, Math.round(safeWidth * safeDpr));
    const pixelHeight = Math.max(1, Math.round(safeHeight * safeDpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    if (!isContextLost) {
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    }
    updateCameraMatrices(pixelWidth, pixelHeight);
  }

  function setQuality(quality) {
    if (quality === 'high' || quality === 'medium' || quality === 'eco') {
      currentQuality = quality;
    }
  }

  function render(elapsedSec, envState) {
    if (isDisposed || isContextLost || !glState.skyProgram || !glState.voxelProgram) {
      return;
    }

    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Pass 1: Sky + Sun/Moon/Stars + God Rays
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(glState.skyProgram);
    const su = glState.skyUniforms;
    if (su.uInvViewProj) gl.uniformMatrix4fv(su.uInvViewProj, false, invViewProjMat);
    if (su.uCameraPos) gl.uniform3fv(su.uCameraPos, cameraPos);
    if (su.uTime) gl.uniform1f(su.uTime, elapsedSec);
    if (su.uSunDir) gl.uniform3fv(su.uSunDir, envState.sunDir);
    if (su.uSkyZenith) gl.uniform3fv(su.uSkyZenith, envState.skyZenith);
    if (su.uSkyMid) gl.uniform3fv(su.uSkyMid, envState.skyMid);
    if (su.uSkyHorizon) gl.uniform3fv(su.uSkyHorizon, envState.skyHorizon);
    if (su.uSunColor) gl.uniform3fv(su.uSunColor, envState.sunColor);
    if (su.uGodRayColor) gl.uniform3fv(su.uGodRayColor, envState.godRayColor);
    if (su.uGodRayIntensity) gl.uniform1f(su.uGodRayIntensity, envState.godRayIntensity);
    if (su.uStarIntensity) gl.uniform1f(su.uStarIntensity, envState.starIntensity);

    if (glState.skyVao) {
      bindVao(glState.skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      bindVao(null);
    } else {
      bindSkyAttributes();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (glState.skyPosLoc >= 0) {
        gl.disableVertexAttribArray(glState.skyPosLoc);
      }
    }

    // Pass 2: Instanced 3D Voxels
    const instanceCount = getInstanceCount();
    if (instanceCount > 0) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      gl.useProgram(glState.voxelProgram);
      const vu = glState.voxelUniforms;
      if (vu.uViewProj) gl.uniformMatrix4fv(vu.uViewProj, false, viewProjMat);
      if (vu.uCameraPos) gl.uniform3fv(vu.uCameraPos, cameraPos);
      if (vu.uTime) gl.uniform1f(vu.uTime, elapsedSec);
      if (vu.uCloudSpanX) gl.uniform1f(vu.uCloudSpanX, cloudSpanX);
      if (vu.uSunDir) gl.uniform3fv(vu.uSunDir, envState.sunDir);
      if (vu.uSunColor) gl.uniform3fv(vu.uSunColor, envState.sunColor);
      if (vu.uSunIntensity) gl.uniform1f(vu.uSunIntensity, envState.sunIntensity);
      if (vu.uAmbientSky) gl.uniform3fv(vu.uAmbientSky, envState.ambientSky);
      if (vu.uAmbientGround) gl.uniform3fv(vu.uAmbientGround, envState.ambientGround);
      if (vu.uFogColor) gl.uniform3fv(vu.uFogColor, envState.fogColor);
      if (vu.uFogDensity) gl.uniform1f(vu.uFogDensity, envState.fogDensity);
      if (vu.uCloudTint) gl.uniform3fv(vu.uCloudTint, envState.cloudTint);
      if (vu.uWindowGlow) gl.uniform1f(vu.uWindowGlow, envState.windowGlow);
      if (vu.uParticleGlow) gl.uniform1f(vu.uParticleGlow, envState.particleGlow);
      if (vu.uParticleColor) gl.uniform3fv(vu.uParticleColor, envState.particleColor);

      if (glState.voxelVao) {
        bindVao(glState.voxelVao);
        drawElementsInstanced(gl.TRIANGLES, CUBE_INDICES.length, gl.UNSIGNED_SHORT, 0, instanceCount);
        bindVao(null);
      } else {
        bindVoxelAttributes();
        drawElementsInstanced(gl.TRIANGLES, CUBE_INDICES.length, gl.UNSIGNED_SHORT, 0, instanceCount);
        disableVoxelAttributesFallback();
      }
    }
  }

  function handleContextLost(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    isContextLost = true;
  }

  function handleContextRestored() {
    if (isDisposed) {
      return;
    }
    try {
      releaseGLResources();
      initGLResources();
      isContextLost = false;
      resize(lastCssWidth, lastCssHeight, lastDpr);
    } catch {
      isContextLost = true;
    }
  }

  function dispose() {
    if (isDisposed) {
      return;
    }
    releaseGLResources();
    isDisposed = true;
  }

  return {
    supported: true,
    isWebGL2,
    resize,
    setQuality,
    render,
    handleContextLost,
    handleContextRestored,
    dispose,
  };
}
