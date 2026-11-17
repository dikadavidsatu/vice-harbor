// Neon Bay — every tuning number, the palette, the story and the mission data.
// One file, one job: nothing here touches the scene or the DOM.
export const SAVE_KEY = 'neonbay-save-v1';

export const WORLD = {
  roadSpacing: 60,
  roadHalf: 5, // asphalt half-width
  walkHalf: 8, // road + sidewalk half-width
  gridMin: -240,
  gridMax: 240,
  bound: 270, // city edge; beach starts here, bay beyond x = 300
  beachX: 300,
  pierEndX: 358,
};

export const ROADS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

export const PALETTE = {
  sky: 0xff9a5c,
  skyTop: 0x2c3e6e,
  fog: 0xe88a5a,
  sun: 0xffd9a0,
  asphalt: 0x2e2e38,
  sidewalk: 0x8a8a92,
  sand: 0xd9b380,
  water: 0x1d5f7a,
  grass: 0x4a7d4f,
  buildingA: 0x8a6f5c,
  buildingB: 0x5c6f8a,
  buildingC: 0x6f5c7d,
  buildingD: 0x9a8a6f,
  windowLit: 0xffd27a,
  windowDark: 0x2a3348,
};

export const PLAYER_TUNE = {
  walkSpeed: 5.2,
  runSpeed: 9.5,
  accel: 26,
  radius: 0.7,
  maxHealth: 100,
  punchDamage: 25,
  punchRange: 2.6,
  gunDamage: 34,
  gunRange: 48,
  gunAimSlop: 2.2,
};

export const CAR_TUNE = {
  accel: 13,
  brake: 26,
  reverseMax: 9,
  maxSpeed: 30,
  policeMaxSpeed: 33,
  trafficSpeed: 11,
  steerRate: 1.9,
  radius: 1.6,
};

export const WANTED = {
  // heat thresholds per star
  stars: [0, 25, 50, 75, 100, 125],
  heatPerCrime: { shoot: 20, hitPed: 25, steal: 25, killPed: 30, ram: 8 },
  decayPerSec: 1.0,
  decayFarPerSec: 2.2,
  maxPoliceCars: 4,
  maxOfficers: 2,
  arrestHoldSec: 2.0,
};

export const STORY = {
  title: 'NEON BAY',
  tagline: 'A sun-soaked bay city. One driver. Five jobs. No way back.',
  fixer: 'Mara Voss',
  fixerRole: 'fixer of the bay',
  intro:
    'You rolled into Neon Bay with a borrowed jacket and a fast car. Mara Voss runs the jobs here. Do her five jobs, and the bay is yours.',
  ending:
    'Five jobs. Five stars. One legend. The bay whispers your name now — the driver nobody catches.',
};

export const MISSIONS = [
  {
    id: 0,
    title: 'Paket Dermaga',
    reward: 800,
    intro:
      'Mara Voss: "Paket panas di ujung dermaga. Ambil, antar ke titik drop selatan. Jangan bikin ribut."',
    outro: 'Mara Voss: "Bersih. Kamu bisa diandalkan. Ada kerjaan lagi kalau mau."',
    steps: [
      { kind: 'goto', place: 'pierEnd', radius: 5, text: 'Ambil paket di ujung dermaga' },
      { kind: 'goto', place: 'dropSouth', radius: 6, text: 'Antar paket ke titik drop selatan' },
    ],
  },
  {
    id: 1,
    title: 'Mobil Pesanan',
    reward: 1200,
    intro:
      'Mara Voss: "Klien mau sedan merah itu. Curi, antar ke bengkel Riko. Jangan sampai penyok."',
    outro: 'Riko: "Mulus. Klien senang. Mara bilang kamu naik kelas."',
    steps: [
      { kind: 'stealCar', marker: 'sedan', text: 'Curi sedan merah' },
      { kind: 'deliverCar', place: 'garage', radius: 7, text: 'Antar sedan ke bengkel' },
    ],
  },
  {
    id: 2,
    title: 'Ekor Panjang',
    reward: 1500,
    intro:
      'Mara Voss: "Ikuti coupe ungu itu. Jangan terlalu dekat — kalau dia sadar, barangnya hilang."',
    outro: 'Mara Voss: "Barangnya di tangan. Kamu punya mata elang, anak baru."',
    steps: [
      { kind: 'tail', marker: 'target', text: 'Buntuti coupe ungu — jaga jarak 10–50 m' },
      { kind: 'goto', place: 'targetStop', radius: 5, text: 'Ambil barang dari mobil target' },
    ],
  },
  {
    id: 3,
    title: 'Pertahankan Gudang',
    reward: 2000,
    intro:
      'Mara Voss: "Geng Pelabuhan mau merebut gudang kita. Tahan tiga gelombang. Jangan biarkan mereka masuk."',
    outro: 'Mara Voss: "Gudang aman. Pelabuhan sekarang tahu siapa yang pegang teluk ini."',
    steps: [
      { kind: 'defend', place: 'warehouse', radius: 18, waves: [2, 3, 4], text: 'Pertahankan gudang — gelombang ' },
    ],
  },
  {
    id: 4,
    title: 'Pelarian Teluk',
    reward: 3000,
    intro:
      'Mara Voss: "Seluruh kota memburumu sekarang. Lima bintang. Sampai ke safehouse — hidup-hidup."',
    outro: 'Mara Voss: "Kamu lolos dari lima bintang. Mulai hari ini, kamu legenda Neon Bay."',
    steps: [
      { kind: 'goto', place: 'safehouse', radius: 7, text: 'Kabur ke safehouse — hindari polisi!' },
    ],
  },
];

export const DIALOG_MS = 6500;

export const CONTROLS = [
  ['W A S D', 'Bergerak / mengemudi'],
  ['Mouse', 'Putar kamera (klik untuk kunci pointer)'],
  ['Shift', 'Lari'],
  ['E', 'Masuk / keluar mobil, curi mobil'],
  ['Space', 'Rem tangan'],
  ['Klik kiri', 'Tembak'],
  ['F', 'Pukul'],
  ['M', 'Mulai misi berikutnya'],
  ['P', 'Jeda'],
];
