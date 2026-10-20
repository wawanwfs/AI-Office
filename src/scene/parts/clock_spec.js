// Spesifikasi geometri jam dinding — murni (tanpa THREE/canvas), mudah diuji.
// Sudut dari 12 (arah atas), searah jarum jam, dalam radian.
export const HANDS = {
  hour: { len: 22, w: 4, color: '#222' },
  minute: { len: 32, w: 2.6, color: '#444' },
  second: { len: 36, w: 1.2, color: '#f97316' },
};
export const TICKS = 12;
export const tickAngle = (i) => (i * Math.PI) / 6;
export const tickInnerR = (i) => (i % 3 === 0 ? 35 : 39);
export const hourHandAngle = (minutes) =>
  ((((minutes / 60) % 12) * Math.PI) / 6);
export const minuteHandAngle = (minutes) => (minutes % 60) * (Math.PI / 30);
export const secondHandAngle = (seconds) => (seconds % 60) * (Math.PI / 30);
