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

bot.on('chat', (username, message) => {
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
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 4), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Rem mendadak. Aku berhenti.')
  }
})

bot.on('error', (err) => console.log(err))