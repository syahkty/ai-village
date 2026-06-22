const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

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
    await new Promise(resolve => setTimeout(resolve, 300)); // Fix: 50ms -> 300ms agar mundur ~1.3 blok
    bot.setControlState('back', false);
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Fix: jeda stabilisasi sebelum lompat

    bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 150)); // Fix: 50ms -> 150ms agar bot naik cukup tinggi
    
    bot.setControlState('forward', true); 
    await new Promise(resolve => setTimeout(resolve, 300)); 
    
    bot.setControlState('jump', false); 
    await new Promise(resolve => setTimeout(resolve, 250)); 
    
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
// === SISTEM AUTO-JUMP BEDROCK EDITION V1 (Proaktif) ===
// ====================================================================
// Terinspirasi dari auto-jump Minecraft Bedrock yang lompat SEBELUM nabrak,
// bukan SESUDAH stuck. Sistem ini punya 2 layer:
//   Layer 1: Auto-Jump Proaktif — deteksi obstacle setiap tick, lompat instan
//   Layer 2: Rescue Fallback — jika benar-benar stuck (lubang, terkurung, dll)
// ====================================================================

// --- Layer 1: Auto-Jump Proaktif (Bedrock-style) ---
let lastAutoJumpY = 0;

function cekBlokPadat(pos) {
  if (!pos) return false;
  const blok = bot.blockAt(pos);
  if (!blok) return false;
  // Blok padat = bukan udara, bukan air, bukan tanaman kecil, bukan blok transparan yg bisa dilewati
  return blok.boundingBox === 'block';
}

bot.on('physicsTick', () => {
  // Hanya aktif kalau bot sedang bergerak (ada goal / ada input forward)
  if (!bot.pathfinder.goal && !bot.getControlState('forward')) return;
  // Jangan ganggu kalau sedang rescue
  if (sedangPenyelamatan) return;
  // Jangan lompat kalau sedang di udara (belum mendarat dari lompat sebelumnya)
  if (!bot.entity.onGround) return;

  const pos = bot.entity.position;
  const vel = bot.entity.velocity;

  // Hitung arah gerak dari velocity. Kalau velocity terlalu kecil, pakai arah pandang (yaw)
  let dx = vel.x;
  let dz = vel.z;
  const speed = Math.sqrt(dx * dx + dz * dz);
  
  if (speed < 0.01) {
    // Velocity terlalu kecil, pakai arah pandang bot
    const yaw = bot.entity.yaw;
    dx = -Math.sin(yaw);
    dz = -Math.cos(yaw);
  } else {
    // Normalisasi ke unit vector
    dx /= speed;
    dz /= speed;
  }

  // Cek titik 0.6 blok di depan (tepat di tepi hitbox bot, radius hitbox = 0.3)
  const cekX = Math.floor(pos.x + dx * 0.6);
  const cekZ = Math.floor(pos.z + dz * 0.6);
  const kakinya = Math.floor(pos.y);      // Level kaki (Y)
  

  // === DETEKSI OBSTACLE ===
  // Cek apakah ada blok PADAT di level kaki (setinggi kaki bot)
  const blokKaki = cekBlokPadat(new Vec3(cekX, kakinya, cekZ));
  
  if (!blokKaki) return; // Tidak ada halangan, skip

  // === CEK BISA DILOMPATI ===
  // Blok di atas obstacle harus kosong (2 blok ruang gerak agar badan bot muat)
  const atasObstacle1 = cekBlokPadat(new Vec3(cekX, kakinya + 1, cekZ));
  const atasObstacle2 = cekBlokPadat(new Vec3(cekX, kakinya + 2, cekZ));
  
  // Juga cek ruang di atas kepala bot (kalau ada langit-langit rendah jangan lompat)
  const atasKepala = cekBlokPadat(new Vec3(Math.floor(pos.x), kakinya + 2, Math.floor(pos.z)));

  if (!atasObstacle1 && !atasObstacle2 && !atasKepala) {
    // Obstacle 1 blok tinggi, ada ruang di atas → LOMPAT!
    bot.setControlState('jump', true);
    // Release jump setelah 1 tick agar tidak lompat berulang
    setImmediate(() => {
      bot.setControlState('jump', false);
    });
  }
});

// --- Layer 2: Rescue Fallback (untuk stuck yang lebih parah) ---
let posisiTerakhir = null;
let waktuMacet = 0;
let sedangPenyelamatan = false;
let percobaanPenyelamatan = 0;
let tickCountRescue = 0;
let isProcessingRescue = false;

bot.on('physicsTick', async () => {
  if (isProcessingRescue) return;
  
  if (bot.pathfinder.goal && !sedangPenyelamatan) {
    tickCountRescue++;
    
    // Cek setiap 20 tick (1 detik) — lebih lama dari V6 karena Layer 1 sudah handle lompat ringan
    if (tickCountRescue >= 20) {
      const posisiSekarang = bot.entity.position.clone();
      
      if (posisiTerakhir) {
        const dx = posisiSekarang.x - posisiTerakhir.x;
        const dz = posisiSekarang.z - posisiTerakhir.z;
        const jarakHorizontal = Math.sqrt(dx * dx + dz * dz);
        
        if (jarakHorizontal < 0.3) { // Lebih ketat: 0.3 blok karena Layer 1 sudah bantu
          waktuMacet++;
        } else {
          waktuMacet = 0;
        }
      }
      
      posisiTerakhir = posisiSekarang;
      tickCountRescue = 0;
    }

    // Sudah 3 detik stuck (3x cek @ 1 detik interval)
    if (waktuMacet > 3) {
      sedangPenyelamatan = true;
      isProcessingRescue = true;
      percobaanPenyelamatan++;
      
      const tujuanBos = bot.pathfinder.goal;
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      
      // --- TEBAS DAUN OTOMATIS ---
      // Cek daun di sekitar tubuh bot (penyebab stuck paling umum di hutan)
      const daunNyangkut = bot.findBlock({
        matching: (block) => block && block.name && block.name.includes('leaves'),
        maxDistance: 2
      });
      
      if (daunNyangkut) {
        if (percobaanPenyelamatan <= 2) {
          bot.chat('Daun menghalangi, pangkas dulu!');
        }
        try { await bot.dig(daunNyangkut); } catch(e) {}
        // Setelah tebas daun, langsung coba lanjut tanpa manuver
        if (tujuanBos) bot.pathfinder.setGoal(tujuanBos);
        waktuMacet = 0;
        sedangPenyelamatan = false;
        isProcessingRescue = false;
        return;
      }

      // --- STRATEGI ESKALASI ---
      if (percobaanPenyelamatan <= 2) {
        // Percobaan 1-2: Lompat mundur + maju (mirip Step Up yang lebih kuat)
        bot.setControlState('back', true);
        await new Promise(resolve => setTimeout(resolve, 400));
        bot.setControlState('back', false);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        bot.setControlState('jump', true);
        bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 400));
        
        bot.setControlState('jump', false);
        await new Promise(resolve => setTimeout(resolve, 200));
        bot.clearControlStates();
        
      } else if (percobaanPenyelamatan <= 4) {
        // Percobaan 3-4: Geser ke samping + lompat (cari rute alternatif)
        bot.chat('Aku cari jalan lain...');
        const arah = percobaanPenyelamatan % 2 === 0 ? 'left' : 'right';
        
        bot.setControlState('back', true);
        bot.setControlState(arah, true);
        await new Promise(resolve => setTimeout(resolve, 500));
        bot.clearControlStates();
        
        bot.setControlState('jump', true);
        bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 400));
        bot.clearControlStates();
        
      } else {
        // Percobaan 5+: Reroute total — paksa pathfinder hitung ulang dari posisi baru
        bot.chat('Jalannya buntu total! Reroute jalur...');
        
        // Mundur jauh + geser
        const arah = Math.random() > 0.5 ? 'left' : 'right';
        bot.setControlState('back', true);
        bot.setControlState(arah, true);
        await new Promise(resolve => setTimeout(resolve, 800));
        bot.clearControlStates();
        
        // Reset counter agar mulai dari strategi 1 lagi di posisi baru
        percobaanPenyelamatan = 0;
      }
      
      // Lanjutkan ke tujuan semula
      if (tujuanBos) {
        bot.pathfinder.setGoal(tujuanBos, true); // true = paksa recalculate path
      }
      
      waktuMacet = 0;
      sedangPenyelamatan = false;
      isProcessingRescue = false;
    }
  } 
  else {
    posisiTerakhir = null;
    waktuMacet = 0;
    if (!bot.pathfinder.goal && !sedangPenyelamatan) {
      percobaanPenyelamatan = 0;
    }
  }
});

bot.on('error', (err) => console.log(err))