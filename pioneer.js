const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(pathfinder)

let isWorking = false 

// === LOGIKA PATHFINDING SEMPURNA (Dari Referensi GitHub) ===
// Fungsi ini menggantikan 'await bot.pathfinder.goto()' agar bot tidak pernah stuck.
function jalanAman(targetGoal) {
  return new Promise((resolve, reject) => {
    // Mulai jalan
    bot.pathfinder.setGoal(targetGoal)

    // Fungsi untuk membersihkan memori (mencegah memory leak)
    const bersihkanListener = () => {
      bot.removeListener('goal_reached', selesai)
      bot.removeListener('path_update', cekGagal)
    }

    // Jika berhasil sampai tujuan
    const selesai = () => {
      bersihkanListener()
      resolve(true)
    }

    // Jika saat di jalan otaknya sadar tidak ada rute
    const cekGagal = (r) => {
      if (r.status === 'noPath') {
        bersihkanListener()
        bot.pathfinder.setGoal(null) // Hentikan paksa
        reject(new Error('noPath'))
      }
    }

    // Pasang 'telinga' untuk mendengarkan status pergerakan
    bot.once('goal_reached', selesai)
    bot.on('path_update', cekGagal)
  })
}

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  const defaultMove = new Movements(bot) 
  defaultMove.allowFreeMotion = true  // Kunci pergerakan luwes
  defaultMove.allowParkour = true     
  defaultMove.allow1by1towers = false 
  defaultMove.canDig = false          
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sistem Navigasi Anti-Stuck Aktif!')
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
          // MENGGUNAKAN FUNGSI BARU KITA
          await jalanAman(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1))
          await bot.dig(targetBlock);
          hasChoppedSomething = true; 
        } catch (err) {
          if (err.message === 'noPath') {
            bot.chat('Aku melihat kayunya, tapi tidak ada jalan yang aman untuk ke sana.');
          } else {
            bot.chat('Tanganku tidak sampai ke sisa kayunya.');
          }
          break; // Berhenti menebang pohon ini
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
            // MENGGUNAKAN FUNGSI BARU KITA UNTUK MENGANTAR
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

bot.on('error', (err) => console.log(err))