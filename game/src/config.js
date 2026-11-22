// Neon Bay — every tuning number, the palette, the districts, the story and
// the mission data. One file, one job: nothing here touches the scene or the
// DOM, so the city builder, the missions and the side activities can all read
// the same facts about the world.
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

// --- Districts -------------------------------------------------------------
// Three themed quarters laid over the road grid. Each one changes how the
// city builder treats its blocks (glass towers, market stalls, container
// stacks) and each one anchors its own missions and side activities.
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

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
  }
  return null;
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
  tagline: 'A sun-soaked bay city. One driver. Ten jobs. No way back.',
  fixer: 'Mara Voss',
  fixerRole: 'fixer of the bay',
  intro:
    'You rolled into Neon Bay with a borrowed jacket and a fast car. Mara Voss runs the jobs here. Do her ten jobs — pier, market, glass hill and the old harbour — and the bay is yours.',
  ending:
    'Ten jobs. Five stars. One legend. The bay whispers your name now — the driver nobody catches.',
};

// --- Missions --------------------------------------------------------------
// Ten jobs in order. Step kinds: goto, stealCar, deliverCar, tail, defend,
// timedGoto (reach the place before the clock dies), driveTo (same, but you
// must be in a car), race (hit every checkpoint in order, in a car) and
// collect (pick up every marked crate, on foot or in a car).
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
    title: 'Kurir Dua Distrik',
    reward: 1800,
    intro:
      'Mara Voss: "Dokumen dari kios Pasar Senja harus sampai ke lobi Menara Kaca sebelum rapat mulai. Jamnya jalan terus."',
    outro: 'Mara Voss: "Tepat waktu. Orang Bukit Kaca jarang terkesan — kali ini mereka terkesan."',
    steps: [
      { kind: 'timedGoto', place: 'marketStall', radius: 6, timeLimit: 75, text: 'Ambil dokumen di kios Pasar Senja' },
      { kind: 'timedGoto', place: 'glassLobby', radius: 7, timeLimit: 110, text: 'Antar dokumen ke lobi Menara Kaca — cepat!' },
    ],
  },
  {
    id: 5,
    title: 'Balapan Senja',
    reward: 2200,
    intro:
      'Mara Voss: "Kru Pasar Senja taruhan besar soal siapa pembalap tercepat di teluk. Lewati semua gerbang, jangan sampai kalah."',
    outro: 'Mara Voss: "Kru pasar sampai terdiam. Taruhannya kita yang pegang sekarang."',
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
    intro:
      'Mara Voss: "Truk Pelabuhan Tua menjatuhkan empat kotak bercahaya semalam. Kumpulkan semuanya sebelum orang lain yang menemukan."',
    outro: 'Mara Voss: "Empat kotak, lengkap. Isinya? Lebih baik kamu tidak tahu."',
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
    intro:
      'Mara Voss: "Seorang VIP menunggu di Menara Kaca. Jemput dia dengan mobil, antar ke Pelabuhan Tua sebelum kapalnya berangkat."',
    outro: 'Mara Voss: "VIP-nya sampai, kapalnya berangkat, dan tidak ada yang tahu kamu yang mengantar."',
    steps: [
      { kind: 'driveTo', place: 'glassLobby', radius: 7, text: 'Jemput VIP di lobi Menara Kaca (dengan mobil)' },
      { kind: 'timedGoto', place: 'harborGate', radius: 8, timeLimit: 100, text: 'Antar VIP ke gerbang Pelabuhan Tua' },
    ],
  },
  {
    id: 8,
    title: 'Malam di Pelabuhan',
    reward: 3200,
    intro:
      'Mara Voss: "Geng Pelabuhan menyerang balik — kali ini di halaman kontainer mereka sendiri. Tahan tiga gelombang di Pelabuhan Tua."',
    outro: 'Mara Voss: "Pelabuhan diam sekarang. Seluruh teluk tahu siapa yang menang malam ini."',
    steps: [
      { kind: 'defend', place: 'harborGate', radius: 20, waves: [3, 3, 5], text: 'Pertahankan Pelabuhan Tua — gelombang ' },
    ],
  },
  {
    id: 9,
    title: 'Pelarian Teluk',
    reward: 4000,
    intro:
      'Mara Voss: "Seluruh kota memburumu sekarang. Lima bintang. Sampai ke safehouse — hidup-hidup."',
    outro: 'Mara Voss: "Kamu lolos dari lima bintang. Mulai hari ini, kamu legenda Neon Bay."',
    steps: [
      { kind: 'goto', place: 'safehouse', radius: 7, text: 'Kabur ke safehouse — hindari polisi!' },
    ],
  },
];

// The finale is always the last mission in the list; earlier code pinned
// heat and gated the start button on a hard-coded index, now it follows
// the data so the story can grow.
export const FINAL_MISSION_INDEX = MISSIONS.length - 1;

export const DIALOG_MS = 6500;

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
