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
  
  // MENGGUNAKAN bot.registry (Bukan data paksaan 1.21.1)
  // Ini memastikan bot tahu ukuran asli blok di server sehingga dia berani melompat
  const defaultMove = new Movements(bot, bot.registry)
  
  defaultMove.canDig = false     
  defaultMove.allowParkour = true 
  
  bot.pathfinder.setMovements(defaultMove)

  bot.chat('Sistem Navigasi & Registry Aktif. Aku siap melompat!')
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  if (message === 'sini') {
    // MENDETEKSI DARI DAFTAR PEMAIN (Sangat Akurat untuk Java & Bedrock)
    const targetPlayer = bot.players[username]

    // Memeriksa apakah pemain ada dan fisik (entity)-nya sudah ter-render di dekat bot
    if (!targetPlayer || !targetPlayer.entity) {
      bot.chat('Aku tahu kamu ada di server, tapi fisikmu tidak terlihat. Coba mendekat!')
      return
    }

    bot.chat(`OTW melompat menghampiri ${username}!`)
    
    // Menyuruh bot mengikuti target fisik tersebut
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 2), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Oke, aku berhenti.')
  }
})

bot.on('error', (err) => console.log(err))