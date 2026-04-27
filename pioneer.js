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
  // Bot akan jalan santai. Ini memberi otaknya cukup waktu untuk 
  // mendeteksi blok di depan dan melompat tanpa menabrak duluan.
  defaultMove.allowSprints = true 
  
  // TWEAK 2: Atur batas berani turun (Max Drop).
  // Kadang bot ragu melompat turun kalau medannya berundak. 
  // Kita set agar dia berani lompat turun maksimal 3 blok (biar gak mati kena fall damage).
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
    
    // Tekan tombol spasi
    bot.setControlState('jump', true);
    
    // Tahan spasi selama 300 milidetik (waktu standar Minecraft untuk lompatan penuh)
    setTimeout(() => {
      // Lepas tombol spasi
      bot.setControlState('jump', false);
    }, 300);
  }

  // === FITUR TES LOMPAT SAMBIL MAJU ===
  // === FITUR TES LOMPAT MAJU (Dengan Ancang-ancang Otomatis) ===
  // === FITUR TES LOMPAT MAJU (Auto-Positioning Sempurna) ===
  else if (message === 'lompat maju') {
    bot.chat('Menganalisis jarak... Mencari posisi parkour ideal.');
    
    // 1. Kunci pandangan ke arah Bos
    const target = bot.players[username]?.entity;
    if (target) {
      await bot.lookAt(target.position.offset(0, 1.5, 0));
    }

    // 2. PENYESUAIAN JARAK (Jika terlalu jauh)
    // Kalau tidak nempel tembok, berarti terlalu jauh. Maju dulu!
    if (!bot.entity.isCollidedHorizontally) {
      bot.chat('Terlalu jauh. Aku jalan maju dulu sampai ketemu bloknya...');
      bot.setControlState('forward', true);
      
      let waktuPencarian = 0;
      // Loop: Tunggu sampai bot menabrak tembok (Maksimal 3 detik agar tidak bablas)
      while (!bot.entity.isCollidedHorizontally && waktuPencarian < 60) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Cek sensor setiap 50 milidetik
        waktuPencarian++;
      }
      // Begitu nempel, langsung rem!
      bot.setControlState('forward', false);
    }

    // 3. AMBIL ANCANG-ANCANG (Mundur selangkah dari tembok)
    // (Di tahap ini bot dipastikan sudah menempel di tembok berkat langkah 2)
    bot.chat('Nempel tembok! Mundur dikit buat ambil ancang-ancang...');
    bot.setControlState('back', true);
    await new Promise(resolve => setTimeout(resolve, 200)); // Mundur presisi 200ms
    bot.setControlState('back', false);
    
    // Jeda sebentar menstabilkan keseimbangan fisik
    await new Promise(resolve => setTimeout(resolve, 50));

    // 4. EKSEKUSI PARKOUR PRO
    bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 50)); // Angkat badan
    
    bot.setControlState('forward', true); 
    await new Promise(resolve => setTimeout(resolve, 250)); // Terbang ke depan
    
    bot.setControlState('jump', false); 
    await new Promise(resolve => setTimeout(resolve, 300)); // Mendarat
    
    bot.setControlState('forward', false); // Rem total
    bot.chat('Hap! Parkour berhasil dari jarak mana pun.');
  }

  // === FITUR KONFIRMASI (BARU) ===
  else if (message === 'menerima kayu') {
    bot.pathfinder.setGoal(null) // Menghentikan gerakan bot sepenuhnya
    isWorking = false            // Memastikan bot siap kerja lagi
    bot.chat('Sama-sama, Bos! Tugas telah selesai dan sistem di-reset. Ketik "tebang" lagi jika ingin aku mencari pohon dari awal.')
  }

  // === FITUR MENEBANG & MENGANTAR KAYU ===
  else if (message === 'tebang') {
    // Mengecek apakah bot masih ngerjain tugas sebelumnya
    if (isWorking) {
      bot.chat('Sabar Bos, aku masih ngerjain tugas sebelumnya! Ketik "berhenti" kalau mau membatalkan.')
      return
    }

    // Mengunci status bot menjadi "Sedang Bekerja"
    isWorking = true 
    bot.chat('Siap laksanakan! Mulai mencari pohon dari awal...')
    
    let isChopping = true

    try {
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
      await new Promise(resolve => setTimeout(resolve, 1500))

      // 3. Mencari Bos dan Mengantar Barang
      const targetPlayer = bot.players[username]?.entity
      if (targetPlayer) {
        bot.chat(`OTW mengantar kayu ke ${username}!`)
        
        await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2))
        await bot.lookAt(targetPlayer.position.offset(0, 1.5, 0))

        const logs = bot.inventory.items().filter(item => item.name.includes('log'))
        
        if (logs.length > 0) {
          for (const log of logs) {
            await bot.tossStack(log) 
          }
          // Mengingatkan Bos untuk konfirmasi
          bot.chat('Ini hasil tebangannya, Bos! Tolong ketik "menerima kayu" untuk menyelesaikan tugas ini.')
        } else {
          bot.chat('Maaf Bos, kayunya tidak masuk ke inventory-ku (mungkin jatuh ke tempat yang tidak bisa kuambil).')
          // Tetap ingatkan konfirmasi kalau gagal ambil
          bot.chat('Ketik "menerima kayu" agar aku bisa reset tugas.')
        }
      } else {
        bot.chat('Bos di mana? Aku tidak melihatmu. Ketik "menerima kayu" untuk mereset tugasku.')
      }
    } catch (error) {
      bot.chat('Duh, aku nyangkut di jalan.')
      console.log(error)
    } finally {
      // Menandai proses penebangan sudah selesai secara sistem
      // (Namun bot tetap akan diam menunggu bos mengetik "menerima kayu")
      isWorking = false 
    }
  }
})

bot.on('error', (err) => console.log(err))