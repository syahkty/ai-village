const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(pathfinder)

let isWorking = false 

// === LOGIKA PATHFINDING SEMPURNA ===
// Mencegah bot stuck saat mencari rute yang rumit
function jalanAman(targetGoal) {
  return new Promise((resolve, reject) => {
    bot.pathfinder.setGoal(targetGoal)

    const bersihkanListener = () => {
      bot.removeListener('goal_reached', selesai)
      bot.removeListener('path_update', cekGagal)
    }

    const selesai = () => {
      bersihkanListener()
      resolve(true)
    }

    const cekGagal = (r) => {
      if (r.status === 'noPath') {
        bersihkanListener()
        bot.pathfinder.setGoal(null)
        reject(new Error('noPath'))
      }
    }

    bot.once('goal_reached', selesai)
    bot.on('path_update', cekGagal)
  })
}

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  // WAJIB pakai bot.registry agar dia tahu persis tinggi blok tanah
  const defaultMove = new Movements(bot, bot.registry) 
  
  defaultMove.allowFreeMotion = false // MATIKAN INI! Ini biang kerok bot malas lompat
  defaultMove.allowParkour = true     
  defaultMove.allow1by1towers = false 
  defaultMove.canDig = false          
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sistem Navigasi & Refleks Lompat Aktif, Bos!')
})

bot.on('death', () => {
  bot.pathfinder.setGoal(null) 
  isWorking = false 
  bot.chat('Aduh, aku mati. Sistem di-reset.')
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // === FITUR SINI ===
  if (message === 'sini') {
    const targetPlayer = bot.players[username]?.entity
    if (!targetPlayer) return bot.chat('Fisikmu tidak terlihat!')
    
    bot.chat('Meluncur!')
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 3), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    isWorking = false 
    bot.chat('Rem mendadak.')
  }

  else if (message === 'menerima kayu') {
    bot.pathfinder.setGoal(null) 
    isWorking = false            
    bot.chat('Siap, tugasku di-reset.')
  }

  // === FITUR TEBANG (Memakai jalanAman) ===
  else if (message === 'tebang') {
    if (isWorking) return bot.chat('Sabar, masih kerja!')

    isWorking = true; 
    bot.chat('Mencari pohon...');
    
    let isChopping = true;
    let hasChoppedSomething = false; 

    try {
      while (isChopping) {
        const targetBlock = bot.findBlock({
          matching: (block) => block.name.includes('log'),
          maxDistance: 32 
        });

        if (!targetBlock) {
          if (!hasChoppedSomething) {
            bot.chat('Tidak ada pohon di sekitarku.');
            isWorking = false;
          }
          break;
        }

        try {
          await jalanAman(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1))
          await bot.dig(targetBlock);
          hasChoppedSomething = true; 
        } catch (err) {
          if (err.message === 'noPath') {
            bot.chat('Aku melihat kayunya, tapi tidak ada jalan yang aman untuk ke sana.');
          } else {
            bot.chat('Tanganku tidak sampai ke sisa kayunya.');
          }
          break; 
        }
      }

      // TAHAP MENGANTAR
      if (hasChoppedSomething) {
        bot.chat('Memungut kayu jatuh...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        const targetPlayer = bot.players[username]?.entity;
        if (targetPlayer) {
          bot.chat(`Mengantar ke Bos!`);
          
          try {
            await jalanAman(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2))
            await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0));

            const logs = bot.inventory.items().filter(item => item.name.includes('log'));
            if (logs.length > 0) {
              for (const log of logs) await bot.tossStack(log); 
              bot.chat('Selesai! Tolong ketik "menerima kayu".');
            }
          } catch (err) {
            bot.chat('Aku tidak menemukan jalan menuju tempatmu berdiri, Bos.');
          }
        }
      }
    } catch (error) {
      console.log(error);
    } 
  }
})

// === SARAF REFLEKS ANTI-NYANGKUT (Logika Sakty) ===
// Memaksa bot melompat jika wajahnya menabrak blok saat disuruh jalan
bot.on('physicsTick', () => {
  if (bot.pathfinder.goal) {
    if (bot.entity.isCollidedHorizontally) {
      bot.setControlState('jump', true) 
      bot.chat('mencoba loncat')
    } else {
      bot.setControlState('jump', false) 
    }
  }
})

bot.on('error', (err) => console.log(err))