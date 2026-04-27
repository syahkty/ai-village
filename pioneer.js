const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(pathfinder)

// === SISTEM STATUS KERJA ===
let isWorking = false 

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  // === KONFIGURASI PATHFINDER ALA GITHUB ===
  const defaultMove = new Movements(bot) // Otomatis mendeteksi registry
  
  defaultMove.allowFreeMotion = true  // Membuat jalan dan lompatan sangat luwes (tidak kaku)
  defaultMove.allowParkour = true     // Boleh melompat
  defaultMove.allow1by1towers = false // Dilarang membangun pilar tanah ke atas
  defaultMove.canDig = false          // Jangan hancurkan blok saat jalan
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sistem Navigasi FreeMotion Aktif. Aku siap melompat dengan luwes!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  bot.pathfinder.setGoal(null) 
  isWorking = false 
  bot.chat('Waduh, aku mati! Mereset ulang posisiku...')
})

bot.on('chat', async (username, message) => {
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
    bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 3), true)
  } 
  
  else if (message === 'berhenti') {
    bot.pathfinder.setGoal(null)
    isWorking = false 
    bot.chat('Rem mendadak. Aku berhenti dan siap menerima perintah baru.')
  }

  // === FITUR KONFIRMASI ===
  else if (message === 'menerima kayu') {
    bot.pathfinder.setGoal(null) 
    isWorking = false            
    bot.chat('Sama-sama, Bos! Tugas telah selesai dan sistem di-reset.')
  }

  // === FITUR MENEBANG & MENGANTAR KAYU ===
  else if (message === 'tebang') {
    if (isWorking) {
      bot.chat('Sabar Bos, aku masih ngerjain tugas sebelumnya!');
      return;
    }

    isWorking = true; 
    bot.chat('Siap laksanakan! Memindai area sekitar untuk mencari pohon...');
    
    let isChopping = true;
    let hasChoppedSomething = false; 

    try {
      while (isChopping) {
        const targetBlock = bot.findBlock({
          matching: (block) => block.name.includes('log'),
          maxDistance: 32 // Radar 32 blok
        });

        if (!targetBlock) {
          if (hasChoppedSomething) {
            bot.chat('Pohonnya sudah habis ditebang!');
          } else {
            bot.chat('Maaf Bos, tidak ada pohon (blok kayu) dalam jarak dekat (radius 32 blok). Tugasku batal ya.');
            isWorking = false; 
          }
          isChopping = false;
          break;
        }

        try {
          const x = targetBlock.position.x;
          const y = targetBlock.position.y;
          const z = targetBlock.position.z;
          
          await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1));
          await bot.dig(targetBlock);
          hasChoppedSomething = true; 
        } catch (err) {
          bot.chat('Sisa kayunya di luar jangkauanku (terlalu tinggi atau terhalang).');
          isChopping = false;
          break;
        }
      }

      if (hasChoppedSomething) {
        bot.chat('Tunggu sebentar, aku memungut kayunya yang jatuh...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        const targetPlayer = bot.players[username]?.entity;
        if (targetPlayer) {
          bot.chat(`OTW mengantar kayu ke ${username}!`);
          
          await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2));
          await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0));

          const logs = bot.inventory.items().filter(item => item.name.includes('log'));
          
          if (logs.length > 0) {
            for (const log of logs) {
              await bot.tossStack(log); 
            }
            bot.chat('Ini hasil tebangannya, Bos! Tolong ketik "menerima kayu" untuk mereset tugasku.');
          } else {
            bot.chat('Maaf Bos, kayunya tidak masuk ke inventory-ku. Ketik "menerima kayu" untuk mereset.');
          }
        } else {
          bot.chat('Bos di mana? Aku tidak melihatmu. Ketik "menerima kayu" untuk mereset tugasku.');
        }
      }

    } catch (error) {
      bot.chat('Duh, aku nyangkut di jalan.');
      console.log(error);
    } 
  }
})

bot.on('error', (err) => console.log(err))