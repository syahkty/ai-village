const mineflayer = require('mineflayer')
// Import modul pathfinder
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,         // Pastikan port survival kamu benar
  username: 'PioneerBot',
  version: '1.21.11' 
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
    // Meminta bot memindai sekelilingnya untuk mencari fisik pemain (bukan berdasarkan nama chat)
    const targetEntity = bot.nearestEntity(entity => entity.type === 'player' && entity.username !== bot.username)

    if (!targetEntity) {
      bot.chat('Aku tidak melihat fisik siapa-siapa. Coba mendekat sedikit ke jarak pandangku!')
      return
    }

    bot.chat(`OTW menghampiri ${targetEntity.username}!`)
    
    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)
    
    // Menyuruh bot mengikuti entitas fisik yang ditemukan dengan jarak 2 blok
    bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true)
  } 
  
  else if (message === 'berhenti') {
    // Menghapus rute navigasi agar bot diam
    bot.pathfinder.setGoal(null)
    bot.chat('Oke, aku berhenti.')
  }
})

bot.on('kicked', (reason) => console.log(`Ditendang:`, JSON.stringify(reason, null, 2)))
bot.on('error', (err) => console.log(err))

