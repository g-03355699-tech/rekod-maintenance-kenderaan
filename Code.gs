/**
 * Rekod Maintenance Kenderaan — versi berbilang pengguna
 * Google Apps Script Web App + Google Sheets
 *
 * Setiap pengguna (akaun Google) mendapat "garaj" sendiri = Google Sheet dalam Drive mereka,
 * dicipta automatik kali pertama app dibuka. Garaj boleh dikongsi dengan ahli keluarga.
 *
 * Deploy > Web app:
 *   Execute as:      User accessing the web app
 *   Who has access:  Anyone with Google account
 */

/* ===================== Tetapan ===================== */

const HAMPIR_KM = 500;          // kuning bila baki <= 500 km
const HAMPIR_HARI = 14;         // kuning bila baki <= 14 hari
const EMEL_HARI_SEBELUM = 7;    // e-mel dihantar 7 hari sebelum tarikh peringatan
const DOKUMEN_HARI = [30, 7];   // cukai jalan / insurans: notis 30 & 7 hari sebelum tamat
const JAM_SEMAKAN = 8;          // semakan e-mel harian sekitar 8 pagi
const NAMA_FOLDER_RESIT = 'Resit Maintenance Kenderaan';

/* ===================== Struktur Sheet ===================== */

const SHEET_KENDERAAN = 'Kenderaan';
const SHEET_REKOD = 'Rekod';
const SHEET_MILEAGE = 'Mileage';
const SHEET_TEMPLAT = 'Templat';

const HDR_KENDERAAN = ['No_Plat', 'Jenama_Model', 'Tahun', 'Pemilik', 'Tarikh_Daftar', 'Jenis', 'Ikon',
                       'Tamat_Cukai', 'Tamat_Insurans', 'Notis_Cukai', 'Notis_Insurans', 'Cal_Cukai', 'Cal_Insurans'];
const HDR_REKOD = ['ID', 'No_Plat', 'Tarikh', 'Jenis_Aktiviti', 'Mileage', 'Kos', 'Bengkel', 'Catatan', 'Masa_Rekod',
                   'Ingat_Mileage', 'Ingat_Tarikh', 'Ingat_Emel', 'Calendar_ID', 'Emel_Dihantar', 'Resit_ID', 'Resit_URL'];
const HDR_MILEAGE = ['ID', 'No_Plat', 'Tarikh', 'Mileage', 'Masa_Rekod'];
const HDR_TEMPLAT = ['No_Plat', 'Aktiviti', 'Selang_KM', 'Selang_Bulan'];

const JENIS_KENDERAAN = ['Motorsikal', 'Kereta'];

// Indeks lajur (0-based)
const K = { PLAT: 0, MODEL: 1, TAHUN: 2, PEMILIK: 3, DAFTAR: 4, JENIS: 5, IKON: 6,
            CUKAI: 7, INSURANS: 8, NOTIS_CUKAI: 9, NOTIS_INSURANS: 10, CAL_CUKAI: 11, CAL_INSURANS: 12 };
const R = { ID: 0, PLAT: 1, TARIKH: 2, AKTIVITI: 3, MILEAGE: 4, KOS: 5, BENGKEL: 6, CATATAN: 7, MASA: 8,
            INGAT_KM: 9, INGAT_TARIKH: 10, INGAT_EMEL: 11, CAL_ID: 12, EMEL_DIHANTAR: 13, RESIT_ID: 14, RESIT_URL: 15 };

const DOKUMEN = [
  { kod: 'cukai', nama: 'Cukai jalan', kol: K.CUKAI, notis: K.NOTIS_CUKAI, cal: K.CAL_CUKAI },
  { kod: 'insurans', nama: 'Insurans', kol: K.INSURANS, notis: K.NOTIS_INSURANS, cal: K.CAL_INSURANS }
];

/* ===================== Web app ===================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Rekod Maintenance Kenderaan')
    .setFaviconUrl('https://raw.githubusercontent.com/g-03355699-tech/rekod-maintenance-kenderaan/main/docs/app/ikon-192.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * (Pemilik sahaja) Jalankan sekali dari editor Apps Script yang terikat pada Google Sheet anda.
 * Sheet ini akan dijadikan garaj ANDA dalam web app, supaya data sedia ada kekal.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getUserProperties().setProperty('SS_ID', ss.getId());
  SS_CACHE = ss;
  sediaTab_(ss);
  pasangTrigger_();
}

/* ===================== Garaj (Sheet) pengguna ===================== */

let SS_CACHE = null;

function bukaSS_(id) {
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

/** Sheet milik pengguna sendiri. Dicipta jika belum ada. */
function ssSendiri_(cipta) {
  const props = PropertiesService.getUserProperties();
  const id = props.getProperty('SS_ID');
  if (id) {
    const ss = bukaSS_(id);
    if (ss) return ss;
  }
  if (cipta === false) return null;

  const ss = SpreadsheetApp.create('Rekod Maintenance Kenderaan');
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  props.setProperty('SS_ID', ss.getId());
  sediaTab_(ss);
  ss.getSheets()
    .filter(s => [SHEET_KENDERAAN, SHEET_REKOD, SHEET_MILEAGE, SHEET_TEMPLAT].indexOf(s.getName()) < 0)
    .forEach(s => ss.deleteSheet(s));   // buang "Sheet1" lalai
  try { pasangTrigger_(); } catch (e) { console.error('Gagal pasang trigger: ' + e); }
  return ss;
}

function sediaTab_(ss) {
  getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN, ss).getRange('A:A').setNumberFormat('@');
  getSheet_(SHEET_REKOD, HDR_REKOD, ss).getRange('A:B').setNumberFormat('@');
  getSheet_(SHEET_MILEAGE, HDR_MILEAGE, ss).getRange('A:B').setNumberFormat('@');
  getSheet_(SHEET_TEMPLAT, HDR_TEMPLAT, ss).getRange('A:A').setNumberFormat('@');
}

/** Garaj yang sedang aktif (sendiri atau garaj yang dikongsi orang lain). */
function ss_() {
  if (SS_CACHE) return SS_CACHE;
  const props = PropertiesService.getUserProperties();
  const aktif = props.getProperty('AKTIF_ID');
  if (aktif && aktif !== props.getProperty('SS_ID')) {
    const ss = bukaSS_(aktif);
    if (ss) return (SS_CACHE = ss);
    props.deleteProperty('AKTIF_ID');      // akses telah ditarik balik
  }
  return (SS_CACHE = ssSendiri_(true));
}

function emelSaya_() { return Session.getEffectiveUser().getEmail(); }

function senaraiDisertai_() {
  try { return JSON.parse(PropertiesService.getUserProperties().getProperty('GARAJ') || '[]'); }
  catch (e) { return []; }
}

function namaGaraj_(ss) {
  try { return 'Garaj ' + ss.getOwner().getEmail(); } catch (e) { return ss.getName(); }
}

/** Maklumat pengguna & garaj untuk dipaparkan di app. */
function maklumatPengguna() {
  const ss = ss_();
  const sendiri = ssSendiri_(true);
  return {
    emel: emelSaya_(),
    urlSheet: ss.getUrl(),
    garajSendiri: ss.getId() === sendiri.getId(),
    namaGaraj: ss.getId() === sendiri.getId() ? 'Garaj saya' : namaGaraj_(ss)
  };
}

/** Senarai garaj + ahli garaj sendiri. */
function senaraiGaraj() {
  const saya = emelSaya_();
  const sendiri = ssSendiri_(true);
  const aktifId = ss_().getId();
  const garaj = [{ id: sendiri.getId(), nama: 'Garaj saya', sendiri: true, aktif: aktifId === sendiri.getId() }];
  senaraiDisertai_().forEach(id => {
    const ss = bukaSS_(id);
    if (ss) garaj.push({ id: id, nama: namaGaraj_(ss), sendiri: false, aktif: aktifId === id });
  });
  const ahli = sendiri.getEditors().map(u => u.getEmail())
    .filter(e => e && e.toLowerCase() !== saya.toLowerCase());
  return { garaj: garaj, ahli: ahli, kod: sendiri.getId(), emel: saya };
}

/** Kongsi garaj sendiri dengan ahli keluarga (beri akses edit pada Sheet). */
function kongsiGaraj(emel) {
  emel = String(emel || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emel)) throw new Error('Alamat e-mel tidak sah.');
  if (emel === emelSaya_().toLowerCase()) throw new Error('Itu e-mel anda sendiri.');
  ssSendiri_(true).addEditor(emel);
  return senaraiGaraj();
}

function buangAhli(emel) {
  ssSendiri_(true).removeEditor(String(emel));
  return senaraiGaraj();
}

/** Sertai garaj orang lain menggunakan kod (ID Sheet) atau pautan Sheet. */
function sertaiGaraj(kod) {
  const m = String(kod || '').match(/[-\w]{25,}/);
  if (!m) throw new Error('Kod garaj tidak sah.');
  const id = m[0];
  if (id === ssSendiri_(true).getId()) throw new Error('Itu garaj anda sendiri.');
  const ss = bukaSS_(id);
  if (!ss) throw new Error('Tiada akses. Minta pemilik garaj kongsi dengan e-mel anda (' + emelSaya_() + ') dahulu.');
  if (!ss.getSheetByName(SHEET_KENDERAAN)) throw new Error('Kod ini bukan garaj Rekod Maintenance Kenderaan.');

  const props = PropertiesService.getUserProperties();
  const senarai = senaraiDisertai_();
  if (senarai.indexOf(id) < 0) senarai.push(id);
  props.setProperty('GARAJ', JSON.stringify(senarai));
  props.setProperty('AKTIF_ID', id);
  SS_CACHE = null;
  return senaraiGaraj();
}

function tukarGaraj(id) {
  const props = PropertiesService.getUserProperties();
  if (id === props.getProperty('SS_ID')) props.deleteProperty('AKTIF_ID');
  else if (senaraiDisertai_().indexOf(id) >= 0) props.setProperty('AKTIF_ID', id);
  else throw new Error('Garaj tidak dijumpai.');
  SS_CACHE = null;
  return senaraiGaraj();
}

function tinggalkanGaraj(id) {
  const props = PropertiesService.getUserProperties();
  props.setProperty('GARAJ', JSON.stringify(senaraiDisertai_().filter(x => x !== id)));
  if (props.getProperty('AKTIF_ID') === id) props.deleteProperty('AKTIF_ID');
  SS_CACHE = null;
  return senaraiGaraj();
}

/* ===================== Kenderaan ===================== */

/** Senarai kenderaan berdaftar + status peringatan (untuk butang pilihan pantas). */
function senaraiKenderaan() {
  const kenderaan = bacaKenderaan_();
  if (!kenderaan.length) return [];

  const semua = bacaRekod_();
  prosesPeringatan_(semua, bacaMileage_());
  const statusPlat = {};
  const naik = (plat, st) => { if (TAHAP[st] > TAHAP[statusPlat[plat] || 'ok']) statusPlat[plat] = st; };
  semua.filter(r => r.aktif).forEach(r => naik(r.plat, r.status));
  kenderaan.forEach(k => statusDokumen_(k).forEach(d => naik(k.plat, d.status)));

  return kenderaan
    .map(k => ({ plat: k.plat, model: k.model, jenis: k.jenis, ikon: k.ikon, status: statusPlat[k.plat] || '' }))
    .sort((a, b) => a.plat.localeCompare(b.plat));
}

/** Cari kenderaan + semua rekod, peringatan, log mileage, templat. */
function cariKenderaan(plat) {
  plat = normPlat_(plat);
  if (!plat) throw new Error('Sila masukkan nombor plat.');

  const kenderaan = findKenderaan_(plat);
  if (!kenderaan) return { wujud: false, plat: plat };

  const semua = bacaRekod_();
  const log = bacaMileage_();
  const maxKm = prosesPeringatan_(semua, log);

  const rekod = semua.filter(r => r.plat === plat)
    .sort((a, b) => bandingTerbaru_(b, a))
    .map(awam_);
  const dokumen = statusDokumen_(kenderaan);
  const peringatan = rekod.filter(r => r.aktif)
    .map(r => Object.assign({ jenisP: 'servis' }, r))
    .concat(dokumen.map(d => ({ jenisP: 'dokumen', aktiviti: d.nama, status: d.status, bakiHari: d.bakiHari,
                                bakiKm: null, ingatTarikh: d.tarikh, ingatMileage: '' })))
    .sort((a, b) => TAHAP[b.status] - TAHAP[a.status]);

  const logPlat = log.filter(m => m.plat === plat)
    .map(m => ({ tarikh: m.tarikh, mileage: m.mileage }))
    .sort((a, b) => b.tarikh.localeCompare(a.tarikh));

  return {
    wujud: true,
    plat: plat,
    kenderaan: kenderaan,
    rekod: rekod,
    peringatan: peringatan,
    logMileage: logPlat,
    templat: bacaTemplat_().filter(t => t.plat === plat),
    senaraiAktiviti: unik_(semua.map(r => r.aktiviti)),
    senaraiBengkel: unik_(semua.map(r => r.bengkel)),
    amaran: unik_(AMARAN),
    ringkasan: {
      bilRekod: rekod.length,
      jumlahKos: rekod.reduce((s, r) => s + (Number(r.kos) || 0), 0),
      mileageTerkini: maxKm[plat] || 0,
      kemaskiniMileage: logPlat.length ? logPlat[0].tarikh : '',
      servisTerakhir: rekod.length ? rekod[0].tarikh : ''
    }
  };
}

/** Daftar kenderaan baru. */
function daftarKenderaan(data) {
  const plat = normPlat_(data.plat);
  if (!plat) throw new Error('Nombor plat diperlukan.');
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error('Sila pilih jenis kenderaan (Motorsikal / Kereta).');
  const cukai = tarikhSah_(data.tamatCukai), insurans = tarikhSah_(data.tamatInsurans);

  return withLock_(() => {
    if (findKenderaan_(plat)) throw new Error('Kenderaan ' + plat + ' sudah didaftarkan.');
    getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN).appendRow([
      plat, clean_(data.model), clean_(data.tahun), clean_(data.pemilik), new Date(), data.jenis, kodIkon_(data.ikon),
      cukai ? keTarikh_(cukai) : '', insurans ? keTarikh_(insurans) : '', '', '',
      cukai ? ciptaAcaraDokumen_(plat, 'Cukai jalan', cukai) : '',
      insurans ? ciptaAcaraDokumen_(plat, 'Insurans', insurans) : ''
    ]);
    return cariKenderaan(plat);
  });
}

/** Kemaskini maklumat kenderaan (termasuk tukar nombor plat & tarikh cukai/insurans). */
function kemaskiniKenderaan(data) {
  const asal = normPlat_(data.platAsal);
  const baru = normPlat_(data.plat);
  if (!asal || !baru) throw new Error('Nombor plat diperlukan.');
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error('Sila pilih jenis kenderaan (Motorsikal / Kereta).');
  const tarikhBaru = { cukai: tarikhSah_(data.tamatCukai), insurans: tarikhSah_(data.tamatInsurans) };

  return withLock_(() => {
    const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
    const baris = cariBaris_(shK, 0, asal, normPlat_);
    if (!baris) throw new Error('Kenderaan ' + asal + ' tidak dijumpai.');
    if (baru !== asal && findKenderaan_(baru)) throw new Error('Nombor plat ' + baru + ' sudah digunakan kenderaan lain.');

    const row = shK.getRange(baris, 1, 1, HDR_KENDERAAN.length).getValues()[0];
    row[K.PLAT] = baru;
    row[K.MODEL] = clean_(data.model);
    row[K.TAHUN] = clean_(data.tahun);
    row[K.PEMILIK] = clean_(data.pemilik);
    row[K.JENIS] = data.jenis;
    row[K.IKON] = kodIkon_(data.ikon);

    // Cukai jalan / insurans: jika tarikh berubah, ganti acara Calendar & reset notis e-mel
    DOKUMEN.forEach(d => {
      const lama = fmtDate_(row[d.kol]);
      const t = tarikhBaru[d.kod];
      if (lama !== t || (baru !== asal && row[d.cal])) {
        padamAcara_(row[d.cal]);
        row[d.kol] = t ? keTarikh_(t) : '';
        row[d.cal] = t ? ciptaAcaraDokumen_(baru, d.nama, t) : '';
        if (lama !== t) row[d.notis] = '';
      }
    });
    shK.getRange(baris, 1, 1, HDR_KENDERAAN.length).setValues([row]);

    if (baru !== asal) tukarPlatSemuaTab_(asal, baru);
    return cariKenderaan(baru);
  });
}

function tukarPlatSemuaTab_(asal, baru) {
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
  [[SHEET_MILEAGE, HDR_MILEAGE, 1], [SHEET_TEMPLAT, HDR_TEMPLAT, 0]].forEach(([nama, hdr, kol]) => {
    const sh = getSheet_(nama, hdr);
    const last = sh.getLastRow();
    if (last < 2) return;
    const rng = sh.getRange(2, kol + 1, last - 1, 1);
    rng.setValues(rng.getValues().map(r => [normPlat_(r[0]) === asal ? baru : r[0]]));
  });
}

/** Padam kenderaan beserta SEMUA rekod, log mileage, templat, resit & acara Calendar. */
function padamKenderaan(plat) {
  plat = normPlat_(plat);
  return withLock_(() => {
    const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
    const baris = cariBaris_(shK, 0, plat, normPlat_);
    if (!baris) throw new Error('Kenderaan ' + plat + ' tidak dijumpai.');
    const row = shK.getRange(baris, 1, 1, HDR_KENDERAAN.length).getValues()[0];
    DOKUMEN.forEach(d => padamAcara_(row[d.cal]));

    const rekod = bacaRekod_().filter(r => r.plat === plat);
    rekod.forEach(r => { padamAcara_(r.calendarId); padamResit_(r.resitId); });
    padamBaris_(getSheet_(SHEET_REKOD, HDR_REKOD), rekod.map(r => r.baris));

    [[SHEET_MILEAGE, HDR_MILEAGE, 1], [SHEET_TEMPLAT, HDR_TEMPLAT, 0]].forEach(([nama, hdr, kol]) => {
      const sh = getSheet_(nama, hdr);
      const last = sh.getLastRow();
      if (last < 2) return;
      const baris2 = [];
      sh.getRange(2, kol + 1, last - 1, 1).getValues().forEach((r, i) => { if (normPlat_(r[0]) === plat) baris2.push(i + 2); });
      padamBaris_(sh, baris2);
    });

    shK.deleteRow(baris);
    return { plat: plat, bilRekod: rekod.length };
  });
}

/** Kemas kini mileage pantas (tanpa rekod servis). */
function kemaskiniMileage(data) {
  const plat = normPlat_(data.plat);
  const km = Number(data.mileage);
  if (!data.mileage || isNaN(km) || km < 0) throw new Error('Mileage tidak sah.');
  const tarikh = tarikhSah_(data.tarikh) || fmtDate_(new Date());

  return withLock_(() => {
    if (!findKenderaan_(plat)) throw new Error('Kenderaan ' + plat + ' tidak dijumpai.');
    const maxKm = prosesPeringatan_(bacaRekod_(), bacaMileage_());
    if (km < (maxKm[plat] || 0)) {
      throw new Error(`Mileage ${km.toLocaleString()} km lebih rendah daripada mileage terkini (${(maxKm[plat] || 0).toLocaleString()} km).`);
    }
    getSheet_(SHEET_MILEAGE, HDR_MILEAGE).appendRow([Utilities.getUuid().slice(0, 8), plat, keTarikh_(tarikh), km, new Date()]);
    return cariKenderaan(plat);
  });
}

/* ===================== Rekod maintenance ===================== */

/** Tambah rekod maintenance (dengan peringatan, templat & resit jika ada). */
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
    const resit = data.resit ? simpanResit_(plat, data.resit) : { id: '', url: '' };

    sh.appendRow([Utilities.getUuid().slice(0, 8), plat].concat(
      nilai, [new Date(), ingat.mileage, ingat.tarikhObj, ingat.emel, calId, '', resit.id, resit.url]));

    simpanTemplat_(plat, nilai[1], data);
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
    const baris = cariBaris_(sh, R.ID, data.id, String);
    if (!baris) throw new Error('Rekod tidak dijumpai. Mungkin telah dipadam.');
    const row = sh.getRange(baris, 1, 1, HDR_REKOD.length).getValues()[0];
    if (normPlat_(row[R.PLAT]) !== plat) throw new Error('Rekod bukan milik kenderaan ini.');

    padamAcara_(row[R.CAL_ID]);
    const calId = (data.kalendar && ingat.tarikh)
      ? ciptaAcara_(plat, nilai[1], ingat.tarikh, ingat.mileage) : '';

    // Resit: 'buang' = padam, data baru = ganti, kosong = kekal
    if (data.resit || data.buangResit) {
      padamResit_(row[R.RESIT_ID]);
      const resit = data.resit ? simpanResit_(plat, data.resit) : { id: '', url: '' };
      row[R.RESIT_ID] = resit.id;
      row[R.RESIT_URL] = resit.url;
    }

    nilai.forEach((v, i) => row[R.TARIKH + i] = v);
    row[R.INGAT_KM] = ingat.mileage;
    row[R.INGAT_TARIKH] = ingat.tarikhObj;
    row[R.INGAT_EMEL] = ingat.emel;
    row[R.CAL_ID] = calId;
    row[R.EMEL_DIHANTAR] = '';
    sh.getRange(baris, 1, 1, HDR_REKOD.length).setValues([row]);

    simpanTemplat_(plat, nilai[1], data);
    bersihAcaraLama_();
    return cariKenderaan(plat);
  });
}

/** Padam satu rekod berdasarkan ID. */
function padamRekod(id, plat) {
  return withLock_(() => {
    const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
    const baris = cariBaris_(sh, R.ID, id, String);
    if (baris) {
      const row = sh.getRange(baris, 1, 1, HDR_REKOD.length).getValues()[0];
      padamAcara_(row[R.CAL_ID]);
      padamResit_(row[R.RESIT_ID]);
      sh.deleteRow(baris);
    }
    return cariKenderaan(plat);
  });
}

/* ===================== Templat servis ===================== */

function bacaTemplat_() {
  const sh = getSheet_(SHEET_TEMPLAT, HDR_TEMPLAT);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HDR_TEMPLAT.length).getValues().map(r => ({
    plat: normPlat_(r[0]), aktiviti: String(r[1] || ''),
    km: r[2] === '' ? '' : Number(r[2]), bulan: r[3] === '' ? '' : Number(r[3])
  }));
}

/** Simpan selang (km/bulan) sebagai templat untuk kenderaan + aktiviti ini. */
function simpanTemplat_(plat, aktiviti, data) {
  if (!data.simpanTemplat) return;
  const km = data.selangKm === '' || data.selangKm == null ? '' : Math.round(Number(data.selangKm));
  const bulan = data.selangBulan === '' || data.selangBulan == null ? '' : Math.round(Number(data.selangBulan));
  if ((km === '' || !(km > 0)) && (bulan === '' || !(bulan > 0))) return;

  const sh = getSheet_(SHEET_TEMPLAT, HDR_TEMPLAT);
  const kunci = String(aktiviti).trim().toLowerCase();
  const last = sh.getLastRow();
  const nilai = [plat, aktiviti, km > 0 ? km : '', bulan > 0 ? bulan : ''];
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (normPlat_(rows[i][0]) === plat && String(rows[i][1]).trim().toLowerCase() === kunci) {
        sh.getRange(i + 2, 1, 1, 4).setValues([nilai]);
        return;
      }
    }
  }
  sh.appendRow(nilai);
}

/* ===================== Resit (Google Drive) ===================== */
// Menggunakan Advanced Drive Service (v3) dengan skop drive.file — app hanya boleh
// akses fail yang ia cipta sendiri, bukan keseluruhan Drive pengguna.

function folderResit_() {
  const props = PropertiesService.getUserProperties();
  const id = props.getProperty('RESIT_FOLDER');
  if (id) {
    try {
      const f = Drive.Files.get(id, { fields: 'id,trashed' });
      if (!f.trashed) return id;
    } catch (e) { /* folder dipadam */ }
  }
  const folder = Drive.Files.create({ name: NAMA_FOLDER_RESIT, mimeType: 'application/vnd.google-apps.folder' });
  props.setProperty('RESIT_FOLDER', folder.id);
  return folder.id;
}

/** resit = { b64, mime } — gambar telah dimampatkan di pelayar. */
function simpanResit_(plat, resit) {
  if (!resit || !resit.b64) return { id: '', url: '' };
  if (resit.b64.length > 8 * 1024 * 1024) throw new Error('Gambar resit terlalu besar.');
  const nama = `Resit_${plat}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')}.jpg`;
  const blob = Utilities.newBlob(Utilities.base64Decode(resit.b64), resit.mime || 'image/jpeg', nama);
  const fail = Drive.Files.create({ name: nama, parents: [folderResit_()] }, blob, { fields: 'id,webViewLink' });

  // Kongsi (lihat sahaja) dengan ahli lain garaj ini
  ahliGaraj_().forEach(emel => {
    try {
      Drive.Permissions.create({ role: 'reader', type: 'user', emailAddress: emel }, fail.id, { sendNotificationEmail: false });
    } catch (e) { console.warn('Gagal kongsi resit dengan ' + emel + ': ' + e); }
  });
  return { id: fail.id, url: fail.webViewLink || ('https://drive.google.com/file/d/' + fail.id + '/view') };
}

function padamResit_(id) {
  if (!id) return;
  try { Drive.Files.update({ trashed: true }, String(id)); }
  catch (e) { console.warn('Gagal padam resit (mungkin milik ahli lain): ' + e); }
}

/** E-mel semua ahli garaj aktif (pemilik + editor) kecuali diri sendiri. */
function ahliGaraj_() {
  const saya = emelSaya_().toLowerCase();
  const ss = ss_();
  const emel = [];
  try { emel.push(ss.getOwner().getEmail()); } catch (e) {}
  try { ss.getEditors().forEach(u => emel.push(u.getEmail())); } catch (e) {}
  return unik_(emel.filter(e => e && e.toLowerCase() !== saya));
}

/* ===================== Laporan PDF ===================== */

function eksportPdf(plat) {
  const d = cariKenderaan(plat);
  if (!d.wujud) throw new Error('Kenderaan tidak dijumpai.');
  const k = d.kenderaan;
  const fmt = s => s ? s.split('-').reverse().join('/') : '-';
  const rm = n => n === '' || n == null ? '-' : 'RM' + Number(n).toFixed(2);
  const km = n => n === '' || n == null ? '-' : Number(n).toLocaleString() + ' km';

  const baris = d.rekod.slice().reverse().map((r, i) => `
    <tr${i % 2 ? ' style="background:#f5f7fa"' : ''}>
      <td>${fmt(r.tarikh)}</td><td>${esc_(r.aktiviti)}${r.catatan ? `<br><span class="c">${esc_(r.catatan)}</span>` : ''}</td>
      <td class="n">${km(r.mileage)}</td><td>${esc_(r.bengkel)}</td><td class="n">${rm(r.kos)}</td>
    </tr>`).join('');

  const html = `<html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#1b1f24;font-size:11px;margin:24px}
    h1{color:#12386b;font-size:20px;margin:0}
    .sub{color:#5f6670;margin:2px 0 14px}
    .kotak{display:inline-block;border:1px solid #d3deee;border-radius:6px;padding:6px 12px;margin:0 6px 10px 0}
    .kotak b{display:block;font-size:14px;color:#12386b}
    table{border-collapse:collapse;width:100%}
    th{background:#12386b;color:#fff;text-align:left;padding:6px}
    td{padding:6px;border-bottom:1px solid #e3e8ef;vertical-align:top}
    .n{text-align:right;white-space:nowrap} .c{color:#5f6670;font-size:10px}
    .kaki{margin-top:16px;color:#5f6670;font-size:9px}
  </style></head><body>
    <h1>Sejarah Maintenance — ${esc_(k.plat)}</h1>
    <div class="sub">${esc_([k.jenis, k.model, k.tahun, k.pemilik].filter(Boolean).join(' • '))}</div>
    <div class="kotak">Bilangan rekod<b>${d.ringkasan.bilRekod}</b></div>
    <div class="kotak">Mileage terkini<b>${km(d.ringkasan.mileageTerkini)}</b></div>
    <div class="kotak">Jumlah kos<b>${rm(d.ringkasan.jumlahKos)}</b></div>
    ${k.tamatCukai ? `<div class="kotak">Cukai jalan tamat<b>${fmt(k.tamatCukai)}</b></div>` : ''}
    ${k.tamatInsurans ? `<div class="kotak">Insurans tamat<b>${fmt(k.tamatInsurans)}</b></div>` : ''}
    <table><tr><th>Tarikh</th><th>Aktiviti</th><th class="n">Mileage</th><th>Bengkel</th><th class="n">Kos</th></tr>
    ${baris || '<tr><td colspan="5">Tiada rekod.</td></tr>'}</table>
    <div class="kaki">Dijana pada ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')} — Rekod Maintenance Kenderaan</div>
  </body></html>`;

  const pdf = Utilities.newBlob(html, 'text/html', 'laporan.html').getAs('application/pdf');
  return { nama: `Sejarah_Maintenance_${k.plat}.pdf`, b64: Utilities.base64Encode(pdf.getBytes()) };
}

/* ===================== Peringatan ===================== */

const TAHAP = { '': 0, ok: 1, hampir: 2, lewat: 3 };

/**
 * Tandakan peringatan aktif & status setiap rekod.
 * Peringatan aktif = rekod TERBARU bagi kenderaan + aktiviti yang sama, yang ada mileage/tarikh peringatan.
 * Pulangkan peta mileage terkini setiap plat (dari rekod servis & log mileage).
 */
function prosesPeringatan_(semua, log) {
  const maxKm = {};
  const naik = (p, km) => { if (km !== '' && !isNaN(km)) maxKm[p] = Math.max(maxKm[p] || 0, Number(km)); };
  semua.forEach(r => naik(r.plat, r.mileage));
  (log || []).forEach(m => naik(m.plat, m.mileage));

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

/** Status cukai jalan & insurans satu kenderaan. */
function statusDokumen_(k) {
  const hariIni = keHari_(fmtDate_(new Date()));
  return DOKUMEN.filter(d => k[d.kod === 'cukai' ? 'tamatCukai' : 'tamatInsurans']).map(d => {
    const tarikh = k[d.kod === 'cukai' ? 'tamatCukai' : 'tamatInsurans'];
    const baki = keHari_(tarikh) - hariIni;
    return { kod: d.kod, nama: d.nama, tarikh: tarikh, bakiHari: baki,
             status: baki < 0 ? 'lewat' : baki <= DOKUMEN_HARI[0] ? 'hampir' : 'ok' };
  });
}

/** Dipanggil oleh trigger harian: e-mel peringatan servis, cukai jalan & insurans (garaj sendiri). */
function semakPeringatanHarian() {
  const ss = ssSendiri_(false);
  if (!ss) return;                 // pengguna sudah padam Sheet — jangan cipta baru dari trigger
  SS_CACHE = ss;

  const semua = bacaRekod_();
  prosesPeringatan_(semua, bacaMileage_());
  const kenderaan = bacaKenderaan_();
  const model = {};
  kenderaan.forEach(k => model[k.plat] = k.model);

  const servis = semua.filter(r => r.aktif && r.ingatEmel && !r.emelDihantar && (
    (r.bakiHari !== null && r.bakiHari <= EMEL_HARI_SEBELUM) ||
    (r.bakiKm !== null && r.bakiKm <= HAMPIR_KM)));

  // Cukai jalan / insurans — notis pada 30 & 7 hari (setiap tahap sekali sahaja)
  const dokumen = [];
  kenderaan.forEach(k => statusDokumen_(k).forEach(d => {
    const def = DOKUMEN.find(x => x.kod === d.kod);
    const sudah = String(k.notis[d.kod] || '');
    const tahap = DOKUMEN_HARI.filter(h => d.bakiHari <= h).pop();   // tahap paling dekat yang dicapai
    if (tahap === undefined) return;
    const kunci = d.tarikh + '|' + tahap;
    const sudahLebihDekat = sudah.indexOf(d.tarikh + '|') === 0 && Number(sudah.split('|')[1]) <= tahap;
    if (sudahLebihDekat) return;
    dokumen.push({ plat: k.plat, aktiviti: d.nama, status: d.status, teks: teksHari_(d.bakiHari, d.tarikh),
                   baris: k.baris, kol: def.notis, kunci: kunci });
  }));

  if (!servis.length && !dokumen.length) return;

  const tr = (plat, aktiviti, status, teks) => {
    const warna = status === 'lewat' ? '#d93025' : '#b06d00';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee"><b>${esc_(plat)}</b><br><small>${esc_(model[plat] || '')}</small></td>
      <td style="padding:8px;border-bottom:1px solid #eee">${esc_(aktiviti)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;color:${warna}">${esc_(teks)}</td></tr>`;
  };
  const baris = servis.map(r => tr(r.plat, r.aktiviti, r.status, teksBaki_(r)))
    .concat(dokumen.map(d => tr(d.plat, d.aktiviti, d.status, d.teks))).join('');

  const html = `<div style="font-family:Arial,sans-serif;color:#1b1f24">
    <h2 style="color:#12386b;margin:0 0 8px">🔔 Peringatan Kenderaan</h2>
    <p>Perkara berikut perlu perhatian tidak lama lagi:</p>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr style="background:#12386b;color:#fff"><th style="padding:8px;text-align:left">Kenderaan</th>
      <th style="padding:8px;text-align:left">Perkara</th><th style="padding:8px;text-align:left">Status</th></tr>
      ${baris}
    </table>
    <p><a href="${ScriptApp.getService().getUrl()}">Buka Rekod Maintenance Kenderaan</a></p>
  </div>`;

  MailApp.sendEmail({
    to: emelSaya_(),
    subject: `🔔 Peringatan kenderaan: ${servis.length + dokumen.length} perkara`,
    htmlBody: html
  });

  const shR = getSheet_(SHEET_REKOD, HDR_REKOD);
  servis.forEach(r => shR.getRange(r.baris, R.EMEL_DIHANTAR + 1).setValue(new Date()));
  const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  dokumen.forEach(d => shK.getRange(d.baris, d.kol + 1).setValue(d.kunci));
}

function teksHari_(baki, tarikh) {
  const t = tarikh.split('-').reverse().join('/');
  return baki < 0 ? `Tamat ${-baki} hari lalu (${t})` : baki === 0 ? `Tamat hari ini (${t})` : `Tamat dalam ${baki} hari (${t})`;
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

/* ===================== Google Calendar ===================== */

function ciptaAcara_(plat, aktiviti, tarikhStr, ingatMileage) {
  return ciptaAcaraUmum_(`🔧 ${aktiviti} — ${plat}`, tarikhStr,
    `Peringatan maintenance kenderaan ${plat}: ${aktiviti}` +
    (ingatMileage !== '' ? `\nAtau pada ${Number(ingatMileage).toLocaleString()} km (mana dulu).` : ''));
}

function ciptaAcaraDokumen_(plat, nama, tarikhStr) {
  return ciptaAcaraUmum_(`📄 ${nama} tamat — ${plat}`, tarikhStr, `${nama} kenderaan ${plat} tamat pada tarikh ini. Sila perbaharui.`);
}

/** Amaran untuk dipaparkan kepada pengguna (cth. acara Calendar gagal dicipta). */
let AMARAN = [];

function ciptaAcaraUmum_(tajuk, tarikhStr, keterangan) {
  let ev;
  try {
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
    ev = CalendarApp.getDefaultCalendar().createAllDayEvent(tajuk, keTarikh_(tarikhStr),
      { description: keterangan + (url ? '\n\n' + url : '') });
  } catch (e) {
    console.error('Gagal cipta acara Calendar: ' + e);
    AMARAN.push('Acara Google Calendar gagal dicipta: ' + (e.message || e));
    return '';
  }
  // Notifikasi — jika gagal, acara tetap disimpan
  try {
    ev.removeAllReminders();
    ev.addPopupReminder(7 * 24 * 60 - 9 * 60); // 7 hari sebelum, ~9 pagi
    ev.addPopupReminder(24 * 60 - 9 * 60);     // 1 hari sebelum, ~9 pagi
  } catch (e) {
    console.warn('Acara dicipta tetapi notifikasi gagal ditetapkan: ' + e);
  }
  return ev.getId();
}

/**
 * UJIAN: jalankan dari editor (pilih ujiCalendar > Run), kemudian lihat Execution log.
 * Mencipta acara ujian esok hari, kemudian memadamnya semula.
 */
function ujiCalendar() {
  const cal = CalendarApp.getDefaultCalendar();
  console.log('Kalendar lalai: ' + cal.getName() + ' (' + cal.getId() + ')');
  const esok = fmtDate_(new Date(Date.now() + 86400000));
  const id = ciptaAcaraUmum_('🔧 Ujian Rekod Maintenance', esok, 'Acara ujian — akan dipadam automatik.');
  if (id) {
    console.log('BERJAYA cipta acara: ' + id);
    padamAcara_(id);
    console.log('Acara ujian telah dipadam. Calendar berfungsi dengan baik.');
  } else {
    console.log('GAGAL: ' + AMARAN.join(' | '));
  }
}

/**
 * BAIKI: cipta acara Calendar untuk peringatan aktif yang ada tarikh (akan datang)
 * tetapi tiada Calendar_ID. Jalankan dari editor selepas ujiCalendar berjaya.
 */
function baikiAcaraCalendar() {
  SS_CACHE = ssSendiri_(false);
  if (!SS_CACHE) return console.log('Tiada Sheet.');
  const semua = bacaRekod_();
  prosesPeringatan_(semua, bacaMileage_());
  const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
  const hariIni = keHari_(fmtDate_(new Date()));
  let bil = 0;
  semua.filter(r => r.aktif && r.ingatTarikh && !r.calendarId && keHari_(r.ingatTarikh) >= hariIni).forEach(r => {
    const id = ciptaAcara_(r.plat, r.aktiviti, r.ingatTarikh, r.ingatMileage);
    if (id) { sh.getRange(r.baris, R.CAL_ID + 1).setValue(id); bil++; }
  });
  // Cukai jalan & insurans
  const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  bacaKenderaan_().forEach(k => DOKUMEN.forEach(d => {
    const tarikh = d.kod === 'cukai' ? k.tamatCukai : k.tamatInsurans;
    const ada = shK.getRange(k.baris, d.cal + 1).getValue();
    if (tarikh && !ada && keHari_(tarikh) >= hariIni) {
      const id = ciptaAcaraDokumen_(k.plat, d.nama, tarikh);
      if (id) { shK.getRange(k.baris, d.cal + 1).setValue(id); bil++; }
    }
  }));
  console.log(`${bil} acara Calendar dicipta.` + (AMARAN.length ? ' Amaran: ' + AMARAN.join(' | ') : ''));
}

function padamAcara_(id) {
  if (!id) return;
  try {
    const ev = CalendarApp.getEventById(String(id));
    if (ev) ev.deleteEvent();
  } catch (e) {
    console.warn('Gagal padam acara Calendar (mungkin milik ahli lain): ' + e);
  }
}

/** Padam acara Calendar bagi peringatan yang sudah tidak aktif (diganti rekod baru). */
function bersihAcaraLama_() {
  const semua = bacaRekod_();
  prosesPeringatan_(semua, []);
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

/* ===================== Baca data ===================== */

function bacaKenderaan_() {
  const sh = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HDR_KENDERAAN.length).getValues()
    .map((r, i) => r[K.PLAT] ? kenderaanObj_(r, i + 2) : null)
    .filter(Boolean);
}

function kenderaanObj_(r, baris) {
  return {
    baris: baris,
    plat: String(r[K.PLAT]),
    model: String(r[K.MODEL] || ''),
    tahun: String(r[K.TAHUN] || ''),
    pemilik: String(r[K.PEMILIK] || ''),
    tarikhDaftar: fmtDate_(r[K.DAFTAR]),
    jenis: String(r[K.JENIS] || ''),
    ikon: String(r[K.IKON] || ''),
    tamatCukai: fmtDate_(r[K.CUKAI]),
    tamatInsurans: fmtDate_(r[K.INSURANS]),
    notis: { cukai: String(r[K.NOTIS_CUKAI] || ''), insurans: String(r[K.NOTIS_INSURANS] || '') }
  };
}

function findKenderaan_(plat) {
  return bacaKenderaan_().find(k => normPlat_(k.plat) === plat) || null;
}

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
    emelDihantar: !!r[R.EMEL_DIHANTAR],
    resitId: String(r[R.RESIT_ID] || ''),
    resitUrl: String(r[R.RESIT_URL] || '')
  }));
}

function bacaMileage_() {
  const sh = getSheet_(SHEET_MILEAGE, HDR_MILEAGE);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HDR_MILEAGE.length).getValues()
    .filter(r => r[1] !== '')
    .map(r => ({ plat: normPlat_(r[1]), tarikh: fmtDate_(r[2]), mileage: Number(r[3]) }));
}

/** Medan rekod yang dihantar ke frontend. */
function awam_(r) {
  return {
    id: r.id, tarikh: r.tarikh, aktiviti: r.aktiviti, mileage: r.mileage, kos: r.kos,
    bengkel: r.bengkel, catatan: r.catatan,
    ingatMileage: r.ingatMileage, ingatTarikh: r.ingatTarikh, ingatEmel: r.ingatEmel,
    adaKalendar: !!r.calendarId, resitUrl: r.resitUrl,
    aktif: r.aktif, status: r.status, bakiKm: r.bakiKm, bakiHari: r.bakiHari
  };
}

/* ===================== Helper ===================== */

function kunciAktiviti_(r) { return r.plat + '|' + r.aktiviti.trim().toLowerCase(); }

/** >0 jika a lebih baru daripada b (ikut tarikh, mileage, kemudian masa rekod). */
function bandingTerbaru_(a, b) {
  return a.tarikh.localeCompare(b.tarikh) || ((Number(a.mileage) || 0) - (Number(b.mileage) || 0)) || (a.masa - b.masa);
}

/** Senarai teks unik (tidak sensitif huruf besar/kecil). */
function unik_(arr) {
  const peta = {};
  arr.forEach(v => {
    const s = String(v || '').trim();
    if (s && !peta[s.toLowerCase()]) peta[s.toLowerCase()] = s;
  });
  return Object.keys(peta).map(k => peta[k]);
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
  const tarikh = tarikhSah_(data.ingatTarikh);
  return {
    mileage: km,
    tarikh: tarikh,
    tarikhObj: tarikh ? keTarikh_(tarikh) : '',
    emel: (km !== '' || tarikh) ? !!data.emel : false
  };
}

function tarikhSah_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '';
}

/** Cari nombor baris (1-based) di mana lajur `kol` sepadan dengan `nilai` selepas `norm`. */
function cariBaris_(sh, kol, nilai, norm) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const sasar = norm(nilai);
  const v = sh.getRange(2, kol + 1, last - 1, 1).getValues();
  for (let i = 0; i < v.length; i++) if (norm(v[i][0]) === sasar) return i + 2;
  return 0;
}

/** Padam beberapa baris (dari bawah supaya nombor baris tak berubah). */
function padamBaris_(sh, senarai) {
  senarai.slice().sort((a, b) => b - a).forEach(b => sh.deleteRow(b));
}

function getSheet_(name, header, book) {
  const ss = book || ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8eaed');
  } else if (sh.getLastColumn() < header.length) {
    // Sheet lama: tambah header lajur baru tanpa usik data sedia ada
    if (sh.getMaxColumns() < header.length) sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e8eaed');
  }
  return sh;
}

/** Kod ikon kenderaan (cth. 'sedan', 'kapcai') — huruf kecil sahaja. */
function kodIkon_(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
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

/** Kunci skrip — garaj boleh dikongsi antara pengguna, jadi guna kunci global. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
