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

// === FUNGSI LOGISTIK DESA ===
async function simpanKePeti() {
  bot.chat('Mencari peti desa terdekat...');
  
  // 1. Cari peti (menggunakan ID blok chest)
  const chestId = bot.registry.blocksByName.chest.id;
  const petiPositions = bot.findBlocks({
    matching: chestId,
    maxDistance: 32,
    count: 1
  });

  if (petiPositions.length === 0) {
    bot.chat('Aduh, tidak ada peti di sekitarku (radius 32 blok). Kayunya kusimpan di tas ya.');
    return false;
  }

  const petiBlok = bot.blockAt(petiPositions[0]);

  // 2. Jalan menuju peti
  try {
    bot.chat('Peti ditemukan! Meluncur ke sana...');
    // Jarak 1.5 agar cukup dekat untuk membuka peti
    await bot.pathfinder.goto(new goals.GoalNear(petiBlok.position.x, petiBlok.position.y, petiBlok.position.z, 1.5));
    await bot.lookAt(petiBlok.position);
  } catch (err) {
    bot.chat('Aduh, jalanku menuju peti terhalang sesuatu...');
    return false;
  }

  // 3. Buka peti dan pindahkan kayu
  try {
    const peti = await bot.openChest(petiBlok);
    bot.chat('Membuka peti desa...');
    
    const semuaItem = bot.inventory.items();
    let adaKayu = false;

    for (const item of semuaItem) {
      if (item.name.includes('log')) {
        adaKayu = true;
        // Pindahkan ke peti
        await peti.deposit(item.type, null, item.count);
        await new Promise(resolve => setTimeout(resolve, 500)); // Jeda biar server tidak mengira bot spam
      }
    }
    
    peti.close();
    
    if (adaKayu) {
      bot.chat('Selesai! Semua kayu sudah aman di dalam peti desa.');
    } else {
      bot.chat('Peti sudah kututup, tapi tadi tidak ada kayu di tasku.');
    }
    return true;
  } catch (err) {
    bot.chat('Gagal memindahkan barang ke peti: ' + err.message);
    return false;
  }
}

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

    // Cek apakah bot sedang membawa kayu
    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    
    if (logs.length > 0) {
      bot.chat(`Meluncur Bos! Kebetulan aku bawa hasil tebangan, mau kuantar sekalian.`);
      try {
        // Dekati Bos
        await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, 2));
        await bot.lookAt(targetPlayer.entity.position.offset(0, 1.5, 0));
        
        // Cek jarak untuk memastikan bot benar-benar sampai
        const jarakKeBos = bot.entity.position.distanceTo(targetPlayer.entity.position);
        if (jarakKeBos <= 4) {
          for (const log of logs) {
            await bot.tossStack(log);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          bot.chat('Ini kayunya Bos! Jangan lupa ketik "menerima kayu" ya.');
        } else {
          bot.chat(`Bos, aku terhalang di tengah jalan! (Masih berjarak ${Math.round(jarakKeBos)} blok).`);
        }
      } catch (e) {
        bot.chat('Aduh aku nyangkut di jalan. Samperin aku atau panggil "sini" lagi ya.');
      }
    } else {
      bot.chat(`Meluncur ke arah ${username}!`)
      bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer.entity, 3), true)
    }
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
          
          // 1. PENDEKATAN FLEKSIBEL: Jarak 2 agar tidak nyangkut saat menebang log di atas (Y+1)
          await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2))
          // Maju sedikit untuk memastikan item jatuh langsung terambil
          bot.setControlState('forward', true)
          await new Promise(resolve => setTimeout(resolve, 200))
          bot.setControlState('forward', false)
          
          await bot.dig(targetBlock)
        } catch (err) {
          if (err?.message === 'GoalChanged' || err?.name === 'GoalChanged') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; 
          } else {
            // 2. INSTING TEBAS DAUN: Jika gagal mendekat/menebang, pangkas daun yang menghalangi
            const daun = bot.findBlock({
              matching: (block) => block && block.name && block.name.includes('leaves'),
              maxDistance: 4 
            });

            if (daun) {
              bot.chat('Daunnya menghalangi! Aku pangkas daunnya dulu...');
              try {
                await bot.dig(daun); // Tebas daunnya
                await new Promise(resolve => setTimeout(resolve, 500));
                continue; // Coba dekati dan tebang kayunya lagi setelah jalan terbuka
              } catch (e) {
                // Biarkan kalau gagal nebas daun
              }
            }

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

        // Panggil fungsi simpan ke peti
        const berhasilSimpan = await simpanKePeti();
        
        if (!berhasilSimpan) {
           bot.chat('Karena gagal masuk peti, ketik "menerima kayu" ya Bos kalau mau ambil manual dariku.');
        }
        
        isWorking = false; // Reset status agar bot bisa menerima perintah baru
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
// === SISTEM MONITORING ANTI-STUCK V6 (Anti-Looping) ===
// ====================================================================
let posisiTerakhir = null;
let waktuMacet = 0;
let sedangPenyelamatan = false;
let percobaanPenyelamatan = 0;
let tickCount = 0;

bot.on('physicsTick', async () => {
  if (bot.pathfinder.goal && !sedangPenyelamatan) {
    tickCount++;
    
    // Cek setiap 10 tick (0.5 detik) agar gerakan lompat (sumbu Y) tidak mengecoh deteksi
    if (tickCount >= 10) {
      const posisiSekarang = bot.entity.position.clone();
      
      if (posisiTerakhir) {
        const jarakGerak = posisiSekarang.distanceTo(posisiTerakhir);
        
        // Jika dalam 0.5 detik bot tidak berpindah lebih dari 0.5 blok (artinya nyangkut/loncat di tempat)
        if (jarakGerak < 0.5) {
          waktuMacet++;
        } else {
          waktuMacet = 0; 
          percobaanPenyelamatan = 0; // Reset jika bot sudah jalan normal
        }
      }
      
      posisiTerakhir = posisiSekarang;
      tickCount = 0;
    }

    if (waktuMacet > 4) { // Berarti sudah 2 detik nyangkut di radius < 0.5 blok
      sedangPenyelamatan = true;
      percobaanPenyelamatan++;
      
      const tujuanBos = bot.pathfinder.goal;
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      
      // INSTING TEBAS DAUN SAAT NYANGKUT: Cek daun yang menempel di sekitar tubuh bot
      const daunNyangkut = bot.findBlock({
        matching: (block) => block && block.name && block.name.includes('leaves'),
        maxDistance: 2.5
      });
      
      if (daunNyangkut) {
        if (percobaanPenyelamatan % 2 === 1) {
            bot.chat('Aduh nyangkut daun, pangkas dulu ah!');
        }
        try { await bot.dig(daunNyangkut); } catch(e) {}
      }
      
      if (percobaanPenyelamatan > 2) {
        bot.chat('Jalannya buntu! Aku coba cari jalan memutar...');
        
        // Mundur dan geser untuk mencari rute baru
        const arahAcak = Math.random() > 0.5 ? 'left' : 'right';
        bot.setControlState('back', true);
        bot.setControlState(arahAcak, true);
        await new Promise(resolve => setTimeout(resolve, 600));
        bot.clearControlStates();
        
        if (tujuanBos) {
          // Memaksa pathfinder membuat ulang jalur dari awal
          bot.pathfinder.setGoal(tujuanBos, true); 
        }
        
        waktuMacet = 0;
        sedangPenyelamatan = false;
        return;
      }
      
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
    if (!bot.pathfinder.goal && !sedangPenyelamatan) {
      percobaanPenyelamatan = 0; // Reset jika sudah sampai tujuan / idle
    }
  }
});

bot.on('error', (err) => console.log(err))