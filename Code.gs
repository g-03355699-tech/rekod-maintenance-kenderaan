/**
 * Rekod Maintenance Kenderaan — versi berbilang pengguna
 * Google Apps Script Web App + Google Sheets
 *
 * Setiap pengguna (akaun Google) mendapat Google Sheet SENDIRI dalam Drive mereka,
 * dicipta automatik kali pertama app dibuka. Calendar & e-mel peringatan juga
 * masuk ke akaun pengguna itu sendiri.
 *
 * Deploy > Web app:
 *   Execute as:      User accessing the web app
 *   Who has access:  Anyone with Google account
 */

const SHEET_KENDERAAN = 'Kenderaan';
const SHEET_REKOD = 'Rekod';
const HDR_KENDERAAN = ['No_Plat', 'Jenama_Model', 'Tahun', 'Pemilik', 'Tarikh_Daftar', 'Jenis'];
const HDR_REKOD = ['ID', 'No_Plat', 'Tarikh', 'Jenis_Aktiviti', 'Mileage', 'Kos', 'Bengkel', 'Catatan', 'Masa_Rekod',
                   'Ingat_Mileage', 'Ingat_Tarikh', 'Ingat_Emel', 'Calendar_ID', 'Emel_Dihantar'];
const JENIS_KENDERAAN = ['Motorsikal', 'Kereta'];

/* ---------- Tetapan peringatan ---------- */
const HAMPIR_KM = 500;          // kuning bila baki <= 500 km
const HAMPIR_HARI = 14;         // kuning bila baki <= 14 hari
const EMEL_HARI_SEBELUM = 7;    // e-mel dihantar 7 hari sebelum tarikh peringatan
const JAM_SEMAKAN = 8;          // semakan e-mel harian sekitar 8 pagi

// Indeks lajur (0-based) dalam tab Rekod
const R = { ID: 0, PLAT: 1, TARIKH: 2, AKTIVITI: 3, MILEAGE: 4, KOS: 5, BENGKEL: 6, CATATAN: 7, MASA: 8,
            INGAT_KM: 9, INGAT_TARIKH: 10, INGAT_EMEL: 11, CAL_ID: 12, EMEL_DIHANTAR: 13 };

/* ---------- Web app ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Rekod Maintenance Kenderaan')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * (Pemilik sahaja) Jalankan sekali dari editor Apps Script yang terikat pada Google Sheet anda.
 * Sheet ini akan dijadikan Sheet ANDA dalam web app, supaya data sedia ada kekal.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getUserProperties().setProperty('SS_ID', ss.getId());
  SS_CACHE = ss;
  getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN).getRange('A:A').setNumberFormat('@');
  getSheet_(SHEET_REKOD, HDR_REKOD).getRange('A:B').setNumberFormat('@');
  pasangTrigger_();
}

/* ---------- Sheet setiap pengguna ---------- */

let SS_CACHE = null;

/**
 * Pulangkan Google Sheet milik pengguna semasa.
 * Jika belum ada (atau telah dipadam), cipta baru dalam Drive pengguna.
 */
function ss_(cipta) {
  if (SS_CACHE) return SS_CACHE;
  const props = PropertiesService.getUserProperties();
  const id = props.getProperty('SS_ID');
  if (id) {
    try {
      SS_CACHE = SpreadsheetApp.openById(id);
      return SS_CACHE;
    } catch (e) {
      console.warn('Sheet pengguna tidak dapat dibuka, cipta baru: ' + e);
    }
  }
  if (cipta === false) return null;

  const ss = SpreadsheetApp.create('Rekod Maintenance Kenderaan');
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  props.setProperty('SS_ID', ss.getId());
  SS_CACHE = ss;

  getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN).getRange('A:A').setNumberFormat('@');
  getSheet_(SHEET_REKOD, HDR_REKOD).getRange('A:B').setNumberFormat('@');
  ss.getSheets()
    .filter(s => [SHEET_KENDERAAN, SHEET_REKOD].indexOf(s.getName()) < 0)
    .forEach(s => ss.deleteSheet(s));   // buang "Sheet1" lalai

  try { pasangTrigger_(); } catch (e) { console.error('Gagal pasang trigger: ' + e); }
  return ss;
}

/** Maklumat pengguna untuk dipaparkan di app. */
function maklumatPengguna() {
  const ss = ss_();
  return { emel: Session.getEffectiveUser().getEmail(), urlSheet: ss.getUrl() };
}

/* ---------- Fungsi dipanggil dari frontend ---------- */

/** Senarai kenderaan berdaftar + status peringatan (untuk butang pilihan pantas). */
function senaraiKenderaan() {
  const sh = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  const last = sh.getLastRow();
  if (last < 2) return [];

  const semua = bacaRekod_();
  prosesPeringatan_(semua);
  const statusPlat = {};
  semua.filter(r => r.aktif).forEach(r => {
    if (TAHAP[r.status] > TAHAP[statusPlat[r.plat] || 'ok']) statusPlat[r.plat] = r.status;
  });

  return sh.getRange(2, 1, last - 1, HDR_KENDERAAN.length).getValues()
    .filter(r => r[0])
    .map(r => ({
      plat: String(r[0]), model: String(r[1] || ''), jenis: String(r[5] || ''),
      status: statusPlat[normPlat_(r[0])] || ''
    }))
    .sort((a, b) => a.plat.localeCompare(b.plat));
}

/** Cari kenderaan + semua rekod maintenance + peringatan aktif. */
function cariKenderaan(plat) {
  plat = normPlat_(plat);
  if (!plat) throw new Error('Sila masukkan nombor plat.');

  const kenderaan = findKenderaan_(plat);
  if (!kenderaan) return { wujud: false, plat: plat };

  const semua = bacaRekod_();
  const maxKm = prosesPeringatan_(semua);

  const rekod = semua.filter(r => r.plat === plat)
    .sort((a, b) => bandingTerbaru_(b, a))
    .map(awam_);
  const peringatan = rekod.filter(r => r.aktif)
    .sort((a, b) => TAHAP[b.status] - TAHAP[a.status]);

  return {
    wujud: true,
    plat: plat,
    kenderaan: kenderaan,
    rekod: rekod,
    peringatan: peringatan,
    senaraiAktiviti: senaraiAktiviti_(semua),
    ringkasan: {
      bilRekod: rekod.length,
      jumlahKos: rekod.reduce((s, r) => s + (Number(r.kos) || 0), 0),
      mileageTerkini: maxKm[plat] || 0,
      servisTerakhir: rekod.length ? rekod[0].tarikh : ''
    }
  };
}

/** Daftar kenderaan baru. */
function daftarKenderaan(data) {
  const plat = normPlat_(data.plat);
  if (!plat) throw new Error('Nombor plat diperlukan.');
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error('Sila pilih jenis kenderaan (Motorsikal / Kereta).');

  return withLock_(() => {
    if (findKenderaan_(plat)) throw new Error('Kenderaan ' + plat + ' sudah didaftarkan.');
    getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN).appendRow([
      plat, clean_(data.model), clean_(data.tahun), clean_(data.pemilik), new Date(), data.jenis
    ]);
    return cariKenderaan(plat);
  });
}

/** Kemaskini maklumat kenderaan (termasuk tukar nombor plat). */
function kemaskiniKenderaan(data) {
  const asal = normPlat_(data.platAsal);
  const baru = normPlat_(data.plat);
  if (!asal || !baru) throw new Error('Nombor plat diperlukan.');
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error('Sila pilih jenis kenderaan (Motorsikal / Kereta).');

  return withLock_(() => {
    const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
    const baris = cariBarisKenderaan_(shK, asal);
    if (!baris) throw new Error('Kenderaan ' + asal + ' tidak dijumpai.');
    if (baru !== asal && findKenderaan_(baru)) throw new Error('Nombor plat ' + baru + ' sudah digunakan kenderaan lain.');

    const tarikhDaftar = shK.getRange(baris, 5).getValue();
    shK.getRange(baris, 1, 1, HDR_KENDERAAN.length).setValues([[
      baru, clean_(data.model), clean_(data.tahun), clean_(data.pemilik), tarikhDaftar, data.jenis
    ]]);

    // Tukar plat: kemaskini semua rekod & tajuk acara Calendar
    if (baru !== asal) {
      const shR = getSheet_(SHEET_REKOD, HDR_REKOD);
      bacaRekod_().filter(r => r.plat === asal).forEach(r => {
        shR.getRange(r.baris, R.PLAT + 1).setValue(baru);
        if (r.calendarId) {
          try {
            const ev = CalendarApp.getEventById(r.calendarId);
            if (ev) ev.setTitle(ev.getTitle().replace(asal, baru));
          } catch (e) { console.error('Gagal kemaskini acara: ' + e); }
        }
      });
    }
    return cariKenderaan(baru);
  });
}

/** Padam kenderaan beserta SEMUA rekod & acara Calendar berkaitan. */
function padamKenderaan(plat) {
  plat = normPlat_(plat);
  return withLock_(() => {
    const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
    const baris = cariBarisKenderaan_(shK, plat);
    if (!baris) throw new Error('Kenderaan ' + plat + ' tidak dijumpai.');

    const shR = getSheet_(SHEET_REKOD, HDR_REKOD);
    const rekod = bacaRekod_().filter(r => r.plat === plat);
    rekod.forEach(r => padamAcara_(r.calendarId));
    rekod.map(r => r.baris).sort((a, b) => b - a)       // padam dari bawah supaya nombor baris tak berubah
      .forEach(b => shR.deleteRow(b));
    shK.deleteRow(baris);
    return { plat: plat, bilRekod: rekod.length };
  });
}

function cariBarisKenderaan_(sh, plat) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const plats = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < plats.length; i++) {
    if (normPlat_(plats[i][0]) === plat) return i + 2;
  }
  return 0;
}

/** Tambah rekod maintenance (dengan peringatan jika ada). */
function tambahRekod(data) {
  const plat = normPlat_(data.plat);
  if (!plat) throw new Error('Nombor plat diperlukan.');
  const nilai = nilaiRekod_(data);
  const ingat = nilaiPeringatan_(data);

  return withLock_(() => {
    if (!findKenderaan_(plat)) throw new Error('Kenderaan ' + plat + ' belum didaftarkan.');
    const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
    const calId = (data.kalendar && ingat.tarikh)
      ? ciptaAcara_(plat, nilai[1], ingat.tarikh, ingat.mileage) : '';

    sh.appendRow([Utilities.getUuid().slice(0, 8), plat].concat(
      nilai, [new Date(), ingat.mileage, ingat.tarikhObj, ingat.emel, calId, '']));

    bersihAcaraLama_();
    return cariKenderaan(plat);
  });
}

/** Kemaskini rekod sedia ada berdasarkan ID. */
function kemaskiniRekod(data) {
  const plat = normPlat_(data.plat);
  if (!data.id) throw new Error('ID rekod tidak sah.');
  const nilai = nilaiRekod_(data);
  const ingat = nilaiPeringatan_(data);

  return withLock_(() => {
    const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
    const baris = cariBarisRekod_(sh, data.id);
    if (!baris) throw new Error('Rekod tidak dijumpai. Mungkin telah dipadam.');
    const asal = sh.getRange(baris, 1, 1, HDR_REKOD.length).getValues()[0];
    if (normPlat_(asal[R.PLAT]) !== plat) throw new Error('Rekod bukan milik kenderaan ini.');

    // Ganti acara Calendar lama (jika ada) dengan yang baru
    padamAcara_(asal[R.CAL_ID]);
    const calId = (data.kalendar && ingat.tarikh)
      ? ciptaAcara_(plat, nilai[1], ingat.tarikh, ingat.mileage) : '';

    sh.getRange(baris, R.TARIKH + 1, 1, nilai.length).setValues([nilai]);
    sh.getRange(baris, R.INGAT_KM + 1, 1, 5)
      .setValues([[ingat.mileage, ingat.tarikhObj, ingat.emel, calId, '']]); // reset status e-mel

    bersihAcaraLama_();
    return cariKenderaan(plat);
  });
}

/** Padam satu rekod berdasarkan ID. */
function padamRekod(id, plat) {
  return withLock_(() => {
    const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
    const baris = cariBarisRekod_(sh, id);
    if (baris) {
      padamAcara_(sh.getRange(baris, R.CAL_ID + 1).getValue());
      sh.deleteRow(baris);
    }
    return cariKenderaan(plat);
  });
}

/* ---------- Peringatan ---------- */

const TAHAP = { '': 0, ok: 1, hampir: 2, lewat: 3 };

/**
 * Tandakan peringatan aktif & status setiap rekod.
 * Peringatan aktif = rekod TERBARU bagi kenderaan + aktiviti yang sama, yang ada mileage/tarikh peringatan.
 * (Bila rekod baru dengan aktiviti sama ditambah, peringatan lama dianggap selesai.)
 * Pulangkan peta mileage terkini setiap plat.
 */
function prosesPeringatan_(semua) {
  const maxKm = {};
  semua.forEach(r => { if (r.mileage !== '') maxKm[r.plat] = Math.max(maxKm[r.plat] || 0, r.mileage); });

  const terbaru = {};
  semua.forEach(r => {
    const k = kunciAktiviti_(r);
    if (!terbaru[k] || bandingTerbaru_(r, terbaru[k]) > 0) terbaru[k] = r;
  });

  const hariIni = keHari_(fmtDate_(new Date()));
  semua.forEach(r => {
    r.aktif = false; r.status = ''; r.bakiKm = null; r.bakiHari = null;
    if (r.ingatMileage === '' && !r.ingatTarikh) return;
    if (terbaru[kunciAktiviti_(r)] !== r) return;

    r.aktif = true;
    if (r.ingatMileage !== '') r.bakiKm = r.ingatMileage - (maxKm[r.plat] || 0);
    if (r.ingatTarikh) r.bakiHari = keHari_(r.ingatTarikh) - hariIni;

    if ((r.bakiKm !== null && r.bakiKm <= 0) || (r.bakiHari !== null && r.bakiHari < 0)) r.status = 'lewat';
    else if ((r.bakiKm !== null && r.bakiKm <= HAMPIR_KM) || (r.bakiHari !== null && r.bakiHari <= HAMPIR_HARI)) r.status = 'hampir';
    else r.status = 'ok';
  });
  return maxKm;
}

/** Dipanggil oleh trigger harian: hantar e-mel untuk peringatan yang hampir/lewat. */
function semakPeringatanHarian() {
  if (!ss_(false)) return;   // pengguna sudah padam Sheet — jangan cipta baru dari trigger
  const semua = bacaRekod_();
  prosesPeringatan_(semua);

  const hantar = semua.filter(r => r.aktif && r.ingatEmel && !r.emelDihantar && (
    (r.bakiHari !== null && r.bakiHari <= EMEL_HARI_SEBELUM) ||
    (r.bakiKm !== null && r.bakiKm <= HAMPIR_KM)));
  if (!hantar.length) return;

  const model = {};
  const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  if (shK.getLastRow() > 1) {
    shK.getRange(2, 1, shK.getLastRow() - 1, 2).getValues()
      .forEach(r => model[normPlat_(r[0])] = String(r[1] || ''));
  }

  const baris = hantar.map(r => {
    const warna = r.status === 'lewat' ? '#d93025' : '#b06d00';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee"><b>${esc_(r.plat)}</b><br><small>${esc_(model[r.plat] || '')}</small></td>
      <td style="padding:8px;border-bottom:1px solid #eee">${esc_(r.aktiviti)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;color:${warna}">${esc_(teksBaki_(r))}</td>
    </tr>`;
  }).join('');

  const html = `<div style="font-family:Arial,sans-serif;color:#1b1f24">
    <h2 style="color:#12386b;margin:0 0 8px">🔔 Peringatan Maintenance Kenderaan</h2>
    <p>Kenderaan berikut perlu diselenggara tidak lama lagi:</p>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr style="background:#12386b;color:#fff"><th style="padding:8px;text-align:left">Kenderaan</th>
      <th style="padding:8px;text-align:left">Aktiviti</th><th style="padding:8px;text-align:left">Status</th></tr>
      ${baris}
    </table>
    <p><a href="${ScriptApp.getService().getUrl()}">Buka Rekod Maintenance Kenderaan</a></p>
  </div>`;

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),   // e-mel pengguna itu sendiri
    subject: `🔔 Peringatan maintenance: ${hantar.length} kenderaan/aktiviti`,
    htmlBody: html
  });

  const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
  hantar.forEach(r => sh.getRange(r.baris, R.EMEL_DIHANTAR + 1).setValue(new Date()));
}

function teksBaki_(r) {
  const bah = [];
  if (r.bakiKm !== null) bah.push(r.bakiKm <= 0
    ? `Lewat ${Math.abs(r.bakiKm).toLocaleString()} km (pada ${r.ingatMileage.toLocaleString()} km)`
    : `Baki ${r.bakiKm.toLocaleString()} km (pada ${r.ingatMileage.toLocaleString()} km)`);
  if (r.bakiHari !== null) {
    const t = r.ingatTarikh.split('-').reverse().join('/');
    bah.push(r.bakiHari < 0 ? `Lewat ${-r.bakiHari} hari (${t})`
           : r.bakiHari === 0 ? `Hari ini (${t})` : `${r.bakiHari} hari lagi (${t})`);
  }
  return bah.join(' atau ');
}

/* ---------- Google Calendar ---------- */

function ciptaAcara_(plat, aktiviti, tarikhStr, ingatMileage) {
  try {
    const ev = CalendarApp.getDefaultCalendar().createAllDayEvent(
      `🔧 ${aktiviti} — ${plat}`,
      keTarikh_(tarikhStr),
      { description: `Peringatan maintenance kenderaan ${plat}: ${aktiviti}` +
          (ingatMileage !== '' ? `\nAtau pada ${Number(ingatMileage).toLocaleString()} km (mana dulu).` : '') +
          `\n\n${ScriptApp.getService().getUrl() || ''}` });
    ev.removeAllReminders();
    ev.addPopupReminder(7 * 24 * 60 - 9 * 60); // 7 hari sebelum, ~9 pagi
    ev.addPopupReminder(24 * 60 - 9 * 60);     // 1 hari sebelum, ~9 pagi
    return ev.getId();
  } catch (e) {
    console.error('Gagal cipta acara Calendar: ' + e);
    return '';
  }
}

function padamAcara_(id) {
  if (!id) return;
  try {
    const ev = CalendarApp.getEventById(String(id));
    if (ev) ev.deleteEvent();
  } catch (e) {
    console.error('Gagal padam acara Calendar: ' + e);
  }
}

/** Padam acara Calendar bagi peringatan yang sudah tidak aktif (diganti rekod baru). */
function bersihAcaraLama_() {
  const semua = bacaRekod_();
  prosesPeringatan_(semua);
  const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
  semua.filter(r => r.calendarId && !r.aktif).forEach(r => {
    padamAcara_(r.calendarId);
    sh.getRange(r.baris, R.CAL_ID + 1).setValue('');
  });
}

function pasangTrigger_() {
  const ada = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'semakPeringatanHarian');
  if (!ada) ScriptApp.newTrigger('semakPeringatanHarian').timeBased().everyDays(1).atHour(JAM_SEMAKAN).create();
}

/* ---------- Helper data ---------- */

function bacaRekod_() {
  const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HDR_REKOD.length).getValues().map((r, i) => ({
    baris: i + 2,
    id: String(r[R.ID]),
    plat: normPlat_(r[R.PLAT]),
    tarikh: fmtDate_(r[R.TARIKH]),
    aktiviti: String(r[R.AKTIVITI] || ''),
    mileage: r[R.MILEAGE] === '' ? '' : Number(r[R.MILEAGE]),
    kos: r[R.KOS] === '' ? '' : Number(r[R.KOS]),
    bengkel: String(r[R.BENGKEL] || ''),
    catatan: String(r[R.CATATAN] || ''),
    masa: r[R.MASA] instanceof Date ? r[R.MASA].getTime() : 0,
    ingatMileage: r[R.INGAT_KM] === '' ? '' : Number(r[R.INGAT_KM]),
    ingatTarikh: fmtDate_(r[R.INGAT_TARIKH]),
    ingatEmel: r[R.INGAT_EMEL] === true || String(r[R.INGAT_EMEL]).toUpperCase() === 'TRUE',
    calendarId: String(r[R.CAL_ID] || ''),
    emelDihantar: !!r[R.EMEL_DIHANTAR]
  }));
}

/** Medan yang dihantar ke frontend. */
function awam_(r) {
  return {
    id: r.id, tarikh: r.tarikh, aktiviti: r.aktiviti, mileage: r.mileage, kos: r.kos,
    bengkel: r.bengkel, catatan: r.catatan,
    ingatMileage: r.ingatMileage, ingatTarikh: r.ingatTarikh, ingatEmel: r.ingatEmel,
    adaKalendar: !!r.calendarId,
    aktif: r.aktif, status: r.status, bakiKm: r.bakiKm, bakiHari: r.bakiHari
  };
}

/** Semua jenis aktiviti unik yang pernah direkod (semua kenderaan). */
function senaraiAktiviti_(semua) {
  const peta = {};
  semua.forEach(r => {
    const a = r.aktiviti.trim();
    if (a && !peta[a.toLowerCase()]) peta[a.toLowerCase()] = a;
  });
  return Object.keys(peta).map(k => peta[k]);
}

function kunciAktiviti_(r) { return r.plat + '|' + r.aktiviti.trim().toLowerCase(); }

/** >0 jika a lebih baru daripada b (ikut tarikh, kemudian masa rekod). */
function bandingTerbaru_(a, b) {
  return a.tarikh.localeCompare(b.tarikh) || ((Number(a.mileage) || 0) - (Number(b.mileage) || 0)) || (a.masa - b.masa);
}

/** Sahkan input & pulangkan [Tarikh, Aktiviti, Mileage, Kos, Bengkel, Catatan]. */
function nilaiRekod_(data) {
  if (!data.tarikh) throw new Error('Tarikh diperlukan.');
  if (!data.aktiviti) throw new Error('Jenis aktiviti diperlukan.');
  const mileage = Number(data.mileage);
  const kos = Number(data.kos);
  if (data.mileage !== '' && (isNaN(mileage) || mileage < 0)) throw new Error('Mileage tidak sah.');
  if (data.kos !== '' && (isNaN(kos) || kos < 0)) throw new Error('Kos tidak sah.');
  return [
    keTarikh_(data.tarikh),
    clean_(data.aktiviti),
    data.mileage === '' ? '' : mileage,
    data.kos === '' ? '' : kos,
    clean_(data.bengkel),
    clean_(data.catatan)
  ];
}

/** Sahkan input peringatan. */
function nilaiPeringatan_(data) {
  const km = data.ingatMileage === '' || data.ingatMileage == null ? '' : Number(data.ingatMileage);
  if (km !== '' && (isNaN(km) || km < 0)) throw new Error('Mileage peringatan tidak sah.');
  if (km !== '' && data.mileage !== '' && km <= Number(data.mileage)) {
    throw new Error('Mileage peringatan mesti lebih tinggi daripada mileage semasa.');
  }
  const tarikh = /^\d{4}-\d{2}-\d{2}$/.test(String(data.ingatTarikh || '')) ? data.ingatTarikh : '';
  return {
    mileage: km,
    tarikh: tarikh,
    tarikhObj: tarikh ? keTarikh_(tarikh) : '',
    emel: (km !== '' || tarikh) ? !!data.emel : false
  };
}

function cariBarisRekod_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function getSheet_(name, header) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8eaed');
  } else if (sh.getLastColumn() < header.length) {
    // Sheet lama: tambah header lajur baru tanpa usik data sedia ada
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e8eaed');
  }
  return sh;
}

function findKenderaan_(plat) {
  const sh = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, HDR_KENDERAAN.length).getValues();
  const r = rows.find(row => normPlat_(row[0]) === plat);
  if (!r) return null;
  return {
    plat: String(r[0]),
    model: String(r[1] || ''),
    tahun: String(r[2] || ''),
    pemilik: String(r[3] || ''),
    tarikhDaftar: fmtDate_(r[4]),
    jenis: String(r[5] || '')
  };
}

/** "wxy 1234" -> "WXY1234" */
function normPlat_(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Elak formula injection & potong teks terlalu panjang. */
function clean_(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Date -> 'yyyy-MM-dd' (google.script.run tidak boleh hantar objek Date). */
function fmtDate_(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) !== '[object Date]') return String(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** 'yyyy-mm-dd' -> Date (waktu tempatan) */
function keTarikh_(s) {
  const p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** 'yyyy-mm-dd' -> nombor hari (untuk kira beza hari tanpa isu zon waktu) */
function keHari_(s) {
  const p = String(s).split('-');
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000);
}

function withLock_(fn) {
  const lock = LockService.getUserLock();   // kunci setiap pengguna (Sheet berasingan)
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
