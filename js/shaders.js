// WebGL2 / WebGL1 GLSL shader definitions for sky, god rays, and instanced 3D voxels.

export const VOXEL_TYPE = Object.freeze({
  STATIC: 0,
  CITADEL: 1,
  CLOUD: 2,
  GRASS: 3,
  WATERFALL: 4,
  MIST: 5,
  PARTICLE: 6,
  WINDOW_LIGHT: 7,
});

export function getSkyShaderSources(isWebGL2) {
  const versionHeader = isWebGL2 ? '#version 300 es\n' : '';
  const vsIn = isWebGL2 ? 'layout(location = 0) in' : 'attribute';
  const vsOut = isWebGL2 ? 'out' : 'varying';
  const fsIn = isWebGL2 ? 'in' : 'varying';
  const fsOutDecl = isWebGL2 ? 'out vec4 fragColor;\n' : '';
  const fsOutVar = isWebGL2 ? 'fragColor' : 'gl_FragColor';

  const vertexSource = `${versionHeader}precision highp float;

${vsIn} vec2 aPosition;
${vsOut} vec2 vNdc;

void main() {
  vNdc = aPosition;
  gl_Position = vec4(aPosition, 0.9999, 1.0);
}
`;

  const fragmentSource = `${versionHeader}precision highp float;

${fsIn} vec2 vNdc;
${fsOutDecl}
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform vec3 uGodRayColor;
uniform float uGodRayIntensity;
uniform float uStarIntensity;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 acesToneMap(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec4 worldFar = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 worldPos = worldFar.xyz / max(worldFar.w, 1e-5);
  vec3 rayDir = normalize(worldPos - uCameraPos);
  vec3 sunDir = normalize(uSunDir);

  // 3-stop sky gradient with soft below-horizon haze.
  float elev = rayDir.y;
  float midT = smoothstep(-0.04, 0.28, elev);
  float zenithT = smoothstep(0.22, 0.85, elev);
  vec3 skyColor = mix(uSkyHorizon, uSkyMid, midT);
  skyColor = mix(skyColor, uSkyZenith, zenithT);
  float belowHaze = smoothstep(0.02, -0.35, elev);
  skyColor = mix(skyColor, uSkyHorizon * 0.78, belowHaze * 0.55);

  // Sun / moon disc and atmospheric scattering halo.
  float sunCos = max(dot(rayDir, sunDir), 0.0);
  float haloWide = pow(sunCos, 5.0) * 0.34;
  float haloMid = pow(sunCos, 32.0) * 0.55;
  float disc = smoothstep(0.9972, 0.9991, sunCos);
  float horizonMask = smoothstep(-0.08, 0.08, elev);
  skyColor += uSunColor * (haloWide + haloMid) * horizonMask;
  skyColor += uSunColor * disc * 2.2 * horizonMask;

  // Radial god rays streaming from behind the floating citadel / sun direction.
  if (uGodRayIntensity > 0.001) {
    vec3 rayOriginDir = normalize(mix(vec3(-0.015, 0.20, -0.98), sunDir, 0.42));
    vec3 upRef = vec3(0.0, 1.0, 0.0);
    vec3 rightAxis = normalize(cross(upRef, rayOriginDir));
    vec3 upAxis = cross(rayOriginDir, rightAxis);

    vec3 diff = rayDir - rayOriginDir * dot(rayDir, rayOriginDir);
    float px = dot(diff, rightAxis);
    float py = dot(diff, upAxis);
    float angle = atan(py, px);
    float radial = max(dot(rayDir, rayOriginDir), 0.0);

    float waveA = 0.5 + 0.5 * sin(angle * 9.0 + uTime * 0.16);
    float waveB = 0.5 + 0.5 * sin(angle * 17.0 - uTime * 0.24 + 1.4);
    float waveC = 0.5 + 0.5 * sin(angle * 5.0 + uTime * 0.09 - 0.7);
    float beams = pow(waveA * 0.5 + waveB * 0.35 + waveC * 0.15, 2.2);

    float cone = pow(radial, 2.6) * smoothstep(-0.05, 0.45, elev);
    float centerSoft = smoothstep(0.998, 0.92, radial) * 0.75 + 0.25;
    float godRay = beams * cone * centerSoft * uGodRayIntensity;
    skyColor += uGodRayColor * godRay * 0.65;
  }

  // Twinkling night stars.
  if (uStarIntensity > 0.001 && elev > 0.02) {
    vec3 starGrid = floor(rayDir * 240.0);
    float h = hash31(starGrid);
    if (h > 0.9915) {
      vec3 cellCenter = normalize(starGrid + vec3(0.5));
      float d = length(rayDir - cellCenter) * 240.0;
      float starPoint = smoothstep(0.42, 0.05, d);
      float twinkle = 0.62 + 0.38 * sin(uTime * (2.0 + fract(h * 97.3) * 3.5) + h * 120.0);
      float starFade = smoothstep(0.03, 0.32, elev);
      vec3 starTint = mix(vec3(0.78, 0.87, 1.0), vec3(1.0, 0.93, 0.82), fract(h * 53.7));
      skyColor += starTint * starPoint * twinkle * starFade * uStarIntensity * 1.45;
    }
  }

  vec3 finalColor = acesToneMap(skyColor);
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  ${fsOutVar} = vec4(finalColor, 1.0);
}
`;

  return { vertexSource, fragmentSource };
}

export function getVoxelShaderSources(isWebGL2) {
  const versionHeader = isWebGL2 ? '#version 300 es\n' : '';
  const vsIn0 = isWebGL2 ? 'layout(location = 0) in' : 'attribute';
  const vsIn1 = isWebGL2 ? 'layout(location = 1) in' : 'attribute';
  const vsIn2 = isWebGL2 ? 'layout(location = 2) in' : 'attribute';
  const vsIn3 = isWebGL2 ? 'layout(location = 3) in' : 'attribute';
  const vsIn4 = isWebGL2 ? 'layout(location = 4) in' : 'attribute';
  const vsIn5 = isWebGL2 ? 'layout(location = 5) in' : 'attribute';
  const vsOut = isWebGL2 ? 'out' : 'varying';
  const fsIn = isWebGL2 ? 'in' : 'varying';
  const fsOutDecl = isWebGL2 ? 'out vec4 fragColor;\n' : '';
  const fsOutVar = isWebGL2 ? 'fragColor' : 'gl_FragColor';

  const vertexSource = `${versionHeader}precision highp float;

${vsIn0} vec3 aPosition;
${vsIn1} vec3 aNormal;
${vsIn2} vec3 aInstancePos;
${vsIn3} vec3 aInstanceScale;
${vsIn4} vec3 aInstanceColor;
${vsIn5} vec4 aInstanceMeta;

uniform mat4 uViewProj;
uniform float uTime;
uniform float uCloudSpanX;

${vsOut} vec3 vNormal;
${vsOut} vec3 vColor;
${vsOut} vec3 vWorldPos;
${vsOut} float vType;
${vsOut} float vEffect;

void main() {
  float vTypeId = floor(aInstanceMeta.x + 0.5);
  float phase = aInstanceMeta.y;
  float speed = aInstanceMeta.z;
  float extra = aInstanceMeta.w;

  vec3 instPos = aInstancePos;
  vec3 localPos = aPosition * aInstanceScale;
  float effectVal = 0.0;

  if (vTypeId > 0.5 && vTypeId < 1.5) {
    // CITADEL: unified slow vertical hover; detached rock fragments add independent bobbing.
    float citadelBob = sin(uTime * 0.45) * 1.6 + sin(uTime * 0.21 + 1.2) * 0.6;
    instPos.y += citadelBob;
    if (extra > 0.5) {
      instPos.y += sin(uTime * speed + phase) * 0.95;
      instPos.x += cos(uTime * speed * 0.6 + phase) * 0.25;
    }
  } else if (vTypeId > 1.5 && vTypeId < 2.5) {
    // CLOUD: seamless horizontal wrap across uCloudSpanX with smooth 40-unit edge fade.
    float halfSpan = max(uCloudSpanX * 0.5, 1.0);
    float wrappedX = mod(instPos.x + uTime * speed + halfSpan, uCloudSpanX) - halfSpan;
    float edgeDist = halfSpan - abs(wrappedX);
    float edgeFade = smoothstep(0.0, 40.0, edgeDist);
    instPos.x = wrappedX;
    instPos.y += sin(uTime * 0.35 + phase) * 0.42;
    localPos *= edgeFade;
    effectVal = edgeFade;
  } else if (vTypeId > 2.5 && vTypeId < 3.5) {
    // GRASS: rooted at bottom (tip = 0), swaying wind wave toward tip (tip = 1).
    float tip = clamp(aPosition.y + 0.5, 0.0, 1.0);
    float wind = sin(uTime * speed + phase + instPos.x * 0.32 + instPos.z * 0.24) * 0.28
               + sin(uTime * (speed * 1.65) + phase * 1.35) * 0.09;
    float swayAmp = tip * tip * max(aInstanceScale.y, 0.4);
    localPos.x += wind * swayAmp;
    localPos.z += wind * 0.45 * swayAmp;
    effectVal = tip;
  } else if (vTypeId > 3.5 && vTypeId < 4.5) {
    // WATERFALL: continuous vertical drop loop with subtle parabolic leap & stretch.
    float t = fract(phase + uTime * speed);
    instPos.y -= t * extra;
    instPos.x -= (1.0 - pow(max(1.0 - t, 0.0001), 2.2)) * 3.8;
    instPos.z -= t * 0.85;
    float wfEdge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.92, t);
    localPos.y *= (0.85 + t * 0.85);
    localPos *= mix(0.6, 1.0, wfEdge);
    float foamWave = 0.5 + 0.5 * sin(t * 42.0 - uTime * 6.5 + phase * 12.0);
    effectVal = clamp(smoothstep(0.45, 1.0, t) * 0.65 + foamWave * 0.38, 0.0, 1.0);
  } else if (vTypeId > 4.5 && vTypeId < 5.5) {
    // MIST: rises from plunge pool, spreads in XZ, fades in/out smoothly via sin(life * PI).
    float life = fract(phase + uTime * speed);
    float env = sin(life * 3.14159265);
    float angle = phase * 6.2831853;
    instPos.y += life * extra;
    instPos.x += cos(angle) * life * (extra * 0.65);
    instPos.z += sin(angle) * life * (extra * 0.65);
    localPos *= env;
    effectVal = env;
  } else if (vTypeId > 5.5 && vTypeId < 6.5) {
    // PARTICLE: gentle upward drift with meandering XZ path and twinkling scale.
    float life = fract(phase + uTime * speed);
    float env = sin(life * 3.14159265);
    instPos.y += life * extra;
    instPos.x += sin(uTime * 0.85 + phase * 11.0) * 1.45;
    instPos.z += cos(uTime * 0.72 + phase * 9.0) * 1.45;
    float twinkle = 0.55 + 0.45 * sin(uTime * 3.2 + phase * 17.0);
    localPos *= env * (0.65 + 0.35 * twinkle);
    effectVal = env * twinkle;
  } else if (vTypeId > 6.5) {
    // WINDOW_LIGHT: exact same hover offset as CITADEL so windows stay locked to walls.
    float citadelBob = sin(uTime * 0.45) * 1.6 + sin(uTime * 0.21 + 1.2) * 0.6;
    instPos.y += citadelBob;
    effectVal = 0.78 + 0.22 * sin(uTime * 1.35 + phase * 13.0);
  }

  vec3 worldPos = instPos + localPos;
  vWorldPos = worldPos;
  vNormal = aNormal;
  vColor = aInstanceColor;
  vType = vTypeId;
  vEffect = effectVal;

  gl_Position = uViewProj * vec4(worldPos, 1.0);
}
`;

  const fragmentSource = `${versionHeader}precision highp float;

${fsIn} vec3 vNormal;
${fsIn} vec3 vColor;
${fsIn} vec3 vWorldPos;
${fsIn} float vType;
${fsIn} float vEffect;
${fsOutDecl}
uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCloudTint;
uniform float uWindowGlow;
uniform float uParticleGlow;
uniform vec3 uParticleColor;

vec3 acesToneMap(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);

  float ndotl = max(dot(N, sunDir), 0.0);
  vec3 hemi = mix(uAmbientGround, uAmbientSky, N.y * 0.5 + 0.5);
  float fresnel = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);

  vec3 lit = vColor * (hemi + uSunColor * uSunIntensity * ndotl);

  if (vType > 1.5 && vType < 2.5) {
    // CLOUD: soft wrap lighting + warm/cool cloud tint + backlit silver rim.
    float wrap = clamp((dot(N, sunDir) + 0.55) / 1.55, 0.0, 1.0);
    float backScatter = pow(max(dot(-viewDir, sunDir), 0.0), 3.5);
    vec3 cloudBase = vColor * uCloudTint;
    lit = cloudBase * (hemi * 0.9 + uSunColor * uSunIntensity * (0.45 + 0.72 * wrap));
    lit += uSunColor * (backScatter * 0.42 + fresnel * 0.14) * uSunIntensity;
  } else if (vType > 2.5 && vType < 3.5) {
    // GRASS: tip brightening + subtle sunlight translucency.
    float tipShade = mix(0.76, 1.18, vEffect);
    float backLit = pow(max(dot(-viewDir, sunDir), 0.0), 2.5) * 0.25 * vEffect;
    lit = lit * tipShade + vColor * uSunColor * uSunIntensity * backLit;
  } else if (vType > 3.5 && vType < 4.5) {
    // WATERFALL: shimmering cyan-blue flow + white foam crests + crisp specular glint.
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = pow(max(dot(N, halfVec), 0.0), 28.0);
    float shimmer = 0.5 + 0.5 * sin(vWorldPos.y * 2.2 + uTime * 8.5 + vWorldPos.x * 1.3);
    vec3 foamColor = mix(vColor, vec3(0.95, 0.98, 1.0), clamp(vEffect * 0.72 + shimmer * 0.18, 0.0, 1.0));
    lit = foamColor * (hemi * 1.05 + uSunColor * uSunIntensity * (0.45 + 0.65 * ndotl));
    lit += uSunColor * spec * 0.75 * uSunIntensity + vec3(0.10, 0.16, 0.20) * vEffect;
  } else if (vType > 4.5 && vType < 5.5) {
    // MIST: airy backlit spray around the plunge pool.
    vec3 mistTint = mix(vColor, uCloudTint, 0.45);
    lit = mistTint * (hemi * 1.15 + uSunColor * uSunIntensity * 0.72) + vec3(0.06) * vEffect;
  } else if (vType > 5.5 && vType < 6.5) {
    // PARTICLE: luminous floating motes.
    vec3 glow = uParticleColor * (0.55 + uParticleGlow * 1.85) * (0.45 + 0.85 * vEffect);
    lit = mix(vColor * hemi, glow, 0.82);
  } else if (vType > 6.5) {
    // WINDOW_LIGHT: muted during daytime, warm golden glow at dusk/night.
    vec3 dayStone = vColor * (hemi + uSunColor * uSunIntensity * ndotl) * 0.55;
    vec3 nightGlow = vColor * (1.35 + 2.6 * vEffect) * uWindowGlow;
    lit = dayStone + nightGlow;
  } else if (vType > 0.5 && vType < 1.5) {
    // CITADEL: subtle atmospheric rim highlight to accentuate monumental silhouettes.
    lit += uSunColor * fresnel * 0.12 * uSunIntensity;
  }

  // Distance + altitude atmospheric fog.
  float dist = length(vWorldPos - uCameraPos);
  float heightAtten = exp(-max(vWorldPos.y + 8.0, 0.0) * 0.011);
  float fogAmount = 1.0 - exp(-dist * uFogDensity * mix(0.48, 1.0, heightAtten));
  fogAmount = clamp(fogAmount, 0.0, 0.92);

  if (vType > 6.5) {
    fogAmount *= 0.42;
  } else if (vType > 5.5 && vType < 6.5) {
    fogAmount *= 0.35;
  } else if (vType > 0.5 && vType < 1.5) {
    fogAmount = min(fogAmount * 0.85, 0.52);
  }

  vec3 color = mix(lit, uFogColor, fogAmount);
  color = acesToneMap(color);
  color = pow(color, vec3(1.0 / 2.2));
  ${fsOutVar} = vec4(color, 1.0);
}
`;

  return { vertexSource, fragmentSource };
}
