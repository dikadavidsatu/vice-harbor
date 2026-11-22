// Builds Neon Bay: a road grid, lit-window towers, a central park, a beach
// and a pier on the bay to the east, all under a golden-hour sun — plus the
// three themed districts that give the city its character: Pasar Senja, a
// night-market quarter in the south-east with striped stalls and string
// lights; Bukit Kaca, a glass-tower quarter in the north-west where the
// towers run taller and bluer; and Pelabuhan Tua, the old container harbour
// along the eastern shore, with stacked shipping containers and two cranes.
import * as THREE from 'three';
import { DISTRICTS, PALETTE, ROADS, WORLD, districtAt } from './config.js';

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

function makeGlassTexture(rng) {
  // Bukit Kaca facades: tall panes of blue glass, most of them lit from
  // inside with a cooler light than the warm windows elsewhere in town.
  const w = 64;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2c5a78';
  ctx.fillRect(0, 0, w, h);
  const cols = 5;
  const rows = 20;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = rng.next();
      ctx.fillStyle = roll < 0.62 ? '#bfeaff' : roll < 0.8 ? '#5fb6dd' : '#17384e';
      ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
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
  const addSolid = (x, z, w, d, pad = 0) => {
    solids.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });
  };

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

  // --- district ground tint: a warm market apron and a cool glass plaza ---
  const marketApron = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshLambertMaterial({ color: 0x6a4a3a }),
  );
  marketApron.rotation.x = -Math.PI / 2;
  marketApron.position.set(183, 0.005, 183);
  group.add(marketApron);
  const glassApron = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshLambertMaterial({ color: 0x44586a }),
  );
  glassApron.rotation.x = -Math.PI / 2;
  glassApron.position.set(-183, 0.005, -183);
  group.add(glassApron);

  // --- buildings: one or two towers per block, skipped for park/pier/plaza ---
  const facadeTex = [
    makeFacadeTexture(rng, '#7d6a58', 0.55),
    makeFacadeTexture(rng, '#5c6f8a', 0.45),
    makeFacadeTexture(rng, '#6f5c7d', 0.5),
    makeFacadeTexture(rng, '#8a7a5c', 0.4),
  ];
  const glassTex = makeGlassTexture(rng);
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
    const district = districtAt(cx, cz);
    // Pasar Senja keeps half its blocks open for stalls and crowds
    if (district && district.id === 'pasar-senja' && rng.next() < 0.45) continue;
    // Pelabuhan Tua is a container yard, not a tower district
    if (district && district.id === 'pelabuhan-tua') continue;
    if (rng.next() < 0.12) continue; // empty lot / parking
    const isGlass = district && district.id === 'bukit-kaca';
    const count = rng.next() < 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const w = rng.float(16, 30);
      const d = rng.float(16, 30);
      // glass towers run taller and slimmer than the rest of the city
      const h = isGlass ? rng.float(30, 58) : rng.float(9, 42);
      const ox = count === 1 ? 0 : (k === 0 ? -12 : 12);
      const oz = count === 1 ? 0 : (k === 0 ? 10 : -10);
      const tex = isGlass ? glassTex : rng.pick(facadeTex);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx + ox, h / 2, cz + oz);
      group.add(b);
      // roof rim light, cyan over Bukit Kaca, warm gold everywhere else
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshLambertMaterial({
          color: isGlass ? PALETTE.neonCyan : 0xffd27a,
          emissive: isGlass ? 0x1a5566 : 0x664411,
        }),
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

  // --- Pasar Senja: market stalls with striped awnings + string lights ---
  // Stalls line the two streets that cross the market block; each stall is a
  // counter box, four posts and a sloped awning in one of the market colours.
  const stallSpots = [];
  for (let i = 0; i < 7; i++) {
    stallSpots.push({ x: 138 + i * 15, z: 172, rot: 0 });
    stallSpots.push({ x: 138 + i * 15, z: 194, rot: Math.PI });
  }
  for (let i = 0; i < 5; i++) {
    stallSpots.push({ x: 172, z: 138 + i * 15, rot: Math.PI / 2 });
    stallSpots.push({ x: 194, z: 138 + i * 15, rot: -Math.PI / 2 });
  }
  const awningColors = [PALETTE.awningA, PALETTE.awningB, PALETTE.awningC, PALETTE.awningD];
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5c4630 });
  stallSpots.forEach((spot, i) => {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 1.1, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x8a6f4d }),
    );
    counter.position.y = 0.55;
    stall.add(counter);
    // goods on the counter: little bright boxes, different on every stall
    for (let gItem = 0; gItem < 3; gItem++) {
      const goods = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.5, 0.7),
        new THREE.MeshLambertMaterial({ color: rng.pick(awningColors) }),
      );
      goods.position.set(-1.4 + gItem * 1.4, 1.35, 0);
      stall.add(goods);
    }
    for (const [px, pz] of [[-2.1, -0.9], [2.1, -0.9], [-2.1, 0.9], [2.1, 0.9]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), postMat);
      post.position.set(px, 1.3, pz);
      stall.add(post);
    }
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.12, 3.2),
      new THREE.MeshLambertMaterial({ color: awningColors[i % awningColors.length] }),
    );
    awning.position.set(0, 2.7, 0);
    awning.rotation.x = 0.18;
    stall.add(awning);
    stall.position.set(spot.x, 0, spot.z);
    stall.rotation.y = spot.rot;
    group.add(stall);
    addSolid(spot.x, spot.z, 4.8, 2.6, 0.2);
  });
  // string lights: two catenary-ish rows of warm bulbs over the market square
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xcc8822 });
  for (const rowZ of [178, 188]) {
    for (let i = 0; i <= 12; i++) {
      const bx = 132 + i * 8.5;
      const sag = Math.sin((i / 12) * Math.PI) * -0.7;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), bulbMat);
      bulb.position.set(bx, 4.6 + sag, rowZ);
      group.add(bulb);
    }
  }

  // --- Pelabuhan Tua: container stacks and two harbour cranes ---
  const containerColors = [PALETTE.containerRed, PALETTE.containerBlue, PALETTE.containerGreen, PALETTE.containerSand];
  const containerSpots = [
    [232, -52], [232, -38], [246, -52], [246, -38], [232, 34], [246, 34],
    [218, 52], [232, 52], [252, -8], [252, 8], [218, -58], [260, 44],
  ];
  for (const [cx, cz] of containerSpots) {
    const levels = rng.int(1, 3);
    for (let lv = 0; lv < levels; lv++) {
      const cont = box(11, 2.8, 4.6, rng.pick(containerColors), cx, 1.4 + lv * 2.85, cz);
      if (rng.chance(0.3)) cont.rotation.y = Math.PI / 2;
      group.add(cont);
    }
    addSolid(cx, cz, 11.4, 5, 0.2);
  }
  function buildCrane(x, z, rotY) {
    const crane = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xc26a1e });
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 17, 0.7), steel);
      leg.position.set(lx, 8.5, lz);
      crane.add(leg);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), steel);
    cab.position.set(0, 17.8, 0);
    crane.add(cab);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 0.8), steel);
    jib.position.set(6, 19.4, 0);
    crane.add(jib);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6, 0.12), steel);
    cable.position.set(15, 16.2, 0);
    crane.add(cable);
    const hookBox = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 2.2, 2),
      new THREE.MeshLambertMaterial({ color: PALETTE.containerBlue }),
    );
    hookBox.position.set(15, 12.6, 0);
    crane.add(hookBox);
    crane.position.set(x, 0, z);
    crane.rotation.y = rotY;
    group.add(crane);
    addSolid(x, z, 7.4, 7.4, 0.2);
  }
  buildCrane(238, -16, 0.3);
  buildCrane(258, 26, -0.4);

  // --- beach promenade: palm trees along the sand ---
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  for (let pz = -240; pz <= 240; pz += 40) {
    if (Math.abs(pz) < 12) continue; // keep the pier entrance clear
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), palmTrunkMat);
    trunk.position.set(282, 2.7, pz);
    trunk.rotation.z = -0.12;
    group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.SphereGeometry(1.9, 7, 5), palmLeafMat);
      const a = (f / 5) * Math.PI * 2;
      frond.scale.set(1, 0.28, 0.5);
      frond.position.set(282 - 0.6 + Math.sin(a) * 1.1, 5.6, pz + Math.cos(a) * 1.1);
      frond.rotation.y = a;
      group.add(frond);
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

  // --- park fountain and benches (south-east quadrant of the park) ---
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.8, 0.7, 18),
    new THREE.MeshLambertMaterial({ color: 0x9a94a4 }),
  );
  fountainBase.position.set(14, 0.35, -14);
  group.add(fountainBase);
  const fountainWater = new THREE.Mesh(
    new THREE.CircleGeometry(3.9, 18),
    new THREE.MeshLambertMaterial({ color: 0x3d9ec2 }),
  );
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(14, 0.72, -14);
  group.add(fountainWater);
  const fountainSpire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 1.9, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a94a4 }),
  );
  fountainSpire.position.set(14, 1.4, -14);
  group.add(fountainSpire);
  addSolid(14, -14, 9.4, 9.4, 0.1);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  for (const [bx, bz, brot] of [[8, -22], [20, -22], [8, -6], [20, -6], [-22, 6], [-6, 22]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.7), benchMat);
    bench.position.set(bx, 0.45, bz);
    bench.rotation.y = brot || 0;
    group.add(bench);
  }

  // --- Pelabuhan Tua dressing: fuel drums and mooring bollards ---
  const drumColors = [0xb03a30, 0x2a5f9e, 0x777777];
  for (const [dx, dz] of [[222, 12], [224, 12], [223, 14], [248, -30], [250, -30], [214, 44], [258, 52]]) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10),
      new THREE.MeshLambertMaterial({ color: rng.pick(drumColors) }),
    );
    drum.position.set(dx, 0.65, dz);
    group.add(drum);
  }
  const bollardMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  for (let bz = -60; bz <= 60; bz += 20) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), bollardMat);
    bollard.position.set(272, 0.45, bz);
    group.add(bollard);
  }

  // --- Pasar Senja lantern poles: taller than street lamps, warmer light ---
  const lanternMat = new THREE.MeshLambertMaterial({ color: 0xff9a5c, emissive: 0xcc5a22 });
  for (const [lx, lz] of [[132, 168], [168, 168], [204, 168], [132, 198], [168, 198], [204, 198], [228, 183]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), postMat);
    pole.position.set(lx, 2.2, lz);
    group.add(pole);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), lanternMat);
    lantern.position.set(lx, 4.6, lz);
    group.add(lantern);
  }

  // --- lifeguard towers on the beach, watching the swimmers that aren't ---
  for (const lz of [-120, 90]) {
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d2 });
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.28), towerMat);
      leg.position.set(292 + ox, 1.7, lz + oz);
      group.add(leg);
    }
    const hut = box(3.8, 1.9, 3.8, 0xd84a4a, 292, 4.3, lz);
    group.add(hut);
    const roof = box(4.4, 0.3, 4.4, 0xf2ead8, 292, 5.4, lz);
    group.add(roof);
    addSolid(292, lz, 3.6, 3.6, 0.1);
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
  landmark(150, 210, 16, 6, 10, 0x7a4a2e, 0xff7a3c); // Pasar Senja market hall
  landmark(-210, -150, 18, 16, 14, 0x2c5a78, 0x53d8ff); // Menara Kaca lobby tower
  landmark(214, -64, 16, 7, 12, 0x5a5148, 0xffd23b); // Pelabuhan Tua harbour office

  // --- race gates: two neon posts and a lintel at every checkpoint ---
  // The same gates serve the story race in Pasar Senja and the repeatable
  // street-race side activity, which starts at the market gate.
  const gatePlaces = {
    raceGate1: { x: 120, z: 120 },
    raceGate2: { x: 240, z: 120 },
    raceGate3: { x: 240, z: 240 },
    raceGate4: { x: 120, z: 240 },
    raceGate5: { x: 60, z: 180 },
    marketGate: { x: 120, z: 180 },
  };
  const gateMat = new THREE.MeshLambertMaterial({ color: PALETTE.neonPink, emissive: 0x881155 });
  for (const gp of Object.values(gatePlaces)) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.4, 8), gateMat);
      post.position.set(gp.x + side * 5.4, 2.7, gp.z);
      group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.5, 0.5), gateMat);
    lintel.position.set(gp.x, 5.4, gp.z);
    group.add(lintel);
  }

  // --- named places the missions, activities and the test harness use ---
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
    // Pasar Senja
    marketStall: { x: 156, z: 180 },
    marketHall: { x: 150, z: 196 },
    marketGate: gatePlaces.marketGate,
    // Bukit Kaca
    glassLobby: { x: -204, z: -132 },
    glassPlaza: { x: -180, z: -180 },
    // Pelabuhan Tua
    harborGate: { x: 222, z: -46 },
    harborOffice: { x: 206, z: -58 },
    // story-race checkpoints and lost-crate spots
    ...gatePlaces,
    crateHarbor: { x: 236, z: 20 },
    crateMarket: { x: 168, z: 156 },
    crateGlass: { x: -114, z: -228 },
    cratePier: { x: 330, z: -3 },
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

  return { group, solids, places, graph, graphKey: key, districts: DISTRICTS };
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
