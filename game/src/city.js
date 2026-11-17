// Builds Neon Bay: a road grid, lit-window towers, a central park, a beach
// and a pier on the bay to the east, all under a golden-hour sun.
import * as THREE from 'three';
import { PALETTE, ROADS, WORLD } from './config.js';

function makeFacadeTexture(rng, baseColor, litRatio) {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 14;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? '#ffd27a' : '#20283c';
      ctx.fillRect(c * cw + 2, r * ch + 3, cw - 4, ch - 6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

export function buildCity(G) {
  const { scene, rng } = G;
  const group = new THREE.Group();
  scene.add(group);
  const solids = []; // {minX,maxX,minZ,maxZ} building footprints for collisions
  const places = {};

  // --- ground, beach, bay water ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x3d3a44 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 620),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachX - 15, 0.02, 0);
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 900),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.beachX + 250, 0.0, 0);
  group.add(water);

  // --- roads: asphalt strips + centre dashes + sidewalks ---
  const asphaltMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c86a });
  for (const r of ROADS) {
    for (const horizontal of [true, false]) {
      const len = WORLD.gridMax - WORLD.gridMin + 60;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(len, WORLD.roadHalf * 2), asphaltMat);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) road.position.set(0, 0.01, r);
      else {
        road.rotation.z = Math.PI / 2;
        road.position.set(r, 0.01, 0);
      }
      group.add(road);
      // sidewalks on both sides
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (horizontal) walk.position.set(0, 0.015, r + side * (WORLD.roadHalf + 1.5));
        else {
          walk.rotation.z = Math.PI / 2;
          walk.position.set(r + side * (WORLD.roadHalf + 1.5), 0.015, 0);
        }
        group.add(walk);
      }
      // dashed centre line
      for (let d = WORLD.gridMin; d < WORLD.gridMax; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) dash.position.set(d, 0.02, r);
        else {
          dash.rotation.z = Math.PI / 2;
          dash.position.set(r, 0.02, d);
        }
        group.add(dash);
      }
    }
  }

  // --- buildings: one or two towers per block, skipped for park/pier/plaza ---
  const facadeTex = [
    makeFacadeTexture(rng, '#7d6a58', 0.55),
    makeFacadeTexture(rng, '#5c6f8a', 0.45),
    makeFacadeTexture(rng, '#6f5c7d', 0.5),
    makeFacadeTexture(rng, '#8a7a5c', 0.4),
  ];
  const blockCenters = [];
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const cx = (ROADS[i] + ROADS[i + 1]) / 2;
      const cz = (ROADS[j] + ROADS[j + 1]) / 2;
      blockCenters.push([cx, cz]);
    }
  }
  const parkBlock = [0, 0];
  for (const [cx, cz] of blockCenters) {
    const isPark = Math.abs(cx - parkBlock[0]) < 1 && Math.abs(cz - parkBlock[1]) < 1;
    if (isPark) continue;
    // keep the pier approach (east edge, z near 0) and the garage block open
    if (cx > 200 && Math.abs(cz) < 40) continue;
    if (rng.next() < 0.12) continue; // empty lot / parking
    const count = rng.next() < 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const w = rng.float(16, 30);
      const d = rng.float(16, 30);
      const h = rng.float(9, 42);
      const ox = count === 1 ? 0 : (k === 0 ? -12 : 12);
      const oz = count === 1 ? 0 : (k === 0 ? 10 : -10);
      const tex = rng.pick(facadeTex);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx + ox, h / 2, cz + oz);
      group.add(b);
      // roof rim light
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshLambertMaterial({ color: 0xffd27a, emissive: 0x664411 }),
      );
      rim.position.set(cx + ox, h + 0.25, cz + oz);
      group.add(rim);
      solids.push({
        minX: cx + ox - w / 2 - 0.4,
        maxX: cx + ox + w / 2 + 0.4,
        minZ: cz + oz - d / 2 - 0.4,
        maxZ: cz + oz + d / 2 + 0.4,
      });
    }
  }

  // --- central park: grass quadrants around the crossing roads, trees, pond ---
  // (the grass must not cover the roads that cross the park block)
  const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  for (const [gx, gz] of [[-13.5, -13.5], [13.5, -13.5], [-13.5, 13.5], [13.5, 13.5]]) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), grassMat);
    quad.rotation.x = -Math.PI / 2;
    quad.position.set(gx, 0.03, gz);
    group.add(quad);
  }
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshLambertMaterial({ color: 0x2a6f8a }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-14, 0.04, 14);
  group.add(pond);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d46 });
  let placedTrees = 0;
  for (let t = 0; t < 40 && placedTrees < 14; t++) {
    const tx = rng.float(-20, 20);
    const tz = rng.float(-20, 20);
    if (Math.abs(tx) < 7 || Math.abs(tz) < 7) continue; // keep off the roads
    if (Math.hypot(tx + 14, tz - 14) < 8) continue; // keep out of the pond
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), trunkMat);
    trunk.position.set(tx, 1.2, tz);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(rng.float(1.6, 2.6), 8, 6), leafMat);
    leaves.position.set(tx, 3.4, tz);
    group.add(trunk);
    group.add(leaves);
    placedTrees++;
  }

  // --- pier: wooden deck out over the bay, with lamps and a shack ---
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(95, 0.2, 10), pierMat);
  pier.position.set(WORLD.beachX + 42, 0.1, 0);
  group.add(pier);
  for (let p = 0; p < 5; p++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 6), pierMat);
    post.position.set(WORLD.beachX + 8 + p * 20, -0.6, 4.2);
    group.add(post);
    const post2 = post.clone();
    post2.position.z = -4.2;
    group.add(post2);
  }
  const shack = box(6, 4, 5, 0x7d5a3c, WORLD.pierEndX - 8, 2.2, 5);
  group.add(shack);
  solids.push({
    minX: WORLD.pierEndX - 11.4,
    maxX: WORLD.pierEndX - 4.6,
    minZ: 2.2,
    maxZ: 7.8,
  });

  // --- street lamps along the roads ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe6a8, emissive: 0xcc8822 });
  for (const r of ROADS) {
    for (let d = WORLD.gridMin + 30; d <= WORLD.gridMax; d += 60) {
      for (const [x, z] of [
        [r, d],
        [d, r],
      ]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.set(x + 6.5, 3, z + 6.5);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
        bulb.position.set(x + 6.5, 6.2, z + 6.5);
        group.add(pole);
        group.add(bulb);
      }
    }
  }

  // --- garage, warehouse, safehouse, fixer office: named landmarks ---
  function landmark(x, z, w, h, d, color, signColor) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    m.position.set(x, h / 2, z);
    group.add(m);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, 1.2, 0.3),
      new THREE.MeshLambertMaterial({ color: signColor, emissive: signColor, emissiveIntensity: 0.5 }),
    );
    sign.position.set(x, h + 0.8, z + d / 2 + 0.2);
    group.add(sign);
    solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }
  landmark(186, -186, 20, 8, 14, 0x4a5a6a, 0x33e0ff); // Riko's garage
  landmark(-186, 126, 26, 10, 18, 0x6a4a3a, 0xff5533); // warehouse
  landmark(-246, -246, 14, 7, 12, 0x3a6a4a, 0x33ff88); // safehouse
  landmark(66, 66, 12, 12, 12, 0x5a4a6a, 0xffcc33); // Mara's office

  // --- named places the missions and the test harness use ---
  Object.assign(places, {
    pierEnd: { x: WORLD.pierEndX - 2, z: 0 },
    dropSouth: { x: -240, z: 246 },
    garage: { x: 180, z: -168 },
    warehouse: { x: -180, z: 108 },
    safehouse: { x: -240, z: -228 },
    fixerSpot: { x: 60, z: 52 },
    hospital: { x: 0, z: -246 },
    spawn: { x: 4, z: 30 },
    targetStop: { x: 240, z: 180 },
  });

  // --- road graph: intersections are nodes, edges run along roads ---
  const graph = new Map(); // "x,z" -> [{x,z}, ...]
  const key = (x, z) => `${x},${z}`;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const nb = [];
      for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) {
        const nx = rx + dx;
        const nz = rz + dz;
        if (nx >= WORLD.gridMin && nx <= WORLD.gridMax && nz >= WORLD.gridMin && nz <= WORLD.gridMax) {
          nb.push({ x: nx, z: nz });
        }
      }
      graph.set(key(rx, rz), nb);
    }
  }

  return { group, solids, places, graph, graphKey: key };
}

export function nearestRoadPoint(x, z) {
  const rx = ROADS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const rz = ROADS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
  return Math.abs(rx - x) < Math.abs(rz - z) ? { x: rx, z } : { x, z: rz };
}

export function collideSolids(solids, x, z, r) {
  // Push a circle out of every building AABB it overlaps. Returns corrected [x, z].
  for (const s of solids) {
    if (x > s.minX - r && x < s.maxX + r && z > s.minZ - r && z < s.maxZ + r) {
      const dxl = x - (s.minX - r);
      const dxr = s.maxX + r - x;
      const dzl = z - (s.minZ - r);
      const dzr = s.maxZ + r - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = s.minX - r;
      else if (m === dxr) x = s.maxX + r;
      else if (m === dzl) z = s.minZ - r;
      else z = s.maxZ + r;
    }
  }
  return [x, z];
}
