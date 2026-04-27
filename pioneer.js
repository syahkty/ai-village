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
  
  const defaultMove = new Movements(bot, bot.registry)
  
  defaultMove.canDig = false     
  defaultMove.allowParkour = true 
  defaultMove.allowSprints = true 
  defaultMove.maxDropDown = 3      
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sesi Fisioterapi Selesai. Otot kakiku sudah diperbaiki, Bos!')
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

  // === FITUR TES LOMPAT MANUAL ===
  else if (message === 'lompat') {
    bot.chat('Hiaaa! (Tes lompat di tempat)');
    bot.setControlState('jump', true);
    setTimeout(() => {
      bot.setControlState('jump', false);
    }, 300);
  }

  // === FITUR TES LOMPAT MAJU (Auto-Positioning Sempurna) ===
  else if (message === 'lompat maju') {
    bot.chat('Menganalisis jarak... Mencari posisi parkour ideal.');
    
    const target = bot.players[username]?.entity;
    if (target) {
      await bot.lookAt(target.position.offset(0, 1.5, 0));
    }

    if (!bot.entity.isCollidedHorizontally) {
      bot.chat('Terlalu jauh. Aku jalan maju dulu sampai ketemu bloknya...');
      bot.setControlState('forward', true);
      
      let waktuPencarian = 0;
      while (!bot.entity.isCollidedHorizontally && waktuPencarian < 60) {
        await new Promise(resolve => setTimeout(resolve, 50)); 
        waktuPencarian++;
      }
      bot.setControlState('forward', false);
    }

    bot.chat('Nempel tembok! Mundur dikit buat ambil ancang-ancang...');
    bot.setControlState('back', true);
    await new Promise(resolve => setTimeout(resolve, 50)); 
    bot.setControlState('back', false);
    
    await new Promise(resolve => setTimeout(resolve, 50));

    bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    bot.setControlState('forward', true); 
    await new Promise(resolve => setTimeout(resolve, 250)); 
    
    bot.setControlState('jump', false); 
    await new Promise(resolve => setTimeout(resolve, 300)); 
    
    bot.setControlState('forward', false); 
    bot.chat('Hap! Parkour berhasil dari jarak mana pun.');
  }

  // === FITUR KONFIRMASI DENGAN PENGECEKAN INVENTORY ===
  else if (message === 'menerima kayu') {
    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    let sisaKayu = logs.reduce((total, item) => total + item.count, 0)

    if (sisaKayu > 0) {
      bot.chat(`Tunggu Bos! Masih ada ${sisaKayu} kayu di tas-ku. Tolong ambil dulu kayunya yang jatuh, atau kosongkan tas-ku, baru ketik "menerima kayu".`)
    } else {
      bot.pathfinder.setGoal(null) 
      isWorking = false            
      bot.chat('Sip! Inventory-ku sudah bersih. Tugas selesai dan sistem siap menerima perintah baru.')
    }
  }

  // === FITUR MENEBANG (RADAR ID SUPER CEPAT & ANTI-BUTA) ===
  else if (message.startsWith('tebang')) {
    if (isWorking) {
      bot.chat('Sabar Bos, aku masih ngerjain tugas sebelumnya! Ketik "berhenti" kalau mau membatalkan.')
      return
    }

    isWorking = true 
    let targetKayu = 10; 
    const kata = message.split(' '); 
    
    if (kata.length > 1) {
      const angkaDiminta = parseInt(kata[1], 10);
      if (!isNaN(angkaDiminta) && angkaDiminta > 0) {
        targetKayu = angkaDiminta;
      } else {
        bot.chat('Perintahnya aneh Bos. Aku tebang target standar (10 kayu) aja ya.');
      }
    }

    let ignoredBlocks = []; 

    // AMBIL SEMUA ID KAYU YANG ADA DI SERVER (Radar ID)
    const logBlockIds = bot.registry.blocksArray.filter(b => b.name.includes('log')).map(b => b.id);

    bot.chat(`Siap laksanakan! Mencari minimal ${targetKayu} kayu...`)
    
    try {
      let hasChoppedSomething = false

      while (true) {
        // Cek isi tas
        const logs = bot.inventory.items().filter(item => item.name.includes('log'))
        let kayuTerkumpul = logs.reduce((total, item) => total + item.count, 0)

        if (kayuTerkumpul >= targetKayu) {
          bot.chat(`Target tercapai! Mengumpulkan ${kayuTerkumpul} kayu.`)
          hasChoppedSomething = true
          break
        }

        // TEKNIK RADAR: Cari 50 koordinat kayu terdekat menggunakan ID
        const targetPositions = bot.findBlocks({
          matching: logBlockIds,
          maxDistance: 32,
          count: 50
        });

        // Seleksi 1 koordinat kayu yang belum masuk daftar hitam
        let targetBlock = null;
        for (const pos of targetPositions) {
          const posKey = `${pos.x},${pos.y},${pos.z}`;
          if (!ignoredBlocks.includes(posKey)) {
            targetBlock = bot.blockAt(pos); // Konversi koordinat jadi blok
            break; // Dapatkan yang pertama (paling dekat)
          }
        }

        if (!targetBlock) {
          bot.chat(`Pohon di sekitarku habis. Cuma dapat ${kayuTerkumpul} kayu.`)
          if (kayuTerkumpul > 0) hasChoppedSomething = true
          break
        }

        try {
          const x = targetBlock.position.x
          const y = targetBlock.position.y
          const z = targetBlock.position.z
          
          await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1))
          await bot.dig(targetBlock)
        } catch (err) {
          if (err?.message === 'GoalChanged' || err?.name === 'GoalChanged') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; 
          } else {
            bot.chat('Blok ini sulit dijangkau, cari yang lain...')
            // Format daftar hitam yang aman
            const posKey = `${targetBlock.position.x},${targetBlock.position.y},${targetBlock.position.z}`;
            ignoredBlocks.push(posKey);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (hasChoppedSomething) {
        bot.chat('Memungut sisa kayu yang jatuh...')
        await new Promise(resolve => setTimeout(resolve, 1500))

        const targetPlayer = bot.players[username]?.entity
        if (targetPlayer) {
          bot.chat(`OTW mengantar kayu ke Bos!`)
          
          try {
            await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2))
            await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0))
          } catch (e) {
             // Abaikan tabrakan saat antar
          }

          const logs = bot.inventory.items().filter(item => item.name.includes('log'))
          
          if (logs.length > 0) {
            for (const log of logs) {
              await bot.tossStack(log) 
              await new Promise(resolve => setTimeout(resolve, 500)) 
            }
            bot.chat('Ini hasil tebangannya, Bos! Tolong ambil lalu ketik "menerima kayu".')
          } else {
            bot.chat('Maaf Bos, kayunya tidak masuk ke inventory-ku.')
            bot.chat('Ketik "menerima kayu" agar aku bisa reset tugas.')
          }
        } else {
          bot.chat('Bos di mana? Aku tidak melihatmu. Ketik "menerima kayu" untuk mereset tugasku.')
        }
      } else {
        isWorking = false 
      }
    } catch (error) {
      bot.chat('Duh, ada error sistem (Cek Terminal VPS).')
      console.log(error)
      isWorking = false
    } 
  }
})

// ====================================================================
// === SISTEM MONITORING ANTI-STUCK V4 (Anti-Looping) ===
// ====================================================================
let posisiTerakhir = null;
let waktuMacet = 0;
let sedangPenyelamatan = false;

bot.on('physicsTick', async () => {
  if (bot.pathfinder.goal && !sedangPenyelamatan) {
    
    const posisiSekarang = bot.entity.position.clone();
    
    if (posisiTerakhir) {
      const jarakGerak = posisiSekarang.distanceTo(posisiTerakhir);
      
      if (bot.controlState.forward && jarakGerak < 0.05) {
        waktuMacet++;
      } else {
        waktuMacet = 0; 
      }
    }
    
    posisiTerakhir = posisiSekarang;

    if (waktuMacet > 10) {
      sedangPenyelamatan = true;
      
      const tujuanBos = bot.pathfinder.goal;
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      
      bot.setControlState('back', true);
      await new Promise(resolve => setTimeout(resolve, 150)); 
      bot.setControlState('back', false);
      
      await new Promise(resolve => setTimeout(resolve, 50)); 
      
      bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 50)); 
      
      bot.setControlState('forward', true); 
      await new Promise(resolve => setTimeout(resolve, 300)); 
      
      bot.setControlState('jump', false); 
      await new Promise(resolve => setTimeout(resolve, 200)); 
      
      bot.clearControlStates(); 
      
      if (tujuanBos) {
        bot.pathfinder.setGoal(tujuanBos);
      }
      
      waktuMacet = 0;
      sedangPenyelamatan = false;
    }
  } 
  else {
    posisiTerakhir = null;
    waktuMacet = 0;
  }
});

bot.on('error', (err) => console.log(err))