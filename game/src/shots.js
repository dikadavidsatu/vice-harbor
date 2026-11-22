// shots.js — staged scenes for the entry's screenshot renders.
//
// ?shot=<name>&seed=<n> puts the game into a composed tableau instead of
// the menu: the player's coupe auto-drives a fixed route while traffic,
// police or the first mission are arranged around it. Once staging is done
// the scene just needs to settle; main.js watches G.shotReadyAt and flips
// window.__shotReady when game time passes it. The 8-second waits exist so
// the mission intro dialogue (6.5 s) has left the frame.

const BAY_LOOP = [[0, 180], [180, 180], [180, -180], [-180, -180], [-180, 180], [0, 180]];

function stageDriver(G, car, x, z, heading, waypoints) {
  G.autoWaypoints = waypoints;
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = 0;
  car.syncMesh();
  G.player.enterCar(car);
  G.player.autoDrive = true;
}

export function applyShot(G, name) {
  if (name === 'start') {
    // Nothing to stage: the menu's orbiting camera over the city is the shot.
    G.shotReadyAt = 1.0;
    return;
  }
  G.startGame(false);
  const viper = G.vehicles.cars.find((c) => c.name === 'Viper');
  if (!viper) {
    G.shotReadyAt = 0.5;
    return;
  }

  if (name === 'drive') {
    // Straight up the x=0 road, three traffic cars parked in the lane ahead
    // so the frame reads as live traffic rather than an empty street.
    stageDriver(G, viper, 0, -180, 0, BAY_LOOP);
    const ahead = [[2, -40], [-2, 30], [2, 90]];
    G.vehicles.cars.filter((c) => c.ai).slice(0, 3).forEach((car, i) => {
      car.pos.set(ahead[i][0], 0, ahead[i][1]);
      car.heading = 0;
      car.speed = 0;
      car.ai.node = { x: 0, z: ahead[i][1] };
      car.ai.target = { x: 0, z: ahead[i][1] + 60 };
      car.syncMesh();
    });
    G.shotReadyAt = 8.0;
    return;
  }

  if (name === 'chase') {
    // Three stars held artificially, two cruisers pinned in formation at
    // the Viper's flanks — the classic pursuit photograph.
    stageDriver(G, viper, 0, -180, 0, BAY_LOOP);
    G.police.setHeat(95);
    G.police.update(0.05);
    G.police.update(0.05);
    G.police.update(0.05);
    const [left, right] = G.police.cars;
    if (left) left.formation = { right: -5, back: 2 };
    if (right) right.formation = { right: 5, back: 4 };
    G.shotReadyAt = 8.0;
    return;
  }

  if (name === 'mission') {
    // Mission one is live. Start at the Pasar Senja gate and run east along
    // the market road toward the beach — stalls and string lights in frame —
    // then continue down the pier.
    stageDriver(G, viper, 120, 180, Math.PI / 2, [[240, 180], [300, 180], [300, 60], [330, 0], [360, 0]]);
    G.shotReadyAt = 8.0;
    return;
  }

  G.shotReadyAt = 0.5;
}
