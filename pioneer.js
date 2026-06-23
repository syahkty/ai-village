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
let followInterval = null 
let isFollowing = false   

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  if (bot.ashfinder) {
    bot.ashfinder.config.breakBlocks = true 
    bot.ashfinder.config.placeBlocks = true 
    bot.ashfinder.config.parkour = true     
    
    // MATIKAN SEMUA DEBUG BARITONE SECARA PAKSA
    bot.ashfinder.debug = false; 
    bot.ashfinder.config.thinkTimeout = 60000; 

    console.log('✅ Sistem Ashfinder (Baritone) dimuat dengan mode SILENT (Tanpa Partikel).')
  } else {
    console.log('❌ PERINGATAN: Sistem Ashfinder tidak terdeteksi di dalam bot!')
  }
  bot.chat('Siap bekerja! Mode senyap tanpa jalur path sudah aktif, Bos!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  if (bot.ashfinder) bot.ashfinder.stop()
  isWorking = false
  isFollowing = false
  if (followInterval) { clearInterval(followInterval); followInterval = null }
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

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
    if (bot.ashfinder) bot.ashfinder.stop() 
    await bot.ashfinder.goto(
      new goals.GoalNear(new Vec3(petiBlok.position.x, petiBlok.position.y, petiBlok.position.z), 1.5)
    )
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
    const targetPlayer = bot.players[username]
    if (!targetPlayer || !targetPlayer.entity) {
      const pos = bot.entity.position
      bot.chat(`Aku tidak melihatmu dari sini. Aku di X:${Math.round(pos.x)}, Y:${Math.round(pos.y)}, Z:${Math.round(pos.z)}.`)
      return
    }

    const logs = bot.inventory.items().filter(item => item.name.includes('log'))

    if (logs.length > 0) {
      bot.chat(`Meluncur Bos! Kebetulan aku bawa hasil tebangan.`)
      try {
        if (bot.ashfinder) bot.ashfinder.stop() 
        const destPos = targetPlayer.entity.position
        await bot.ashfinder.goto(new goals.GoalNear(new Vec3(destPos.x, destPos.y, destPos.z), 2))

        if (!targetPlayer.entity) return

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
        bot.chat('Aduh aku nyangkut di jalan.')
      }
    } else {
      bot.chat(`Membuntuti ${username} dengan radar Baritone!`)
      
      if (followInterval) { clearInterval(followInterval); followInterval = null }
      if (bot.ashfinder) bot.ashfinder.stop()
      isFollowing = false

      let lastTargetPos = null;

      const ikutiPemain = async () => {
        const player = bot.players[username]
        
        if (!player || !player.entity) {
          clearInterval(followInterval); followInterval = null
          return
        }
        
        const p = player.entity.position
        const jarakKeBos = bot.entity.position.distanceTo(p)
        
        if (lastTargetPos && p.distanceTo(lastTargetPos) > 4) {
           bot.ashfinder.stop();
           isFollowing = false;
        }

        if (!isFollowing && jarakKeBos > 3) {
          lastTargetPos = p.clone(); 
          isFollowing = true;
          bot.ashfinder.goto(new goals.GoalNear(new Vec3(p.x, p.y, p.z), 2))
            .then(() => { isFollowing = false; })
            .catch(() => { isFollowing = false; });
        }
      }

      ikutiPemain()
      followInterval = setInterval(ikutiPemain, 1500) 
    }
  }

  // === FITUR BERHENTI DARURAT ===
  else if (message === 'berhenti' || message === 'stop') {
    isWorking = false
    if (followInterval) { clearInterval(followInterval); followInterval = null }
    if (bot.ashfinder) bot.ashfinder.stop()
    isFollowing = false
    bot.clearControlStates()
    try { bot.stopDigging() } catch (e) {}
    bot.chat('Rem darurat ditarik! Semua aktivitas dibatalkan.')
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

    if (followInterval) { clearInterval(followInterval); followInterval = null; isFollowing = false; }
    
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

          if (bot.ashfinder) bot.ashfinder.stop() 
          await bot.ashfinder.goto(new goals.GoalNear(new Vec3(x, y, z), 2))
          if (!isWorking) break

          const jarakKeTarget = bot.entity.position.distanceTo(new Vec3(x, y, z))
          if (jarakKeTarget > 5) {
            ignoredBlocks.add(`${x},${y},${z}`)
            continue
          }

          const blokSegar = bot.blockAt(new Vec3(x, y, z))
          if (!blokSegar || !logBlockIds.includes(blokSegar.type)) {
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
      bot.chat('Duh, ada error sistem.')
      isWorking = false
    }
  }
})

bot.on('error', (err) => {
  // Hanya log error penting yang bukan soal partikel
  if (!err.message.includes('world_particles')) {
     console.log('🚨 [ERROR MINEFLAYER]:', err.message)
  }
})

// === PENGAMAN SUPER: MEMBLOKIR ERROR PARTIKEL DI PM2 ===
process.on('uncaughtException', (err) => {
  // Jika error berasal dari gagal baca packet partikel, abaikan dan jangan penuhi log PM2!
  if (err.name === 'PartialReadError' || (err.message && err.message.includes('world_particles'))) {
    return; 
  }
  console.error('🚨 [CRITICAL ERROR]:', err);
});

process.on('unhandledRejection', (reason) => {
  if (reason && (reason.name === 'PartialReadError' || (reason.message && reason.message.includes('world_particles')))) {
    return;
  }
});