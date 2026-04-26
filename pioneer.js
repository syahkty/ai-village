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
  bot.chat('Sistem Navigasi & Pekerja Aktif. Aku siap disuruh-suruh!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem navigasi...')
  bot.pathfinder.setGoal(null) 
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

bot.on('chat', async (username, message) => {
  // Abaikan pesan dari diri sendiri
  if (username === bot.username) return

  // === FITUR NAVIGASI ===
  if (message === 'sini') {
    const targetPlayer = bot.players[username]
    if (!targetPlayer || !targetPlayer.entity) {
      const pos = bot.entity.position
      bot.chat(`Aku tidak melihatmu dari sini. Aku di koordinat X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}.`)
      return
    }
    bot.chat(`Meluncur ke arah ${username}!`)
    // Jarak diatur ke 3 agar tidak terlalu mepet tembok/blok
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 3), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    bot.chat('Rem mendadak. Aku berhenti.')
  }

  // === FITUR MENEBANG & MENGANTAR KAYU ===
  else if (message === 'tebang') {
    bot.chat('Mencari pohon... Aku akan menebang sampai habis!')
    let isChopping = true

    // 1. Proses Menebang
    while (isChopping) {
      const targetBlock = bot.findBlock({
        matching: (block) => block.name.includes('log'),
        maxDistance: 10
      })

      if (!targetBlock) {
        bot.chat('Pohon di depanku sudah habis!')
        isChopping = false
        break
      }

      try {
        const x = targetBlock.position.x
        const y = targetBlock.position.y
        const z = targetBlock.position.z
        
        await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1))
        await bot.dig(targetBlock)
      } catch (err) {
        bot.chat('Sisa kayunya terlalu tinggi, tanganku tidak sampai!')
        isChopping = false
        break
      }
    }

    // 2. Memungut Barang
    bot.chat('Tunggu sebentar, aku memungut kayunya yang jatuh...')
    // Jeda 1,5 detik agar animasi blok jatuh selesai dan tersedot ke badan bot
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 3. Mencari Bos dan Mengantar Barang
    const targetPlayer = bot.players[username]?.entity
    if (targetPlayer) {
      bot.chat(`OTW mengantar kayu ke ${username}!`)
      try {
        // Jalan ke arah pemain (berhenti pada jarak 2 blok)
        await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2))
        
        // Memaksa bot melihat ke arah kepala pemain agar lemparannya pas
        await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0))

        // Mengecek isi tas bot, cari semua benda yang namanya mengandung 'log'
        const logs = bot.inventory.items().filter(item => item.name.includes('log'))
        
        if (logs.length > 0) {
          // Lemparkan semua kayu yang ada di tas satu per satu
          for (const log of logs) {
            await bot.tossStack(log) 
          }
          bot.chat('Ini hasil tebangannya, Bos!')
        } else {
          bot.chat('Maaf Bos, kayunya tidak masuk ke inventory-ku (mungkin jatuh ke tempat yang tidak bisa kuambil).')
        }
      } catch (err) {
        bot.chat('Duh, aku nyangkut di jalan saat mau mengantar kayunya.')
      }
    } else {
      bot.chat('Bos di mana? Aku tidak melihatmu, kayunya aku simpan di kantongku dulu ya.')
    }
  }
})

bot.on('error', (err) => console.log(err))