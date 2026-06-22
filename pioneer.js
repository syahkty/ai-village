const mineflayer = require('mineflayer')
const { loader, goals } = require('@miner-org/mineflayer-baritone')
const { Vec3 } = require('vec3')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(loader)

// === SISTEM STATUS KERJA ===
let isWorking = false
let followInterval = null // Tracking loop ikuti pemain

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  if (bot.ashfinder) {
    // JANGAN aktifkan breakBlocks — akan menghancurkan tanah/batu untuk buat jalur
    bot.ashfinder.config.breakBlocks = false
    bot.ashfinder.config.placeBlocks = false
    console.log('✅ Sistem Ashfinder (Baritone) berhasil dimuat!')
  } else {
    console.log('❌ PERINGATAN: Sistem Ashfinder tidak terdeteksi di dalam bot!')
  }
  bot.chat('Siap bekerja, Bos!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  if (bot.ashfinder) bot.ashfinder.stop()
  isWorking = false
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

// === HELPER: EQUIP KAPAK TERBAIK ===
// [FIX #1] Fungsi baru — tanpa kapak bot menebang dengan tangan kosong, sangat lambat.
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
  // Tidak ada kapak — pakai tangan kosong saja
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
    await bot.ashfinder.goto(
      new goals.GoalNear(new Vec3(petiBlok.position.x, petiBlok.position.y, petiBlok.position.z), 1.5)
    )
    if (!isWorking) {
      bot.chat('Batal simpan ke peti karena dihentikan.')
      return false
    }
    // [FIX #2] lookAt ke TENGAH blok (offset 0.5), bukan sudutnya — bisa gagal buka peti.
    await bot.lookAt(petiBlok.position.offset(0.5, 0.5, 0.5))
  } catch (err) {
    console.log('⚠️ [DEBUG] Error saat jalan ke peti:', err)
    bot.chat('Aduh, jalanku menuju peti gagal...')
    return false
  }

  // [FIX #3] Deklarasi `peti` di luar try agar bisa diakses di blok `finally`.
  // Tanpa ini, jika deposit() throw error, peti TIDAK PERNAH ditutup (chest hang terbuka).
  let peti = null
  try {
    peti = await bot.openChest(petiBlok)
    bot.chat('Membuka peti desa...')

    const semuaItem = bot.inventory.items()
    let adaKayu = false

    for (const item of semuaItem) {
      if (!isWorking) break // Hentikan deposit jika emergency stop dipanggil di tengah jalan
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
    // [FIX #3 lanjutan] Blok `finally` PASTI jalan, baik sukses maupun error.
    // Ini satu-satunya tempat yang aman untuk menutup peti.
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
        console.log(`📍 [SINI] Goto posisi bos: X:${destPos.x.toFixed(1)}, Y:${destPos.y.toFixed(1)}, Z:${destPos.z.toFixed(1)}`)
        console.log(`📍 [SINI] Ashfinder tersedia: ${!!bot.ashfinder}`)
        await bot.ashfinder.goto(new goals.GoalNear(new Vec3(destPos.x, destPos.y, destPos.z), 2))
        console.log(`📍 [SINI] Goto SELESAI (dengan kayu)`)

        if (!targetPlayer.entity) {
          bot.chat('Bos kabur kemana nih...')
          return
        }

        await bot.lookAt(targetPlayer.entity.position.offset(0, 1.5, 0))
        const jarakKeBos = bot.entity.position.distanceTo(targetPlayer.entity.position)
        console.log(`📍 [SINI] Jarak ke bos setelah goto: ${jarakKeBos.toFixed(1)} blok`)

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
      console.log(`📍 [SINI] Ashfinder tersedia: ${!!bot.ashfinder}`)
      
      bot.chat(`Meluncur ke arah ${username}!`)
      if (followInterval) { clearInterval(followInterval); followInterval = null }
      
      const ikutiPemain = async () => {
        const player = bot.players[username]
        if (!player || !player.entity) {
          console.log('📍 [FOLLOW] Player tidak terlihat, stop follow')
          clearInterval(followInterval); followInterval = null
          return
        }
        const p = player.entity.position
        const jarak = bot.entity.position.distanceTo(p)
        console.log(`📍 [FOLLOW] Jarak ke ${username}: ${jarak.toFixed(1)} blok`)
        if (jarak > 3) {
          try {
            console.log(`📍 [FOLLOW] Update tujuan ke: X:${p.x.toFixed(1)}, Y:${p.y.toFixed(1)}, Z:${p.z.toFixed(1)}`)
            await bot.ashfinder.goto(new goals.GoalNear(new Vec3(p.x, p.y, p.z), 2))
          } catch (e) {}
        }
      }
      
      console.log('📍 [SINI] Menjalankan ikutiPemain()...')
      ikutiPemain()
      followInterval = setInterval(ikutiPemain, 3000)
    }
  }

  // === FITUR BERHENTI DARURAT ===
  else if (message === 'berhenti' || message === 'stop') {
    isWorking = false
    if (followInterval) { clearInterval(followInterval); followInterval = null }
    if (bot.ashfinder) bot.ashfinder.stop()
    bot.clearControlStates()
    try { bot.stopDigging() } catch (e) {}
    bot.chat('Rem darurat ditarik! Semua aktivitas dan pergerakan dibatalkan secara paksa.')
  }

  // === FITUR DEBUGGING ===
  else if (message === 'debug') {
    bot.chat('Mencetak status debug ke Terminal...')
    console.log('================ DEBUG INFO ================')
    console.log('Status isWorking:', isWorking)
    console.log('Ashfinder siap?:', bot.ashfinder ? 'Ya' : 'TIDAK (Undefined)')
    console.log('Posisi Bot:', bot.entity.position)
    console.log('Inventory:', bot.inventory.items().map(i => `${i.name}(x${i.count})`).join(', ') || 'Kosong')
    console.log('============================================')
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
      // [FIX #5] Lempar ulang kayu yang tersisa alih-alih cuma menyuruh Bos mengambilnya.
      // Kode lama: hanya chat "tolong ambil dulu" → tidak ada tindakan nyata.
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
      if (bot.ashfinder) bot.ashfinder.stop()
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

    // [FIX #6] Gunakan Set, bukan Array.
    // Array.includes() = O(n) — makin lama bot kerja, makin lambat pencarian ignored block.
    // Set.has() = O(1) — selalu cepat berapapun ukurannya.
    const ignoredBlocks = new Set()
    const logBlockIds = bot.registry.blocksArray.filter(b => b.name.includes('log')).map(b => b.id)

    bot.chat(`Siap laksanakan! Mencari minimal ${targetKayu} kayu...`)

    try {
      let hasChoppedSomething = false

      // [FIX #1 lanjutan] Pasang kapak terbaik sebelum mulai menebang.
      await equipAxe()

      while (isWorking) {
        const kayuInventory = bot.inventory.items().filter(item => item.name.includes('log'))
        const kayuTerkumpul = kayuInventory.reduce((total, item) => total + item.count, 0)

        if (kayuTerkumpul >= targetKayu) {
          bot.chat(`Target tercapai! Mengumpulkan ${kayuTerkumpul} kayu.`)
          hasChoppedSomething = true
          break
        }

        // [FIX #7] Cek inventory hampir penuh sebelum lanjut menebang.
        // Jika bot terus menebang dengan tas penuh, item baru tidak akan bisa dipungut.
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

          await bot.ashfinder.goto(new goals.GoalNear(new Vec3(x, y, z), 2))
          if (!isWorking) break

          // VALIDASI JARAK: Pastikan bot BENAR-BENAR sampai dekat blok kayu sebelum dig.
          // ashfinder.goto() bisa resolve tanpa error meski bot belum sampai (stuck/timeout).
          const jarakKeTarget = bot.entity.position.distanceTo(new Vec3(x, y, z))
          if (jarakKeTarget > 5) {
            console.log(`[INFO] Bot masih terlalu jauh (${jarakKeTarget.toFixed(1)} blok) dari kayu, skip.`)
            ignoredBlocks.add(`${x},${y},${z}`)
            continue
          }

          // Re-fetch blok setelah navigasi — referensi lama bisa basi.
          const blokSegar = bot.blockAt(new Vec3(x, y, z))
          if (!blokSegar || !logBlockIds.includes(blokSegar.type)) {
            console.log('[INFO] Blok sudah tidak ada/bukan kayu lagi setelah navigasi, skip.')
            ignoredBlocks.add(`${x},${y},${z}`)
            continue
          }

          if (!isWorking) break

          // Hadapkan bot ke arah blok kayu sebelum menebang
          await bot.lookAt(new Vec3(x + 0.5, y + 0.5, z + 0.5))

          await bot.dig(blokSegar)

          // [FIX #10] Tunggu item jatuh & dipungut bot secara otomatis sebelum iterasi berikutnya.
          // Tanpa delay ini, `kayuTerkumpul` di iterasi selanjutnya belum mereflek item baru,
          // sehingga bot bisa terus menebang padahal target kayu sudah sebenarnya tercapai.
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

      // [FIX #11] Hanya simpan ke peti jika MASIH dalam status kerja (bukan dihentikan paksa).
      // Kode lama: hasChoppedSomething saja → bot tetap jalan ke peti meski sudah di-stop.
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
