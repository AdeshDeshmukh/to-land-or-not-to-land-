import * as THREE from 'three';

export const EARTH_ORBIT_DIST = 92;
export const SUN_ORBIT_DIST = 140;

const EARTH_RADIUS = 3.2;
const SUN_CORE_RADIUS = 2.4;

export interface CelestialSpaceEnvironment {
  rootGroup: THREE.Group;
  earthGroup: THREE.Group;
  sunGroup: THREE.Group;
  updateEphemeris: (
    sunVec: { x: number; y: number; z: number },
    earthVec: { x: number; y: number; z: number },
    offsetDays?: number
  ) => void;
  dispose: () => void;
}

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, y: number, periodX = 256): number {
  const ix0 = Math.floor(x);
  const iy0 = Math.floor(y);
  const fx = x - ix0;
  const fy = y - iy0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const wx0 = ((ix0 % periodX) + periodX) % periodX;
  const wx1 = (((ix0 + 1) % periodX) + periodX) % periodX;

  const a = hash2D(wx0, iy0);
  const b = hash2D(wx1, iy0);
  const c = hash2D(wx0, iy0 + 1);
  const d = hash2D(wx1, iy0 + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbmSphere(u: number, v: number, octaves = 5, basePeriod = 8): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2D(u * period, v * period * 0.5 + o * 17.3, period) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

function createPinpointStarTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.98)');
  grad.addColorStop(0.68, 'rgba(232, 244, 255, 0.42)');
  grad.addColorStop(0.88, 'rgba(200, 225, 255, 0.08)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createMilkyWayBackdropTexture(maxAniso: number): THREE.CanvasTexture {
  // Subtle whisper-soft galactic plane band & cosmic dust rifts (no baked blurry point circles;
  // all stars render at native screen/retina resolution via THREE.Points)
  const mwW = 1024;
  const mwH = 512;
  const canvas = document.createElement('canvas');
  canvas.width = mwW;
  canvas.height = mwH;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(mwW, mwH);
  const data = img.data;

  const tiltRad = (38 * Math.PI) / 180;
  const gxN = 0.24 * Math.sin(tiltRad);
  const gyN = Math.cos(tiltRad);
  const gzN = 0.97 * Math.sin(tiltRad);

  for (let py = 0; py < mwH; py++) {
    const v = (py + 0.5) / mwH;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let px = 0; px < mwW; px++) {
      const u = (px + 0.5) / mwW;
      const theta = u * Math.PI * 2;
      const x = -sinPhi * Math.cos(theta);
      const y = cosPhi;
      const z = sinPhi * Math.sin(theta);

      const gLat = x * gxN + y * gyN + z * gzN;
      const band = Math.exp(-(gLat * gLat) / 0.026);
      const coreBoost = Math.exp(-((u - 0.62) * (u - 0.62)) / 0.04) * Math.exp(-(gLat * gLat) / 0.042);

      const n1 = fbmSphere(u + 0.13, v + 0.07, 4, 8);
      const rift = fbmSphere(u * 2.0 + 0.41, v * 2.0 + 0.19, 3, 16);
      const dustMask = Math.max(0.22, 1.0 - Math.max(0, 0.52 - Math.abs(gLat) * 4.6) * (1.2 - rift * 1.4));

      const lum = (band * (0.35 + n1 * 0.65) + coreBoost * 0.45) * dustMask;
      const idx = (py * mwW + px) * 4;
      data[idx] = Math.min(255, Math.round(1 + lum * 13));
      data[idx + 1] = Math.min(255, Math.round(2 + lum * 16));
      data[idx + 2] = Math.min(255, Math.round(4 + lum * 25));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function drawContinentPolygons(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const toXY = (lonDeg: number, latDeg: number): [number, number] => [
    ((lonDeg + 180) / 360) * width,
    ((90 - latDeg) / 180) * height,
  ];

  const fillPoly = (coords: [number, number][]) => {
    if (coords.length < 3) return;
    ctx.beginPath();
    coords.forEach(([lon, lat], idx) => {
      const [x, y] = toXY(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };

  // North America
  fillPoly([
    [-168, 66], [-160, 71], [-135, 70], [-115, 74], [-85, 75], [-68, 63], [-55, 52],
    [-64, 44], [-75, 36], [-80, 26], [-83, 29], [-90, 29], [-97, 26], [-96, 19],
    [-87, 21], [-83, 10], [-78, 8], [-85, 11], [-94, 15], [-105, 20], [-112, 24],
    [-117, 32], [-124, 42], [-130, 54], [-145, 60], [-162, 55],
  ]);

  // Greenland
  fillPoly([
    [-55, 60], [-52, 71], [-40, 82], [-18, 81], [-22, 70], [-42, 60],
  ]);

  // South America
  fillPoly([
    [-78, 9], [-71, 12], [-61, 10], [-50, 1], [-35, -6], [-39, -18], [-48, -28],
    [-58, -38], [-66, -47], [-69, -55], [-74, -52], [-73, -38], [-71, -18], [-81, -5],
  ]);

  // Africa
  fillPoly([
    [-17, 15], [-13, 28], [-6, 36], [10, 37], [25, 32], [33, 31], [43, 12], [51, 12],
    [41, -2], [40, -14], [34, -26], [20, -35], [15, -24], [12, -6], [8, 4], [-8, 5],
  ]);

  // Madagascar
  fillPoly([
    [49, -12], [50, -18], [46, -25], [43, -23], [44, -16],
  ]);

  // Europe + Eurasia
  fillPoly([
    [-9, 37], [-9, 43], [-2, 43], [-4, 48], [2, 51], [8, 55], [5, 60], [16, 69],
    [28, 71], [44, 68], [68, 71], [104, 77], [140, 73], [178, 66], [162, 59], [142, 54],
    [135, 44], [128, 35], [121, 39], [122, 31], [116, 22], [109, 12], [103, 2],
    [98, 16], [90, 22], [80, 8], [72, 20], [62, 25], [56, 26], [48, 29], [36, 30],
    [35, 36], [26, 40], [22, 37], [15, 38], [8, 44], [2, 41],
  ]);

  // UK & Japan accent islands
  fillPoly([[-6, 50], [1, 51], [-2, 58], [-6, 56]]);
  fillPoly([[130, 32], [136, 34], [141, 38], [145, 44], [140, 41], [135, 36]]);

  // Australia
  fillPoly([
    [114, -22], [129, -14], [136, -12], [142, -11], [153, -25], [149, -37],
    [138, -35], [128, -32], [115, -34],
  ]);

  // New Zealand
  fillPoly([[167, -46], [172, -41], [178, -37], [174, -44]]);

  // Antarctica
  fillPoly([
    [-180, -72], [-120, -73], [-62, -64], [-40, -75], [0, -70], [70, -68],
    [140, -67], [175, -72], [180, -72], [180, -90], [-180, -90],
  ]);
}

function createEarthTextures(maxAniso: number): {
  albedoTex: THREE.CanvasTexture;
  roughnessTex: THREE.CanvasTexture;
  emissiveTex: THREE.CanvasTexture;
  cloudTex: THREE.CanvasTexture;
} {
  const width = 2048;
  const height = 1024;

  const maskW = 1024;
  const maskH = 512;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskW;
  maskCanvas.height = maskH;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.fillStyle = '#000000';
  maskCtx.fillRect(0, 0, maskW, maskH);
  maskCtx.fillStyle = '#ffffff';
  drawContinentPolygons(maskCtx, maskW, maskH);
  const maskData = maskCtx.getImageData(0, 0, maskW, maskH).data;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d')!;

  const earthWorkCanvas = document.createElement('canvas');
  earthWorkCanvas.width = maskW;
  earthWorkCanvas.height = maskH;
  const ewCtx = earthWorkCanvas.getContext('2d')!;
  const ewImg = ewCtx.createImageData(maskW, maskH);
  const ewData = ewImg.data;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = maskW;
  roughCanvas.height = maskH;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(maskW, maskH);
  const rData = rImg.data;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = maskW;
  emCanvas.height = maskH;
  const emCtx = emCanvas.getContext('2d')!;
  const emImg = emCtx.createImageData(maskW, maskH);
  const emData = emImg.data;

  for (let py = 0; py < maskH; py++) {
    const v = (py + 0.5) / maskH;
    const latDeg = 90 - v * 180;
    const absLat = Math.abs(latDeg);

    for (let px = 0; px < maskW; px++) {
      const u = (px + 0.5) / maskW;
      const idx = (py * maskW + px) * 4;
      const baseMask = maskData[idx] / 255;

      const nDetail = fbmSphere(u, v, 5, 12);
      const biomeNoise = fbmSphere(u + 0.37, v + 0.61, 4, 8);
      const cityCluster = fbmSphere(u * 3.0 + 0.19, v * 3.0 + 0.77, 3, 24);
      const perturbed = baseMask + (nDetail - 0.5) * 0.36;
      const isLand = perturbed > 0.5;
      const coastDist = Math.max(0, 0.56 - perturbed);

      let cr: number;
      let cg: number;
      let cb: number;
      let roughByte: number;

      if (absLat > 78 + (nDetail - 0.5) * 7) {
        cr = 232;
        cg = 239;
        cb = 247;
        roughByte = 190;
      } else if (isLand) {
        const desertBand = Math.exp(-Math.pow((absLat - 24) / 13, 2)) * (0.45 + biomeNoise * 0.7);
        const alpine = Math.max(0, (nDetail - 0.68) * 3.1);

        const rForest = 38 + nDetail * 38;
        const gForest = 82 + nDetail * 56;
        const bForest = 46 + nDetail * 24;

        const rDesert = 178 + biomeNoise * 38;
        const gDesert = 152 + biomeNoise * 34;
        const bDesert = 104 + biomeNoise * 26;

        const aridMix = Math.min(1, desertBand * 1.15);
        cr = rForest * (1 - aridMix) + rDesert * aridMix + alpine * 95;
        cg = gForest * (1 - aridMix) + gDesert * aridMix + alpine * 95;
        cb = bForest * (1 - aridMix) + bDesert * aridMix + alpine * 105;

        if (absLat > 62) {
          const snowMix = Math.min(1, (absLat - 62) / 16);
          cr = cr * (1 - snowMix) + 215 * snowMix;
          cg = cg * (1 - snowMix) + 225 * snowMix;
          cb = cb * (1 - snowMix) + 235 * snowMix;
        }
        roughByte = 228;
      } else {
        const shelf = Math.max(0, 1 - coastDist / 0.14) * (baseMask > 0.05 ? 1 : 0.45);
        const bathy = nDetail * 0.4;
        cr = Math.round(8 + bathy * 12 + shelf * 24);
        cg = Math.round(36 + bathy * 28 + shelf * 78);
        cb = Math.round(88 + bathy * 42 + shelf * 74);
        roughByte = 72;
      }

      const clampR = Math.max(0, Math.min(255, Math.round(cr)));
      const clampG = Math.max(0, Math.min(255, Math.round(cg)));
      const clampB = Math.max(0, Math.min(255, Math.round(cb)));

      ewData[idx] = clampR;
      ewData[idx + 1] = clampG;
      ewData[idx + 2] = clampB;
      ewData[idx + 3] = 255;

      rData[idx] = roughByte;
      rData[idx + 1] = roughByte;
      rData[idx + 2] = roughByte;
      rData[idx + 3] = 255;

      // Subtle earthshine / lunar-reflected continent visibility + warm coastal city clusters on dark hemisphere
      const nightGlow = 0.11;
      const citySpark =
        isLand && absLat < 58 && cityCluster > 0.67 && hash2D(px * 1.7, py * 2.3) > 0.84
          ? (cityCluster - 0.67) * 3.0
          : 0;
      emData[idx] = Math.min(255, Math.round(clampR * nightGlow + citySpark * 225));
      emData[idx + 1] = Math.min(255, Math.round(clampG * nightGlow + citySpark * 170 + 3));
      emData[idx + 2] = Math.min(255, Math.round(clampB * nightGlow + citySpark * 85 + 8));
      emData[idx + 3] = 255;
    }
  }

  ewCtx.putImageData(ewImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  emCtx.putImageData(emImg, 0, 0);

  albedoCtx.imageSmoothingEnabled = true;
  albedoCtx.imageSmoothingQuality = 'high';
  albedoCtx.drawImage(earthWorkCanvas, 0, 0, width, height);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.wrapS = THREE.RepeatWrapping;
  albedoTex.wrapT = THREE.ClampToEdgeWrapping;
  albedoTex.anisotropy = maxAniso;
  albedoTex.needsUpdate = true;

  const roughnessTex = new THREE.CanvasTexture(roughCanvas);
  roughnessTex.wrapS = THREE.RepeatWrapping;
  roughnessTex.wrapT = THREE.ClampToEdgeWrapping;
  roughnessTex.needsUpdate = true;

  const emissiveTex = new THREE.CanvasTexture(emCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  emissiveTex.wrapS = THREE.RepeatWrapping;
  emissiveTex.wrapT = THREE.ClampToEdgeWrapping;
  emissiveTex.anisotropy = maxAniso;
  emissiveTex.needsUpdate = true;

  // 2. Cloud layer texture (1024x512 RGBA)
  const cCanvas = document.createElement('canvas');
  cCanvas.width = maskW;
  cCanvas.height = maskH;
  const cCtx = cCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(maskW, maskH);
  const cData = cImg.data;

  for (let py = 0; py < maskH; py++) {
    const v = (py + 0.5) / maskH;
    const latDeg = 90 - v * 180;
    const stormBelt = 0.78 + 0.25 * Math.sin((Math.abs(latDeg) * Math.PI) / 45);

    for (let px = 0; px < maskW; px++) {
      const u = (px + 0.5) / maskW;
      const swirlU = u + Math.sin(v * Math.PI * 5) * 0.045;
      const cNoise = fbmSphere(swirlU, v, 5, 10);
      const wisps = fbmSphere(u * 2.0 + 0.23, v * 2.0 + 0.51, 3, 20);
      const density = (cNoise * 0.72 + wisps * 0.28) * stormBelt;
      const alpha = Math.max(0, Math.min(255, Math.round((density - 0.44) * 580)));

      const idx = (py * maskW + px) * 4;
      cData[idx] = 248;
      cData[idx + 1] = 251;
      cData[idx + 2] = 255;
      cData[idx + 3] = alpha;
    }
  }
  cCtx.putImageData(cImg, 0, 0);

  const cloudTex = new THREE.CanvasTexture(cCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  cloudTex.wrapS = THREE.RepeatWrapping;
  cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  cloudTex.anisotropy = maxAniso;
  cloudTex.needsUpdate = true;

  return { albedoTex, roughnessTex, emissiveTex, cloudTex };
}

function createSolarCoronaTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  const radial = ctx.createRadialGradient(half, half, 0, half, half, half);
  radial.addColorStop(0.0, 'rgba(255, 255, 248, 1.0)');
  radial.addColorStop(0.14, 'rgba(255, 246, 205, 0.90)');
  radial.addColorStop(0.30, 'rgba(253, 214, 128, 0.36)');
  radial.addColorStop(0.56, 'rgba(245, 158, 11, 0.10)');
  radial.addColorStop(0.84, 'rgba(217, 119, 6, 0.02)');
  radial.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(half, half);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const isCardinal = i % 2 === 0;
    const rayLen = isCardinal ? half * 0.94 : half * 0.64;
    const rayWidth = isCardinal ? 4.0 : 2.2;

    ctx.save();
    ctx.rotate(angle);
    const rayGrad = ctx.createLinearGradient(-rayLen, 0, rayLen, 0);
    rayGrad.addColorStop(0.0, 'rgba(255, 244, 214, 0.0)');
    rayGrad.addColorStop(0.35, isCardinal ? 'rgba(255, 236, 179, 0.22)' : 'rgba(255, 236, 179, 0.12)');
    rayGrad.addColorStop(0.5, 'rgba(255, 254, 245, 0.52)');
    rayGrad.addColorStop(0.65, isCardinal ? 'rgba(255, 236, 179, 0.22)' : 'rgba(255, 236, 179, 0.12)');
    rayGrad.addColorStop(1.0, 'rgba(255, 244, 214, 0.0)');

    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rayLen, rayWidth, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildStarPointsLayer(
  count: number,
  radius: number,
  seed: number,
  pointSize: number,
  opacity: number,
  spriteTex: THREE.CanvasTexture,
  minBrightness: number,
  maxBrightness = 1.0
): { points: THREE.Points; geometry: THREE.BufferGeometry; material: THREE.PointsMaterial } {
  const rng = createSeededRng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const starColors = [
    new THREE.Color('#bcd6ff'), // O/B blue-white
    new THREE.Color('#ffffff'), // A/F pure white
    new THREE.Color('#ffffff'),
    new THREE.Color('#fff4d6'), // G warm solar
    new THREE.Color('#ffd2a1'), // K/M orange-red
  ];

  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);

    positions[i * 3] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * sinPhi * Math.sin(theta);

    const baseCol = starColors[Math.floor(rng() * starColors.length)];
    // Power-law stellar magnitude distribution: realistic sparse bright stars + rich faint starfield
    const mag = Math.pow(rng(), 1.8);
    const brightness = minBrightness + mag * (maxBrightness - minBrightness);
    colors[i * 3] = baseCol.r * brightness;
    colors[i * 3 + 1] = baseCol.g * brightness;
    colors[i * 3 + 2] = baseCol.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: false,
    map: spriteTex,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.raycast = () => {};
  return { points, geometry, material };
}

export function buildCelestialSpaceEnvironment(maxAniso: number): CelestialSpaceEnvironment {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'celestial-space-environment';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  // 1. Subtle Deep-Space Milky Way Galactic Sky Sphere (R = 460)
  const mwTex = createMilkyWayBackdropTexture(maxAniso);
  textures.push(mwTex);
  const mwGeo = new THREE.SphereGeometry(460, 64, 64);
  geometries.push(mwGeo);
  const mwMat = new THREE.MeshBasicMaterial({
    map: mwTex,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  materials.push(mwMat);
  const mwMesh = new THREE.Mesh(mwGeo, mwMat);
  mwMesh.frustumCulled = false;
  mwMesh.raycast = () => {};
  rootGroup.add(mwMesh);

  // 2. Three-Tier Native-Screen Pinpoint 3D Star Catalog (sharp on 1x & Retina/4K displays)
  const starSpriteTex = createPinpointStarTexture();
  textures.push(starSpriteTex);

  const deepFieldStars = buildStarPointsLayer(10500, 428, 196907, 1.45, 0.96, starSpriteTex, 0.42, 0.88);
  geometries.push(deepFieldStars.geometry);
  materials.push(deepFieldStars.material);
  rootGroup.add(deepFieldStars.points);

  const midFieldStars = buildStarPointsLayer(3200, 412, 197212, 2.05, 1.0, starSpriteTex, 0.65, 1.0);
  geometries.push(midFieldStars.geometry);
  materials.push(midFieldStars.material);
  rootGroup.add(midFieldStars.points);

  const navStars = buildStarPointsLayer(380, 395, 202609, 2.95, 1.0, starSpriteTex, 0.85, 1.0);
  geometries.push(navStars.geometry);
  materials.push(navStars.material);
  rootGroup.add(navStars.points);

  // 3. High-Resolution 3D Earth (surface + nightside continents/city lights + cloud layer + atmospheric limb)
  const earthGroup = new THREE.Group();
  earthGroup.name = 'celestial-earth-3d';

  const { albedoTex, roughnessTex, emissiveTex, cloudTex } = createEarthTextures(maxAniso);
  textures.push(albedoTex, roughnessTex, emissiveTex, cloudTex);

  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
  geometries.push(earthGeo);
  const earthMat = new THREE.MeshStandardMaterial({
    map: albedoTex,
    roughnessMap: roughnessTex,
    emissiveMap: emissiveTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.9,
    roughness: 0.65,
    metalness: 0.05,
  });
  materials.push(earthMat);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.raycast = () => {};
  earthGroup.add(earthMesh);

  const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 64, 64);
  geometries.push(cloudGeo);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    roughness: 0.9,
  });
  materials.push(cloudMat);
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.raycast = () => {};
  earthGroup.add(cloudMesh);

  const atmoSunDir = new THREE.Vector3(1, 0, 0);
  const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.0875, 64, 64);
  geometries.push(atmoGeo);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: atmoSunDir },
      uGlowColor: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uGlowColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float c = clamp(dot(vWorldNormal, -viewDir), 0.0, 1.0);
        float rim = clamp(c / 0.41, 0.0, 1.0);
        float sunWrap = smoothstep(-0.35, 0.45, dot(vWorldNormal, normalize(uSunDir))) * 0.85 + 0.15;
        float intensity = pow(rim, 3.0) * sunWrap * 0.75;
        gl_FragColor = vec4(uGlowColor, intensity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  materials.push(atmoMat);
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  atmoMesh.raycast = () => {};
  earthGroup.add(atmoMesh);

  rootGroup.add(earthGroup);

  // 4. High-Resolution 3D Sun & Corona
  const sunGroup = new THREE.Group();
  sunGroup.name = 'celestial-sun-3d';

  const sunCoreGeo = new THREE.SphereGeometry(SUN_CORE_RADIUS, 48, 48);
  geometries.push(sunCoreGeo);
  const sunCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfffef5,
    toneMapped: false,
  });
  materials.push(sunCoreMat);
  const sunCoreMesh = new THREE.Mesh(sunCoreGeo, sunCoreMat);
  sunCoreMesh.raycast = () => {};
  sunGroup.add(sunCoreMesh);

  const coronaTex = createSolarCoronaTexture();
  textures.push(coronaTex);

  const innerCoronaMat = new THREE.SpriteMaterial({
    map: coronaTex,
    color: 0xfff7d6,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  materials.push(innerCoronaMat);
  const innerCoronaSprite = new THREE.Sprite(innerCoronaMat);
  innerCoronaSprite.scale.set(11.5, 11.5, 1);
  innerCoronaSprite.raycast = () => {};
  sunGroup.add(innerCoronaSprite);

  const outerCoronaMat = new THREE.SpriteMaterial({
    map: coronaTex,
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  materials.push(outerCoronaMat);
  const outerCoronaSprite = new THREE.Sprite(outerCoronaMat);
  outerCoronaSprite.scale.set(26, 26, 1);
  outerCoronaSprite.raycast = () => {};
  sunGroup.add(outerCoronaSprite);

  rootGroup.add(sunGroup);

  const updateEphemeris = (
    sunVec: { x: number; y: number; z: number },
    earthVec: { x: number; y: number; z: number },
    offsetDays = 0
  ) => {
    sunGroup.position.set(
      sunVec.x * SUN_ORBIT_DIST,
      sunVec.y * SUN_ORBIT_DIST,
      sunVec.z * SUN_ORBIT_DIST
    );
    earthGroup.position.set(
      earthVec.x * EARTH_ORBIT_DIST,
      earthVec.y * EARTH_ORBIT_DIST,
      earthVec.z * EARTH_ORBIT_DIST
    );

    earthMesh.rotation.y = 0.65 + offsetDays * Math.PI * 2;
    cloudMesh.rotation.y = 0.85 + offsetDays * Math.PI * 2.15;

    atmoSunDir.set(sunVec.x, sunVec.y, sunVec.z).normalize();
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return {
    rootGroup,
    earthGroup,
    sunGroup,
    updateEphemeris,
    dispose,
  };
}
