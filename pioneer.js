const mineflayer = require('mineflayer')
// Gunakan pathfinder resmi yang super stabil
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

// Muat plugin resmi
bot.loadPlugin(pathfinder)

// === SISTEM STATUS KERJA ===
let isWorking = false
let followInterval = null
let debugNav = false

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  // Konfigurasi pergerakan dasar
  const defaultMove = new Movements(bot, bot.registry)
  defaultMove.canDig = false // Jangan biarkan dia hancurkan dunia sembarangan
  defaultMove.allowParkour = true
  
  // Matikan fitur auto-jump bawaan pathfinder yang bodoh agar 
  // SISTEM AUTO-JUMP V2 buatanmu yang mengambil alih kontrol!
  bot.pathfinder.setMovements(defaultMove)
  
  // [MIGRASI] Listener untuk visualisasi rute pathfinder
  bot.on('path_update', (results) => {
    if (debugNav && results.path) drawPath(results.path)
  })
  
  console.log('✅ Sistem Pathfinder Resmi dimuat. Otak fisika menggunakan V2 buatan Bos!')
  bot.chat('Siap bekerja! Fisikaku sudah di-upgrade, Bos!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  bot.pathfinder.setGoal(null)
  isWorking = false
  if (followInterval) { clearInterval(followInterval); followInterval = null }
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

// === HELPER: NAVIGASI ASYNC (MIGRASI) ===
function gotoGoal(goal) {
  return new Promise((resolve, reject) => {
    bot.pathfinder.setGoal(goal)
    const onGoalReached = () => {
      cleanup()
      resolve()
    }
    const onPathUpdate = (results) => {
      if (results.status === 'noPath') {
        cleanup()
        reject(new Error('No path found'))
      }
    }
    const cleanup = () => {
      bot.removeListener('goal_reached', onGoalReached)
      bot.removeListener('path_update', onPathUpdate)
    }
    bot.on('goal_reached', onGoalReached)
    bot.on('path_update', onPathUpdate)
  })
}

// === HELPER: EQUIP KAPAK TERBAIK ===
async function equipAxe() {
  const axePriority = [
    'netherite_axe', 'diamond_axe', 'iron_axe',
    'stone_axe', 'wooden_axe', 'golden_axe'
  ]
  for (const axeName of axePriority) {
    const axe = bot.inventory.items().find(item => item.name === axeName)
    if (axe) {
      await bot.equip(axe, 'hand')
      console.log(`[INFO] Memakai kapak: ${axeName}`)
      return
    }
  }
}

// === HELPER: VISUALISASI RUTE (PARTIKEL) ===
async function drawPath(path) {
  if (!debugNav) return
  // pathfinder node has x, y, z properties
  for (let i = 0; i < path.length; i += 5) {
    if (!debugNav) break
    const point = path[i]
    if (point) {
      bot.chat(`/particle flame ${point.x} ${point.y + 0.5} ${point.z} 0 0 0 0.05 5 force @a`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
}

// === FUNGSI LOGISTIK DESA ===
async function simpanKePeti() {
  bot.chat('Mencari peti desa terdekat...')
  const chestId = bot.registry.blocksByName.chest.id
  const petiPositions = bot.findBlocks({ matching: chestId, maxDistance: 32, count: 1 })

  if (petiPositions.length === 0) {
    bot.chat('Aduh, tidak ada peti di sekitarku (radius 32 blok). Kayunya kusimpan di tas ya.')
    return false
  }

  const petiBlok = bot.blockAt(petiPositions[0])

  try {
    bot.chat('Peti ditemukan! Meluncur ke sana...')
    await gotoGoal(new goals.GoalNear(petiBlok.position.x, petiBlok.position.y, petiBlok.position.z, 1.5))
    if (!isWorking) {
      bot.chat('Batal simpan ke peti karena dihentikan.')
      return false
    }
    await bot.lookAt(petiBlok.position.offset(0.5, 0.5, 0.5))
  } catch (err) {
    console.log('⚠️ [DEBUG] Error saat jalan ke peti:', err)
    bot.chat('Aduh, jalanku menuju peti gagal...')
    return false
  }

  let peti = null
  try {
    peti = await bot.openChest(petiBlok)
    bot.chat('Membuka peti desa...')

    const semuaItem = bot.inventory.items()
    let adaKayu = false

    for (const item of semuaItem) {
      if (!isWorking) break
      if (item.name.includes('log')) {
        adaKayu = true
        try {
          await peti.deposit(item.type, null, item.count)
          await new Promise(resolve => setTimeout(resolve, 300))
        } catch (depositErr) {
          console.log('⚠️ [DEBUG] Gagal deposit:', depositErr)
          bot.chat('Gagal memasukkan kayu (mungkin peti penuh): ' + depositErr.message)
          return false
        }
      }
    }

    if (adaKayu) {
      bot.chat('Selesai! Semua kayu sudah aman di dalam peti desa.')
    } else {
      bot.chat('Peti sudah kututup, tapi tadi tidak ada kayu di tasku.')
    }
    return true
  } catch (err) {
    console.log('⚠️ [DEBUG] Error saat buka peti:', err)
    bot.chat('Gagal memindahkan barang ke peti: ' + err.message)
    return false
  } finally {
    if (peti) {
      try { peti.close() } catch (e) {}
    }
  }
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // === FITUR NAVIGASI ===
  if (message === 'sini') {
    console.log(`\n📍 [SINI] Perintah 'sini' diterima dari: ${username}`)
    const targetPlayer = bot.players[username]
    console.log(`📍 [SINI] Player ditemukan di bot.players: ${!!targetPlayer}`)
    console.log(`📍 [SINI] Player punya entity: ${!!(targetPlayer && targetPlayer.entity)}`)

    if (!targetPlayer || !targetPlayer.entity) {
      const pos = bot.entity.position
      bot.chat(`Aku tidak melihatmu dari sini. Aku di X:${Math.round(pos.x)}, Y:${Math.round(pos.y)}, Z:${Math.round(pos.z)}.`)
      return
    }

    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    console.log(`📍 [SINI] Kayu di inventory: ${logs.length} stack`)

    if (logs.length > 0) {
      bot.chat(`Meluncur Bos! Kebetulan aku bawa hasil tebangan.`)
      try {
        const destPos = targetPlayer.entity.position
        await gotoGoal(new goals.GoalNear(destPos.x, destPos.y, destPos.z, 2))

        if (!targetPlayer.entity) {
          bot.chat('Bos kabur kemana nih...')
          return
        }

        await bot.lookAt(targetPlayer.entity.position.offset(0, 1.5, 0))
        const jarakKeBos = bot.entity.position.distanceTo(targetPlayer.entity.position)

        if (jarakKeBos <= 4) {
          const logsSekarang = bot.inventory.items().filter(item => item.name.includes('log'))
          for (const log of logsSekarang) {
            await bot.tossStack(log)
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          bot.chat('Ini kayunya Bos! Jangan lupa ketik "menerima kayu" ya.')
        } else {
          bot.chat(`Bos, aku terhalang di tengah jalan!`)
        }
      } catch (e) {
        console.log('❌ [SINI] ERROR saat antar kayu ke bos:', e)
        bot.chat('Aduh aku nyangkut di jalan.')
      }
    } else {
      console.log(`📍 [SINI] Tidak ada kayu, masuk mode FOLLOW`)
      bot.chat(`Meluncur ke arah ${username}!`)
      if (followInterval) { clearInterval(followInterval); followInterval = null }

      const ikutiPemain = async () => {
        const player = bot.players[username]
        if (!player || !player.entity) {
          clearInterval(followInterval); followInterval = null
          return
        }
        const p = player.entity.position
        const jarak = bot.entity.position.distanceTo(p)
        if (jarak > 3) {
          try {
            bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 2))
          } catch (e) {}
        }
      }

      ikutiPemain()
      followInterval = setInterval(ikutiPemain, 3000)
    }
  }

  // === FITUR BERHENTI DARURAT ===
  else if (message === 'berhenti' || message === 'stop') {
    isWorking = false
    if (followInterval) { clearInterval(followInterval); followInterval = null }
    bot.pathfinder.setGoal(null)
    bot.clearControlStates()
    try { bot.stopDigging() } catch (e) {}
    bot.chat('Rem darurat ditarik! Semua aktivitas dan pergerakan dibatalkan secara paksa.')
  }

  // === FITUR DEBUGGING ===
  else if (message === 'debug') {
    bot.chat('Mencetak status debug ke Terminal...')
    console.log('================ DEBUG INFO ================')
    console.log('Status isWorking:', isWorking)
    console.log('Visualisasi Navigasi (debugNav):', debugNav)
    console.log('Pathfinder Goal:', !!bot.pathfinder.goal)
    console.log('Posisi Bot:', bot.entity.position)
    console.log('Inventory:', bot.inventory.items().map(i => `${i.name}(x${i.count})`).join(', ') || 'Kosong')
    console.log('============================================')
  }

  // === FITUR VISUALISASI RUTE ===
  else if (message === 'debug nav on') {
    debugNav = true
    bot.chat('Visualisasi rute AKTIF! (Bot butuh OP untuk menggambar partikel)')
  }
  else if (message === 'debug nav off') {
    debugNav = false
    bot.chat('Visualisasi rute dimatikan.')
  }

  // === FITUR TES LOMPAT ===
  else if (message === 'lompat') {
    bot.chat('Hiaaa! (Tes lompat di tempat)')
    bot.setControlState('jump', true)
    setTimeout(() => bot.setControlState('jump', false), 300)
  }

  // === FITUR KONFIRMASI MENERIMA KAYU ===
  else if (message === 'menerima kayu') {
    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    const sisaKayu = logs.reduce((total, item) => total + item.count, 0)

    if (sisaKayu > 0) {
      bot.chat(`Masih ada ${sisaKayu} kayu di tasku, aku lempar sekarang!`)
      try {
        for (const log of logs) {
          await bot.tossStack(log)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        bot.chat('Sudah aku lempar semua. Ambil kayunya Bos!')
      } catch (e) {
        console.log('⚠️ [DEBUG] Error saat lempar kayu:', e)
        bot.chat('Gagal lempar: ' + e.message)
      }
    } else {
    bot.pathfinder.setGoal(null)
    isWorking = false
    bot.chat('Sip! Inventory-ku sudah bersih. Siap menerima perintah baru.')
    }
  }

  // === FITUR MENEBANG ===
  else if (message.startsWith('tebang')) {
    if (isWorking) {
      bot.chat('Sabar Bos, aku masih ngerjain tugas sebelumnya! Ketik "berhenti" kalau mau membatalkan.')
      return
    }

    isWorking = true
    let targetKayu = 10
    const kata = message.split(' ')

    if (kata.length > 1) {
      const angkaDiminta = parseInt(kata[1], 10)
      if (!isNaN(angkaDiminta) && angkaDiminta > 0) {
        targetKayu = angkaDiminta
      } else {
        bot.chat('Perintahnya aneh Bos. Aku tebang target standar (10 kayu) aja ya.')
      }
    }

    const ignoredBlocks = new Set()
    const logBlockIds = bot.registry.blocksArray.filter(b => b.name.includes('log')).map(b => b.id)

    bot.chat(`Siap laksanakan! Mencari minimal ${targetKayu} kayu...`)

    try {
      let hasChoppedSomething = false
      await equipAxe()

      while (isWorking) {
        const kayuInventory = bot.inventory.items().filter(item => item.name.includes('log'))
        const kayuTerkumpul = kayuInventory.reduce((total, item) => total + item.count, 0)

        if (kayuTerkumpul >= targetKayu) {
          bot.chat(`Target tercapai! Mengumpulkan ${kayuTerkumpul} kayu.`)
          hasChoppedSomething = true
          break
        }

        if (bot.inventory.items().length >= 35) {
          bot.chat(`Tas hampir penuh (${kayuTerkumpul} kayu)! Simpan ke peti dulu...`)
          hasChoppedSomething = kayuTerkumpul > 0
          break
        }

        const targetPositions = bot.findBlocks({ matching: logBlockIds, maxDistance: 32, count: 50 })

        let targetBlock = null
        for (const pos of targetPositions) {
          const posKey = `${pos.x},${pos.y},${pos.z}`
          if (!ignoredBlocks.has(posKey)) {
            targetBlock = bot.blockAt(pos)
            break
          }
        }

        if (!targetBlock) {
          bot.chat(`Pohon di sekitarku habis. Cuma dapat ${kayuTerkumpul} kayu.`)
          if (kayuTerkumpul > 0) hasChoppedSomething = true
          break
        }

        try {
          const { x, y, z } = targetBlock.position

          await gotoGoal(new goals.GoalNear(x, y, z, 2))
          if (!isWorking) break

          const jarakKeTarget = bot.entity.position.distanceTo(new Vec3(x, y, z))
          if (jarakKeTarget > 5) {
            console.log(`[INFO] Bot masih terlalu jauh (${jarakKeTarget.toFixed(1)} blok) dari kayu, skip.`)
            ignoredBlocks.add(`${x},${y},${z}`)
            continue
          }

          const blokSegar = bot.blockAt(new Vec3(x, y, z))
          if (!blokSegar || !logBlockIds.includes(blokSegar.type)) {
            console.log('[INFO] Blok sudah tidak ada/bukan kayu lagi setelah navigasi, skip.')
            ignoredBlocks.add(`${x},${y},${z}`)
            continue
          }

          if (!isWorking) break

          await bot.lookAt(new Vec3(x + 0.5, y + 0.5, z + 0.5))
          await bot.dig(blokSegar)
          await new Promise(resolve => setTimeout(resolve, 800))

        } catch (err) {
          if (!isWorking) break
          if (err?.message === 'GoalChanged' || err?.name === 'GoalChanged') {
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          } else {
            console.log('⚠️ [DEBUG] Error saat mencari jalan ke pohon:', err)
            bot.chat('Blok ini sulit dijangkau, cari yang lain...')
            ignoredBlocks.add(`${targetBlock.position.x},${targetBlock.position.y},${targetBlock.position.z}`)
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }

      if (hasChoppedSomething && isWorking) {
        bot.chat('Memungut sisa kayu yang jatuh...')
        await new Promise(resolve => setTimeout(resolve, 1500))
        const berhasilSimpan = await simpanKePeti()
        if (!berhasilSimpan) {
          bot.chat('Karena gagal masuk peti, ketik "menerima kayu" ya Bos kalau mau ambil manual dariku.')
        }
      } else if (hasChoppedSomething && !isWorking) {
        bot.chat('Penebangan dihentikan. Kayu hasil tebangan ada di tasku.')
      }

      isWorking = false

    } catch (error) {
      bot.chat('Duh, ada error sistem (Cek Terminal VPS).')
      console.log('🚨 [FATAL ERROR] Sistem tebang jebol:', error)
      isWorking = false
    }
  }
})

bot.on('error', (err) => {
  console.log('🚨 [ERROR CORE MINEFLAYER]:', err)
})


// ====================================================================
// === SISTEM AUTO-JUMP V2 — PREDIKTIF + HITBOX-AWARE + CORNER DETECT ===
// ====================================================================
//
//  MASALAH KODE LAMA yang diperbaiki:
//
//  [M1] REAKTIF, BUKAN PREDIKTIF
//       Lama : Hanya lompat saat isCollidedHorizontally → sudah terlambat,
//              bot sudah terhimpit di tepi blok, sering gagal naik
//       Baru : Scan maju SEBELUM nabrak, hitung tick sampai kontak vs tick
//              yang dibutuhkan untuk naik 1 blok, lompat di jendela optimal
//
//  [M2] JUMP RELEASE TERLALU CEPAT
//       Lama : setImmediate() — bisa jalan sebelum physics engine baca state
//       Baru : setTimeout(65ms) = 1 tick (50ms) + 15ms buffer → dijamin
//              physics engine sempat mencatat state 'jump=true'
//
//  [M3] TIDAK MEMPERHITUNGKAN LEBAR HITBOX
//       Lama : Cek satu titik tepat di depan → miss blok di sudut hitbox
//       Baru : Scan 3 garis (tengah, kiri hitbox, kanan hitbox) → deteksi
//              corner block yang menyangkut sisi hitbox
//
//  [M4] TIMING STATIS TANPA RUMUS
//       Lama : Tidak ada kalkulasi kapan harus lompat berdasarkan kecepatan
//       Baru : Rumus diskrit fisika Minecraft:
//              tickHinggaKontak = efektif / speedXZ
//              Bandingkan dengan TICK_NAIK_1_BLOK (pre-kalkulasi ~4 tick)
//              → lompat di jendela [TICK_NAIK - 1.5, TICK_NAIK + 3.0]
//
//  [M5] COOLDOWN 500ms TERLALU PANJANG
//       Lama : 500ms cooldown → bot jalan 2.2 blok, window terlewat
//       Baru : 400ms cooldown = ~8 tick, cukup cegah double-jump
//
//  LAYER 1 — Lompat Prediktif (physicsTick sync):
//    Deteksi + timing kalkulasi + eksekusi lompat sebelum nabrak
//
//  LAYER 2 — Rescue Fallback (physicsTick async):
//    Jika bot benar-benar stuck (posisi tidak bergerak >1 detik):
//    mundur, lompat paksa, atau reroute. Termasuk rescue corner khusus.
// ====================================================================


// ─── KONSTANTA FISIKA MINECRAFT (simulasi diskrit per-tick, 20 Hz) ────────────
const PLAYER_HALF_WIDTH = 0.30    // Setengah lebar hitbox pemain (blok)
const JUMP_INITIAL_VY   = 0.42    // Kecepatan vertikal awal lompatan (blok/tick)
const GRAVITY_AIR       = 0.08    // Gravitasi per tick di udara
const AIR_DRAG          = 0.98    // Hambatan udara per tick (faktor pengali)
const TICK_MS           = 50      // Durasi satu physics tick (ms) = 1000 / 20Hz
const JUMP_COOLDOWN_MS  = 400     // [FIX M5] Jeda minimum antar lompatan (ms)
const SCAN_MAX_DIST     = 2.0     // Jangkauan scan ke depan (blok)
const SCAN_STEP         = 0.08    // Resolusi scan per langkah (blok)

// ─── STATE VARIABEL ───────────────────────────────────────────────────────────
let lastJumpTime          = 0     // Timestamp lompatan terakhir
let sedangKoreksiCorner   = false // Flag: sedang melakukan koreksi sudut blok
let waktuKoreksiCorner    = 0     // Timestamp koreksi sudut terakhir

// Layer 2 state
let sedangPenyelamatan    = false
let posisiTerakhir        = null
let waktuMacet            = 0
let percobaanPenyelamatan = 0
let tickCountRescue       = 0
let isProcessingRescue    = false


// ─── HELPER: SIMULASI FISIKA LOMPATAN ────────────────────────────────────────
//
//  Minecraft menggunakan simulasi diskrit per-tick (bukan integral kontinu).
//  Setiap tick:  posY += vy
//                vy   = (vy - GRAVITY_AIR) * AIR_DRAG
//
//  Dengan nilai default:
//    tick 1: posY = 0.42, vy = (0.42 - 0.08) * 0.98 = 0.327
//    tick 2: posY = 0.747, vy = (0.327 - 0.08) * 0.98 = 0.242
//    tick 3: posY = 0.989, vy = 0.159
//    tick 4: posY = 1.148 ← melewati 1.05 blok di sini → return 4
//
//  Sehingga TICK_NAIK_1_BLOK = 4 (pre-kalkulasi di bawah)
//
function hitungTickNaikKetinggian(h) {
  let posY = 0
  let vy   = JUMP_INITIAL_VY
  for (let t = 1; t <= 25; t++) {
    posY += vy
    if (posY >= h) return t
    vy = (vy - GRAVITY_AIR) * AIR_DRAG
    if (vy <= 0) return Infinity  // Sudah mulai turun, tidak akan capai h
  }
  return Infinity
}

// Pre-kalkulasi SEKALI — bukan setiap tick. Hasilnya ≈ 4 tick untuk naik 1.05 blok.
// Margin 0.05 blok = safety agar bot pasti berhasil naik, tidak cuma menyentuh tepi.
const TICK_NAIK_1_BLOK = hitungTickNaikKetinggian(1.05)


// ─── HELPER: CEK BLOK PADAT ──────────────────────────────────────────────────
function cekPadat(pos) {
  if (!pos) return false
  const blok = bot.blockAt(pos)
  return blok ? blok.boundingBox === 'block' : false
}


// ─── HELPER: SCAN STEP-UP DI DEPAN BOT ──────────────────────────────────────
//
//  Algoritma:
//    1. Hitung vektor arah hadap (dx, dz) dari yaw bot
//    2. Hitung vektor tegak lurus (perpX, perpZ) untuk sisi kiri/kanan
//    3. Definisikan 3 garis scan: tengah, kiri, kanan (80% half-width)
//    4. Scan dari jarak PLAYER_HALF_WIDTH + 0.05 sampai SCAN_MAX_DIST,
//       step 0.08 blok (resolusi tinggi untuk tidak miss blok tipis)
//    5. Di setiap titik, cek 3 kondisi:
//       - Ada blok padat di lantaiY (level kaki) → ini step yang perlu dilompati
//       - TIDAK ada blok di lantaiY+1 (badan) dan lantaiY+2 (kepala) → bisa dilompati
//       - TIDAK ada langit-langit di atas bot sendiri → ada ruang untuk lompat
//    6. Kembalikan step terdekat (jarakDasar, efektif, isCorner, sisi)
//
//  Mengapa 3 garis?
//    Bot hitbox lebar 0.6 blok. Blok di sudut kiri/kanan hitbox
//    tidak terdeteksi oleh scan tengah saja. Inilah penyebab
//    "corner catching" di kode lama.
//
function scanStepDepan() {
  const pos   = bot.entity.position
  const yaw   = bot.entity.yaw
  // Konversi yaw Mineflayer ke vektor arah hadap
  const dx    = -Math.sin(yaw)   // Komponen X arah hadap
  const dz    = -Math.cos(yaw)   // Komponen Z arah hadap
  // Vektor tegak lurus (rotasi 90° CW)
  const perpX = -dz
  const perpZ =  dx

  // Y kaki bot. Saat onGround, pos.y sangat dekat dengan nilai integer
  // (mis. 64.0001 saat berdiri di atas blok Y=63 → Math.floor = 64)
  const lantaiY = Math.floor(pos.y)

  // Cegah lompat jika ada langit-langit tepat di atas bot (ruang kepala tidak cukup)
  if (cekPadat(new Vec3(Math.floor(pos.x), lantaiY + 2, Math.floor(pos.z)))) return null

  // 80% half-width menghindari false-positive dari blok diagonal jauh di samping
  const W = PLAYER_HALF_WIDTH * 0.80
  const garisGaris = [
    { ox: 0,          oz: 0,          nama: 'tengah' },
    { ox:  perpX * W, oz:  perpZ * W, nama: 'kiri'   },
    { ox: -perpX * W, oz: -perpZ * W, nama: 'kanan'  },
  ]

  let stepTerdekat = null

  // Scan maju dari tepi hitbox ke SCAN_MAX_DIST
  for (let d = PLAYER_HALF_WIDTH + 0.05; d <= SCAN_MAX_DIST; d += SCAN_STEP) {
    const bx = pos.x + dx * d   // Koordinat X titik scan
    const bz = pos.z + dz * d   // Koordinat Z titik scan

    for (const g of garisGaris) {
      const cx = Math.floor(bx + g.ox)
      const cz = Math.floor(bz + g.oz)

      // Kondisi 1: Ada blok padat di level kaki → ini adalah step-up 1 blok
      if (!cekPadat(new Vec3(cx, lantaiY, cz))) continue

      // Kondisi 2: Tidak ada blok di level badan (lantaiY+1) dan kepala (lantaiY+2)
      //            → ini step yang bisa dilompati, bukan tembok
      if (cekPadat(new Vec3(cx, lantaiY + 1, cz))) continue  // Tembok (badan) → skip
      if (cekPadat(new Vec3(cx, lantaiY + 2, cz))) continue  // Tembok (kepala) → skip

      // Step valid ditemukan. Simpan yang terdekat.
      if (!stepTerdekat || d < stepTerdekat.jarakDasar) {
        stepTerdekat = {
          jarakDasar : d,                    // Jarak dari PUSAT bot ke blok
          efektif    : d - PLAYER_HALF_WIDTH, // Jarak dari TEPI hitbox ke blok
          isCorner   : g.nama !== 'tengah',   // True jika blok ada di sudut hitbox
          sisi       : g.nama,
        }
      }
    }

    // Optimasi: setelah menemukan step, scan 0.20 blok lagi lalu berhenti.
    // Ini untuk memastikan step yang lebih dekat di garis lain tidak terlewat.
    if (stepTerdekat && d > stepTerdekat.jarakDasar + 0.20) break
  }

  return stepTerdekat
}


// ─── HELPER: KOREKSI POSISI LATERAL (CORNER FIX) ─────────────────────────────
//
//  Ketika scanStepDepan() mendeteksi isCorner = true, artinya blok bukan tepat
//  di depan (tengah), tapi di sudut kiri atau kanan hitbox.
//
//  Solusi: geser bot ke LAWAN sisi yang nyangkut selama ≈1-2 tick (70ms),
//  agar hitbox terlepas dari sudut blok, kemudian bot bisa lompat dengan bersih.
//
//  Fungsi ini async dan dipanggil tanpa await dari physicsTick (sync).
//  Aman karena:
//    - sedangKoreksiCorner mencegah re-entrancy
//    - Operasi 'left'/'right' tidak konflik dengan 'jump' (state berbeda)
//
async function koreksiSudutBlok(sisi) {
  if (sedangKoreksiCorner) return
  if (Date.now() - waktuKoreksiCorner < 700) return  // Rate-limit koreksi

  sedangKoreksiCorner = true
  waktuKoreksiCorner  = Date.now()

  // Geser ke LAWAN sisi yang nyangkut
  const arahGeser = sisi === 'kiri' ? 'right' : 'left'
  bot.setControlState(arahGeser, true)
  await new Promise(r => setTimeout(r, 70))   // ≈ 1-2 tick (70ms)
  bot.setControlState(arahGeser, false)

  sedangKoreksiCorner = false
}


// ─── HELPER: EKSEKUSI LOMPATAN ───────────────────────────────────────────────
//
//  [FIX M2]: setImmediate() diganti setTimeout(65ms).
//
//  Mengapa setImmediate bermasalah?
//    setImmediate berjalan setelah current event loop iteration tapi mungkin
//    SEBELUM physics engine Mineflayer memproses state jump. Ini menyebabkan
//    state 'jump=true' hanya ada untuk fraksi tick, tidak cukup untuk lompat.
//
//  Mengapa 65ms?
//    1 physics tick = 50ms. Dengan hold 65ms, kita jamin minimal 1 tick penuh
//    state jump=true dibaca oleh physics engine. 15ms buffer aman dari jitter.
//
function eksekusiLompat() {
  if (Date.now() - lastJumpTime < JUMP_COOLDOWN_MS) return
  lastJumpTime = Date.now()
  bot.setControlState('jump', true)
  setTimeout(() => bot.setControlState('jump', false), TICK_MS + 15)  // 65ms
}


// ════════════════════════════════════════════════════════════════════
// LAYER 1: AUTO-JUMP PREDIKTIF
// ════════════════════════════════════════════════════════════════════
//
//  Logika kalkulasi jendela lompat:
//
//    tickHinggaKontak = step.efektif / kecepatan
//      → Berapa tick sampai TEPI HITBOX menyentuh tepi blok
//
//    TICK_NAIK_1_BLOK ≈ 4 tick (pre-kalkulasi)
//      → Berapa tick sampai lompatan mencapai ketinggian +1.05 blok
//
//    Jendela Optimal:
//      [TICK_NAIK_1_BLOK - 1.5 , TICK_NAIK_1_BLOK + 3.0]
//      = [2.5 , 7.0] tick
//
//    Contoh pada kecepatan jalan (0.22 blok/tick):
//      jendela menembak ketika efektif = 2.5*0.22 sampai 7.0*0.22
//                                      = 0.55 sampai 1.54 blok dari hitbox
//      → Lompat ketika blok 0.55–1.54 blok di depan hitbox edge ✓
//
//    Contoh pada kecepatan lari (0.28 blok/tick):
//      jendela = 0.70 sampai 1.96 blok dari hitbox edge ✓
//
//    Safety Net: Jika efektif < 0.28 atau isCollidedHorizontally,
//    lompat paksa (bot sudah terlanjur terlalu dekat / nabrak).
//
bot.on('physicsTick', () => {
  // Guard: aktif saat navigasi ATAU bergerak maju manual
  const isNavigating = !!bot.pathfinder.goal
  if (!isNavigating && !bot.getControlState('forward')) return
  if (sedangPenyelamatan)   return  // Jangan interfere saat rescue sedang jalan
  if (!bot.entity.onGround) return  // Tidak bisa lompat saat di udara
  if (Date.now() - lastJumpTime < JUMP_COOLDOWN_MS) return

  // Ambil kecepatan horizontal aktual dari physics engine (blok/tick)
  const { x: vx, z: vz } = bot.entity.velocity
  const speedXZ = Math.sqrt(vx * vx + vz * vz)

  // Scan step di depan (prediktif, sebelum nabrak)
  const step = scanStepDepan()
  if (!step) return

  // Kalkulasi jendela lompat dinamis berdasarkan kecepatan aktual
  // Min 0.06 blok/tick untuk hindari division-by-zero saat bot hampir diam
  const kecepatan        = Math.max(speedXZ, 0.06)
  const tickHinggaKontak = step.efektif / kecepatan

  const JENDELA_MIN = TICK_NAIK_1_BLOK - 1.5  // Sedikit lebih awal dari ideal
  const JENDELA_MAX = TICK_NAIK_1_BLOK + 3.0  // Toleransi sampai 3 tick lewat ideal

  if (tickHinggaKontak >= JENDELA_MIN && tickHinggaKontak <= JENDELA_MAX) {
    // [FIX M3]: Koreksi lateral jika blok ada di sudut hitbox (corner)
    if (step.isCorner) koreksiSudutBlok(step.sisi)
    eksekusiLompat()
    return
  }

  // Safety Net: bot sudah terlanjur sangat dekat atau sudah nabrak
  // Tangkap kasus di mana bot bergerak lambat sehingga jendela tidak terpicu
  if (step.efektif < 0.28 || bot.entity.isCollidedHorizontally) {
    if (step.isCorner) koreksiSudutBlok(step.sisi)
    eksekusiLompat()
  }
})


// ════════════════════════════════════════════════════════════════════
// LAYER 2: RESCUE FALLBACK
// ════════════════════════════════════════════════════════════════════
//
//  Deteksi: Jika selama 20 tick (1 detik) bot navigasi tapi bergerak
//  kurang dari 0.3 blok, waktuMacet++. Jika waktuMacet > 3 (>3 detik),
//  aktifkan manuver rescue.
//
//  Urutan rescue:
//    1. Hancurkan daun (leaves) yang mungkin menghalangi
//    2. Jika corner terdeteksi: koreksi lateral agresif (150ms) + lompat
//    3. Percobaan 1-2: Mundur → lompat ke depan
//    4. Percobaan 3-4: Mundur + geser samping → lompat ke depan
//    5. Percobaan 5+:  Reroute total (mundur jauh, reset counter)
//
bot.on('physicsTick', async () => {
  if (isProcessingRescue) return

  const isNavigating = !!bot.pathfinder.goal

  if (isNavigating && !sedangPenyelamatan) {
    tickCountRescue++

    // Cek posisi setiap 20 tick (1 detik)
    if (tickCountRescue >= 20) {
      const posisiSekarang = bot.entity.position.clone()
      if (posisiTerakhir) {
        const dX = posisiSekarang.x - posisiTerakhir.x
        const dZ = posisiSekarang.z - posisiTerakhir.z
        if (Math.sqrt(dX * dX + dZ * dZ) < 0.3) waktuMacet++
        else waktuMacet = 0
      }
      posisiTerakhir  = posisiSekarang
      tickCountRescue = 0
    }

    if (waktuMacet > 3) {
      sedangPenyelamatan = true
      isProcessingRescue = true
      percobaanPenyelamatan++

      const tujuanLama = bot.pathfinder.goal
      bot.pathfinder.setGoal(null)
      bot.clearControlStates()

      // ── Rescue 0: Hancurkan daun yang menghalangi ────────────────
      const daunNyangkut = bot.findBlock({
        matching: (block) => block && block.name?.includes('leaves'),
        maxDistance: 2
      })

      if (daunNyangkut) {
        try { await bot.dig(daunNyangkut) } catch (e) {}
        if (tujuanLama) bot.pathfinder.setGoal(tujuanLama)
        waktuMacet = 0; sedangPenyelamatan = false; isProcessingRescue = false
        return
      }

      // ── Rescue Spesifik: Corner Nyangkut ─────────────────────────
      // Layer 1 sudah coba lompat tapi masih stuck? Kemungkinan corner
      // yang lebih kompleks. Koreksi lateral lebih agresif (150ms).
      const step = scanStepDepan()
      if (step?.isCorner && bot.entity.isCollidedHorizontally && percobaanPenyelamatan <= 2) {
        console.log(`[RESCUE] Corner nyangkut di sisi ${step.sisi}, koreksi agresif...`)
        const arahKoreksi = step.sisi === 'kiri' ? 'right' : 'left'
        bot.setControlState(arahKoreksi, true)
        await new Promise(r => setTimeout(r, 150))  // 3× lebih lama dari normal
        bot.setControlState(arahKoreksi, false)
        await new Promise(r => setTimeout(r, 50))
        // Lompat setelah posisi terkoreksi
        bot.setControlState('jump', true)
        bot.setControlState('forward', true)
        await new Promise(r => setTimeout(r, 300))
        bot.clearControlStates()
        if (tujuanLama) bot.pathfinder.setGoal(tujuanLama)
        waktuMacet = 0; sedangPenyelamatan = false; isProcessingRescue = false
        return
      }

      // ── Rescue Bertahap ───────────────────────────────────────────
      if (percobaanPenyelamatan <= 2) {
        // Mundur → lompat maju
        bot.setControlState('back', true)
        await new Promise(r => setTimeout(r, 400))
        bot.setControlState('back', false)
        await new Promise(r => setTimeout(r, 100))
        bot.setControlState('jump', true)
        bot.setControlState('forward', true)
        await new Promise(r => setTimeout(r, 400))
        bot.clearControlStates()

      } else if (percobaanPenyelamatan <= 4) {
        // Mundur + geser samping → lompat maju
        bot.chat('Cari rute lain...')
        const arah = percobaanPenyelamatan % 2 === 0 ? 'left' : 'right'
        bot.setControlState('back', true)
        bot.setControlState(arah, true)
        await new Promise(r => setTimeout(r, 500))
        bot.clearControlStates()
        bot.setControlState('jump', true)
        bot.setControlState('forward', true)
        await new Promise(r => setTimeout(r, 400))
        bot.clearControlStates()

      } else {
        // Reroute total
        bot.chat('Macet parah, reroute total!')
        bot.setControlState('back', true)
        await new Promise(r => setTimeout(r, 800))
        bot.clearControlStates()
        percobaanPenyelamatan = 0
      }

      if (tujuanLama) bot.pathfinder.setGoal(tujuanLama)
      waktuMacet = 0; sedangPenyelamatan = false; isProcessingRescue = false
    }

  } else {
    // Bot tidak sedang navigasi → reset semua counter
    posisiTerakhir = null
    waktuMacet     = 0
    if (!isNavigating && !sedangPenyelamatan) percobaanPenyelamatan = 0
  }
})