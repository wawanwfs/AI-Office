// Konversi unit waktu untuk jam dinding 3D (parts/clock_canvas.js).
// drawClockFace mengharapkan DETIK sejak tengah malam (minutes = nowSeconds/60),
// sedangkan scene menyimpan timeOfDay sebagai MENIT simulasi (0–1440).
// Bug lama: menit dimasukkan langsung sebagai detik → jam 14:30 tergambar
// sebagai 00:14 (jarum jam hampir di angka 12 terus-menerus).
export const simMinutesToClockSeconds = (m) => m * 60;
