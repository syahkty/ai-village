const mineflayer = require('mineflayer')
// Menggunakan loader dari mineflayer-baritone (ashfinder)
const { loader, goals } = require('@miner-org/mineflayer-baritone')
const { Vec3 } = require('vec3')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'PioneerBot'
})

// Memuat plugin navigasi tingkat dewa
bot.loadPlugin(loader)

// === SISTEM STATUS KERJA ===
let isWorking = false 

bot.on('spawn', () => {
  console.log('PioneerBot mendarat dengan aman!')
  
  // Mengaktifkan fitur ajaib Baritone (Ashfinder)
  if (bot.ashfinder) {
    bot.ashfinder.config.breakBlocks = true; // Bot akan menghancurkan daun/tanah yang menghalangi
    bot.ashfinder.config.placeBlocks = true; // Bot akan menaruh blok untuk membuat jembatan/tangga
    console.log('✅ Sistem Ashfinder (Baritone) berhasil dimuat!');
  } else {
    console.log('❌ PERINGATAN: Sistem Ashfinder tidak terdeteksi di dalam bot!');
  }
  
  bot.chat('Sesi Cangkok Otak Baritone Selesai! Aku sudah jadi ahli parkour sekarang, Bos!')
})

bot.on('death', () => {
  console.log('Bot mati. Mereset sistem...')
  if (bot.ashfinder) bot.ashfinder.stop() 
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

  // 2. Jalan menuju peti menggunakan Ashfinder
  try {
    bot.chat('Peti ditemukan! Meluncur ke sana...');
    await bot.ashfinder.goto(new goals.GoalNear(petiBlok.position.x, petiBlok.position.y, petiBlok.position.z, 1.5));
    if (!isWorking) { bot.chat('Batal simpan ke peti karena dihentikan.'); return false; }
    await bot.lookAt(petiBlok.position);
  } catch (err) {
    console.log('⚠️ [DEBUG] Error saat jalan ke peti:', err);
    bot.chat('Aduh, jalanku menuju peti gagal...');
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
        await peti.deposit(item.type, null, item.count);
        await new Promise(resolve => setTimeout(resolve, 500)); 
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
    console.log('⚠️ [DEBUG] Error saat buka peti:', err);
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

    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    
    if (logs.length > 0) {
      bot.chat(`Meluncur Bos! Kebetulan aku bawa hasil tebangan.`);
      try {
        await bot.ashfinder.goto(new goals.GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, 2));
        await bot.lookAt(targetPlayer.entity.position.offset(0, 1.5, 0));
        
        const jarakKeBos = bot.entity.position.distanceTo(targetPlayer.entity.position);
        if (jarakKeBos <= 4) {
          for (const log of logs) {
            await bot.tossStack(log);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          bot.chat('Ini kayunya Bos! Jangan lupa ketik "menerima kayu" ya.');
        } else {
          bot.chat(`Bos, aku terhalang di tengah jalan!`);
        }
      } catch (e) {
        console.log('⚠️ [DEBUG] Error saat antar kayu ke bos:', e);
        bot.chat('Aduh aku nyangkut di jalan.');
      }
    } else {
      bot.chat(`Meluncur ke arah ${username}!`)
      try {
        bot.ashfinder.goto(new goals.GoalFollow(targetPlayer.entity, 3))
      } catch (e) {
         console.log('⚠️ [DEBUG] Error saat jalan ikuti bos:', e);
      }
    }
  } 
  
  // === FITUR BERHENTI DARURAT (EMERGENCY STOP) ===
  else if (message === 'berhenti' || message === 'stop') {
    isWorking = false; // Mematikan izin sistem agar semua perulangan (loop) terhenti
    if (bot.ashfinder) bot.ashfinder.stop(); // Berhenti jalan
    bot.clearControlStates(); // Lepas semua tombol keyboard virtual
    try { bot.stopDigging(); } catch(e) {} // Berhenti memukul blok
    bot.chat('Rem darurat ditarik! Semua aktivitas dan pergerakan dibatalkan secara paksa.');
  }

  // === FITUR DEBUGGING SYSTEM ===
  else if (message === 'debug') {
    bot.chat('Mencetak status debug ke Terminal VPS...');
    console.log('================ DEBUG INFO ================');
    console.log('Status isWorking:', isWorking);
    console.log('Apakah Ashfinder siap?:', bot.ashfinder ? 'Ya' : 'TIDAK (Undefined)');
    console.log('Posisi Bot:', bot.entity.position);
    console.log('Isi Inventory:', bot.inventory.items().map(i => `${i.name} (x${i.count})`).join(', ') || 'Kosong');
    console.log('============================================');
  }

  // === FITUR TES LOMPAT MANUAL ===
  else if (message === 'lompat') {
    bot.chat('Hiaaa! (Tes lompat di tempat)');
    bot.setControlState('jump', true);
    setTimeout(() => {
      bot.setControlState('jump', false);
    }, 300);
  }

  // === FITUR KONFIRMASI DENGAN PENGECEKAN INVENTORY ===
  else if (message === 'menerima kayu') {
    const logs = bot.inventory.items().filter(item => item.name.includes('log'))
    let sisaKayu = logs.reduce((total, item) => total + item.count, 0)

    if (sisaKayu > 0) {
      bot.chat(`Tunggu Bos! Masih ada ${sisaKayu} kayu di tas-ku. Tolong ambil dulu kayunya yang jatuh, atau kosongkan tas-ku, baru ketik "menerima kayu".`)
    } else {
      if (bot.ashfinder) bot.ashfinder.stop() 
      isWorking = false            
      bot.chat('Sip! Inventory-ku sudah bersih. Tugas selesai dan sistem siap menerima perintah baru.')
    }
  }
  

  // === FITUR MENEBANG (RADAR ID SUPER CEPAT) ===
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
    const logBlockIds = bot.registry.blocksArray.filter(b => b.name.includes('log')).map(b => b.id);

    bot.chat(`Siap laksanakan! Mencari minimal ${targetKayu} kayu...`)
    
    try {
      let hasChoppedSomething = false

      // Ubah while (true) menjadi while (isWorking) agar bisa di-break oleh perintah stop
      while (isWorking) {
        const logs = bot.inventory.items().filter(item => item.name.includes('log'))
        let kayuTerkumpul = logs.reduce((total, item) => total + item.count, 0)

        if (kayuTerkumpul >= targetKayu) {
          bot.chat(`Target tercapai! Mengumpulkan ${kayuTerkumpul} kayu.`)
          hasChoppedSomething = true
          break
        }

        const targetPositions = bot.findBlocks({
          matching: logBlockIds,
          maxDistance: 32,
          count: 50
        });

        let targetBlock = null;
        for (const pos of targetPositions) {
          const posKey = `${pos.x},${pos.y},${pos.z}`;
          if (!ignoredBlocks.includes(posKey)) {
            targetBlock = bot.blockAt(pos); 
            break; 
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
          
          // Pendekatan menggunakan Baritone (Ashfinder)
          await bot.ashfinder.goto(new goals.GoalNear(x, y, z, 2))
          if (!isWorking) break; // Langsung keluar kalau disuruh stop saat lagi jalan
          
          bot.setControlState('forward', true)
          await new Promise(resolve => setTimeout(resolve, 200))
          bot.setControlState('forward', false)
          
          if (!isWorking) break; // Keluar sebelum memukul blok
          await bot.dig(targetBlock)
        } catch (err) {
          if (!isWorking) break; // Langsung putus loop kalau terhenti karena error stop
          if (err?.message === 'GoalChanged' || err?.name === 'GoalChanged') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; 
          } else {
            console.log('⚠️ [DEBUG] Error saat mencari jalan ke pohon:', err);
            bot.chat('Blok ini sulit dijangkau, cari yang lain...')
            const posKey = `${targetBlock.position.x},${targetBlock.position.y},${targetBlock.position.z}`;
            ignoredBlocks.push(posKey);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (hasChoppedSomething) {
        bot.chat('Memungut sisa kayu yang jatuh...')
        await new Promise(resolve => setTimeout(resolve, 1500))

        const berhasilSimpan = await simpanKePeti();
        
        if (!berhasilSimpan) {
           bot.chat('Karena gagal masuk peti, ketik "menerima kayu" ya Bos kalau mau ambil manual dariku.');
        }
        
        isWorking = false; 
      } else {
        isWorking = false 
      }
      
    } catch (error) {
      bot.chat('Duh, ada error sistem (Cek Terminal VPS).')
      console.log('🚨 [FATAL ERROR] Sistem tebang jebol:', error)
      isWorking = false
    } 
  }
})

bot.on('error', (err) => {
  console.log('🚨 [ERROR CORE MINEFLAYER]:', err)
})