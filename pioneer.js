const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  const defaultMove = new Movements(bot, bot.registry)
  defaultMove.canDig = false     
  defaultMove.allowParkour = true 
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sistem Navigasi Aktif. Aku siap menjelajah!')
})

// === SISTEM BARU: MENDETEKSI KEMATIAN ===
bot.on('death', () => {
  console.log('Bot mati. Mereset sistem navigasi...')
  bot.pathfinder.setGoal(null) // Membersihkan memori rute agar tidak error
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  if (message === 'sini') {
    const targetPlayer = bot.players[username]

    // Jika fisik pemain tidak terdeteksi (karena kejauhan)
    if (!targetPlayer || !targetPlayer.entity) {
      // Bot akan memeriksa posisi koordinatnya sendiri saat ini
      const pos = bot.entity.position
      bot.chat(`Aku tidak melihatmu dari sini. Aku tersesat di koordinat X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}. Tolong jemput!`)
      return
    }

    bot.chat(`Meluncur ke arah ${username}!`)
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 2), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Rem mendadak. Aku berhenti.')
  }

  if (message === 'sini') {
    const targetPlayer = bot.players[username]
    if (!targetPlayer || !targetPlayer.entity) {
      bot.chat('Aku tidak melihat fisikmu. Coba mendekat!')
      return
    }
    bot.chat(`Meluncur ke arah ${username}!`)
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 2), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Rem mendadak. Aku berhenti.')
  }

  // === FITUR BARU: MENEBANG POHON ===
  else if (message === 'tebang') {
    bot.chat('Memindai pohon terdekat...')

    // 1. Mencari blok kayu (log) dalam radius 32 blok
    const targetBlock = bot.findBlock({
      matching: (block) => block.name.includes('log'), // Mencari apa saja yang namanya mengandung 'log' (oak_log, birch_log, dll)
      maxDistance: 32
    })

    if (!targetBlock) {
      bot.chat('Tidak ada pohon di sekitarku (radius 32 blok).')
      return
    }

    bot.chat(`Ketemu kayu di koordinat X: ${targetBlock.position.x}, Z: ${targetBlock.position.z}. OTW tebang!`)

    try {
      // 2. Berjalan mendekati pohon (berhenti pada jarak 1 blok agar bisa memukul)
      const x = targetBlock.position.x
      const y = targetBlock.position.y
      const z = targetBlock.position.z
      await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1))

      // 3. Mulai memukul/menebang blok tersebut
      bot.chat('Mulai menebang! (Pakai tangan kosong agak lama ya...)')
      await bot.dig(targetBlock)
      
      bot.chat('Selesai! Kayunya sudah hancur.')
    } catch (err) {
      bot.chat('Duh, aku nyangkut atau pohonnya di luar jangkauanku.')
      console.log(err)
    }
  }
})

bot.on('error', (err) => console.log(err))