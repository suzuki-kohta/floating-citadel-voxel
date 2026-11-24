// Procedural 3D voxel scene builder for the Floating Citadel, Sea of Clouds,
// distant mountains, forest valley, foreground grassy cliff, waterfall, mist, and light particles.

import { clamp, lerp, createRng, fbm2D } from './math.js';
import { VOXEL_TYPE } from './shaders.js';

const TWO_PI = Math.PI * 2;

function createVoxelBuilder() {
  const positions = [];
  const scales = [];
  const colors = [];
  const metas = [];

  function add(x, y, z, sx, sy, sz, r, g, b, type, phase = 0, speed = 0, extra = 0) {
    positions.push(x, y, z);
    scales.push(sx, sy, sz);
    colors.push(r, g, b);
    metas.push(type, phase, speed, extra);
  }

  function count() {
    return positions.length / 3;
  }

  function toTypedArrays() {
    return {
      positions: new Float32Array(positions),
      scales: new Float32Array(scales),
      colors: new Float32Array(colors),
      metas: new Float32Array(metas),
    };
  }

  return { add, count, toTypedArrays };
}

function jitterColor(base, amount, rng) {
  const d = (rng() - 0.5) * 2 * amount;
  return [
    clamp(base[0] + d, 0, 1),
    clamp(base[1] + d * 0.95, 0, 1),
    clamp(base[2] + d * 0.9, 0, 1),
  ];
}

function addCitadel(builder, rng) {
  const cx = -4;
  const cy = 62;
  const cz = -210;

  const ironHullDark = [0.22, 0.24, 0.28];
  const ironHullMid = [0.31, 0.34, 0.39];
  const ironHullLight = [0.42, 0.45, 0.50];
  const trimSilver = [0.54, 0.58, 0.64];
  const obeliskLight = [0.88, 0.90, 0.92];
  const obeliskMid = [0.74, 0.77, 0.82];
  const crownCrimson = [0.68, 0.22, 0.20];
  const crownRedLight = [0.80, 0.34, 0.28];
  const crownRedDark = [0.46, 0.14, 0.14];
  const bedrockDark = [0.16, 0.18, 0.22];
  const bedrockMid = [0.26, 0.28, 0.33];
  const windowWarm = [1.0, 0.80, 0.42];
  const windowSoft = [1.0, 0.90, 0.64];

  function addCitadelVoxel(x, y, z, sx, sy, sz, color, extra = 0, speed = 0) {
    builder.add(
      cx + x,
      cy + y,
      cz + z,
      sx,
      sy,
      sz,
      color[0],
      color[1],
      color[2],
      VOXEL_TYPE.CITADEL,
      rng() * TWO_PI,
      speed,
      extra,
    );
  }

  function addWindowVoxel(x, y, z, sx, sy, sz) {
    const col = rng() > 0.35 ? windowWarm : windowSoft;
    builder.add(
      cx + x,
      cy + y,
      cz + z,
      sx,
      sy,
      sz,
      col[0],
      col[1],
      col[2],
      VOXEL_TYPE.WINDOW_LIGHT,
      rng() * TWO_PI,
      0,
      0,
    );
  }

  function bedrockWave(angle, waveScale) {
    return (Math.sin(angle * 3 + 0.5) * 4.2 + Math.cos(angle * 5 - 1.1) * 2.8) * waveScale;
  }

  function addRing(
    y,
    radius,
    thickness,
    height,
    voxelW,
    baseColor,
    windowChance = 0,
    startAngle = 0,
    endAngle = TWO_PI,
    radialJitter = 0,
    waveScale = 0,
  ) {
    const arcSpan = Math.max(0.01, endAngle - startAngle);
    const arcLen = arcSpan * radius;
    const isFull = arcSpan >= TWO_PI - 0.001;
    const steps = Math.max(isFull ? 12 : 4, Math.round(arcLen / voxelW));
    const denom = isFull ? steps : Math.max(1, steps - 1);

    for (let i = 0; i < steps; i += 1) {
      const a = startAngle + (i / denom) * arcSpan;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const wave = waveScale > 0 ? bedrockWave(a, waveScale) : 0;
      const jitter = radialJitter > 0 ? (rng() - 0.5) * 2.0 * radialJitter : 0;
      const r = Math.max(2.0, radius + wave + jitter);
      const x = cosA * r;
      const z = sinA * r;
      const c = jitterColor(baseColor, 0.038, rng);
      addCitadelVoxel(x, y, z, thickness, height, thickness, c);

      if (windowChance > 0 && sinA > 0.05 && rng() < windowChance) {
        const wx = cosA * (r + thickness * 0.52);
        const wz = sinA * (r + thickness * 0.52);
        addWindowVoxel(wx, y + (rng() - 0.5) * height * 0.25, wz, 0.85, 0.55, 0.65);
      }
    }
  }

  function addObeliskSpire(x, baseY, z, baseWidth, spireHeight) {
    // Dark iron mounting socket at base
    addCitadelVoxel(x, baseY + 0.4, z, baseWidth * 1.35, 1.5, baseWidth * 1.35, jitterColor(ironHullDark, 0.03, rng));

    const segs = Math.max(5, Math.round(spireHeight / 2.2));
    const segStep = spireHeight / segs;
    for (let s = 0; s < segs; s += 1) {
      const t = s / segs;
      const w = lerp(baseWidth, 0.40, Math.pow(t, 0.88));
      const sy = baseY + 0.9 + (s + 0.5) * segStep;
      const colBase = t > 0.35 ? obeliskLight : obeliskMid;
      addCitadelVoxel(x, sy, z, w, segStep * 1.12, w, jitterColor(colBase, 0.025, rng));
    }

    // Crisp silver-white needle tip
    addCitadelVoxel(x, baseY + spireHeight + 2.0, z, 0.36, 2.5, 0.36, jitterColor(obeliskLight, 0.02, rng));
  }

  function addHangingChain(x, startY, z, length) {
    const links = Math.max(4, Math.round(length / 1.9));
    for (let k = 0; k < links; k += 1) {
      const t = k / (links - 1);
      const baseW = lerp(1.05, 0.38, t);
      const linkW = k % 2 === 0 ? baseW : baseW * 0.72;
      const colBase = k % 3 === 0 ? trimSilver : ironHullDark;
      addCitadelVoxel(x, startY - k * 1.85, z, linkW, 1.7, linkW, jitterColor(colBase, 0.035, rng));
    }
  }

  // -------------------------------------------------------------------------
  // 1. LOWER ROUGH ASYMMETRIC FRACTURED BEDROCK (dy = -56 to -4)
  // -------------------------------------------------------------------------
  const lowerBedrockTiers = [
    { dy: -46.0, r: 10.0, h: 6.0, thick: 3.8, col: bedrockDark, wave: 0.42 },
    { dy: -40.2, r: 14.2, h: 6.0, thick: 4.0, col: bedrockMid, wave: 0.52 },
    { dy: -34.5, r: 18.8, h: 6.0, thick: 4.2, col: bedrockDark, wave: 0.62 },
    { dy: -28.8, r: 23.8, h: 6.0, thick: 4.4, col: bedrockMid, wave: 0.72 },
    { dy: -23.0, r: 29.0, h: 6.0, thick: 4.6, col: bedrockDark, wave: 0.82 },
    { dy: -17.2, r: 34.4, h: 6.0, thick: 4.8, col: bedrockMid, wave: 0.90 },
    { dy: -11.5, r: 39.5, h: 6.0, thick: 5.0, col: bedrockDark, wave: 0.96 },
    { dy: -6.0, r: 44.0, h: 5.4, thick: 5.0, col: bedrockMid, wave: 1.0 },
  ];

  for (let i = 0; i < lowerBedrockTiers.length; i += 1) {
    const tier = lowerBedrockTiers[i];
    const voxelW = Math.max(3.8, tier.thick * 1.12);
    addRing(tier.dy, tier.r, tier.thick, tier.h, voxelW, tier.col, 0, 0, TWO_PI, 1.6, tier.wave);

    // Thick, long asymmetric hanging rock pillars
    const pillarCount = 6 + Math.floor(i * 1.3);
    for (let k = 0; k < pillarCount; k += 1) {
      const a = (k / pillarCount) * TWO_PI + i * 0.53 + (rng() - 0.5) * 0.24;
      const cr = Math.max(4.0, tier.r + bedrockWave(a, tier.wave) + (rng() - 0.5) * 3.0);
      const ch = 7.0 + rng() * 8.0;
      const cw = 2.6 + rng() * 2.0;
      const col = jitterColor(k % 3 === 0 ? bedrockMid : bedrockDark, 0.045, rng);
      addCitadelVoxel(Math.cos(a) * cr, tier.dy - ch * 0.48, Math.sin(a) * cr, cw, ch, cw, col);
    }
  }

  // Hollow nadir (dy = -56 to -44): 3 crooked hanging rock legs & broken arch fragments
  const nadirLegs = [
    { angle: 0.42, rad: 8.6, len: 10.5, w: 3.2 },
    { angle: 2.68, rad: 9.4, len: 11.8, w: 3.4 },
    { angle: -1.52, rad: 8.0, len: 9.6, w: 3.0 },
  ];
  for (let l = 0; l < nadirLegs.length; l += 1) {
    const leg = nadirLegs[l];
    const segs = 4;
    const segH = leg.len / segs;
    for (let s = 0; s < segs; s += 1) {
      const t = s / (segs - 1);
      const a = leg.angle + Math.sin(s * 1.3 + l) * 0.14;
      const r = leg.rad + (s % 2 === 0 ? 0.8 : -0.8) * (1 - t * 0.35);
      const w = lerp(leg.w, leg.w * 0.55, t);
      addCitadelVoxel(
        Math.cos(a) * r,
        -45.5 - (s + 0.5) * segH,
        Math.sin(a) * r,
        w,
        segH * 1.18,
        w,
        jitterColor(s % 2 === 0 ? bedrockDark : bedrockMid, 0.04, rng),
      );
    }
  }

  const archFragments = [
    { a: 1.15, r: 8.2, y: -48.5, sx: 4.0, sy: 2.5, sz: 2.9 },
    { a: 1.85, r: 8.4, y: -50.2, sx: 3.6, sy: 2.3, sz: 2.7 },
    { a: -0.52, r: 7.8, y: -49.2, sx: 3.7, sy: 2.3, sz: 2.6 },
  ];
  for (let f = 0; f < archFragments.length; f += 1) {
    const af = archFragments[f];
    addCitadelVoxel(
      Math.cos(af.a) * af.r,
      af.y,
      Math.sin(af.a) * af.r,
      af.sx,
      af.sy,
      af.sz,
      jitterColor(bedrockDark, 0.04, rng),
    );
  }

  // Detached floating rock fragments orbiting the lower hull (16 fragments, extra = 1.0)
  for (let i = 0; i < 16; i += 1) {
    const a = rng() * TWO_PI;
    const dy = lerp(-54, -8, rng());
    const hullR = lerp(12, 48, (dy + 54) / 46);
    const rad = hullR + 7.5 + rng() * 16.0;
    const sz = 1.4 + rng() * 2.5;
    const col = jitterColor(rng() > 0.4 ? bedrockDark : bedrockMid, 0.05, rng);
    addCitadelVoxel(
      Math.cos(a) * rad,
      dy,
      Math.sin(a) * rad,
      sz,
      sz * (0.7 + rng() * 0.9),
      sz,
      col,
      1.0,
      0.55 + rng() * 0.75,
    );
  }

  // -------------------------------------------------------------------------
  // 2. MID-LEVEL COMPACT ARMORED FLANGE, HORIZONTAL WINGS & WHITE-SILVER OBELISKS
  // -------------------------------------------------------------------------
  const flangeRings = [
    { dy: 1.5, r: 41.0, thick: 4.6, h: 2.3, col: ironHullMid },
    { dy: -1.0, r: 45.5, thick: 4.8, h: 2.3, col: ironHullDark },
    { dy: -3.5, r: 50.0, thick: 4.6, h: 2.2, col: ironHullMid },
  ];
  for (let i = 0; i < flangeRings.length; i += 1) {
    const fr = flangeRings[i];
    addRing(fr.dy, fr.r, fr.thick, fr.h, Math.max(3.6, fr.thick * 0.95), fr.col, 0);
  }

  // 12 protruding outer armored blocks + 12 thick radial top ribs + 12 underside beams
  const flangeModuleCount = 12;
  for (let r = 0; r < flangeModuleCount; r += 1) {
    const a = (r / flangeModuleCount) * TWO_PI;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    // Outer protruding armored block (r = 52.8, w = 5.2, h = 2.8)
    addCitadelVoxel(cosA * 52.8, -3.2, sinA * 52.8, 5.2, 2.8, 5.2, jitterColor(ironHullLight, 0.03, rng));
    addCitadelVoxel(cosA * 52.8, -1.6, sinA * 52.8, 4.4, 0.65, 4.4, jitterColor(trimSilver, 0.03, rng));

    // Thick radial top rib
    for (let s = 0; s < 4; s += 1) {
      const t = s / 3;
      const rad = lerp(40.0, 52.0, t);
      const ry = lerp(2.5, -2.0, t);
      const col = s % 2 === 0 ? trimSilver : ironHullDark;
      addCitadelVoxel(cosA * rad, ry, sinA * rad, 2.8, 1.6, 2.8, jitterColor(col, 0.03, rng));
    }

    // Underside structural beam (dy = -5.5)
    for (let s = 0; s < 3; s += 1) {
      const rad = lerp(41.5, 51.5, s / 2);
      addCitadelVoxel(cosA * rad, -5.5, sinA * rad, 2.8, 1.8, 2.8, jitterColor(ironHullDark, 0.03, rng));
    }
  }

  // Left & right thin horizontal wings (X = +-50 to +-114, dy = -3.2) + root diagonal truss
  for (const side of [-1, 1]) {
    for (let x = 50; x <= 114; x += 3.0) {
      const t = (x - 50) / 64;
      const halfZ = lerp(3.0, 1.2, t);
      const deckH = lerp(1.5, 0.9, t);
      const deckY = -3.2;

      addCitadelVoxel(
        side * x,
        deckY,
        0,
        3.2,
        deckH,
        halfZ * 2.0,
        jitterColor(t > 0.45 ? ironHullMid : ironHullDark, 0.03, rng),
      );
      addCitadelVoxel(
        side * x,
        deckY + deckH * 0.55,
        0,
        3.1,
        0.45,
        halfZ * 1.1,
        jitterColor(trimSilver, 0.03, rng),
      );

      if (x <= 74) {
        const st = (x - 50) / 24;
        const strutY = lerp(-13.0, deckY - 1.2, st);
        addCitadelVoxel(
          side * x,
          strutY,
          0,
          2.8,
          lerp(2.2, 1.1, st),
          lerp(2.8, 1.2, st),
          jitterColor(ironHullDark, 0.03, rng),
        );
        if (Math.round(x) % 8 === 0) {
          addCitadelVoxel(
            side * x,
            (deckY + strutY) * 0.5,
            0,
            1.3,
            Math.abs(deckY - strutY),
            1.3,
            ironHullDark,
          );
        }
      }
    }
  }

  // 10 white-silver obelisk spires & hanging chains
  const obeliskSpecs = [
    // Left wing (3)
    { x: -78, y: -3.2, z: 0, w: 2.2, h: 25, chain: 19, arm: false },
    { x: -96, y: -3.2, z: 0, w: 2.0, h: 21, chain: 16, arm: false },
    { x: -110, y: -3.2, z: 0, w: 1.8, h: 19, chain: 13, arm: false },
    // Right wing (3)
    { x: 80, y: -3.2, z: 0, w: 2.2, h: 24, chain: 18, arm: false },
    { x: 97, y: -3.2, z: 0, w: 2.0, h: 20, chain: 15, arm: false },
    { x: 111, y: -3.2, z: 0, w: 1.8, h: 18, chain: 12, arm: false },
    // Front flange +Z (2, with small mounting arms)
    { x: -20, y: -3.2, z: 48, w: 2.4, h: 27, chain: 21, arm: true },
    { x: 25, y: -3.2, z: 46, w: 2.3, h: 25, chain: 19, arm: true },
    // Rear -Z (2, no chain, with small mounting arms)
    { x: -44, y: -3.2, z: -38, w: 1.9, h: 17, chain: 0, arm: true },
    { x: 44, y: -3.2, z: -38, w: 1.9, h: 17, chain: 0, arm: true },
  ];

  for (let i = 0; i < obeliskSpecs.length; i += 1) {
    const ob = obeliskSpecs[i];
    if (ob.arm) {
      const dist = Math.hypot(ob.x, ob.z);
      const ux = ob.x / dist;
      const uz = ob.z / dist;
      for (let step = 0; step < 3; step += 1) {
        const ar = lerp(Math.min(44, dist - 7), dist, step / 2);
        addCitadelVoxel(ux * ar, ob.y, uz * ar, 3.0, 1.7, 3.0, jitterColor(ironHullDark, 0.03, rng));
      }
    }
    addObeliskSpire(ob.x, ob.y + 0.5, ob.z, ob.w, ob.h);
    if (ob.chain > 0) {
      addHangingChain(ob.x, ob.y - 1.4, ob.z, ob.chain);
    }
  }

  // -------------------------------------------------------------------------
  // 3. UPPER MAIN BODY: 5 MAJOR TIERED BLOCKS + 4 DEEP PINCH SLITS (dy = +2.5 to +73.2)
  // -------------------------------------------------------------------------
  const majorBlocks = [
    {
      yStart: 2.5,
      yEnd: 18.0,
      rStart: 38.5,
      rEnd: 35.5,
      rings: 4,
      thick: 4.5,
      buttresses: 8,
      bw: 3.2,
      balcony: { start: -0.35, span: 1.66, offset: 5.2, ringIdx: 2 },
      silverBand: false,
      slit: { dy: 19.2, r: 32.5, win: 0.22 },
    },
    {
      yStart: 20.8,
      yEnd: 34.5,
      rStart: 34.5,
      rEnd: 30.5,
      rings: 4,
      thick: 4.2,
      buttresses: 8,
      bw: 3.0,
      balcony: { start: 1.65, span: 1.92, offset: 4.8, ringIdx: 2 },
      silverBand: true,
      slit: { dy: 35.7, r: 27.5, win: 0.22 },
    },
    {
      yStart: 37.2,
      yEnd: 49.5,
      rStart: 29.2,
      rEnd: 24.0,
      rings: 4,
      thick: 3.8,
      buttresses: 6,
      bw: 2.8,
      balcony: { start: -0.25, span: 1.57, offset: 4.4, ringIdx: 1 },
      silverBand: true,
      slit: { dy: 50.7, r: 21.0, win: 0.20 },
    },
    {
      yStart: 52.2,
      yEnd: 63.0,
      rStart: 22.2,
      rEnd: 16.5,
      rings: 3,
      thick: 3.3,
      buttresses: 6,
      bw: 2.6,
      balcony: { start: 1.95, span: 1.48, offset: 3.8, ringIdx: 1 },
      silverBand: false,
      slit: { dy: 64.2, r: 13.8, win: 0 },
    },
    {
      yStart: 65.6,
      yEnd: 73.2,
      rStart: 14.5,
      rEnd: 10.2,
      rings: 3,
      thick: 2.8,
      buttresses: 4,
      bw: 2.4,
      balcony: null,
      silverBand: false,
      slit: null,
    },
  ];

  for (let b = 0; b < majorBlocks.length; b += 1) {
    const blk = majorBlocks[b];
    const blkH = blk.yEnd - blk.yStart;
    const stepY = blkH / blk.rings;
    const ringH = stepY * 0.92;

    for (let s = 0; s < blk.rings; s += 1) {
      const t = blk.rings > 1 ? s / (blk.rings - 1) : 0;
      const dy = blk.yStart + (s + 0.5) * stepY;
      const r = lerp(blk.rStart, blk.rEnd, t);
      const voxelW = Math.max(2.6, blk.thick * 1.08);
      const col = s === 0 ? ironHullDark : (s === blk.rings - 1 ? ironHullLight : ironHullMid);
      const winChance = s === 1 ? 0.14 : 0;

      addRing(dy, r, blk.thick, ringH, voxelW, col, winChance);

      // Asymmetric protruding balcony / rampart terrace on silhouette edges
      if (blk.balcony && s === blk.balcony.ringIdx) {
        const balR = r + blk.balcony.offset;
        const endA = blk.balcony.start + blk.balcony.span;
        addRing(dy + 0.4, balR, 3.2, 1.5, 3.0, ironHullLight, 0.16, blk.balcony.start, endA);
        addRing(dy - 0.8, balR - 0.5, 2.8, 1.1, 3.2, ironHullDark, 0, blk.balcony.start, endA);
      }

      // Silver-grey decorative trim band
      if (blk.silverBand && s === blk.rings - 1) {
        const panelCount = Math.max(8, Math.round(r * 0.45));
        for (let p = 0; p < panelCount; p += 1) {
          const a = (p / panelCount) * TWO_PI + b * 0.31;
          const pr = r + blk.thick * 0.46;
          addCitadelVoxel(Math.cos(a) * pr, dy, Math.sin(a) * pr, 2.1, 1.35, 2.1, jitterColor(trimSilver, 0.03, rng));
        }
      }
    }

    // Vertical wall buttresses contained strictly within the block wall height
    const midY = (blk.yStart + blk.yEnd) * 0.5;
    const midR = (blk.rStart + blk.rEnd) * 0.5 + blk.thick * 0.42;
    for (let k = 0; k < blk.buttresses; k += 1) {
      const a = (k / blk.buttresses) * TWO_PI + b * 0.37;
      addCitadelVoxel(
        Math.cos(a) * midR,
        midY,
        Math.sin(a) * midR,
        blk.bw,
        blkH * 0.92,
        blk.bw,
        jitterColor(ironHullDark, 0.035, rng),
      );
    }

    // Deep recessed dark-iron pinch slit between major blocks
    if (blk.slit) {
      addRing(blk.slit.dy, blk.slit.r, 3.0, 2.0, 3.2, ironHullDark, blk.slit.win);
    }
  }

  // Pedestal terrace crowning Block 5 beneath the crimson royal citadel
  addRing(73.2, 9.8, 2.8, 1.6, 2.6, trimSilver, 0);

  // -------------------------------------------------------------------------
  // 4. TOPMOST IMPOSING CRIMSON MULTI-TIERED ROYAL CITADEL (dy = +73.5 to +92.0)
  // -------------------------------------------------------------------------
  addRing(75.0, 7.6, 2.8, 3.2, 2.5, crownRedDark, 0);
  addRing(78.2, 5.6, 2.6, 4.4, 2.3, crownCrimson, 0.26);

  // Central crimson main keep tower (dy = 80.0 to 89.0, width 3.2 -> 1.5) + summit needle (89.0 to 92.0)
  const keepSegs = 4;
  const keepBaseY = 80.0;
  const keepH = 9.0;
  const keepSegH = keepH / keepSegs;
  for (let s = 0; s < keepSegs; s += 1) {
    const st = s / (keepSegs - 1);
    const w = lerp(3.2, 1.5, st);
    const sy = keepBaseY + (s + 0.5) * keepSegH;
    const col = s % 2 === 0 ? crownCrimson : crownRedLight;
    addCitadelVoxel(0, sy, 0, w, keepSegH * 1.1, w, jitterColor(col, 0.035, rng));
    if (s === 0 || s === 1) {
      addWindowVoxel(-w * 0.22, sy, w * 0.54, 0.65, 0.55, 0.45);
      addWindowVoxel(w * 0.22, sy, w * 0.54, 0.65, 0.55, 0.45);
    }
  }
  addCitadelVoxel(0, 89.0 + 1.5, 0, 0.52, 3.0, 0.52, jitterColor(crownRedLight, 0.03, rng));

  // 4 asymmetric crimson sub-towers surrounding the main keep
  const crimsonSubTowers = [
    { a: 0.35, r: 4.0, w: 2.4, h: 6.8, col: crownCrimson },
    { a: 2.25, r: 4.3, w: 2.1, h: 5.8, col: crownRedLight },
    { a: -0.95, r: 4.1, w: 1.9, h: 5.0, col: crownRedDark },
    { a: -2.45, r: 3.8, w: 2.3, h: 6.2, col: crownCrimson },
  ];
  for (let c = 0; c < crimsonSubTowers.length; c += 1) {
    const st = crimsonSubTowers[c];
    const tx = Math.cos(st.a) * st.r;
    const tz = Math.sin(st.a) * st.r;
    const baseY = 79.4;
    addCitadelVoxel(tx, baseY + st.h * 0.5, tz, st.w, st.h, st.w, jitterColor(st.col, 0.035, rng));
    addCitadelVoxel(
      tx,
      baseY + st.h + 0.9,
      tz,
      st.w * 0.52,
      1.8,
      st.w * 0.52,
      jitterColor(crownRedLight, 0.03, rng),
    );
    if (Math.sin(st.a) > 0.05) {
      addWindowVoxel(tx, baseY + st.h * 0.55, tz + st.w * 0.54, 0.6, 0.55, 0.45);
    }
  }
}

function addMountainsAndValley(builder, rng, detailLevel) {
  const forestColors = [
    [0.14, 0.30, 0.20],
    [0.18, 0.36, 0.22],
    [0.12, 0.25, 0.19],
    [0.22, 0.39, 0.23],
    [0.16, 0.32, 0.25],
  ];
  const mountainColors = [
    [0.24, 0.29, 0.35],
    [0.29, 0.34, 0.40],
    [0.36, 0.40, 0.45],
    [0.20, 0.26, 0.32],
  ];
  const snowColor = [0.80, 0.84, 0.89];

  if (detailLevel === 0) {
    // Base undulating forest valley floor
    for (let z = -240; z <= 14; z += 10) {
      for (let x = -250; x <= 250; x += 10) {
        const n = fbm2D(x * 0.012 + 11.3, z * 0.012 + 4.7, 3);
        const valleyDip = Math.min(1, Math.abs(x) / 110);
        const h = -28 + n * 14 + valleyDip * 8;
        const baseCol = forestColors[Math.floor(rng() * forestColors.length)];
        const col = jitterColor(baseCol, 0.035, rng);
        builder.add(
          x + (rng() - 0.5) * 2.5,
          h,
          z + (rng() - 0.5) * 2.5,
          10.4,
          7.5 + n * 5.0,
          10.4,
          col[0],
          col[1],
          col[2],
          VOXEL_TYPE.STATIC,
        );
      }
    }

    // Left & right distant mountain ranges (open center frames the floating citadel)
    for (const side of [-1, 1]) {
      for (let z = -250; z <= -55; z += 12) {
        for (let distX = 85; distX <= 265; distX += 12) {
          const x = side * distX;
          const ridge = fbm2D(x * 0.014 + 3.1, z * 0.014 + 7.9, 4);
          const centerOpen = clamp((distX - 80) / 70, 0, 1);
          const depthBoost = clamp((-z - 55) / 160, 0.2, 1.0);
          const peakH = (10 + ridge * 58) * centerOpen * (0.65 + depthBoost * 0.55);
          if (peakH < 8) {
            continue;
          }

          const baseY = -24;
          const colBase = mountainColors[Math.floor(rng() * mountainColors.length)];
          const col = jitterColor(colBase, 0.04, rng);
          builder.add(
            x + (rng() - 0.5) * 3.0,
            baseY + peakH * 0.5,
            z + (rng() - 0.5) * 3.0,
            13.6,
            peakH,
            13.6,
            col[0],
            col[1],
            col[2],
            VOXEL_TYPE.STATIC,
          );

          // Snow-dusted high peaks
          if (peakH > 40) {
            const sc = jitterColor(snowColor, 0.03, rng);
            builder.add(
              x,
              baseY + peakH + 1.8,
              z,
              7.2,
              4.2,
              7.2,
              sc[0],
              sc[1],
              sc[2],
              VOXEL_TYPE.STATIC,
            );
          }
        }
      }
    }

    // Layer A: Far extended forest and low rolling hills behind the valley
    const farHillColors = [
      [0.16, 0.27, 0.25],
      [0.20, 0.30, 0.28],
      [0.22, 0.29, 0.33],
    ];
    for (let z = -325; z <= -255; z += 22) {
      for (let x = -460; x <= 460; x += 22) {
        const n = fbm2D(x * 0.007 + 5.2, z * 0.007 + 2.1, 3);
        const sideLift = clamp((Math.abs(x) - 90) / 220, 0, 1);
        const hillH = 10 + n * 10 + sideLift * 8;
        const baseY = -28;
        const baseCol = farHillColors[Math.floor(rng() * farHillColors.length)];
        const col = jitterColor(baseCol, 0.03, rng);
        builder.add(
          x + (rng() - 0.5) * 4.0,
          baseY + hillH * 0.5,
          z + (rng() - 0.5) * 4.0,
          24.5,
          hillH,
          24.5,
          col[0],
          col[1],
          col[2],
          VOXEL_TYPE.STATIC,
        );
      }
    }

    // Layer B: Low distant mountain ridges stretching behind the floating citadel
    const farRidgeColors = [
      [0.24, 0.30, 0.38],
      [0.28, 0.34, 0.42],
      [0.21, 0.27, 0.35],
    ];
    for (let z = -395; z <= -315; z += 26) {
      for (let x = -480; x <= 480; x += 24) {
        const ridge = fbm2D(x * 0.0065 + 17.4, z * 0.0065 + 9.3, 4);
        const sideLift = clamp((Math.abs(x) - 85) / 220, 0, 1);
        const depthLift = clamp((-z - 315) / 80, 0, 1);
        const peakH = (12 + ridge * 16) + sideLift * (6 + ridge * 18) + depthLift * 5;
        const baseY = -28;
        const baseCol = farRidgeColors[Math.floor(rng() * farRidgeColors.length)];
        const col = jitterColor(baseCol, 0.035, rng);
        builder.add(
          x + (rng() - 0.5) * 5.0,
          baseY + peakH * 0.5,
          z + (rng() - 0.5) * 5.0,
          28.0,
          peakH,
          28.0,
          col[0],
          col[1],
          col[2],
          VOXEL_TYPE.STATIC,
        );
      }
    }
  } else {
    // Extra tree canopy voxel clusters for medium (1) and high (2) quality tiers
    const treeCount = detailLevel === 1 ? 720 : 580;
    for (let i = 0; i < treeCount; i += 1) {
      const x = (rng() - 0.5) * 340;
      const z = -185 + rng() * 195;
      const n = fbm2D(x * 0.012 + 11.3, z * 0.012 + 4.7, 3);
      const valleyDip = Math.min(1, Math.abs(x) / 110);
      const y = -23.5 + n * 14 + valleyDip * 8;
      const s = 2.6 + rng() * 3.4;
      const baseCol = forestColors[Math.floor(rng() * forestColors.length)];
      const col = jitterColor(baseCol, 0.045, rng);
      builder.add(x, y + s * 0.45, z, s, s * (1.1 + rng() * 0.6), s, col[0], col[1], col[2], VOXEL_TYPE.STATIC);
    }
  }
}

function getCliffSurfaceY(x, z) {
  const n = fbm2D(x * 0.08 + 2.4, z * 0.08 + 5.1, 3);
  const edgeSlope = clamp((x - 19.0) / 16.0, 0, 1);
  const frontSlope = clamp((34.0 - z) / 18.0, 0, 1);
  return 8.4 + n * 2.1 + edgeSlope * 1.6 - (1 - frontSlope) * 0.4;
}

function isStreamCell(x, z) {
  // Winding small stream running across the cliff plateau toward the waterfall lip at (21.0, 14.0)
  const targetZ = 14.0 + Math.sin((x - 21.0) * 0.16) * 2.0 + (x - 21.0) * 0.14;
  return x >= 20.0 && x <= 54.0 && Math.abs(z - targetZ) < 1.9;
}

function addForegroundCliff(builder, rng) {
  const rockColors = [
    [0.34, 0.32, 0.30],
    [0.42, 0.39, 0.35],
    [0.28, 0.27, 0.27],
    [0.48, 0.44, 0.39],
  ];
  const grassTopColors = [
    [0.24, 0.46, 0.21],
    [0.29, 0.52, 0.23],
    [0.20, 0.40, 0.19],
    [0.34, 0.55, 0.24],
  ];
  const streamColor = [0.22, 0.58, 0.78];

  // Build solid stepped rocky cliff in front-right: X in [14, 58], Z in [4, 34]
  for (let z = 4; z <= 34; z += 2) {
    for (let x = 14; x <= 58; x += 2) {
      // Organic rocky coastline / cliff edge shape
      const edgeNoise = fbm2D(x * 0.11 + 8.1, z * 0.11 + 1.9, 3) * 6.0;
      const distFromEdge = (x - 19.6) + (z - 12.0) * 0.22 - edgeNoise * 0.75;
      if (distFromEdge < 0) {
        continue;
      }

      const topY = getCliffSurfaceY(x, z);
      const isStream = isStreamCell(x, z);

      // Top surface voxel (grassy turf or recessed stream bed)
      if (isStream) {
        const wc = jitterColor(streamColor, 0.04, rng);
        builder.add(x, topY - 0.55, z, 2.15, 0.65, 2.15, wc[0], wc[1], wc[2], VOXEL_TYPE.STATIC);
      } else {
        const gc = jitterColor(grassTopColors[Math.floor(rng() * grassTopColors.length)], 0.04, rng);
        builder.add(x, topY, z, 2.15, 1.3, 2.15, gc[0], gc[1], gc[2], VOXEL_TYPE.STATIC);
      }

      // Cliff face vertical strata on exposed perimeter or front-left face
      const isPerimeter = distFromEdge < 4.8 || z <= 8 || x <= 25;
      if (isPerimeter) {
        const layers = 10;
        for (let k = 1; k <= layers; k += 1) {
          const ly = topY - k * 3.6;
          const overhang = Math.sin(k * 0.9 + x * 0.3) * 0.45;
          const rc = jitterColor(rockColors[(k + Math.floor(x)) % rockColors.length], 0.045, rng);
          builder.add(
            x + overhang,
            ly,
            z,
            2.35,
            3.8,
            2.35,
            rc[0],
            rc[1],
            rc[2],
            VOXEL_TYPE.STATIC,
          );
        }
      } else {
        // Interior sub-block support
        const rc = jitterColor(rockColors[0], 0.04, rng);
        builder.add(x, topY - 4.5, z, 2.2, 8.0, 2.2, rc[0], rc[1], rc[2], VOXEL_TYPE.STATIC);
      }
    }
  }

  // Plunge pool boulders & shimmering water surface at valley floor base of waterfall (Y ~ -24.5)
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * TWO_PI;
    const rad = 2.6 + rng() * 4.8;
    const bx = 17.2 + Math.cos(a) * rad;
    const bz = 13.1 + Math.sin(a) * rad;
    const rc = jitterColor(rockColors[i % rockColors.length], 0.05, rng);
    builder.add(bx, -24.2 + rng() * 1.4, bz, 1.8 + rng() * 1.8, 1.6 + rng() * 1.8, 1.8 + rng() * 1.8, rc[0], rc[1], rc[2], VOXEL_TYPE.STATIC);
  }
  builder.add(17.2, -24.5, 13.1, 11.5, 0.8, 9.5, 0.24, 0.62, 0.82, VOXEL_TYPE.STATIC);
}

function addGrass(builder, rng, count) {
  const grassPalette = [
    [0.24, 0.54, 0.20],
    [0.32, 0.62, 0.24],
    [0.19, 0.45, 0.18],
    [0.42, 0.68, 0.26],
  ];

  let added = 0;
  let attempts = 0;
  const maxAttempts = count * 5;

  while (added < count && attempts < maxAttempts) {
    attempts += 1;
    const x = 18.0 + rng() * 38.0;
    const z = 5.0 + rng() * 28.0;
    const edgeNoise = fbm2D(x * 0.11 + 8.1, z * 0.11 + 1.9, 3) * 6.0;
    const distFromEdge = (x - 19.6) + (z - 12.0) * 0.22 - edgeNoise * 0.75;
    if (distFromEdge < 0.6 || isStreamCell(x, z)) {
      continue;
    }

    const y = getCliffSurfaceY(x, z) + 0.55;
    const h = 0.85 + rng() * 1.45;
    const w = 0.20 + rng() * 0.15;
    const col = jitterColor(grassPalette[Math.floor(rng() * grassPalette.length)], 0.05, rng);
    builder.add(
      x,
      y + h * 0.5,
      z,
      w,
      h,
      w,
      col[0],
      col[1],
      col[2],
      VOXEL_TYPE.GRASS,
      rng() * TWO_PI,
      1.6 + rng() * 1.3,
      0,
    );
    added += 1;
  }
}

function addWaterfall(builder, rng) {
  // Multi-lane 3D voxel waterfall pouring off the cliff edge around (21.0, 9.2, 14.0)
  const originX = 21.0;
  const originY = 9.2;
  const originZ = 14.0;

  const waterPalette = [
    [0.24, 0.64, 0.90], // vibrant blue
    [0.38, 0.78, 0.95], // cyan stream
    [0.72, 0.91, 0.99], // frothy turquoise-white
    [0.92, 0.97, 1.00], // crisp white foam
  ];

  const lanes = 7;
  const dropsPerLane = 108;

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneOffset = (lane - (lanes - 1) * 0.5) * 0.55;
    const laneSpeed = 0.19 + (lane % 3) * 0.02 + rng() * 0.03;
    const fallDist = 34.0 + (rng() - 0.5) * 2.4;

    for (let i = 0; i < dropsPerLane; i += 1) {
      const phase = (i / dropsPerLane) + rng() * (1 / dropsPerLane);
      const isOuter = lane === 0 || lane === lanes - 1;
      const colorIdx = isOuter ? (rng() > 0.35 ? 3 : 2) : Math.floor(rng() * waterPalette.length);
      const col = jitterColor(waterPalette[colorIdx], 0.03, rng);

      const sx = 0.48 + rng() * 0.38;
      const sy = 1.05 + rng() * 1.05;
      const sz = 0.48 + rng() * 0.38;

      builder.add(
        originX + (rng() - 0.5) * 0.55,
        originY + (rng() - 0.5) * 0.40,
        originZ + laneOffset + (rng() - 0.5) * 0.32,
        sx,
        sy,
        sz,
        col[0],
        col[1],
        col[2],
        VOXEL_TYPE.WATERFALL,
        phase,
        laneSpeed,
        fallDist,
      );
    }
  }
}

function addMist(builder, rng, count) {
  const mistBaseX = 17.2;
  const mistBaseZ = 13.1;

  for (let i = 0; i < count; i += 1) {
    const s = 0.80 + rng() * 1.65;
    const col = jitterColor([0.88, 0.95, 1.0], 0.035, rng);
    const isValleyFloor = i % 2 === 0;
    const mistY = isValleyFloor ? -23.5 + rng() * 2.0 : -10.5 + rng() * 5.0;
    const riseDist = isValleyFloor ? 14.0 + rng() * 14.0 : 8.0 + rng() * 9.0;
    builder.add(
      mistBaseX + (rng() - 0.5) * 4.8,
      mistY,
      mistBaseZ + (rng() - 0.5) * 4.8,
      s,
      s * (0.75 + rng() * 0.45),
      s,
      col[0],
      col[1],
      col[2],
      VOXEL_TYPE.MIST,
      rng(),
      0.18 + rng() * 0.16,
      riseDist,
    );
  }
}

function addCloudClusters(builder, rng, cloudSpanX, clustersPerLayer) {
  const layers = [
    // Layer 0: far behind citadel
    { zMin: -285, zMax: -235, yMin: 36, yMax: 84, speedMin: 1.1, speedMax: 1.9, scaleMul: 1.55 },
    // Layer 1: encircling citadel mid-to-lower hull
    { zMin: -230, zMax: -165, yMin: 20, yMax: 58, speedMin: 1.8, speedMax: 2.8, scaleMul: 1.25 },
    // Layer 2: midground sea of clouds
    { zMin: -135, zMax: -35, yMin: -2, yMax: 22, speedMin: 2.8, speedMax: 4.2, scaleMul: 1.0 },
  ];

  const topColor = [0.97, 0.97, 0.99];
  const bottomColor = [0.76, 0.80, 0.88];

  for (let l = 0; l < layers.length; l += 1) {
    const layer = layers[l];
    const clusterCount = clustersPerLayer[l];

    for (let c = 0; c < clusterCount; c += 1) {
      const cx = (rng() - 0.5) * cloudSpanX;
      const cy = lerp(layer.yMin, layer.yMax, rng());
      const cz = lerp(layer.zMin, layer.zMax, rng());
      const speed = lerp(layer.speedMin, layer.speedMax, rng());
      const phase = rng() * TWO_PI;

      const puffCount = 6 + Math.floor(rng() * 6);
      const spreadX = (9 + rng() * 14) * layer.scaleMul;
      const spreadZ = (5 + rng() * 8) * layer.scaleMul;

      for (let p = 0; p < puffCount; p += 1) {
        const u = (rng() - 0.5) * 2;
        const v = (rng() - 0.5) * 2;
        const distNorm = Math.min(1, Math.hypot(u, v));
        const px = cx + u * spreadX;
        const pz = cz + v * spreadZ;
        const py = cy + (1 - distNorm * 0.75) * (1.8 + rng() * 2.8) * layer.scaleMul;

        const sx = (5.0 + rng() * 7.5) * layer.scaleMul * (1.05 - distNorm * 0.35);
        const sy = (1.5 + rng() * 2.2) * layer.scaleMul * (1.05 - distNorm * 0.3);
        const sz = (4.5 + rng() * 6.5) * layer.scaleMul * (1.05 - distNorm * 0.35);

        const heightMix = clamp((py - cy) / (4.6 * layer.scaleMul), 0, 1);
        const r = lerp(bottomColor[0], topColor[0], heightMix);
        const g = lerp(bottomColor[1], topColor[1], heightMix);
        const b = lerp(bottomColor[2], topColor[2], heightMix);
        const col = jitterColor([r, g, b], 0.025, rng);

        builder.add(px, py, pz, sx, sy, sz, col[0], col[1], col[2], VOXEL_TYPE.CLOUD, phase, speed, 0);
      }
    }
  }
}

function addParticles(builder, rng, count) {
  for (let i = 0; i < count; i += 1) {
    const x = (rng() - 0.5) * 140;
    const y = -8 + rng() * 75;
    const z = -95 + rng() * 145;
    const s = 0.22 + rng() * 0.36;
    const col = jitterColor([1.0, 0.94, 0.78], 0.06, rng);
    builder.add(
      x,
      y,
      z,
      s,
      s,
      s,
      col[0],
      col[1],
      col[2],
      VOXEL_TYPE.PARTICLE,
      rng(),
      0.035 + rng() * 0.055,
      10 + rng() * 18,
    );
  }
}

export function buildVoxelScene() {
  const rng = createRng(20260417);
  const builder = createVoxelBuilder();
  const cloudSpanX = 720;

  // --- Tier 1: ECO (Essential Core Scene) ---
  addCitadel(builder, rng);
  addMountainsAndValley(builder, rng, 0);
  addForegroundCliff(builder, rng);
  addCloudClusters(builder, rng, cloudSpanX, [14, 18, 12]);
  addWaterfall(builder, rng);
  addGrass(builder, rng, 560);
  addMist(builder, rng, 140);
  addParticles(builder, rng, 80);
  const ecoCount = builder.count();

  // --- Tier 2: MEDIUM (Richer Clouds, Grass, Mist, Valley Detail & Light Particles) ---
  addCloudClusters(builder, rng, cloudSpanX, [8, 10, 8]);
  addGrass(builder, rng, 640);
  addMist(builder, rng, 160);
  addParticles(builder, rng, 240);
  addMountainsAndValley(builder, rng, 1);
  const mediumCount = builder.count();

  // --- Tier 3: HIGH (Maximum Detail Density) ---
  addCloudClusters(builder, rng, cloudSpanX, [6, 8, 6]);
  addGrass(builder, rng, 520);
  addMist(builder, rng, 140);
  addParticles(builder, rng, 340);
  addMountainsAndValley(builder, rng, 2);
  const highCount = builder.count();

  const arrays = builder.toTypedArrays();
  return {
    positions: arrays.positions,
    scales: arrays.scales,
    colors: arrays.colors,
    metas: arrays.metas,
    counts: {
      eco: ecoCount,
      medium: mediumCount,
      high: highCount,
    },
    bounds: {
      cloudSpanX,
    },
  };
}
