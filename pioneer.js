const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot',
  version: '1.21.11'
})

bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  // 1. Paksa bot memuat data fisika blok dari versi 1.21.1 (versi Java yang stabil)
  const mcData = require('minecraft-data')('1.21.1')
  
  // 2. Terapkan data fisika tersebut ke sistem pergerakan bot
  const defaultMove = new Movements(bot, mcData)
  
  // 3. Konfigurasi tambahan agar gerakannya lebih luwes
  defaultMove.canDig = false     // Jangan menghancurkan blok (fokus jalan saja dulu)
  defaultMove.allowParkour = true // Izinkan melompat melewati celah atau naik 1 blok
  
  // 4. Tanamkan pengaturan pergerakan ini ke dalam otak bot
  bot.pathfinder.setMovements(defaultMove)

  bot.chat('Sistem Navigasi & Fisika 1.21.1 Aktif. Aku bisa melompat sekarang!')
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  if (message === 'sini') {
    const targetEntity = bot.nearestEntity(entity => entity.type === 'player' && entity.username !== bot.username)

    if (!targetEntity) {
      bot.chat('Aku tidak melihat fisik siapa-siapa.')
      return
    }

    bot.chat(`OTW melompat menghampiri ${targetEntity.username}!`)
    // Menyuruh bot mengikuti target
    bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Oke, aku berhenti.')
  }
})

bot.on('error', (err) => console.log(err))