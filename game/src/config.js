// config.js — the single source of truth for Neon Bay's numbers and data:
// layout constants, palette, tuning, the three districts, story framing
// and all ten mission definitions. Nothing here builds geometry or touches
// the DOM; every other module reads the same facts from this file.

export const SAVE_KEY = 'neonbay-save-v1';

// The street plan is a square grid. Roads sit every 60 units from -240 to
// 240; east of x=270 the city gives up and the beach (x=300) and the bay
// take over, with the pier reaching out to pierEndX.
export const WORLD = {
  roadSpacing: 60,
  roadHalf: 5,
  walkHalf: 8,
  gridMin: -240,
  gridMax: 240,
  bound: 270,
  beachX: 300,
  pierEndX: 358,
};

export const ROADS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

// Golden-hour palette: warm sky and sand against teal water, with neon
// pink/cyan reserved for gates, shells and other things that must be seen.
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
  glassWall: 0x3d7ea6,
  glassLit: 0xbfeaff,
  containerRed: 0xb03a30,
  containerBlue: 0x2a5f9e,
  containerGreen: 0x3f7d46,
  containerSand: 0xc2a15a,
  awningA: 0xff5a3c,
  awningB: 0xffd23b,
  awningC: 0x2ec4b6,
  awningD: 0xff7ab8,
  palmTrunk: 0x7a5c38,
  palmLeaf: 0x3f8f4f,
  neonPink: 0xff4fd8,
  neonCyan: 0x33e0ff,
};

// The three quarters that break up the old grid. A district is just a
// rectangle plus presentation: the city builder themes the blocks inside
// it, the player module announces crossings, the minimap tints it.
export const DISTRICTS = [
  {
    id: 'pasar-senja',
    name: 'Pasar Senja',
    tagline: 'pasar malam di tenggara teluk',
    motto: 'Buka sampai subuh, harga sampai deal.',
    minX: 104,
    maxX: 262,
    minZ: 104,
    maxZ: 262,
    accent: 0xff7a3c,
    banner: '#ff9a5c',
  },
  {
    id: 'bukit-kaca',
    name: 'Bukit Kaca',
    tagline: 'menara kaca dan uang lama di barat laut',
    motto: 'Semua rapat di sini dimulai dengan angka.',
    minX: -262,
    maxX: -104,
    minZ: -262,
    maxZ: -104,
    accent: 0x53d8ff,
    banner: '#8fe3ff',
  },
  {
    id: 'pelabuhan-tua',
    name: 'Pelabuhan Tua',
    tagline: 'dermaga kontainer di timur kota',
    motto: 'Tidak ada manifest, tidak ada pertanyaan.',
    minX: 168,
    maxX: 282,
    minZ: -84,
    maxZ: 84,
    accent: 0xffd23b,
    banner: '#ffe9a0',
  },
];

// First district whose rectangle holds the point wins; the old grid
// (and anywhere else) answers null.
export function districtAt(x, z) {
  const hit = DISTRICTS.find((d) => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ);
  return hit ?? null;
}

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

// Wanted model: crimes add heat, the stars table turns heat into a star
// count, and heat bleeds away over time — faster when no unit is close.
export const WANTED = {
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
  tagline: 'A sun-soaked bay city. One driver. Ten jobs. No way back.',
  fixer: 'Mara Voss',
  fixerRole: 'fixer of the bay',
  intro:
    'Kamu tiba di Neon Bay berbekal jaket pinjaman dan mobil yang cepat. Mara Voss mengatur semua pekerjaan di sini. Selesaikan sepuluh job-nya — dermaga, pasar, bukit kaca, pelabuhan tua — dan teluk ini jadi milikmu.',
  ending:
    'Sepuluh job. Lima bintang. Satu legenda. Sekarang seluruh teluk membisikkan namamu — sopir yang tak pernah tertangkap.',
};

// The ten jobs, played strictly in order. A step is one objective:
//   goto       reach the place (any way you like)
//   stealCar   get into the car carrying the step's marker
//   deliverCar bring the stolen car to the place
//   tail       stay near the target car, unseen, until the clock fills
//   defend     survive every wave at the place
//   timedGoto  reach the place before stepTimer runs out
//   driveTo    like goto, but only counts from behind a wheel
//   race       pass each checkpoint in order, in a car
//   collect    visit every place in the list
export const MISSIONS = [
  {
    id: 0,
    title: 'Paket Dermaga',
    reward: 800,
    intro: 'Mara Voss: "Ada paket panas di ujung dermaga. Jemput, lalu taruh di titik drop selatan. Usahakan tidak menarik perhatian."',
    outro: 'Mara Voss: "Rapi. Ternyata kamu bisa dipercaya. Nanti ada job lagi buatmu."',
    steps: [
      { kind: 'goto', place: 'pierEnd', radius: 5, text: 'Ambil paket di ujung dermaga' },
      { kind: 'goto', place: 'dropSouth', radius: 6, text: 'Antar paket ke titik drop selatan' },
    ],
  },
  {
    id: 1,
    title: 'Mobil Pesanan',
    reward: 1200,
    intro: 'Mara Voss: "Klien mengincar sedan merah itu. Ambil mobilnya, kirim ke bengkel Riko. Body jangan sampai lecet."',
    outro: 'Riko: "Utuh begini sih klien pasti senyum. Kata Mara, kelasmu naik."',
    steps: [
      { kind: 'stealCar', marker: 'sedan', text: 'Curi sedan merah' },
      { kind: 'deliverCar', place: 'garage', radius: 7, text: 'Antar sedan ke bengkel' },
    ],
  },
  {
    id: 2,
    title: 'Ekor Panjang',
    reward: 1500,
    intro: 'Mara Voss: "Buntuti coupe ungu itu. Jaga jarak — sekali dia sadar, barangnya melayang."',
    outro: 'Mara Voss: "Barangnya sudah di tangan. Matamu tajam juga, anak baru."',
    steps: [
      { kind: 'tail', marker: 'target', text: 'Buntuti coupe ungu — jaga jarak 10–50 m' },
      { kind: 'goto', place: 'targetStop', radius: 5, text: 'Ambil barang dari mobil target' },
    ],
  },
  {
    id: 3,
    title: 'Pertahankan Gudang',
    reward: 2000,
    intro: 'Mara Voss: "Geng Pelabuhan berniat mengambil gudang kita. Tahan tiga gelombang serangan. Jangan biarkan satu pun masuk."',
    outro: 'Mara Voss: "Gudang tetap berdiri. Orang pelabuhan sekarang paham siapa yang memegang teluk ini."',
    steps: [
      { kind: 'defend', place: 'warehouse', radius: 18, waves: [2, 3, 4], text: 'Pertahankan gudang — gelombang ' },
    ],
  },
  {
    id: 4,
    title: 'Kurir Dua Distrik',
    reward: 1800,
    intro: 'Mara Voss: "Dokumen di kios Pasar Senja harus tiba di lobi Menara Kaca sebelum rapat dibuka. Waktunya sudah berjalan."',
    outro: 'Mara Voss: "Pas sekali. Orang Bukit Kaca itu sulit terkesan — tapi kali ini mereka terkesan."',
    steps: [
      { kind: 'timedGoto', place: 'marketStall', radius: 6, timeLimit: 75, text: 'Ambil dokumen di kios Pasar Senja' },
      { kind: 'timedGoto', place: 'glassLobby', radius: 7, timeLimit: 110, text: 'Antar dokumen ke lobi Menara Kaca — cepat!' },
    ],
  },
  {
    id: 5,
    title: 'Balapan Senja',
    reward: 2200,
    intro: 'Mara Voss: "Kru Pasar Senja bertaruh besar soal pembalap tercepat di teluk ini. Sikat semua gerbangnya, jangan kasih kendor."',
    outro: 'Mara Voss: "Kru pasar sampai kehilangan kata-kata. Taruhannya sekarang kita yang pegang."',
    steps: [
      {
        kind: 'race',
        radius: 8,
        checkpoints: ['raceGate1', 'raceGate2', 'raceGate3', 'raceGate4', 'raceGate5', 'marketGate'],
        text: 'Lewati gerbang balapan ',
      },
    ],
  },
  {
    id: 6,
    title: 'Kotak-Kotak Hilang',
    reward: 2400,
    intro: 'Mara Voss: "Semalam truk Pelabuhan Tua menjatuhkan empat kotak bercahaya. Kumpulkan semuanya sebelum jatuh ke tangan orang lain."',
    outro: 'Mara Voss: "Empat kotak, tidak kurang. Soal isinya — lebih baik kamu tidak bertanya."',
    steps: [
      {
        kind: 'collect',
        radius: 6,
        places: ['crateHarbor', 'crateMarket', 'crateGlass', 'cratePier'],
        text: 'Kumpulkan kotak bercahaya ',
      },
    ],
  },
  {
    id: 7,
    title: 'VIP Bukit Kaca',
    reward: 2600,
    intro: 'Mara Voss: "Seorang VIP menunggumu di Menara Kaca. Jemput pakai mobil, antar ke Pelabuhan Tua sebelum kapalnya lepas jangkar."',
    outro: 'Mara Voss: "VIP sampai, kapal berangkat, dan tak seorang pun tahu kamu sopirnya. Sempurna."',
    steps: [
      { kind: 'driveTo', place: 'glassLobby', radius: 7, text: 'Jemput VIP di lobi Menara Kaca (dengan mobil)' },
      { kind: 'timedGoto', place: 'harborGate', radius: 8, timeLimit: 100, text: 'Antar VIP ke gerbang Pelabuhan Tua' },
    ],
  },
  {
    id: 8,
    title: 'Malam di Pelabuhan',
    reward: 3200,
    intro: 'Mara Voss: "Geng Pelabuhan membalas — di halaman kontainer mereka sendiri. Bertahanlah melewati tiga gelombang di Pelabuhan Tua."',
    outro: 'Mara Voss: "Pelabuhan sunyi malam ini. Seisi teluk tahu siapa pemenangnya."',
    steps: [
      { kind: 'defend', place: 'harborGate', radius: 20, waves: [3, 3, 5], text: 'Pertahankan Pelabuhan Tua — gelombang ' },
    ],
  },
  {
    id: 9,
    title: 'Pelarian Teluk',
    reward: 4000,
    intro: 'Mara Voss: "Sekarang seluruh kota memburumu. Lima bintang. Capai safehouse — dan tetap hidup."',
    outro: 'Mara Voss: "Lolos dari kejaran lima bintang. Mulai malam ini, kamu legenda Neon Bay."',
    steps: [
      { kind: 'goto', place: 'safehouse', radius: 7, text: 'Kabur ke safehouse — hindari polisi!' },
    ],
  },
];

// The finale is defined by position, not by a magic number: it is simply
// the last entry of MISSIONS. Gating and the police heat-pin both key off
// this, so appending an eleventh job tomorrow moves the finale with it.
export const FINAL_MISSION_INDEX = MISSIONS.length - 1;

export const DIALOG_MS = 6500;

// Shown on the start screen and in the README; keep the two in step.
export const CONTROLS = [
  ['W A S D', 'Bergerak / mengemudi'],
  ['Mouse', 'Putar kamera (klik untuk kunci pointer)'],
  ['Shift', 'Lari'],
  ['E', 'Masuk / keluar mobil, curi mobil'],
  ['Space', 'Rem tangan'],
  ['Klik kiri', 'Tembak'],
  ['F', 'Pukul'],
  ['H', 'Klakson'],
  ['T', 'Mulai / batalkan order taksi (di taksi)'],
  ['R', 'Mulai balapan jalanan (di mobil, dekat gerbang start)'],
  ['M', 'Mulai misi berikutnya'],
  ['P', 'Jeda'],
];
