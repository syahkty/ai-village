#!/bin/bash

echo "🚀 Mengunggah kode baru ke GitHub..."
git add .
git commit -m "Auto Deploy Update"
git push origin main

echo "⚙️ Menghubungkan ke VPS untuk Update & Restart..."
# Mengeksekusi perintah langsung di dalam VPS melalui SSH
ssh -i "/d/Projek/cloud minecraft/ssh-key-2026-02-09.key" ubuntu@168.110.207.69 "cd /home/ubuntu/Projek/ai-village && git pull origin main && npm install && pm2 restart pioneer-bot"

echo "✅ Deploy Selesai! Bot sudah diperbarui."