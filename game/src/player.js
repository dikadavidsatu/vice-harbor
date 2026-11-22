// player.js — the protagonist: body, wallet, health and camera. On foot
// it walks relative to the camera, punches, and shoots along the camera's
// centre ray; in a car, throttle/steering/handbrake feed the vehicle's own
// tuning and collisions shove traffic aside. It also owns the consequences:
// stealing a car in sight of police is a crime, dying means the hospital,
// and crossing a district border raises that district's banner.
import * as THREE from 'three';
import { CAR_TUNE, PLAYER_TUNE, WORLD, districtAt } from './config.js';
import { collideSolids } from './city.js';

function protagonistMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x19c2e0 });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x22222c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), jacket);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x111118 }),
  );
  cap.position.y = 1.98;
  group.add(cap);
  for (const side of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), trousers);
    leg.position.set(side, 0.31, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    group.add(leg);
  }
  return group;
}

// Shortest-arc angle interpolation helper shared by body and camera turns.
function turnToward(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(4, 0, 30);
    this.heading = Math.PI;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDistMul = 1; // wheel-controlled zoom, clamped 0.7..1.6
    this.onFoot = true;
    this.car = null;
    this.cash = 250;
    this.health = PLAYER_TUNE.maxHealth;
    this.dead = false;
    this.deadTimer = 0;
    this.speed = 0;
    this.autoDrive = false;
    this.autoWp = 0;
    this.lastShotAt = -99;
    this.lastPunchAt = -99;
    this.lastHornAt = -99;
    this.districtId = null;
    this.walkBob = 0;
    this.mesh = protagonistMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    this.cameraPos = new THREE.Vector3(4, 4, 38);
    this.tracer = null;
    this.tracerTimer = 0;
  }

  // Where the world should consider "the player" to be: the car, when driving.
  effectivePos() {
    return this.car ? this.car.pos : this.pos;
  }

  // Pedestrians ask this whether they should be running away: a fast car,
  // or a person who fired a shot in the last second and a half, counts.
  dangerNear(pos, radius) {
    const mine = this.effectivePos();
    if (Math.hypot(pos.x - mine.x, pos.z - mine.z) > radius) return null;
    if (this.car && Math.abs(this.car.speed) > 5) return this.car.pos;
    if (this.G.time - this.lastShotAt < 1.5) return this.pos;
    return null;
  }

  update(dt) {
    const G = this.G;
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      this.updateCamera(dt);
      return;
    }
    if (G.mode !== 'playing') {
      this.updateCamera(dt);
      return;
    }
    this.readMouse();
    this.readActionKeys();
    if (this.onFoot) this.stepOnFoot(dt);
    else this.driveCurrentCar(dt);
    this.watchDistrict();
    this.updateCamera(dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0 && this.tracer) {
        G.scene.remove(this.tracer);
        this.tracer = null;
      }
    }
    G.audio.setEngine(this.car ? Math.abs(this.car.speed) / CAR_TUNE.maxSpeed : 0, Boolean(this.car));
    // Surf noise swells as the player approaches the beach and pier.
    const shore = Math.max(0, Math.min(1, (this.effectivePos().x - 170) / 130));
    G.audio.setAmbience(shore);
  }

  readMouse() {
    const { dx, dy } = this.G.input.consumeMouse();
    this.camYaw -= dx * 0.0028;
    this.camPitch = Math.max(0.08, Math.min(1.0, this.camPitch + dy * 0.0022));
    const wheel = this.G.input.consumeWheel();
    if (wheel !== 0) {
      this.camDistMul = Math.max(0.7, Math.min(1.6, this.camDistMul + wheel * 0.12));
    }
  }

  readActionKeys() {
    const input = this.G.input;
    if (input.consumePressed('KeyE')) this.toggleCar();
    if (input.consumePressed('KeyF')) this.punch();
    if (input.consumePressed('KeyH')) this.horn();
    if (input.consumePressed('KeyM')) this.G.missions.tryStartNext();
    if (input.consumePressed('KeyP')) this.G.togglePause();
    // Clicks only shoot on foot; aim is the screen-centre crosshair, since
    // pointer lock makes the click's own coordinates meaningless.
    for (const _click of input.consumeClicks()) {
      if (this.onFoot) this.shoot();
    }
  }

  stepOnFoot(dt) {
    const input = this.G.input;
    const { f, s } = input.axis();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const moving = f !== 0 || s !== 0;
    const goalSpeed = moving ? (running ? PLAYER_TUNE.runSpeed : PLAYER_TUNE.walkSpeed) : 0;
    // Movement is expressed in camera space, then rotated into the world.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let mx = fx * f + rx * s;
    let mz = fz * f + rz * s;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.heading = turnToward(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    }
    this.speed += (goalSpeed - this.speed) * Math.min(1, dt * 8);
    const [cx, cz] = collideSolids(
      this.G.city.solids,
      this.pos.x + mx * this.speed * dt,
      this.pos.z + mz * this.speed * dt,
      PLAYER_TUNE.radius,
    );
    // City bounds, with one exception: the pier runs east over the water,
    // so x may pass the beach only while z stays on the deck.
    let bx = Math.max(-WORLD.bound, Math.min(WORLD.pierEndX + 6, cx));
    if (bx > WORLD.beachX && Math.abs(cz) > 6) bx = WORLD.beachX;
    this.pos.x = bx;
    this.pos.z = Math.max(-WORLD.bound, Math.min(WORLD.bound, cz));
    // A gentle bob and swinging legs sell the walk cycle.
    this.walkBob += dt * this.speed * 1.8;
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.walkBob)) * 0.05, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkBob) * 0.45 * Math.min(1, this.speed / 5);
    const legL = this.mesh.getObjectByName('legL');
    const legR = this.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
  }

  driveCurrentCar(dt) {
    const car = this.car;
    if (!car) {
      this.onFoot = true;
      return;
    }
    const input = this.G.input;
    const { f, s } = input.axis();
    let throttle = f;
    let steer = s;
    if (this.autoDrive) {
      throttle = 1;
      steer = this.routeSteer();
    }
    // Acceleration is per-kind: the muscle car leaps, the loaded van lumbers.
    const accel = car.accel ?? CAR_TUNE.accel;
    if (throttle > 0) car.speed += accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0.5 ? CAR_TUNE.brake : accel * 0.7) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.down('Space')) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    }
    car.speed = Math.max(-CAR_TUNE.reverseMax, Math.min(car.maxSpeed, car.speed));
    const steerAuthority = Math.max(-1, Math.min(1, car.speed / 9));
    car.heading += steer * CAR_TUNE.steerRate * dt * steerAuthority;

    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    const [cx, cz] = collideSolids(this.G.city.solids, nx, nz, CAR_TUNE.radius);
    if (cx !== nx || cz !== nz) car.speed *= 0.55; // scraping a building scrubs speed
    car.pos.x = cx;
    car.pos.z = cz;
    if (car.pos.x > WORLD.beachX && Math.abs(car.pos.z) > 6) car.pos.x = WORLD.beachX;
    if (car.pos.x > WORLD.pierEndX + 4) car.pos.x = WORLD.pierEndX + 4;
    // Traffic gets shoved, gently, and both cars pay for it in speed.
    for (const other of this.G.vehicles.cars) {
      if (other === car || other.parked) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 3.4) {
        const push = (3.4 - d) / 2;
        car.pos.x += (dx / d) * push;
        car.pos.z += (dz / d) * push;
        other.pos.x -= (dx / d) * push;
        other.pos.z -= (dz / d) * push;
        car.speed *= 0.7;
        other.speed *= 0.7;
      }
    }
    car.syncMesh();
    this.pos.set(car.pos.x, 0, car.pos.z);
    this.heading = car.heading;
    this.speed = car.speed;
  }

  // Auto-drive steering for screenshot staging: chase the waypoint loop.
  routeSteer() {
    const car = this.car;
    const waypoints = this.G.autoWaypoints;
    let wp = waypoints[this.autoWp];
    if (Math.hypot(wp[0] - car.pos.x, wp[1] - car.pos.z) < 15) {
      this.autoWp = (this.autoWp + 1) % waypoints.length;
      wp = waypoints[this.autoWp];
    }
    let diff = Math.atan2(wp[0] - car.pos.x, wp[1] - car.pos.z) - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.max(-1, Math.min(1, diff * 1.5));
  }

  updateCamera(dt) {
    const G = this.G;
    if (G.mode === 'menu') {
      // A slow aerial orbit sells the city behind the start screen.
      const t = G.time * 0.05;
      const orbit = new THREE.Vector3(Math.sin(t) * 190, 85, Math.cos(t) * 190);
      this.cameraPos.lerp(orbit, Math.min(1, dt * 1.5));
      G.camera.position.copy(this.cameraPos);
      G.camera.lookAt(40, 0, 0);
      return;
    }
    const target = this.effectivePos();
    const dist = (this.onFoot ? 7.5 : 11) * this.camDistMul;
    const height = 2.6 + this.camPitch * 4.5;
    const behind = this.onFoot ? this.camYaw : this.car ? this.car.heading + Math.PI : this.camYaw;
    const desired = new THREE.Vector3(
      target.x + Math.sin(behind) * dist,
      height,
      target.z + Math.cos(behind) * dist,
    );
    // Teleports (respawn, staging) snap; ordinary motion eases.
    if (this.cameraPos.distanceTo(desired) > 25) this.cameraPos.copy(desired);
    else this.cameraPos.lerp(desired, Math.min(1, dt * 6));
    G.camera.position.copy(this.cameraPos);
    G.camera.lookAt(target.x, 1.6, target.z);
  }

  watchDistrict() {
    const p = this.effectivePos();
    const district = districtAt(p.x, p.z);
    const id = district?.id ?? null;
    if (id === this.districtId) return;
    this.districtId = id;
    if (district && this.G.mode === 'playing' && !this.dead) {
      this.G.hud.showDistrict(district);
      this.G.audio.districtChime();
    }
  }

  horn() {
    if (this.onFoot || !this.car || this.dead) return;
    if (this.G.time - this.lastHornAt < 0.35) return;
    this.lastHornAt = this.G.time;
    this.G.audio.horn();
    // Whoever is standing in front of the car takes the hint.
    const fx = Math.sin(this.car.heading);
    const fz = Math.cos(this.car.heading);
    for (const ped of this.G.pedestrians.list) {
      if (ped.state === 'down' || ped.state === 'stand') continue;
      const dx = ped.pos.x - this.car.pos.x;
      const dz = ped.pos.z - this.car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && d > 0 && (dx * fx + dz * fz) / d > 0.4) {
        ped.state = 'flee';
        ped.fleeTimer = 1.2;
        ped.heading = Math.atan2(dx, dz);
      }
    }
  }

  toggleCar() {
    if (this.G.mode !== 'playing' || this.dead) return;
    if (!this.onFoot) {
      this.exitCar();
      return;
    }
    let nearest = null;
    let nearestDist = 5;
    for (const car of this.G.vehicles.cars) {
      if (Math.abs(car.speed) > 3) continue;
      const d = Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z);
      if (d < nearestDist) {
        nearest = car;
        nearestDist = d;
      }
    }
    if (nearest) this.enterCar(nearest);
  }

  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    car.parked = false;
    car.ai = null;
    car.speed = 0;
    this.mesh.visible = false;
    this.G.audio.pickup();
    // Taking a parked car in sight of the law is theft, and it is reported.
    const witnessed = this.G.police.nearestPoliceDist(this.pos) < 45;
    if (car.wasParked && witnessed) {
      this.G.police.addCrime('steal', this.pos);
      this.G.hud.toast('Polisi melihatmu mencuri mobil!');
    }
    car.wasParked = false;
    this.G.missions.onEnterCar(car);
    this.G.activities?.onEnterCar(car);
  }

  exitCar() {
    const car = this.car;
    if (!car) return;
    // Step out on the car's left side, pushed out of any wall first.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    const [cx, cz] = collideSolids(
      this.G.city.solids,
      car.pos.x + sideX * 2.2,
      car.pos.z + sideZ * 2.2,
      PLAYER_TUNE.radius,
    );
    this.pos.set(cx, 0, cz);
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.camYaw = car.heading + Math.PI;
    this.G.activities?.onExitCar();
  }

  punch() {
    if (this.G.mode !== 'playing' || this.dead || !this.onFoot) return;
    if (this.G.time - this.lastPunchAt < 0.4) return;
    this.lastPunchAt = this.G.time;
    this.G.audio.punch();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const inArc = (pos) => {
      const dx = pos.x - this.pos.x;
      const dz = pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      return d < PLAYER_TUNE.punchRange && d > 0 && (dx * fx + dz * fz) / d > 0.2;
    };
    for (const enemy of this.G.enemies) {
      if (!enemy.dead && inArc(enemy.pos)) enemy.damage(PLAYER_TUNE.punchDamage, this);
    }
    for (const ped of this.G.pedestrians.list) {
      if (ped.state !== 'down' && inArc(ped.pos)) {
        ped.knockDown();
        this.G.police.addCrime('hitPed', ped.pos);
      }
    }
  }

  shoot() {
    if (this.G.mode !== 'playing' || this.dead || !this.onFoot) return;
    this.lastShotAt = this.G.time;
    this.G.audio.shot();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.G.camera);
    const { origin, direction: dir } = raycaster.ray;
    // A third-person camera looks down at its target, so the hit test asks
    // how closely the ray passes the target's body segment (y 0.3..1.9)
    // rather than a single point.
    let hitAlong = PLAYER_TUNE.gunRange;
    let hitEnemy = null;
    let hitPed = null;
    const probe = (pos, onHit) => {
      const horizLen2 = dir.x * dir.x + dir.z * dir.z;
      if (horizLen2 < 1e-6) return;
      const t = ((pos.x - origin.x) * dir.x + (pos.z - origin.z) * dir.z) / horizLen2;
      if (t < 0.5 || t > PLAYER_TUNE.gunRange) return;
      const closestX = origin.x + dir.x * t;
      const closestZ = origin.z + dir.z * t;
      const horiz = Math.hypot(pos.x - closestX, pos.z - closestZ);
      if (horiz > PLAYER_TUNE.gunAimSlop) return;
      const rayY = origin.y + dir.y * t;
      const vert = rayY < 0.3 ? 0.3 - rayY : rayY > 1.9 ? rayY - 1.9 : 0;
      if (Math.hypot(horiz, vert) < PLAYER_TUNE.gunAimSlop && t < hitAlong) {
        hitAlong = t;
        onHit();
      }
    };
    for (const enemy of this.G.enemies) {
      if (!enemy.dead) probe(enemy.pos, () => { hitEnemy = enemy; hitPed = null; });
    }
    for (const ped of this.G.pedestrians.list) {
      if (ped.state !== 'down') probe(ped.pos, () => { hitPed = ped; hitEnemy = null; });
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(hitEnemy || hitPed ? hitAlong : 40));
    this.showTracer(this.pos.clone().setY(1.4), end);
    if (hitEnemy) {
      hitEnemy.damage(PLAYER_TUNE.gunDamage, this);
    } else if (hitPed) {
      hitPed.knockDown();
      this.G.police.addCrime('hitPed', hitPed.pos);
      this.G.hud.toast('Kamu menembak pejalan kaki!');
    }
  }

  showTracer(from, to) {
    if (this.tracer) this.G.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
    this.G.scene.add(this.tracer);
    this.tracerTimer = 0.07;
  }

  takeDamage(amount) {
    if (this.dead || this.G.mode !== 'playing') return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  die() {
    this.dead = true;
    this.deadTimer = 2.5;
    this.G.audio.wasted();
    this.G.audio.setEngine(0, false);
    this.G.hud.showWasted(true);
  }

  respawn() {
    const hospital = this.G.city.places.hospital;
    this.pos.set(hospital.x, 0, hospital.z);
    this.health = PLAYER_TUNE.maxHealth;
    this.dead = false;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.G.police.resetOnDeath();
    this.G.hud.showWasted(false);
    this.G.hud.toast('Kamu bangun di rumah sakit. Jangan ulangi.');
    this.G.saveGame();
  }

  lerpAngle(a, b, t) {
    return turnToward(a, b, t);
  }
}
