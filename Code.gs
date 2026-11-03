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
const SHEET_MINYAK = 'Minyak';

const HDR_KENDERAAN = ['No_Plat', 'Jenama_Model', 'Tahun', 'Pemilik', 'Tarikh_Daftar', 'Jenis', 'Ikon',
                       'Tamat_Cukai', 'Tamat_Insurans', 'Notis_Cukai', 'Notis_Insurans', 'Cal_Cukai', 'Cal_Insurans'];
const HDR_REKOD = ['ID', 'No_Plat', 'Tarikh', 'Jenis_Aktiviti', 'Mileage', 'Kos', 'Bengkel', 'Catatan', 'Masa_Rekod',
                   'Ingat_Mileage', 'Ingat_Tarikh', 'Ingat_Emel', 'Calendar_ID', 'Emel_Dihantar', 'Resit_ID', 'Resit_URL'];
const HDR_MILEAGE = ['ID', 'No_Plat', 'Tarikh', 'Mileage', 'Masa_Rekod'];
const HDR_TEMPLAT = ['No_Plat', 'Aktiviti', 'Selang_KM', 'Selang_Bulan'];
const HDR_MINYAK = ['ID', 'No_Plat', 'Tarikh', 'Odometer', 'Kuantiti', 'Harga_Seunit', 'Jumlah_RM', 'Penuh', 'Jenis_Tenaga', 'Stesen', 'Masa_Rekod'];
const JENIS_TENAGA = ['RON95', 'RON97', 'Diesel', 'EV'];   // EV dalam kWh, lain-lain dalam liter

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

/* ===================== Bahasa (BM / EN / 中文 / தமிழ்) ===================== */

const BAHASA_SAH = ['ms', 'en', 'zh', 'ta'];
const KAMUS_S = {
"ms": {
"e_emel_tak_sah": "Alamat e-mel tidak sah.",
"e_emel_sendiri": "Itu e-mel anda sendiri.",
"e_kod_tak_sah": "Kod garaj tidak sah.",
"e_garaj_sendiri": "Itu garaj anda sendiri.",
"e_tiada_akses": "Tiada akses. Minta pemilik garaj kongsi dengan e-mel anda ({e}) dahulu.",
"e_bukan_garaj": "Kod ini bukan garaj Rekod Maintenance Kenderaan.",
"e_garaj_tiada": "Garaj tidak dijumpai.",
"e_plat": "Sila masukkan nombor plat.",
"e_plat_perlu": "Nombor plat diperlukan.",
"e_jenis": "Sila pilih jenis kenderaan (Motorsikal / Kereta).",
"e_sudah_daftar": "Kenderaan {p} sudah didaftarkan.",
"e_kenderaan_tiada": "Kenderaan {p} tidak dijumpai.",
"e_plat_digunakan": "Nombor plat {p} sudah digunakan kenderaan lain.",
"e_belum_daftar": "Kenderaan {p} belum didaftarkan.",
"e_mileage": "Mileage tidak sah.",
"e_mileage_rendah": "Mileage {a} km lebih rendah daripada mileage terkini ({b} km).",
"e_id_rekod": "ID rekod tidak sah.",
"e_rekod_tiada": "Rekod tidak dijumpai. Mungkin telah dipadam.",
"e_rekod_bukan": "Rekod bukan milik kenderaan ini.",
"e_gambar_besar": "Gambar resit terlalu besar.",
"e_tarikh": "Tarikh diperlukan.",
"e_aktiviti": "Jenis aktiviti diperlukan.",
"e_kos": "Kos tidak sah.",
"e_ingat_km": "Mileage peringatan tidak sah.",
"e_ingat_tinggi": "Mileage peringatan mesti lebih tinggi daripada mileage semasa.",
"a_calendar_gagal": "Acara Google Calendar gagal dicipta: {m}",
"garaj_saya": "Garaj saya",
"garaj_milik": "Garaj {e}",
"cukai": "Cukai jalan",
"insurans": "Insurans",
"pdf_tajuk": "Sejarah Maintenance",
"pdf_bil": "Bilangan rekod",
"pdf_km": "Mileage terkini",
"pdf_kos": "Jumlah kos",
"pdf_cukai": "Cukai jalan tamat",
"pdf_insurans": "Insurans tamat",
"pdf_c_tarikh": "Tarikh",
"pdf_c_aktiviti": "Aktiviti",
"pdf_c_mileage": "Mileage",
"pdf_c_bengkel": "Bengkel",
"pdf_c_kos": "Kos",
"pdf_tiada": "Tiada rekod.",
"pdf_dijana": "Dijana pada {t} — Rekod Maintenance Kenderaan",
"pdf_fail": "Sejarah_Maintenance",
"em_tajuk": "🔔 Peringatan Kenderaan",
"em_intro": "Perkara berikut perlu perhatian tidak lama lagi:",
"em_c_kenderaan": "Kenderaan",
"em_c_perkara": "Perkara",
"em_c_status": "Status",
"em_buka": "Buka Rekod Maintenance Kenderaan",
"em_subjek": "🔔 Peringatan kenderaan: {n} perkara",
"b_lewat_km": "Lewat {a} km (pada {b} km)",
"b_baki_km": "Baki {a} km (pada {b} km)",
"b_lewat_hari": "Lewat {n} hari ({t})",
"b_hari_ini": "Hari ini ({t})",
"b_hari_lagi": "{n} hari lagi ({t})",
"b_atau": " atau ",
"h_tamat_lalu": "Tamat {n} hari lalu ({t})",
"h_tamat_hari_ini": "Tamat hari ini ({t})",
"h_tamat_dalam": "Tamat dalam {n} hari ({t})",
"c_servis_ket": "Peringatan maintenance kenderaan {p}: {a}",
"c_atau_km": "Atau pada {k} km (mana dulu).",
"c_dok_tajuk": "📄 {d} tamat — {p}",
"c_dok_ket": "{d} kenderaan {p} tamat pada tarikh ini. Sila perbaharui.",
"e_kuantiti": "Kuantiti (liter / kWh) tidak sah.",
"e_jenis_tenaga": "Jenis minyak / tenaga tidak sah.",
"pdf_minyak": "Minyak / Cas",
"pdf_purata_eff": "Purata kecekapan",
"pdf_jum_minyak": "Jumlah belanja minyak / cas",
"pdf_c_odo": "Odometer",
"pdf_c_jenis": "Jenis",
"pdf_c_kuantiti": "Kuantiti",
"pdf_c_eff": "Kecekapan"
},
"en": {
"e_emel_tak_sah": "Invalid email address.",
"e_emel_sendiri": "That is your own email.",
"e_kod_tak_sah": "Invalid garage code.",
"e_garaj_sendiri": "That is your own garage.",
"e_tiada_akses": "No access. Ask the garage owner to share it with your email ({e}) first.",
"e_bukan_garaj": "This code is not a Vehicle Maintenance Log garage.",
"e_garaj_tiada": "Garage not found.",
"e_plat": "Please enter a plate number.",
"e_plat_perlu": "Plate number is required.",
"e_jenis": "Please choose a vehicle type (Motorcycle / Car).",
"e_sudah_daftar": "Vehicle {p} is already registered.",
"e_kenderaan_tiada": "Vehicle {p} not found.",
"e_plat_digunakan": "Plate number {p} is already used by another vehicle.",
"e_belum_daftar": "Vehicle {p} is not registered yet.",
"e_mileage": "Invalid mileage.",
"e_mileage_rendah": "Mileage {a} km is lower than the latest mileage ({b} km).",
"e_id_rekod": "Invalid record ID.",
"e_rekod_tiada": "Record not found. It may have been deleted.",
"e_rekod_bukan": "This record does not belong to this vehicle.",
"e_gambar_besar": "Receipt image is too large.",
"e_tarikh": "Date is required.",
"e_aktiviti": "Activity type is required.",
"e_kos": "Invalid cost.",
"e_ingat_km": "Invalid reminder mileage.",
"e_ingat_tinggi": "Reminder mileage must be higher than the current mileage.",
"a_calendar_gagal": "Google Calendar event could not be created: {m}",
"garaj_saya": "My garage",
"garaj_milik": "{e}'s garage",
"cukai": "Road tax",
"insurans": "Insurance",
"pdf_tajuk": "Maintenance History",
"pdf_bil": "Number of records",
"pdf_km": "Latest mileage",
"pdf_kos": "Total cost",
"pdf_cukai": "Road tax expires",
"pdf_insurans": "Insurance expires",
"pdf_c_tarikh": "Date",
"pdf_c_aktiviti": "Activity",
"pdf_c_mileage": "Mileage",
"pdf_c_bengkel": "Workshop",
"pdf_c_kos": "Cost",
"pdf_tiada": "No records.",
"pdf_dijana": "Generated on {t} — Vehicle Maintenance Log",
"pdf_fail": "Maintenance_History",
"em_tajuk": "🔔 Vehicle Reminders",
"em_intro": "The following items need attention soon:",
"em_c_kenderaan": "Vehicle",
"em_c_perkara": "Item",
"em_c_status": "Status",
"em_buka": "Open Vehicle Maintenance Log",
"em_subjek": "🔔 Vehicle reminders: {n} item(s)",
"b_lewat_km": "{a} km overdue (at {b} km)",
"b_baki_km": "{a} km to go (at {b} km)",
"b_lewat_hari": "{n} days overdue ({t})",
"b_hari_ini": "Today ({t})",
"b_hari_lagi": "In {n} days ({t})",
"b_atau": " or ",
"h_tamat_lalu": "Expired {n} days ago ({t})",
"h_tamat_hari_ini": "Expires today ({t})",
"h_tamat_dalam": "Expires in {n} days ({t})",
"c_servis_ket": "Maintenance reminder for vehicle {p}: {a}",
"c_atau_km": "Or at {k} km (whichever comes first).",
"c_dok_tajuk": "📄 {d} expires — {p}",
"c_dok_ket": "{d} for vehicle {p} expires on this date. Please renew.",
"e_kuantiti": "Invalid quantity (litres / kWh).",
"e_jenis_tenaga": "Invalid fuel / energy type.",
"pdf_minyak": "Fuel / Charging",
"pdf_purata_eff": "Average efficiency",
"pdf_jum_minyak": "Total fuel / charging spend",
"pdf_c_odo": "Odometer",
"pdf_c_jenis": "Type",
"pdf_c_kuantiti": "Quantity",
"pdf_c_eff": "Efficiency"
},
"zh": {
"e_emel_tak_sah": "电邮地址无效。",
"e_emel_sendiri": "这是您自己的电邮。",
"e_kod_tak_sah": "车库代码无效。",
"e_garaj_sendiri": "这是您自己的车库。",
"e_tiada_akses": "无权访问。请先让车库主人与您的电邮（{e}）共享。",
"e_bukan_garaj": "此代码不是车辆保养记录的车库。",
"e_garaj_tiada": "找不到车库。",
"e_plat": "请输入车牌号码。",
"e_plat_perlu": "必须填写车牌号码。",
"e_jenis": "请选择车辆类型（摩托车 / 汽车）。",
"e_sudah_daftar": "车辆 {p} 已登记。",
"e_kenderaan_tiada": "找不到车辆 {p}。",
"e_plat_digunakan": "车牌号码 {p} 已被其他车辆使用。",
"e_belum_daftar": "车辆 {p} 尚未登记。",
"e_mileage": "里程无效。",
"e_mileage_rendah": "里程 {a} 公里低于最新里程（{b} 公里）。",
"e_id_rekod": "记录编号无效。",
"e_rekod_tiada": "找不到记录，可能已被删除。",
"e_rekod_bukan": "此记录不属于该车辆。",
"e_gambar_besar": "收据图片太大。",
"e_tarikh": "必须填写日期。",
"e_aktiviti": "必须选择保养项目。",
"e_kos": "费用无效。",
"e_ingat_km": "提醒里程无效。",
"e_ingat_tinggi": "提醒里程必须高于当前里程。",
"a_calendar_gagal": "无法创建 Google 日历活动：{m}",
"garaj_saya": "我的车库",
"garaj_milik": "{e} 的车库",
"cukai": "路税",
"insurans": "保险",
"pdf_tajuk": "保养历史",
"pdf_bil": "记录数量",
"pdf_km": "最新里程",
"pdf_kos": "总费用",
"pdf_cukai": "路税到期",
"pdf_insurans": "保险到期",
"pdf_c_tarikh": "日期",
"pdf_c_aktiviti": "项目",
"pdf_c_mileage": "里程",
"pdf_c_bengkel": "维修厂",
"pdf_c_kos": "费用",
"pdf_tiada": "没有记录。",
"pdf_dijana": "生成于 {t} — 车辆保养记录",
"pdf_fail": "Maintenance_History",
"em_tajuk": "🔔 车辆提醒",
"em_intro": "以下事项即将需要处理：",
"em_c_kenderaan": "车辆",
"em_c_perkara": "事项",
"em_c_status": "状态",
"em_buka": "打开车辆保养记录",
"em_subjek": "🔔 车辆提醒：{n} 项",
"b_lewat_km": "已超出 {a} 公里（于 {b} 公里）",
"b_baki_km": "还剩 {a} 公里（于 {b} 公里）",
"b_lewat_hari": "逾期 {n} 天（{t}）",
"b_hari_ini": "今天（{t}）",
"b_hari_lagi": "还有 {n} 天（{t}）",
"b_atau": " 或 ",
"h_tamat_lalu": "已于 {n} 天前到期（{t}）",
"h_tamat_hari_ini": "今天到期（{t}）",
"h_tamat_dalam": "{n} 天后到期（{t}）",
"c_servis_ket": "车辆 {p} 保养提醒：{a}",
"c_atau_km": "或于 {k} 公里时（以先到者为准）。",
"c_dok_tajuk": "📄 {d} 到期 — {p}",
"c_dok_ket": "车辆 {p} 的{d}于此日期到期，请续期。",
"e_kuantiti": "数量（升 / kWh）无效。",
"e_jenis_tenaga": "燃料 / 能源类型无效。",
"pdf_minyak": "燃油 / 充电",
"pdf_purata_eff": "平均能耗",
"pdf_jum_minyak": "燃油 / 充电总开销",
"pdf_c_odo": "里程表",
"pdf_c_jenis": "类型",
"pdf_c_kuantiti": "数量",
"pdf_c_eff": "能耗"
},
"ta": {
"e_emel_tak_sah": "தவறான மின்னஞ்சல் முகவரி.",
"e_emel_sendiri": "அது உங்கள் சொந்த மின்னஞ்சல்.",
"e_kod_tak_sah": "தவறான கேரேஜ் குறியீடு.",
"e_garaj_sendiri": "அது உங்கள் சொந்த கேரேஜ்.",
"e_tiada_akses": "அணுகல் இல்லை. கேரேஜ் உரிமையாளரை முதலில் உங்கள் மின்னஞ்சலுடன் ({e}) பகிரச் சொல்லுங்கள்.",
"e_bukan_garaj": "இந்தக் குறியீடு வாகன பராமரிப்புப் பதிவு கேரேஜ் அல்ல.",
"e_garaj_tiada": "கேரேஜ் கிடைக்கவில்லை.",
"e_plat": "பதிவு எண்ணை உள்ளிடவும்.",
"e_plat_perlu": "பதிவு எண் தேவை.",
"e_jenis": "வாகன வகையைத் தேர்ந்தெடுக்கவும் (மோட்டார் சைக்கிள் / கார்).",
"e_sudah_daftar": "வாகனம் {p} ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.",
"e_kenderaan_tiada": "வாகனம் {p} கிடைக்கவில்லை.",
"e_plat_digunakan": "பதிவு எண் {p} ஏற்கனவே வேறு வாகனத்தால் பயன்படுத்தப்படுகிறது.",
"e_belum_daftar": "வாகனம் {p} இன்னும் பதிவு செய்யப்படவில்லை.",
"e_mileage": "தவறான மைலேஜ்.",
"e_mileage_rendah": "மைலேஜ் {a} கி.மீ சமீபத்திய மைலேஜை ({b} கி.மீ) விடக் குறைவு.",
"e_id_rekod": "தவறான பதிவு அடையாளம்.",
"e_rekod_tiada": "பதிவு கிடைக்கவில்லை. அது நீக்கப்பட்டிருக்கலாம்.",
"e_rekod_bukan": "இந்தப் பதிவு இந்த வாகனத்திற்குச் சொந்தமானது அல்ல.",
"e_gambar_besar": "ரசீது படம் மிகப் பெரியது.",
"e_tarikh": "தேதி தேவை.",
"e_aktiviti": "செயல்பாட்டு வகை தேவை.",
"e_kos": "தவறான செலவு.",
"e_ingat_km": "தவறான நினைவூட்டல் மைலேஜ்.",
"e_ingat_tinggi": "நினைவூட்டல் மைலேஜ் தற்போதைய மைலேஜை விட அதிகமாக இருக்க வேண்டும்.",
"a_calendar_gagal": "Google Calendar நிகழ்வை உருவாக்க முடியவில்லை: {m}",
"garaj_saya": "என் கேரேஜ்",
"garaj_milik": "{e} கேரேஜ்",
"cukai": "சாலை வரி",
"insurans": "காப்பீடு",
"pdf_tajuk": "பராமரிப்பு வரலாறு",
"pdf_bil": "பதிவுகளின் எண்ணிக்கை",
"pdf_km": "சமீபத்திய மைலேஜ்",
"pdf_kos": "மொத்த செலவு",
"pdf_cukai": "சாலை வரி காலாவதி",
"pdf_insurans": "காப்பீடு காலாவதி",
"pdf_c_tarikh": "தேதி",
"pdf_c_aktiviti": "செயல்பாடு",
"pdf_c_mileage": "மைலேஜ்",
"pdf_c_bengkel": "பணிமனை",
"pdf_c_kos": "செலவு",
"pdf_tiada": "பதிவுகள் இல்லை.",
"pdf_dijana": "{t} அன்று உருவாக்கப்பட்டது — வாகன பராமரிப்புப் பதிவு",
"pdf_fail": "Maintenance_History",
"em_tajuk": "🔔 வாகன நினைவூட்டல்கள்",
"em_intro": "பின்வருவன விரைவில் கவனம் தேவை:",
"em_c_kenderaan": "வாகனம்",
"em_c_perkara": "விஷயம்",
"em_c_status": "நிலை",
"em_buka": "வாகன பராமரிப்புப் பதிவைத் திற",
"em_subjek": "🔔 வாகன நினைவூட்டல்கள்: {n}",
"b_lewat_km": "{a} கி.மீ தாமதம் ({b} கி.மீ-இல்)",
"b_baki_km": "இன்னும் {a} கி.மீ ({b} கி.மீ-இல்)",
"b_lewat_hari": "{n} நாட்கள் தாமதம் ({t})",
"b_hari_ini": "இன்று ({t})",
"b_hari_lagi": "{n} நாட்களில் ({t})",
"b_atau": " அல்லது ",
"h_tamat_lalu": "{n} நாட்களுக்கு முன் காலாவதியானது ({t})",
"h_tamat_hari_ini": "இன்று காலாவதியாகிறது ({t})",
"h_tamat_dalam": "{n} நாட்களில் காலாவதியாகிறது ({t})",
"c_servis_ket": "வாகனம் {p} பராமரிப்பு நினைவூட்டல்: {a}",
"c_atau_km": "அல்லது {k} கி.மீ-இல் (எது முதலில்).",
"c_dok_tajuk": "📄 {d} காலாவதி — {p}",
"c_dok_ket": "வாகனம் {p}-இன் {d} இந்தத் தேதியில் காலாவதியாகிறது. புதுப்பிக்கவும்.",
"e_kuantiti": "தவறான அளவு (லிட்டர் / kWh).",
"e_jenis_tenaga": "தவறான எரிபொருள் / ஆற்றல் வகை.",
"pdf_minyak": "எரிபொருள் / சார்ஜ்",
"pdf_purata_eff": "சராசரி செயல்திறன்",
"pdf_jum_minyak": "மொத்த எரிபொருள் / சார்ஜ் செலவு",
"pdf_c_odo": "ஓடோமீட்டர்",
"pdf_c_jenis": "வகை",
"pdf_c_kuantiti": "அளவு",
"pdf_c_eff": "செயல்திறன்"
}
};
const AKTIVITI_S = {
"ms": {
"Servis berkala": "Servis berkala",
"Tukar minyak enjin": "Tukar minyak enjin",
"Tukar penapis minyak": "Tukar penapis minyak",
"Tukar penapis udara": "Tukar penapis udara",
"Tukar tayar": "Tukar tayar",
"Alignment / Balancing": "Alignment / Balancing",
"Tukar bateri": "Tukar bateri",
"Brek (pad/disc)": "Brek (pad/disc)",
"Minyak gear / ATF": "Minyak gear / ATF",
"Coolant / Radiator": "Coolant / Radiator",
"Aircond": "Aircond",
"Cukai jalan / Insurans": "Cukai jalan / Insurans",
"Pemeriksaan PUSPAKOM": "Pemeriksaan PUSPAKOM",
"Pembaikan": "Pembaikan",
"Cukai jalan": "Cukai jalan",
"Insurans": "Insurans"
},
"en": {
"Servis berkala": "Periodic service",
"Tukar minyak enjin": "Engine oil change",
"Tukar penapis minyak": "Oil filter change",
"Tukar penapis udara": "Air filter change",
"Tukar tayar": "Tyre change",
"Alignment / Balancing": "Alignment / Balancing",
"Tukar bateri": "Battery change",
"Brek (pad/disc)": "Brakes (pads/discs)",
"Minyak gear / ATF": "Gear oil / ATF",
"Coolant / Radiator": "Coolant / Radiator",
"Aircond": "Air-conditioning",
"Cukai jalan / Insurans": "Road tax / Insurance",
"Pemeriksaan PUSPAKOM": "PUSPAKOM inspection",
"Pembaikan": "Repair",
"Cukai jalan": "Road tax",
"Insurans": "Insurance"
},
"zh": {
"Servis berkala": "定期保养",
"Tukar minyak enjin": "更换机油",
"Tukar penapis minyak": "更换机油滤芯",
"Tukar penapis udara": "更换空气滤芯",
"Tukar tayar": "更换轮胎",
"Alignment / Balancing": "四轮定位 / 平衡",
"Tukar bateri": "更换电池",
"Brek (pad/disc)": "刹车（刹车片/碟盘）",
"Minyak gear / ATF": "齿轮油 / 变速箱油",
"Coolant / Radiator": "冷却液 / 水箱",
"Aircond": "冷气",
"Cukai jalan / Insurans": "路税 / 保险",
"Pemeriksaan PUSPAKOM": "PUSPAKOM 检验",
"Pembaikan": "维修",
"Cukai jalan": "路税",
"Insurans": "保险"
},
"ta": {
"Servis berkala": "காலமுறை சேவை",
"Tukar minyak enjin": "இன்ஜின் எண்ணெய் மாற்றம்",
"Tukar penapis minyak": "எண்ணெய் வடிகட்டி மாற்றம்",
"Tukar penapis udara": "காற்று வடிகட்டி மாற்றம்",
"Tukar tayar": "டயர் மாற்றம்",
"Alignment / Balancing": "அலைன்மென்ட் / பேலன்சிங்",
"Tukar bateri": "பேட்டரி மாற்றம்",
"Brek (pad/disc)": "பிரேக் (பேட்/டிஸ்க்)",
"Minyak gear / ATF": "கியர் எண்ணெய் / ATF",
"Coolant / Radiator": "குளிரூட்டி / ரேடியேட்டர்",
"Aircond": "குளிர்சாதனம்",
"Cukai jalan / Insurans": "சாலை வரி / காப்பீடு",
"Pemeriksaan PUSPAKOM": "PUSPAKOM ஆய்வு",
"Pembaikan": "பழுதுபார்ப்பு",
"Cukai jalan": "சாலை வரி",
"Insurans": "காப்பீடு"
}
};
let BAHASA_CACHE = null;

/** Bahasa pengguna semasa (disimpan dalam UserProperties). */
function bahasa_() {
  if (BAHASA_CACHE) return BAHASA_CACHE;
  const b = PropertiesService.getUserProperties().getProperty('BAHASA');
  return (BAHASA_CACHE = BAHASA_SAH.indexOf(b) >= 0 ? b : 'ms');
}

/** Simpan pilihan bahasa (dipanggil dari app). */
function simpanBahasa(b) {
  if (BAHASA_SAH.indexOf(b) < 0) return bahasa_();
  PropertiesService.getUserProperties().setProperty('BAHASA', b);
  BAHASA_CACHE = b;
  return b;
}

/** Terjemah kunci, ganti {pembolehubah}. */
function T_(k, v) {
  const b = bahasa_();
  let s = (KAMUS_S[b] && KAMUS_S[b][k]) || KAMUS_S.ms[k] || k;
  Object.keys(v || {}).forEach(x => { s = s.split('{' + x + '}').join(String(v[x])); });
  return s;
}

/** Nama jenis kenderaan ikut bahasa. */
function namaJenis_(j) {
  const t = { Motorsikal: { ms: 'Motorsikal', en: 'Motorcycle', zh: '摩托车', ta: 'மோட்டார் சைக்கிள்' },
              Kereta: { ms: 'Kereta', en: 'Car', zh: '汽车', ta: 'கார்' } }[j];
  return t ? t[bahasa_()] : j;
}

/** Nama aktiviti asas ikut bahasa (aktiviti lain dipapar seperti ditaip). */
function namaAktiviti_(a) {
  const t = AKTIVITI_S[bahasa_()];
  return (t && t[a]) || a;
}

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
    .filter(s => [SHEET_KENDERAAN, SHEET_REKOD, SHEET_MILEAGE, SHEET_TEMPLAT, SHEET_MINYAK].indexOf(s.getName()) < 0)
    .forEach(s => ss.deleteSheet(s));   // buang "Sheet1" lalai
  try { pasangTrigger_(); } catch (e) { console.error('Gagal pasang trigger: ' + e); }
  return ss;
}

function sediaTab_(ss) {
  getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN, ss).getRange('A:A').setNumberFormat('@');
  getSheet_(SHEET_REKOD, HDR_REKOD, ss).getRange('A:B').setNumberFormat('@');
  getSheet_(SHEET_MILEAGE, HDR_MILEAGE, ss).getRange('A:B').setNumberFormat('@');
  getSheet_(SHEET_TEMPLAT, HDR_TEMPLAT, ss).getRange('A:A').setNumberFormat('@');
  getSheet_(SHEET_MINYAK, HDR_MINYAK, ss).getRange('A:B').setNumberFormat('@');
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
  try { return T_('garaj_milik', { e: ss.getOwner().getEmail() }); } catch (e) { return ss.getName(); }
}

/** Maklumat pengguna & garaj untuk dipaparkan di app. */
function maklumatPengguna() {
  const ss = ss_();
  const sendiri = ssSendiri_(true);
  return {
    emel: emelSaya_(),
    urlSheet: ss.getUrl(),
    garajSendiri: ss.getId() === sendiri.getId(),
    namaGaraj: ss.getId() === sendiri.getId() ? T_('garaj_saya') : namaGaraj_(ss),
    bahasa: bahasa_()
  };
}

/** Senarai garaj + ahli garaj sendiri. */
function senaraiGaraj() {
  const saya = emelSaya_();
  const sendiri = ssSendiri_(true);
  const aktifId = ss_().getId();
  const garaj = [{ id: sendiri.getId(), nama: T_('garaj_saya'), sendiri: true, aktif: aktifId === sendiri.getId() }];
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emel)) throw new Error(T_('e_emel_tak_sah'));
  if (emel === emelSaya_().toLowerCase()) throw new Error(T_('e_emel_sendiri'));
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
  if (!m) throw new Error(T_('e_kod_tak_sah'));
  const id = m[0];
  if (id === ssSendiri_(true).getId()) throw new Error(T_('e_garaj_sendiri'));
  const ss = bukaSS_(id);
  if (!ss) throw new Error(T_('e_tiada_akses', { e: emelSaya_() }));
  if (!ss.getSheetByName(SHEET_KENDERAAN)) throw new Error(T_('e_bukan_garaj'));

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
  else throw new Error(T_('e_garaj_tiada'));
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
  if (!plat) throw new Error(T_('e_plat'));

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
    minyak: bacaMinyak_().filter(m => m.plat === plat).map(m => { const o = Object.assign({}, m); delete o.baris; delete o.plat; return o; }),
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
  if (!plat) throw new Error(T_('e_plat_perlu'));
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error(T_('e_jenis'));
  const cukai = tarikhSah_(data.tamatCukai), insurans = tarikhSah_(data.tamatInsurans);

  return withLock_(() => {
    if (findKenderaan_(plat)) throw new Error(T_('e_sudah_daftar', { p: plat }));
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
  if (!asal || !baru) throw new Error(T_('e_plat_perlu'));
  if (JENIS_KENDERAAN.indexOf(data.jenis) < 0) throw new Error(T_('e_jenis'));
  const tarikhBaru = { cukai: tarikhSah_(data.tamatCukai), insurans: tarikhSah_(data.tamatInsurans) };

  return withLock_(() => {
    const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
    const baris = cariBaris_(shK, 0, asal, normPlat_);
    if (!baris) throw new Error(T_('e_kenderaan_tiada', { p: asal }));
    if (baru !== asal && findKenderaan_(baru)) throw new Error(T_('e_plat_digunakan', { p: baru }));

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
  [[SHEET_MILEAGE, HDR_MILEAGE, 1], [SHEET_TEMPLAT, HDR_TEMPLAT, 0], [SHEET_MINYAK, HDR_MINYAK, 1]].forEach(([nama, hdr, kol]) => {
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
    if (!baris) throw new Error(T_('e_kenderaan_tiada', { p: plat }));
    const row = shK.getRange(baris, 1, 1, HDR_KENDERAAN.length).getValues()[0];
    DOKUMEN.forEach(d => padamAcara_(row[d.cal]));

    const rekod = bacaRekod_().filter(r => r.plat === plat);
    rekod.forEach(r => { padamAcara_(r.calendarId); padamResit_(r.resitId); });
    padamBaris_(getSheet_(SHEET_REKOD, HDR_REKOD), rekod.map(r => r.baris));

    [[SHEET_MILEAGE, HDR_MILEAGE, 1], [SHEET_TEMPLAT, HDR_TEMPLAT, 0], [SHEET_MINYAK, HDR_MINYAK, 1]].forEach(([nama, hdr, kol]) => {
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
  if (!data.mileage || isNaN(km) || km < 0) throw new Error(T_('e_mileage'));
  const tarikh = tarikhSah_(data.tarikh) || fmtDate_(new Date());

  return withLock_(() => {
    if (!findKenderaan_(plat)) throw new Error(T_('e_kenderaan_tiada', { p: plat }));
    const maxKm = prosesPeringatan_(bacaRekod_(), bacaMileage_());
    if (km < (maxKm[plat] || 0)) {
      throw new Error(T_('e_mileage_rendah', { a: km.toLocaleString(), b: (maxKm[plat] || 0).toLocaleString() }));
    }
    getSheet_(SHEET_MILEAGE, HDR_MILEAGE).appendRow([Utilities.getUuid().slice(0, 8), plat, keTarikh_(tarikh), km, new Date()]);
    return cariKenderaan(plat);
  });
}

/* ===================== Rekod maintenance ===================== */

/** Tambah rekod maintenance (dengan peringatan, templat & resit jika ada). */
function tambahRekod(data) {
  const plat = normPlat_(data.plat);
  if (!plat) throw new Error(T_('e_plat_perlu'));
  const nilai = nilaiRekod_(data);
  const ingat = nilaiPeringatan_(data);

  return withLock_(() => {
    if (!findKenderaan_(plat)) throw new Error(T_('e_belum_daftar', { p: plat }));
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
  if (!data.id) throw new Error(T_('e_id_rekod'));
  const nilai = nilaiRekod_(data);
  const ingat = nilaiPeringatan_(data);

  return withLock_(() => {
    const sh = getSheet_(SHEET_REKOD, HDR_REKOD);
    const baris = cariBaris_(sh, R.ID, data.id, String);
    if (!baris) throw new Error(T_('e_rekod_tiada'));
    const row = sh.getRange(baris, 1, 1, HDR_REKOD.length).getValues()[0];
    if (normPlat_(row[R.PLAT]) !== plat) throw new Error(T_('e_rekod_bukan'));

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

/* ===================== Minyak / cas EV ===================== */

/** Tambah atau kemaskini isian minyak / cas EV. data.id kosong = baru. */
function simpanMinyak(data) {
  const plat = normPlat_(data.plat);
  const odo = Number(data.odometer), kuantiti = Number(data.kuantiti), jumlah = Number(data.jumlah);
  const harga = Number(data.harga) || (kuantiti > 0 ? jumlah / kuantiti : 0);
  if (!tarikhSah_(data.tarikh)) throw new Error(T_('e_tarikh'));
  if (!(odo > 0)) throw new Error(T_('e_mileage'));
  if (!(kuantiti > 0)) throw new Error(T_('e_kuantiti'));
  if (!(jumlah >= 0) || isNaN(jumlah)) throw new Error(T_('e_kos'));
  if (JENIS_TENAGA.indexOf(data.jenis) < 0) throw new Error(T_('e_jenis_tenaga'));

  return withLock_(() => {
    if (!findKenderaan_(plat)) throw new Error(T_('e_kenderaan_tiada', { p: plat }));
    const sh = getSheet_(SHEET_MINYAK, HDR_MINYAK);
    const nilai = [keTarikh_(data.tarikh), odo, Math.round(kuantiti * 1000) / 1000, Math.round(harga * 1000) / 1000,
                   Math.round(jumlah * 100) / 100, !!data.penuh, data.jenis, clean_(data.stesen)];
    if (data.id) {
      const baris = cariBaris_(sh, 0, data.id, String);
      if (!baris) throw new Error(T_('e_rekod_tiada'));
      if (normPlat_(sh.getRange(baris, 2).getValue()) !== plat) throw new Error(T_('e_rekod_bukan'));
      sh.getRange(baris, 3, 1, nilai.length).setValues([nilai]);
    } else {
      sh.appendRow([Utilities.getUuid().slice(0, 8), plat].concat(nilai, [new Date()]));
    }
    return cariKenderaan(plat);
  });
}

/**
 * Kira kecekapan dengan kaedah penuh-ke-penuh.
 * Setiap isian penuh menutup satu segmen: jarak sejak isian penuh sebelumnya ÷ jumlah kuantiti sejak itu.
 * Kenderaan liter & kWh dikira berasingan. Pulangkan { L: {...}, kWh: {...} }.
 */
function kiraMinyak_(senarai) {
  const hasil = {};
  ['L', 'kWh'].forEach(unit => {
    const isian = senarai.filter(m => (m.jenis === 'EV' ? 'kWh' : 'L') === unit)
      .sort((a, b) => (a.odometer - b.odometer) || a.tarikh.localeCompare(b.tarikh));
    if (!isian.length) return;
    const eff = {};
    let odoPenuh = null, kumpul = 0, rmKumpul = 0, jarak = 0, kuantiti = 0, rm = 0;
    isian.forEach(m => {
      if (odoPenuh !== null) { kumpul += m.kuantiti; rmKumpul += m.jumlah; }
      if (m.penuh) {
        if (odoPenuh !== null && m.odometer > odoPenuh && kumpul > 0) {
          eff[m.id] = (m.odometer - odoPenuh) / kumpul;
          jarak += m.odometer - odoPenuh; kuantiti += kumpul; rm += rmKumpul;
        }
        odoPenuh = m.odometer; kumpul = 0; rmKumpul = 0;
      }
    });
    hasil[unit] = { eff: eff, purata: kuantiti ? jarak / kuantiti : 0, rmSeKm: jarak ? rm / jarak : 0,
                    jumlahRM: isian.reduce((s, m) => s + m.jumlah, 0), bil: isian.length };
  });
  return hasil;
}

function padamMinyak(id, plat) {
  return withLock_(() => {
    const sh = getSheet_(SHEET_MINYAK, HDR_MINYAK);
    const baris = cariBaris_(sh, 0, id, String);
    if (baris) sh.deleteRow(baris);
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
  if (resit.b64.length > 8 * 1024 * 1024) throw new Error(T_('e_gambar_besar'));
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
  if (!d.wujud) throw new Error(T_('e_kenderaan_tiada', { p: plat }));
  const k = d.kenderaan;
  const fmt = s => s ? s.split('-').reverse().join('/') : '-';
  const rm = n => n === '' || n == null ? '-' : 'RM' + Number(n).toFixed(2);
  const km = n => n === '' || n == null ? '-' : Number(n).toLocaleString() + ' km';

  const baris = d.rekod.slice().reverse().map((r, i) => `
    <tr${i % 2 ? ' style="background:#f5f7fa"' : ''}>
      <td>${fmt(r.tarikh)}</td><td>${esc_(namaAktiviti_(r.aktiviti))}${r.catatan ? `<br><span class="c">${esc_(r.catatan)}</span>` : ''}</td>
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
    <h1>${T_('pdf_tajuk')} — ${esc_(k.plat)}</h1>
    <div class="sub">${esc_([namaJenis_(k.jenis), k.model, k.tahun, k.pemilik].filter(Boolean).join(' • '))}</div>
    <div class="kotak">${T_('pdf_bil')}<b>${d.ringkasan.bilRekod}</b></div>
    <div class="kotak">${T_('pdf_km')}<b>${km(d.ringkasan.mileageTerkini)}</b></div>
    <div class="kotak">${T_('pdf_kos')}<b>${rm(d.ringkasan.jumlahKos)}</b></div>
    ${k.tamatCukai ? `<div class="kotak">${T_('pdf_cukai')}<b>${fmt(k.tamatCukai)}</b></div>` : ''}
    ${k.tamatInsurans ? `<div class="kotak">${T_('pdf_insurans')}<b>${fmt(k.tamatInsurans)}</b></div>` : ''}
    <table><tr><th>${T_('pdf_c_tarikh')}</th><th>${T_('pdf_c_aktiviti')}</th><th class="n">${T_('pdf_c_mileage')}</th><th>${T_('pdf_c_bengkel')}</th><th class="n">${T_('pdf_c_kos')}</th></tr>
    ${baris || `<tr><td colspan="5">${T_('pdf_tiada')}</td></tr>`}</table>
    ${blokMinyakPdf_(d.minyak || [], fmt, rm, km)}
    <div class="kaki">${T_('pdf_dijana', { t: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') })}</div>
  </body></html>`;

  const pdf = Utilities.newBlob(html, 'text/html', 'laporan.html').getAs('application/pdf');
  return { nama: `${T_('pdf_fail')}_${k.plat}.pdf`, b64: Utilities.base64Encode(pdf.getBytes()) };
}

/** Bahagian minyak / cas dalam PDF. */
function blokMinyakPdf_(senarai, fmt, rm, km) {
  if (!senarai.length) return '';
  const k = kiraMinyak_(senarai);
  const ringkas = Object.keys(k).map(u => `
    <div class="kotak">${T_('pdf_purata_eff')} (${u === 'L' ? 'km/L' : 'km/kWh'})<b>${k[u].purata ? k[u].purata.toFixed(1) : '-'}</b></div>`).join('') +
    `<div class="kotak">${T_('pdf_jum_minyak')}<b>${rm(senarai.reduce((s, m) => s + m.jumlah, 0))}</b></div>`;
  const effSemua = Object.assign({}, ...Object.keys(k).map(u => k[u].eff));
  const baris = senarai.slice().sort((a, b) => a.tarikh.localeCompare(b.tarikh)).map((m, i) => {
    const unit = m.jenis === 'EV' ? 'kWh' : 'L';
    const e = effSemua[m.id];
    return `<tr${i % 2 ? ' style="background:#f5f7fa"' : ''}><td>${fmt(m.tarikh)}</td><td class="n">${km(m.odometer)}</td>
      <td>${esc_(m.jenis)}</td><td class="n">${m.kuantiti.toFixed(2)} ${unit}</td>
      <td class="n">${e ? e.toFixed(1) + ' km/' + unit : '-'}</td><td class="n">${rm(m.jumlah)}</td></tr>`;
  }).join('');
  return `<h2 style="color:#12386b;font-size:15px;margin:22px 0 8px">${T_('pdf_minyak')}</h2>${ringkas}
    <table><tr><th>${T_('pdf_c_tarikh')}</th><th class="n">${T_('pdf_c_odo')}</th><th>${T_('pdf_c_jenis')}</th>
    <th class="n">${T_('pdf_c_kuantiti')}</th><th class="n">${T_('pdf_c_eff')}</th><th class="n">${T_('pdf_c_kos')}</th></tr>${baris}</table>`;
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
    dokumen.push({ plat: k.plat, aktiviti: namaAktiviti_(d.nama), status: d.status, teks: teksHari_(d.bakiHari, d.tarikh),
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
  const baris = servis.map(r => tr(r.plat, namaAktiviti_(r.aktiviti), r.status, teksBaki_(r)))
    .concat(dokumen.map(d => tr(d.plat, d.aktiviti, d.status, d.teks))).join('');

  const html = `<div style="font-family:Arial,sans-serif;color:#1b1f24">
    <h2 style="color:#12386b;margin:0 0 8px">${T_('em_tajuk')}</h2>
    <p>${T_('em_intro')}</p>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr style="background:#12386b;color:#fff"><th style="padding:8px;text-align:left">${T_('em_c_kenderaan')}</th>
      <th style="padding:8px;text-align:left">${T_('em_c_perkara')}</th><th style="padding:8px;text-align:left">${T_('em_c_status')}</th></tr>
      ${baris}
    </table>
    <p><a href="${ScriptApp.getService().getUrl()}">${T_('em_buka')}</a></p>
  </div>`;

  MailApp.sendEmail({
    to: emelSaya_(),
    subject: T_('em_subjek', { n: servis.length + dokumen.length }),
    htmlBody: html
  });

  const shR = getSheet_(SHEET_REKOD, HDR_REKOD);
  servis.forEach(r => shR.getRange(r.baris, R.EMEL_DIHANTAR + 1).setValue(new Date()));
  const shK = getSheet_(SHEET_KENDERAAN, HDR_KENDERAAN);
  dokumen.forEach(d => shK.getRange(d.baris, d.kol + 1).setValue(d.kunci));
}

function teksHari_(baki, tarikh) {
  const t = tarikh.split('-').reverse().join('/');
  return baki < 0 ? T_('h_tamat_lalu', { n: -baki, t: t }) : baki === 0 ? T_('h_tamat_hari_ini', { t: t }) : T_('h_tamat_dalam', { n: baki, t: t });
}

function teksBaki_(r) {
  const bah = [];
  if (r.bakiKm !== null) bah.push(r.bakiKm <= 0
    ? T_('b_lewat_km', { a: Math.abs(r.bakiKm).toLocaleString(), b: r.ingatMileage.toLocaleString() })
    : T_('b_baki_km', { a: r.bakiKm.toLocaleString(), b: r.ingatMileage.toLocaleString() }));
  if (r.bakiHari !== null) {
    const t = r.ingatTarikh.split('-').reverse().join('/');
    bah.push(r.bakiHari < 0 ? T_('b_lewat_hari', { n: -r.bakiHari, t: t })
           : r.bakiHari === 0 ? T_('b_hari_ini', { t: t }) : T_('b_hari_lagi', { n: r.bakiHari, t: t }));
  }
  return bah.join(T_('b_atau'));
}

/* ===================== Google Calendar ===================== */

function ciptaAcara_(plat, aktiviti, tarikhStr, ingatMileage) {
  const a = namaAktiviti_(aktiviti);
  return ciptaAcaraUmum_(`🔧 ${a} — ${plat}`, tarikhStr,
    T_('c_servis_ket', { p: plat, a: a }) +
    (ingatMileage !== '' ? '\n' + T_('c_atau_km', { k: Number(ingatMileage).toLocaleString() }) : ''));
}

function ciptaAcaraDokumen_(plat, nama, tarikhStr) {
  const d = namaAktiviti_(nama);
  return ciptaAcaraUmum_(T_('c_dok_tajuk', { d: d, p: plat }), tarikhStr, T_('c_dok_ket', { d: d, p: plat }));
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
    AMARAN.push(T_('a_calendar_gagal', { m: e.message || e }));
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

/** Log mileage = kemas kini mileage pantas + bacaan odometer semasa isi minyak/cas. */
function bacaMileage_() {
  const sh = getSheet_(SHEET_MILEAGE, HDR_MILEAGE);
  const last = sh.getLastRow();
  const log = last < 2 ? [] : sh.getRange(2, 1, last - 1, HDR_MILEAGE.length).getValues()
    .filter(r => r[1] !== '')
    .map(r => ({ plat: normPlat_(r[1]), tarikh: fmtDate_(r[2]), mileage: Number(r[3]) }));
  return log.concat(bacaMinyak_().map(m => ({ plat: m.plat, tarikh: m.tarikh, mileage: m.odometer })));
}

function bacaMinyak_() {
  const sh = getSheet_(SHEET_MINYAK, HDR_MINYAK);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HDR_MINYAK.length).getValues()
    .map((r, i) => ({
      baris: i + 2, id: String(r[0]), plat: normPlat_(r[1]), tarikh: fmtDate_(r[2]),
      odometer: Number(r[3]) || 0, kuantiti: Number(r[4]) || 0, harga: Number(r[5]) || 0, jumlah: Number(r[6]) || 0,
      penuh: r[7] === true || String(r[7]).toUpperCase() === 'TRUE', jenis: String(r[8] || 'RON95'),
      stesen: String(r[9] || ''), masa: r[10] instanceof Date ? r[10].getTime() : 0
    }))
    .filter(m => m.plat);
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
  if (!data.tarikh) throw new Error(T_('e_tarikh'));
  if (!data.aktiviti) throw new Error(T_('e_aktiviti'));
  const mileage = Number(data.mileage);
  const kos = Number(data.kos);
  if (data.mileage !== '' && (isNaN(mileage) || mileage < 0)) throw new Error(T_('e_mileage'));
  if (data.kos !== '' && (isNaN(kos) || kos < 0)) throw new Error(T_('e_kos'));
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
  if (km !== '' && (isNaN(km) || km < 0)) throw new Error(T_('e_ingat_km'));
  if (km !== '' && data.mileage !== '' && km <= Number(data.mileage)) {
    throw new Error(T_('e_ingat_tinggi'));
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
