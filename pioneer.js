const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

bot.loadPlugin(pathfinder)

// === SISTEM STATUS KERJA ===
// Variabel ini mencegah bot kebingungan jika disuruh tebang berkali-kali secara bersamaan
let isWorking = false 

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  const defaultMove = new Movements(bot, bot.registry)
  
  // === KLINIK FISIOTERAPI: TWEAK OTOT KAKI ===
  defaultMove.canDig = false     
  defaultMove.allowParkour = true 
  
  // TWEAK 1: Matikan fitur lari (Sprint). 
  defaultMove.allowSprints = true 
  
  // TWEAK 2: Atur batas berani turun (Max Drop).
  defaultMove.maxDropDown = 3      
  
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Sesi Fisioterapi Selesai. Otot kakiku sudah diperbaiki, Bos!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  bot.pathfinder.setGoal(null) 
  isWorking = false // Mereset status kerja saat mati
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
    isWorking = false // Paksa reset status kerja
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
    // Cek dulu apakah kayu sudah benar-benar hilang dari tas bot
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

  // === FITUR MENEBANG (TARGET 10 KAYU & ANTI-MEMATUNG) ===
  // === FITUR MENEBANG (DENGAN TARGET DINAMIS) ===
  else if (message.startsWith('tebang')) {
    if (isWorking) {
      bot.chat('Sabar Bos, aku masih ngerjain tugas sebelumnya! Ketik "berhenti" kalau mau membatalkan.')
      return
    }

    isWorking = true 
    
    // 1. MENGAMBIL ANGKA DARI CHAT BOS
    let targetKayu = 10; // Angka default (misal Bos cuma ketik "tebang" tanpa angka)
    const kata = message.split(' '); // Memecah kalimat berdasarkan spasi
    
    // Jika ada kata kedua setelah "tebang"
    if (kata.length > 1) {
      const angkaDiminta = parseInt(kata[1], 10);
      
      // Cek apakah kata kedua itu benar-benar angka dan lebih dari 0
      if (!isNaN(angkaDiminta) && angkaDiminta > 0) {
        targetKayu = angkaDiminta;
      } else {
        bot.chat('Perintahnya aneh Bos. Aku tebang target standar (10 kayu) aja ya.');
      }
    }

    let ignoredBlocks = []; // Memori blok yang tidak bisa dijangkau

    bot.chat(`Siap laksanakan! Mencari minimal ${targetKayu} kayu...`)
    
    try {
      let hasChoppedSomething = false

      while (true) {
        // Cek jumlah kayu di tas
        const logs = bot.inventory.items().filter(item => item.name.includes('log'))
        let kayuTerkumpul = logs.reduce((total, item) => total + item.count, 0)

        // Berhenti jika sudah mencapai target yang diminta Bos
        if (kayuTerkumpul >= targetKayu) {
          bot.chat(`Target tercapai! Mengumpulkan ${kayuTerkumpul} kayu.`)
          hasChoppedSomething = true
          break
        }

        // Cari blok kayu, abaikan yang ada di daftar hitam, jarak mata 32 blok
        const targetBlock = bot.findBlock({
          matching: (block) => block.name.includes('log') && !ignoredBlocks.includes(block.position.toString()),
          maxDistance: 32 
        })

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
          // Jika macet karena sistem parkour kita mengambil alih (GoalChanged)
          if (err.message === 'GoalChanged' || err.name === 'GoalChanged') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; // Ulangi mendekati pohon itu lagi
          } else {
            bot.chat('Blok ini sulit dijangkau, cari yang lain...')
            ignoredBlocks.push(targetBlock.position.toString());
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // TAHAP MENGANTAR
      if (hasChoppedSomething) {
        bot.chat('Memungut sisa kayu yang jatuh...')
        await new Promise(resolve => setTimeout(resolve, 1500))

        const targetPlayer = bot.players[username]?.entity
        if (targetPlayer) {
          bot.chat(`OTW mengantar kayu ke ${username}!`)
          
          try {
            await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2))
            await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0))
          } catch (e) {
             // Abaikan jika diganggu parkour saat mengantar
          }

          const logs = bot.inventory.items().filter(item => item.name.includes('log'))
          
          if (logs.length > 0) {
            for (const log of logs) {
              await bot.tossStack(log) 
              await new Promise(resolve => setTimeout(resolve, 500)) // Jeda melempar
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
        isWorking = false // Reset kalau sama sekali tidak dapat kayu
      }
    } catch (error) {
      bot.chat('Duh, ada error sistem.')
      console.log(error)
      isWorking = false
    } 
  }
})

let posisiTerakhir = null;
let waktuMacet = 0;
let sedangPenyelamatan = false;

bot.on('physicsTick', async () => {
  // Hanya aktif jika punya tujuan dan tidak sedang diselamatkan
  if (bot.pathfinder.goal && !sedangPenyelamatan) {
    
    const posisiSekarang = bot.entity.position.clone();
    
    if (posisiTerakhir) {
      const jarakGerak = posisiSekarang.distanceTo(posisiTerakhir);
      
      // KUNCI LOGIKA BARU: 
      // Hanya hitung macet JIKA bot sedang berusaha "Maju" (W ditekan) TAPI tidak berpindah tempat.
      // Kalau dia diam karena sedang mikir rute atau sedang menebang, waktuMacet tidak bertambah!
      if (bot.controlState.forward && jarakGerak < 0.05) {
        waktuMacet++;
      } else {
        waktuMacet = 0; // Reset jika lancar jalan atau memang sedang sengaja diam
      }
    }
    
    posisiTerakhir = posisiSekarang;

    // Toleransi dinaikkan sedikit ke 10 tick (0.5 detik) agar aman dari lag server
    if (waktuMacet > 10) {
      sedangPenyelamatan = true;
      
      // Matikan pesan ini biar layar bersih
      // bot.chat('Waduh, Pathfinder-ku stuck! Aktifkan Auto-Parkour...');
      
      // 1. Simpan & Matikan Pathfinder
      const tujuanBos = bot.pathfinder.goal;
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      
      // 2. Eksekusi Parkour Sakty
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
      
      // 3. Kembalikan Pathfinder
      // Pastikan tujuanBos tidak kosong sebelum dikembalikan
      if (tujuanBos) {
        bot.pathfinder.setGoal(tujuanBos);
      }
      
      waktuMacet = 0;
      sedangPenyelamatan = false;
    }
  } 
  else {
    // Reset semua jika bot sedang santai (tidak ada perintah)
    posisiTerakhir = null;
    waktuMacet = 0;
  }
});

bot.on('error', (err) => console.log(err))