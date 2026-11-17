// Deterministic screenshot scenes for ?shot=start|drive|chase|mission.
// Each one stages the game, then main.js flips window.__shotReady on.
// Shots wait 8 s of game time so the mission intro dialogue has faded.
const CITY_LOOP = [[0, 180], [180, 180], [180, -180], [-180, -180], [-180, 180], [0, 180]];

export function applyShot(G, name) {
  const viper = G.vehicles.cars.find((c) => c.name === 'Viper');
  if (name === 'start') {
    // menu orbit over the city + start screen; nothing else to stage
    G.shotReadyAt = 1.0;
    return;
  }
  G.startGame(false);
  if (!viper) {
    G.shotReadyAt = 0.5;
    return;
  }

  if (name === 'drive') {
    // north up road x=0 with traffic staged ahead of the Viper
    G.autoWaypoints = CITY_LOOP;
    viper.pos.set(0, 0, -180);
    viper.heading = 0;
    viper.speed = 0;
    viper.syncMesh();
    G.player.enterCar(viper);
    G.player.autoDrive = true;
    const traffic = G.vehicles.cars.filter((c) => c.ai).slice(0, 3);
    const spots = [[2, -40], [-2, 30], [2, 90]];
    traffic.forEach((car, i) => {
      car.pos.set(spots[i][0], 0, spots[i][1]);
      car.heading = 0;
      car.speed = 0;
      car.ai.node = { x: 0, z: spots[i][1] };
      car.ai.target = { x: 0, z: spots[i][1] + 60 };
      car.syncMesh();
    });
    G.shotReadyAt = 8.0;
    return;
  }

  if (name === 'chase') {
    // three stars, two cruisers riding in formation beside the Viper
    G.autoWaypoints = CITY_LOOP;
    viper.pos.set(0, 0, -180);
    viper.heading = 0;
    viper.speed = 0;
    viper.syncMesh();
    G.player.enterCar(viper);
    G.player.autoDrive = true;
    G.police.setHeat(95); // three stars, holding through the 8 s staging
    G.police.update(0.05);
    G.police.update(0.05);
    G.police.update(0.05);
    const escorts = G.police.cars.slice(0, 2);
    escorts[0].formation = { right: -5, back: 2 };
    if (escorts[1]) escorts[1].formation = { right: 5, back: 4 };
    G.shotReadyAt = 8.0;
    return;
  }

  if (name === 'mission') {
    // mission 1 is already active; drive east toward the pier beacon
    G.autoWaypoints = [[240, 0], [300, 0], [360, 0], [360, 0]];
    viper.pos.set(120, 0, 0);
    viper.heading = Math.PI / 2;
    viper.speed = 0;
    viper.syncMesh();
    G.player.enterCar(viper);
    G.player.autoDrive = true;
    G.shotReadyAt = 8.0;
    return;
  }

  G.shotReadyAt = 0.5;
}
