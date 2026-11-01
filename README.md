# 🚗 Rekod Maintenance Kenderaan

Web app percuma untuk merekod penyelenggaraan kenderaan (motosikal & kereta) ke **Google Sheets**, dibina dengan **Google Apps Script**. Mesra telefon, berbilang pengguna, dengan peringatan servis melalui **Google Calendar** dan **e-mel**.

![Tangkapan skrin](docs/tangkapan-skrin.png)

## Ciri-ciri

- **Cari ikut nombor plat**, atau tekan butang plat kenderaan yang telah didaftar.
- **Daftar kenderaan** — Motorsikal / Kereta, jenama/model, tahun, pemilik.
- **Rekod maintenance** — tarikh, mileage (auto-isi mileage terakhir), jenis aktiviti, kos, bengkel, catatan.
  - Kos ditaip gaya ATM: `1453` → **14.53**, `1500` → **15.00**.
  - Aktiviti "Lain-lain" yang ditaip akan disimpan ke senarai pilihan.
- **Edit & padam** rekod dalam sejarah.
- **Ringkasan** — bilangan rekod, mileage terkini, jumlah kos.
- **Peringatan servis seterusnya** — ikut mileage dan/atau tarikh (mana dulu):
  - Status pada kad kenderaan: biru (jauh lagi), kuning (≤ 14 hari / ≤ 500 km), merah (lewat).
  - Acara **Google Calendar** dengan notifikasi 7 hari & 1 hari sebelum.
  - **E-mel** ringkasan harian bila peringatan hampir/lewat.
- **Berbilang pengguna** — setiap akaun Google mendapat Google Sheet sendiri dalam Drive mereka. Data tidak dikongsi.

## Fail

| Fail | Kegunaan |
|---|---|
| `Code.gs` | Backend Apps Script (Sheet, Calendar, e-mel, trigger) |
| `Index.html` | Antara muka web app |
| `appsscript.json` | Manifest: zon waktu, kebenaran (OAuth scopes), tetapan web app |

## Cara pasang

1. Cipta Google Sheet baru → **Extensions → Apps Script**.
2. **Project Settings ⚙️** → tanda **Show "appsscript.json" manifest file in editor**.
3. Dalam Editor `< >`, ganti isi `appsscript.json`, `Code.gs` dan tambah fail HTML bernama `Index` dengan isi dari repo ini. Simpan.
4. Pilih fungsi **`setup`** → **Run** → luluskan kebenaran.
   (Sheet ini akan menjadi Sheet anda sendiri dalam web app dan trigger e-mel harian dipasang.)
5. **Deploy → New deployment → Web app**
   - *Execute as*: **User accessing the web app**
   - *Who has access*: **Anyone with Google account**
6. Kongsi URL `/exec` yang diberi.

Setiap kali kod dikemas kini: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (URL kekal sama).

### Untuk pengguna baru

Kali pertama membuka app, pengguna perlu log masuk akaun Google dan meluluskan kebenaran. Google akan memaparkan amaran **"Google hasn't verified this app"** — tekan **Advanced → Go to … (unsafe)** untuk teruskan. Sheet peribadi dicipta automatik dalam Drive pengguna.

Kebenaran boleh ditarik balik bila-bila masa di <https://myaccount.google.com/permissions>.

## Struktur data

**Tab `Kenderaan`:** `No_Plat`, `Jenama_Model`, `Tahun`, `Pemilik`, `Tarikh_Daftar`, `Jenis`

**Tab `Rekod`:** `ID`, `No_Plat`, `Tarikh`, `Jenis_Aktiviti`, `Mileage`, `Kos`, `Bengkel`, `Catatan`, `Masa_Rekod`, `Ingat_Mileage`, `Ingat_Tarikh`, `Ingat_Emel`, `Calendar_ID`, `Emel_Dihantar`

Peringatan yang **aktif** ialah rekod terbaru bagi kenderaan + jenis aktiviti yang sama. Bila rekod baru dengan aktiviti sama ditambah, peringatan lama dianggap selesai (acara Calendar lama dipadam).

## Tetapan (dalam `Code.gs`)

```js
const HAMPIR_KM = 500;        // kuning bila baki <= 500 km
const HAMPIR_HARI = 14;       // kuning bila baki <= 14 hari
const EMEL_HARI_SEBELUM = 7;  // e-mel 7 hari sebelum tarikh peringatan
const JAM_SEMAKAN = 8;        // semakan e-mel harian sekitar 8 pagi
```

## Had

- App yang belum disahkan Google (*unverified*) dengan kebenaran sensitif (Calendar, e-mel) dihadkan kepada sekitar 100 pengguna baru. Untuk lebih, mohon *OAuth verification* di Google Cloud Console.
- Kuota Apps Script (e-mel harian, masa larian) dikira bagi setiap pengguna.

## Lesen

[MIT](LICENSE) — bebas digunakan, diubah suai dan diedarkan, dengan syarat notis hak cipta dikekalkan.

---

Dibangunkan oleh **Ibrahim bin Kadri (9M2IBR)**.
