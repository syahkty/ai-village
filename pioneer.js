const mineflayer = require('mineflayer')

// Konfigurasi koneksi bot ke server
const bot = mineflayer.createBot({
  host: 'minecraft.syahkty.dev',   // Ganti jika server ada di IP berbeda
  port: 25565,         // Port default Minecraft
  username: 'PioneerBot',
  version: '1.21.11' // Nama bot di dalam game
})

// Event saat bot berhasil masuk ke dalam game
bot.on('spawn', () => {
  console.log('PioneerBot berhasil masuk ke server!')
  bot.chat('Halo, saya PioneerBot. Saya siap menerima perintah awal.')
})

// Event saat ada pesan di chat game
bot.on('chat', async (username, message) => {
  // Abaikan pesan dari bot itu sendiri
  if (username === bot.username) return

  if (message === 'survival') {
    // Menyuruh bot mengetik command bawaan Velocity untuk pindah server
    bot.chat('/server survival') 
    console.log('Bot mencoba pindah ke server survival via command...')
  }


  // Perintah sederhana
  if (message === 'maju') {
    bot.setControlState('forward', true)
    bot.chat('Baik, saya berjalan maju.')
  } 
  else if (message === 'berhenti') {
    bot.clearControlStates() // Menghentikan semua pergerakan
    bot.chat('Saya berhenti.')
  }
  else if (message === 'lompat') {
    bot.setControlState('jump', true)
    bot.setControlState('jump', false) // Matikan langsung agar lompat sekali
    bot.chat('Hap!')
  }
})

// Menangkap error agar bot tidak langsung crash
bot.on('error', (err) => console.log(err))

// Event ketika bot melihat sebuah jendela/GUI terbuka (seperti chest atau menu server)
bot.on('windowOpen', (window) => {
  console.log('--- MENU TERBUKA ---')
  console.log('Bot melihat item-item berikut di dalam menu:')
  
  // Melakukan looping untuk melihat isi setiap slot di menu
  window.slots.forEach((item, index) => {
    if (item) {
      // Menampilkan nomor slot dan nama itemnya
      console.log(`Slot ${index}: ${item.name} (Jumlah: ${item.count})`)
    }
  })
  console.log('--------------------')
  
  // NOTE: Kita belum menyuruh bot mengklik apapun. 
  // Kita hanya membaca nomor slotnya dulu.
})

// Melacak jika bot sengaja ditendang (kicked) oleh server
bot.on('kicked', (reason, loggedIn) => {
  console.log(`--- BOT DITENDANG ---`)
  console.log(`Alasan:`, JSON.stringify(reason, null, 2))
})

// Melacak jika koneksi bot terputus (termasuk jika server mati atau koneksi hilang)
bot.on('end', (reason) => {
  console.log(`--- KONEKSI TERPUTUS ---`)
  console.log(`Alasan: ${reason}`)
})