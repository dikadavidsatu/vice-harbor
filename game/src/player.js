// The player: walks and drives, punches and shoots, and carries the camera.
// Also owns health, cash, death/respawn, and entering or stealing cars.
import * as THREE from 'three';
import { CAR_TUNE, PLAYER_TUNE, WORLD, districtAt } from './config.js';
import { collideSolids } from './city.js';

function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x19c2e0 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22222c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x111118 }));
  cap.position.y = 1.98;
  g.add(cap);
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), pants);
    leg.position.set(lx, 0.31, 0);
    leg.name = lx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(4, 0, 30);
    this.heading = Math.PI;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDistMul = 1; // mouse-wheel camera distance, 0.7..1.6
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
    this.districtId = null; // district the player is currently standing in
    this.walkBob = 0;
    this.mesh = buildPlayerMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    this.cameraPos = new THREE.Vector3(4, 4, 38);
    this.tracer = null;
    this.tracerTimer = 0;
  }

  effectivePos() {
    return this.car ? this.car.pos : this.pos;
  }

  dangerNear(pos, radius) {
    const d = Math.hypot(pos.x - this.effectivePos().x, pos.z - this.effectivePos().z);
    if (d > radius) return null;
    if (!this.onFoot && this.car && Math.abs(this.car.speed) > 5) return this.car.pos;
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
    this.handleMouse();
    this.consumePressedKeys();
    if (this.onFoot) this.updateOnFoot(dt);
    else this.updateDriving(dt);
    this.updateDistrict();
    this.updateCamera(dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0 && this.tracer) {
        G.scene.remove(this.tracer);
        this.tracer = null;
      }
    }
    // engine sound follows the car
    G.audio.setEngine(this.car ? Math.abs(this.car.speed) / CAR_TUNE.maxSpeed : 0, !!this.car);
    // surf fades in as the player nears the beach and the pier
    const shore = Math.max(0, Math.min(1, (this.effectivePos().x - 170) / 130));
    G.audio.setAmbience(shore);
  }

  handleMouse() {
    const { dx, dy } = this.G.input.consumeMouse();
    this.camYaw -= dx * 0.0028;
    this.camPitch = Math.max(0.08, Math.min(1.0, this.camPitch + dy * 0.0022));
    const wheel = this.G.input.consumeWheel();
    if (wheel) {
      this.camDistMul = Math.max(0.7, Math.min(1.6, this.camDistMul + wheel * 0.12));
    }
  }

  updateDistrict() {
    // Crossing into a new quarter earns a banner and a soft chime; leaving
    // the districts for the old grid just clears the current one silently.
    const p = this.effectivePos();
    const d = districtAt(p.x, p.z);
    const id = d ? d.id : null;
    if (id === this.districtId) return;
    this.districtId = id;
    if (d && this.G.mode === 'playing' && !this.dead) {
      this.G.hud.showDistrict(d);
      this.G.audio.districtChime();
    }
  }

  horn() {
    if (this.onFoot || !this.car || this.dead) return;
    if (this.G.time - this.lastHornAt < 0.35) return;
    this.lastHornAt = this.G.time;
    this.G.audio.horn();
    // a horn blast startles whoever is standing in front of the car
    const fx = Math.sin(this.car.heading);
    const fz = Math.cos(this.car.heading);
    for (const ped of this.G.pedestrians.list) {
      if (ped.state === 'down' || ped.state === 'stand') continue;
      const dx = ped.pos.x - this.car.pos.x;
      const dz = ped.pos.z - this.car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.4) {
        ped.state = 'flee';
        ped.fleeTimer = 1.2;
        ped.heading = Math.atan2(dx, dz);
      }
    }
  }

  consumePressedKeys() {
    const input = this.G.input;
    if (input.consumePressed('KeyE')) this.toggleCar();
    if (input.consumePressed('KeyF')) this.punch();
    if (input.consumePressed('KeyH')) this.horn();
    if (input.consumePressed('KeyM')) this.G.missions.tryStartNext();
    if (input.consumePressed('KeyP')) this.G.togglePause();
    for (const click of input.consumeClicks()) {
      if (!this.onFoot) continue;
      // Aim is always the screen-centre crosshair: with pointer lock the
      // click carries no useful position, and a third-person shot goes
      // where the camera looks.
      this.shoot();
    }
  }

  updateOnFoot(dt) {
    const input = this.G.input;
    const { f, s } = input.axis();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = (f !== 0 || s !== 0) ? (run ? PLAYER_TUNE.runSpeed : PLAYER_TUNE.walkSpeed) : 0;
    // move relative to where the camera looks
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
      const wantHeading = Math.atan2(mx, mz);
      this.heading = this.lerpAngle(this.heading, wantHeading, Math.min(1, dt * 12));
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 8);
    const nx = this.pos.x + mx * this.speed * dt;
    const nz = this.pos.z + mz * this.speed * dt;
    const [cx, cz] = collideSolids(this.G.city.solids, nx, nz, PLAYER_TUNE.radius);
    // the city ends at the bound, but the pier runs east over the bay:
    // allow walking out to its end, and never into the water beside it
    let bx = Math.max(-WORLD.bound, Math.min(WORLD.pierEndX + 6, cx));
    if (bx > WORLD.beachX && Math.abs(cz) > 6) bx = WORLD.beachX;
    this.pos.x = bx;
    this.pos.z = Math.max(-WORLD.bound, Math.min(WORLD.bound, cz));
    this.walkBob += dt * this.speed * 1.8;
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.walkBob)) * 0.05, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkBob) * 0.45 * Math.min(1, this.speed / 5);
    const legL = this.mesh.getObjectByName('legL');
    const legR = this.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
  }

  updateDriving(dt) {
    const car = this.car;
    if (!car) {
      this.onFoot = true;
      return;
    }
    const input = this.G.input;
    const { f, s } = input.axis();
    const handbrake = input.down('Space');
    let throttle = f;
    let steer = s;
    if (this.autoDrive) {
      throttle = 1;
      steer = this.autoSteer();
    }
    // each vehicle kind accelerates at its own rate: a muscle car leaps, a
    // loaded van lumbers, and the taxi sits sensibly in between
    const accel = car.accel ?? CAR_TUNE.accel;
    if (throttle > 0) car.speed += accel * dt;
    else if (throttle < 0) {
      car.speed -= (car.speed > 0.5 ? CAR_TUNE.brake : accel * 0.7) * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = Math.max(-CAR_TUNE.reverseMax, Math.min(car.maxSpeed, car.speed));
    const steerFactor = Math.max(-1, Math.min(1, car.speed / 9));
    car.heading += steer * CAR_TUNE.steerRate * dt * steerFactor;
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    const [cx, cz] = collideSolids(this.G.city.solids, nx, nz, CAR_TUNE.radius);
    if (cx !== nx || cz !== nz) car.speed *= 0.55;
    car.pos.x = cx;
    car.pos.z = cz;
    // keep cars out of the bay; the pier deck itself is drivable
    if (car.pos.x > WORLD.beachX && Math.abs(car.pos.z) > 6) car.pos.x = WORLD.beachX;
    if (car.pos.x > WORLD.pierEndX + 4) car.pos.x = WORLD.pierEndX + 4;
    // soft car-car push
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

  autoSteer() {
    // follow the shot/route waypoint loop, staying on the roads
    const car = this.car;
    const wps = this.G.autoWaypoints;
    let wp = wps[this.autoWp];
    const d = Math.hypot(wp[0] - car.pos.x, wp[1] - car.pos.z);
    if (d < 15) {
      this.autoWp = (this.autoWp + 1) % wps.length;
      wp = wps[this.autoWp];
    }
    const want = Math.atan2(wp[0] - car.pos.x, wp[1] - car.pos.z);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.max(-1, Math.min(1, diff * 1.5));
  }

  updateCamera(dt) {
    const G = this.G;
    const target = this.onFoot ? this.pos : this.car ? this.car.pos : this.pos;
    if (G.mode === 'menu') {
      // slow orbit over the city for the start screen
      const t = G.time * 0.05;
      const cx = Math.sin(t) * 190;
      const cz = Math.cos(t) * 190;
      this.cameraPos.lerp(new THREE.Vector3(cx, 85, cz), Math.min(1, dt * 1.5));
      G.camera.position.copy(this.cameraPos);
      G.camera.lookAt(40, 0, 0);
      return;
    }
    const dist = (this.onFoot ? 7.5 : 11) * this.camDistMul;
    const height = 2.6 + this.camPitch * 4.5;
    const back = this.onFoot ? this.camYaw : this.car ? this.car.heading + Math.PI : this.camYaw;
    const cx = target.x + Math.sin(back) * dist;
    const cz = target.z + Math.cos(back) * dist;
    const desired = new THREE.Vector3(cx, height, cz);
    // snap on a big jump (teleport, respawn, shot staging) so the view
    // never lags a frame behind where the player actually is
    if (this.cameraPos.distanceTo(desired) > 25) this.cameraPos.copy(desired);
    else this.cameraPos.lerp(desired, Math.min(1, dt * 6));
    G.camera.position.copy(this.cameraPos);
    G.camera.lookAt(target.x, 1.6, target.z);
  }

  toggleCar() {
    if (this.G.mode !== 'playing' || this.dead) return;
    if (!this.onFoot) {
      this.exitCar();
      return;
    }
    let best = null;
    let bestD = 5;
    for (const car of this.G.vehicles.cars) {
      if (!this.onFoot) break;
      if (Math.abs(car.speed) > 3) continue;
      const d = Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (best) this.enterCar(best);
  }

  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    car.parked = false;
    car.ai = null;
    car.speed = 0;
    this.mesh.visible = false;
    this.G.audio.pickup();
    const policeNear = this.G.police.nearestPoliceDist(this.pos) < 45;
    if (car.wasParked && policeNear) {
      this.G.police.addCrime('steal', this.pos);
      this.G.hud.toast('Polisi melihatmu mencuri mobil!');
    }
    car.wasParked = false;
    this.G.missions.onEnterCar(car);
    if (this.G.activities) this.G.activities.onEnterCar(car);
  }

  exitCar() {
    const car = this.car;
    if (!car) return;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.pos.set(car.pos.x + sideX * 2.2, 0, car.pos.z + sideZ * 2.2);
    const [cx, cz] = collideSolids(this.G.city.solids, this.pos.x, this.pos.z, PLAYER_TUNE.radius);
    this.pos.x = cx;
    this.pos.z = cz;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.camYaw = car.heading + Math.PI;
    if (this.G.activities) this.G.activities.onExitCar();
  }

  punch() {
    if (this.G.mode !== 'playing' || this.dead || !this.onFoot) return;
    if (this.G.time - this.lastPunchAt < 0.4) return;
    this.lastPunchAt = this.G.time;
    this.G.audio.punch();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (const e of this.G.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER_TUNE.punchRange && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.2) {
        e.damage(PLAYER_TUNE.punchDamage, this);
      }
    }
    for (const ped of this.G.pedestrians.list) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - this.pos.x;
      const dz = ped.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER_TUNE.punchRange && (dx * fx + dz * fz) / Math.max(0.01, d) > 0.2) {
        ped.knockDown();
        this.G.police.addCrime('hitPed', ped.pos);
      }
    }
  }

  shoot() {
    if (this.G.mode !== 'playing' || this.dead || !this.onFoot) return;
    this.lastShotAt = this.G.time;
    this.G.audio.shot();
    const camera = this.G.camera;
    const ndc = new THREE.Vector2(0, 0); // screen-centre crosshair
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const origin = ray.ray.origin;
    const dir = ray.ray.direction;
    let best = null;
    let bestAlong = PLAYER_TUNE.gunRange;
    const testTarget = (pos) => {
      // closest approach of the camera ray to the target's vertical body
      // segment (y 0.3..1.9): a third-person camera looks down, so a plain
      // point test would dive under the target at range.
      const dx = pos.x - origin.x;
      const dz = pos.z - origin.z;
      const horizLen2 = dir.x * dir.x + dir.z * dir.z;
      if (horizLen2 < 1e-6) return;
      const t = (dx * dir.x + dz * dir.z) / horizLen2;
      if (t < 0.5 || t > PLAYER_TUNE.gunRange) return;
      const rx = origin.x + dir.x * t;
      const rz = origin.z + dir.z * t;
      const horiz = Math.hypot(pos.x - rx, pos.z - rz);
      if (horiz > PLAYER_TUNE.gunAimSlop) return;
      const ry = origin.y + dir.y * t;
      const dy = ry < 0.3 ? 0.3 - ry : ry > 1.9 ? ry - 1.9 : 0;
      const dist = Math.hypot(horiz, dy);
      if (dist < PLAYER_TUNE.gunAimSlop && t < bestAlong) {
        bestAlong = t;
        best = pos;
      }
    };
    let bestEnemy = null;
    for (const e of this.G.enemies) {
      if (e.dead) continue;
      const before = best;
      testTarget(e.pos);
      if (best !== before) bestEnemy = e;
    }
    let bestPed = null;
    for (const ped of this.G.pedestrians.list) {
      if (ped.state === 'down') continue;
      const before = best;
      testTarget(ped.pos);
      if (best !== before) bestPed = ped;
    }
    // tracer from the player toward the hit (or full range)
    const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestAlong : 40));
    this.showTracer(this.pos.clone().setY(1.4), end);
    if (bestEnemy) {
      bestEnemy.damage(PLAYER_TUNE.gunDamage, this);
    } else if (bestPed) {
      bestPed.knockDown();
      this.G.police.addCrime('hitPed', bestPed.pos);
      this.G.hud.toast('Kamu menembak pejalan kaki!');
    }
  }

  showTracer(from, to) {
    const G = this.G;
    if (this.tracer) G.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
    G.scene.add(this.tracer);
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
    const spot = this.G.city.places.hospital;
    this.pos.set(spot.x, 0, spot.z);
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
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
}
