// city.js — builds Neon Bay and answers questions about its geometry.
// One road grid carries the city; character comes from the layers on it:
// a central park, a beach and pier on the eastern bay, and three districts
// — Pasar Senja (night market), Bukit Kaca (glass towers), Pelabuhan Tua
// (container harbour). buildCity returns the collision solids, the named
// places other modules navigate by, and the road graph traffic drives on.
import * as THREE from 'three';
import { DISTRICTS, PALETTE, ROADS, WORLD, districtAt } from './config.js';

// A building facade drawn on a canvas: a grid of windows, some lit. The
// seeded rng decides which, so a given seed always raises the same towers.
function facadeTexture(rng, wallColour, litChance) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = wallColour;
  ctx.fillRect(0, 0, 64, 128);
  const cols = 6;
  const rows = 14;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = rng.next() < litChance ? '#ffd27a' : '#20283c';
      ctx.fillRect(col * (64 / cols) + 2, row * (128 / rows) + 3, 64 / cols - 4, 128 / rows - 6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Bukit Kaca gets its own glass: taller panes, cooler light, most of them on.
function glassTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2c5a78';
  ctx.fillRect(0, 0, 64, 160);
  const cols = 5;
  const rows = 20;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const roll = rng.next();
      ctx.fillStyle = roll < 0.62 ? '#bfeaff' : roll < 0.8 ? '#5fb6dd' : '#17384e';
      ctx.fillRect(col * (64 / cols) + 1, row * (160 / rows) + 1, 64 / cols - 2, 160 / rows - 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function boxAt(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  mesh.position.set(x, y, z);
  return mesh;
}

export function buildCity(G) {
  const { scene, rng } = G;
  const group = new THREE.Group();
  scene.add(group);
  const solids = [];
  const places = {};
  const registerSolid = (x, z, w, d, pad = 0) => {
    solids.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });
  };

  // -- terrain: base slab, sand strip, open water -------------------------
  const base = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lambert(0x3d3a44));
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.05, 0);
  group.add(base);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, 620), lambert(PALETTE.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachX - 15, 0.02, 0);
  group.add(sand);

  const bay = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 900),
    lambert(PALETTE.water, { transparent: true, opacity: 0.92 }),
  );
  bay.rotation.x = -Math.PI / 2;
  bay.position.set(WORLD.beachX + 250, 0, 0);
  group.add(bay);

  // -- streets: asphalt, sidewalks, dashed centre lines -------------------
  const asphaltMat = lambert(PALETTE.asphalt);
  const walkMat = lambert(PALETTE.sidewalk);
  const dashMat = lambert(0xd8c86a);
  const streetLen = WORLD.gridMax - WORLD.gridMin + 60;
  for (const coord of ROADS) {
    for (const horizontal of [true, false]) {
      const put = (mesh, along, across, y) => {
        mesh.rotation.x = -Math.PI / 2;
        if (!horizontal) mesh.rotation.z = Math.PI / 2;
        if (horizontal) mesh.position.set(along, y, across);
        else mesh.position.set(across, y, along);
        group.add(mesh);
      };
      put(new THREE.Mesh(new THREE.PlaneGeometry(streetLen, WORLD.roadHalf * 2), asphaltMat), 0, coord, 0.01);
      for (const side of [-1, 1]) {
        put(new THREE.Mesh(new THREE.PlaneGeometry(streetLen, 3), walkMat), 0, coord + side * (WORLD.roadHalf + 1.5), 0.015);
      }
      for (let d = WORLD.gridMin; d < WORLD.gridMax; d += 12) {
        put(new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMat), d, coord, 0.02);
      }
    }
  }

  // -- district floor treatments: warm market apron, cool glass plaza -----
  const apron = (x, z, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), lambert(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.005, z);
    group.add(m);
  };
  apron(183, 183, 0x6a4a3a);
  apron(-183, -183, 0x44586a);

  // -- towers: one or two per block, themed by district --------------------
  const facades = [
    facadeTexture(rng, '#7d6a58', 0.55),
    facadeTexture(rng, '#5c6f8a', 0.45),
    facadeTexture(rng, '#6f5c7d', 0.5),
    facadeTexture(rng, '#8a7a5c', 0.4),
  ];
  const glass = glassTexture(rng);
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const cx = (ROADS[i] + ROADS[i + 1]) / 2;
      const cz = (ROADS[j] + ROADS[j + 1]) / 2;
      if (cx === 0 && cz === 0) continue; // the park block stays green
      if (cx > 200 && Math.abs(cz) < 40) continue; // pier approach stays open
      const district = districtAt(cx, cz);
      if (district?.id === 'pelabuhan-tua') continue; // the harbour is a yard, not towers
      if (district?.id === 'pasar-senja' && rng.next() < 0.45) continue; // market needs stall room
      if (rng.next() < 0.12) continue; // vacant lot
      const isGlass = district?.id === 'bukit-kaca';
      const towers = rng.next() < 0.45 ? 2 : 1;
      for (let k = 0; k < towers; k++) {
        const w = rng.float(16, 30);
        const d = rng.float(16, 30);
        const h = isGlass ? rng.float(30, 58) : rng.float(9, 42);
        const ox = towers === 1 ? 0 : k === 0 ? -12 : 12;
        const oz = towers === 1 ? 0 : k === 0 ? 10 : -10;
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ map: isGlass ? glass : rng.pick(facades) }),
        );
        tower.position.set(cx + ox, h / 2, cz + oz);
        group.add(tower);
        // A glowing rim on the roofline: cyan over the glass quarter, gold elsewhere.
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
          lambert(isGlass ? PALETTE.neonCyan : 0xffd27a, { emissive: isGlass ? 0x1a5566 : 0x664411 }),
        );
        rim.position.set(cx + ox, h + 0.25, cz + oz);
        group.add(rim);
        registerSolid(cx + ox, cz + oz, w + 0.8, d + 0.8);
      }
    }
  }

  // -- Pasar Senja: stalls under striped awnings, strung with bulbs --------
  const stallLayout = [];
  for (let i = 0; i < 7; i++) {
    stallLayout.push({ x: 138 + i * 15, z: 172, rot: 0 });
    stallLayout.push({ x: 138 + i * 15, z: 194, rot: Math.PI });
  }
  for (let i = 0; i < 5; i++) {
    stallLayout.push({ x: 172, z: 138 + i * 15, rot: Math.PI / 2 });
    stallLayout.push({ x: 194, z: 138 + i * 15, rot: -Math.PI / 2 });
  }
  const awningPalette = [PALETTE.awningA, PALETTE.awningB, PALETTE.awningC, PALETTE.awningD];
  const timberMat = lambert(0x5c4630);
  stallLayout.forEach((spot, idx) => {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.2), lambert(0x8a6f4d));
    counter.position.y = 0.55;
    stall.add(counter);
    for (let gItem = 0; gItem < 3; gItem++) {
      // Bright little goods boxes — every stall sells something different.
      const goods = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), lambert(rng.pick(awningPalette)));
      goods.position.set(-1.4 + gItem * 1.4, 1.35, 0);
      stall.add(goods);
    }
    for (const [px, pz] of [[-2.1, -0.9], [2.1, -0.9], [-2.1, 0.9], [2.1, 0.9]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), timberMat);
      post.position.set(px, 1.3, pz);
      stall.add(post);
    }
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.12, 3.2),
      lambert(awningPalette[idx % awningPalette.length]),
    );
    awning.position.set(0, 2.7, 0);
    awning.rotation.x = 0.18;
    stall.add(awning);
    stall.position.set(spot.x, 0, spot.z);
    stall.rotation.y = spot.rot;
    group.add(stall);
    registerSolid(spot.x, spot.z, 4.8, 2.6, 0.2);
  });
  const bulbMat = lambert(0xffd9a0, { emissive: 0xcc8822 });
  for (const rowZ of [178, 188]) {
    for (let i = 0; i <= 12; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), bulbMat);
      // The sag of a wire strung between poles, faked with a sine dip.
      bulb.position.set(132 + i * 8.5, 4.6 - Math.sin((i / 12) * Math.PI) * 0.7, rowZ);
      group.add(bulb);
    }
  }

  // -- Pelabuhan Tua: container stacks, cranes, drums, bollards ------------
  const containerPalette = [PALETTE.containerRed, PALETTE.containerBlue, PALETTE.containerGreen, PALETTE.containerSand];
  const stackSpots = [
    [232, -52], [232, -38], [246, -52], [246, -38], [232, 34], [246, 34],
    [218, 52], [232, 52], [252, -8], [252, 8], [218, -58], [260, 44],
  ];
  for (const [sx, sz] of stackSpots) {
    const levels = rng.int(1, 3);
    for (let lv = 0; lv < levels; lv++) {
      const unit = boxAt(11, 2.8, 4.6, rng.pick(containerPalette), sx, 1.4 + lv * 2.85, sz);
      if (rng.chance(0.3)) unit.rotation.y = Math.PI / 2;
      group.add(unit);
    }
    registerSolid(sx, sz, 11.4, 5, 0.2);
  }
  const buildCrane = (x, z, rotY) => {
    const crane = new THREE.Group();
    const steel = lambert(0xc26a1e);
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
    const load = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 2), lambert(PALETTE.containerBlue));
    load.position.set(15, 12.6, 0);
    crane.add(load);
    crane.position.set(x, 0, z);
    crane.rotation.y = rotY;
    group.add(crane);
    registerSolid(x, z, 7.4, 7.4, 0.2);
  };
  buildCrane(238, -16, 0.3);
  buildCrane(258, 26, -0.4);

  const drumPalette = [0xb03a30, 0x2a5f9e, 0x777777];
  for (const [dx, dz] of [[222, 12], [224, 12], [223, 14], [248, -30], [250, -30], [214, 44], [258, 52]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), lambert(rng.pick(drumPalette)));
    drum.position.set(dx, 0.65, dz);
    group.add(drum);
  }
  const bollardMat = lambert(0x2a2a33);
  for (let bz = -60; bz <= 60; bz += 20) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), bollardMat);
    bollard.position.set(272, 0.45, bz);
    group.add(bollard);
  }

  // -- the beach promenade: palms leaning over the sand --------------------
  const trunkMat = lambert(PALETTE.palmTrunk);
  const frondMat = lambert(PALETTE.palmLeaf);
  for (let pz = -240; pz <= 240; pz += 40) {
    if (Math.abs(pz) < 12) continue; // the pier entrance stays clear
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), trunkMat);
    trunk.position.set(282, 2.7, pz);
    trunk.rotation.z = -0.12;
    group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const angle = (f / 5) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.SphereGeometry(1.9, 7, 5), frondMat);
      frond.scale.set(1, 0.28, 0.5);
      frond.position.set(281.4 + Math.sin(angle) * 1.1, 5.6, pz + Math.cos(angle) * 1.1);
      frond.rotation.y = angle;
      group.add(frond);
    }
  }

  // -- central park: grass quadrants, pond, trees, fountain, benches -------
  const grassMat = lambert(PALETTE.grass);
  for (const [gx, gz] of [[-13.5, -13.5], [13.5, -13.5], [-13.5, 13.5], [13.5, 13.5]]) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), grassMat);
    quad.rotation.x = -Math.PI / 2;
    quad.position.set(gx, 0.03, gz);
    group.add(quad);
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(6, 24), lambert(0x2a6f8a));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-14, 0.04, 14);
  group.add(pond);

  const treeTrunkMat = lambert(0x6b4a2f);
  const treeLeafMat = lambert(0x3f7d46);
  let treesPlanted = 0;
  for (let attempt = 0; attempt < 40 && treesPlanted < 14; attempt++) {
    const tx = rng.float(-20, 20);
    const tz = rng.float(-20, 20);
    if (Math.abs(tx) < 7 || Math.abs(tz) < 7) continue; // not on the crossing roads
    if (Math.hypot(tx + 14, tz - 14) < 8) continue; // not in the pond
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), treeTrunkMat);
    trunk.position.set(tx, 1.2, tz);
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(rng.float(1.6, 2.6), 8, 6), treeLeafMat);
    crown.position.set(tx, 3.4, tz);
    group.add(crown);
    treesPlanted++;
  }

  const stoneMat = lambert(0x9a94a4);
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.7, 18), stoneMat);
  fountainBase.position.set(14, 0.35, -14);
  group.add(fountainBase);
  const fountainPool = new THREE.Mesh(new THREE.CircleGeometry(3.9, 18), lambert(0x3d9ec2));
  fountainPool.rotation.x = -Math.PI / 2;
  fountainPool.position.set(14, 0.72, -14);
  group.add(fountainPool);
  const fountainSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.9, 8), stoneMat);
  fountainSpire.position.set(14, 1.4, -14);
  group.add(fountainSpire);
  registerSolid(14, -14, 9.4, 9.4, 0.1);

  const benchMat = lambert(0x6b4a2f);
  for (const [bx, bz] of [[8, -22], [20, -22], [8, -6], [20, -6], [-22, 6], [-6, 22]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.7), benchMat);
    bench.position.set(bx, 0.45, bz);
    group.add(bench);
  }

  // -- Pasar Senja lantern poles -------------------------------------------
  const lanternMat = lambert(0xff9a5c, { emissive: 0xcc5a22 });
  for (const [lx, lz] of [[132, 168], [168, 168], [204, 168], [132, 198], [168, 198], [204, 198], [228, 183]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), timberMat);
    pole.position.set(lx, 2.2, lz);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), lanternMat);
    lamp.position.set(lx, 4.6, lz);
    group.add(lamp);
  }

  // -- lifeguard towers ------------------------------------------------------
  for (const lz of [-120, 90]) {
    const paintMat = lambert(0xe8e2d2);
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.28), paintMat);
      leg.position.set(292 + ox, 1.7, lz + oz);
      group.add(leg);
    }
    group.add(boxAt(3.8, 1.9, 3.8, 0xd84a4a, 292, 4.3, lz));
    group.add(boxAt(4.4, 0.3, 4.4, 0xf2ead8, 292, 5.4, lz));
    registerSolid(292, lz, 3.6, 3.6, 0.1);
  }

  // -- the pier: deck, posts, and the shack at its far end -------------------
  const pierMat = lambert(0x8a6f4d);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(95, 0.2, 10), pierMat);
  deck.position.set(WORLD.beachX + 42, 0.1, 0);
  group.add(deck);
  for (let p = 0; p < 5; p++) {
    for (const pz of [4.2, -4.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 6), pierMat);
      post.position.set(WORLD.beachX + 8 + p * 20, -0.6, pz);
      group.add(post);
    }
  }
  group.add(boxAt(6, 4, 5, 0x7d5a3c, WORLD.pierEndX - 8, 2.2, 5));
  solids.push({ minX: WORLD.pierEndX - 11.4, maxX: WORLD.pierEndX - 4.6, minZ: 2.2, maxZ: 7.8 });

  // -- street lamps ------------------------------------------------------------
  const lampPoleMat = lambert(0x222226);
  const lampHeadMat = lambert(0xffe6a8, { emissive: 0xcc8822 });
  for (const coord of ROADS) {
    for (let d = WORLD.gridMin + 30; d <= WORLD.gridMax; d += 60) {
      for (const [lx, lz] of [[coord, d], [d, coord]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampPoleMat);
        pole.position.set(lx + 6.5, 3, lz + 6.5);
        group.add(pole);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampHeadMat);
        head.position.set(lx + 6.5, 6.2, lz + 6.5);
        group.add(head);
      }
    }
  }

  // -- named landmarks: a block, a glowing sign, a collision footprint --------
  const buildLandmark = (x, z, w, h, d, color, signColor) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    body.position.set(x, h / 2, z);
    group.add(body);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, 1.2, 0.3),
      lambert(signColor, { emissive: signColor, emissiveIntensity: 0.5 }),
    );
    sign.position.set(x, h + 0.8, z + d / 2 + 0.2);
    group.add(sign);
    solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return body;
  };
  buildLandmark(186, -186, 20, 8, 14, 0x4a5a6a, 0x33e0ff); // Riko's garage
  buildLandmark(-186, 126, 26, 10, 18, 0x6a4a3a, 0xff5533); // the warehouse
  buildLandmark(-246, -246, 14, 7, 12, 0x3a6a4a, 0x33ff88); // the safehouse
  buildLandmark(66, 66, 12, 12, 12, 0x5a4a6a, 0xffcc33); // Mara's office
  buildLandmark(150, 210, 16, 6, 10, 0x7a4a2e, 0xff7a3c); // Pasar Senja market hall
  buildLandmark(-210, -150, 18, 16, 14, 0x2c5a78, 0x53d8ff); // Menara Kaca lobby tower
  buildLandmark(214, -64, 16, 7, 12, 0x5a5148, 0xffd23b); // Pelabuhan Tua harbour office

  // -- race gates: twin neon posts and a lintel -------------------------------
  // One set of gates serves both the story race and the street-race time
  // trial; the start/finish gate is the market gate.
  const gatePlaces = {
    raceGate1: { x: 120, z: 120 },
    raceGate2: { x: 240, z: 120 },
    raceGate3: { x: 240, z: 240 },
    raceGate4: { x: 120, z: 240 },
    raceGate5: { x: 60, z: 180 },
    marketGate: { x: 120, z: 180 },
  };
  const gateMat = lambert(PALETTE.neonPink, { emissive: 0x881155 });
  for (const gate of Object.values(gatePlaces)) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.4, 8), gateMat);
      post.position.set(gate.x + side * 5.4, 2.7, gate.z);
      group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.5, 0.5), gateMat);
    lintel.position.set(gate.x, 5.4, gate.z);
    group.add(lintel);
  }

  // -- the gazetteer: every place the missions, activities and HUD refer to --
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
    marketStall: { x: 156, z: 180 },
    marketHall: { x: 150, z: 196 },
    marketGate: gatePlaces.marketGate,
    glassLobby: { x: -204, z: -132 },
    glassPlaza: { x: -180, z: -180 },
    harborGate: { x: 222, z: -46 },
    harborOffice: { x: 206, z: -58 },
    ...gatePlaces,
    crateHarbor: { x: 236, z: 20 },
    crateMarket: { x: 168, z: 156 },
    crateGlass: { x: -114, z: -228 },
    cratePier: { x: 330, z: -3 },
  });

  // -- road graph: intersections are nodes, block edges join neighbours -------
  const graph = new Map();
  const graphKey = (x, z) => `${x},${z}`;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const neighbours = [];
      for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) {
        const nx = rx + dx;
        const nz = rz + dz;
        if (nx >= WORLD.gridMin && nx <= WORLD.gridMax && nz >= WORLD.gridMin && nz <= WORLD.gridMax) {
          neighbours.push({ x: nx, z: nz });
        }
      }
      graph.set(graphKey(rx, rz), neighbours);
    }
  }

  return { group, solids, places, graph, graphKey, districts: DISTRICTS };
}

// The closest point that lies on a road: snap whichever coordinate is
// nearer to its road line and keep the other as it was.
export function nearestRoadPoint(x, z) {
  const nearest = (v) => ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const rx = nearest(x);
  const rz = nearest(z);
  return Math.abs(rx - x) < Math.abs(rz - z) ? { x: rx, z } : { x, z: rz };
}

// Push a circle (centre x/z, radius r) out of every solid AABB it overlaps,
// resolving along whichever face is closest. Returns the corrected [x, z].
export function collideSolids(solids, x, z, r) {
  for (const s of solids) {
    if (x <= s.minX - r || x >= s.maxX + r || z <= s.minZ - r || z >= s.maxZ + r) continue;
    const escapes = [
      { dist: x - (s.minX - r), apply: () => { x = s.minX - r; } },
      { dist: s.maxX + r - x, apply: () => { x = s.maxX + r; } },
      { dist: z - (s.minZ - r), apply: () => { z = s.minZ - r; } },
      { dist: s.maxZ + r - z, apply: () => { z = s.maxZ + r; } },
    ];
    escapes.sort((a, b) => a.dist - b.dist);
    escapes[0].apply();
  }
  return [x, z];
}
