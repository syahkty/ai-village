const mineflayer = require('mineflayer')
// Import modul pathfinder
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25566,         // Pastikan port survival kamu benar
  username: 'PioneerBot',
  version: '1.21.1' 
})

// Pasang plugin pathfinder ke dalam bot
bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  bot.chat('Sistem Navigasi Aktif. Saya siap menjelajah!')
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  // Mencari data player yang mengirim chat
  const targetPlayer = bot.players[username]?.entity

  if (message === 'sini') {
    if (!targetPlayer) {
      bot.chat('Aku tidak melihatmu, kamu di mana?')
      return
    }

    bot.chat('OTW (On The Way)!')
    
    // Memberitahu bot cara bergerak standar (bisa jalan, lari, lompat)
    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)
    
    // Menyuruh bot mengikuti player (target) dengan jarak 2 blok
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 2), true)
  } 
  
  else if (message === 'berhenti') {
    // Menghapus rute navigasi agar bot diam
    bot.pathfinder.setGoal(null)
    bot.chat('Oke, aku berhenti.')
  }
})

bot.on('kicked', (reason) => console.log(`Ditendang:`, JSON.stringify(reason, null, 2)))
bot.on('error', (err) => console.log(err))

