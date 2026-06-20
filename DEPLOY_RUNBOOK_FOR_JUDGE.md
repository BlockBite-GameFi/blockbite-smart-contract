# Deploy to blockbite-protocol.xyz — Minimal Friction Runbook

**When:** Begitu pengadilan cabut pembatasan akses.  
**What:** Deploy kode fix (RPC + UI icon) yang sudah di main ke production xyz.  
**Time:** ~5 menit, 2 klik + 1 copy-paste.

---

## Step 1: Create Vercel Deploy Hook (1 menit)

1. Buka https://vercel.com/account (login akun Vercel pribadi)
2. Pilih project **blockbite-protocol** (atau import dari repo pribadi jika baru)
3. Settings → **Git** → **Deploy Hooks**
4. Klik **Create Hook**
   - Name: `CI Deploy`
   - Branch: `main`
   - Klik **Create**
5. **Copy** URL panjang yang muncul (contoh: `https://api.vercel.com/v1/integrations/deploy/prj_xxx`)

---

## Step 2: Trigger Deploy (copy-paste, 3 menit menunggu)

Terminal atau bash:
```bash
cd /path/to/blockbite-smart-contract
bash DEPLOY_EMERGENCY.sh "paste_hook_url_here"
```

Script itu akan:
- Tembak deploy hook
- Poll xyz tiap detik sampai build selesai
- Verifikasi Cliff icon path berubah menjadi `M8 38 H20 V10 H40`
- Verifikasi RPC health endpoint hidup
- Print evidence untuk hakim

---

## Output untuk Hakim

Script akan print:
```
✓ Build live! SVG path correct (M8 38 H20 V10 H40)

📋 JUDGE EVIDENCE:
  Site:        https://blockbite-protocol.xyz/new
  Cliff Icon:  M8 38 H20 V10 H40 (✓ fixed size)

🧪 RPC health check:
{"status":"ok","ts":...}

✅ All systems live. Ready for judge review.
```

Buka browser:
- https://blockbite-protocol.xyz/new → lihat ketiga icon sejajar
- Coba buat stream → tidak ada "Unexpected error" lagi

---

## If Deploy Fails

1. Check Vercel dashboard → project **blockbite-protocol** → Deployments tab
2. Cek error message (biasanya build error, bukan akses issue)
3. Kalau build error: hub di chat, aku fix kodenya

---

## What's Already Done (No Action Needed)

✅ Kode fix RPC (no "Unexpected error")  
✅ Kode fix UI icon size (Cliff sejajar)  
✅ GitHub workflow auto-deploy siap  
✅ Deploy script siap  
✅ Dokumentasi lengkap  

Semuanya tinggal menunggu Deploy Hook URL dari Vercel. Kamu.

---

## Timeline

- **Now:** Prep kode, workflow, script ✓
- **Saat borgol cabut:** Ambil hook URL (~1 menit), tembak deploy (~3 menit), bukti live
- **Total:** ~5 menit dari "borgol cabut" → "xyz berjalan bersih"
