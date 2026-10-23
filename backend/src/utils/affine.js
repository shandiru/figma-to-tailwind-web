// 2x3 affine transforms shared by Figma export and legacy JSON import.
export const identity = () => [[1, 0, 0], [0, 1, 0]];
export function multiply(a, b) {
  return [
    [a[0][0]*b[0][0]+a[0][1]*b[1][0], a[0][0]*b[0][1]+a[0][1]*b[1][1], a[0][0]*b[0][2]+a[0][1]*b[1][2]+a[0][2]],
    [a[1][0]*b[0][0]+a[1][1]*b[1][0], a[1][0]*b[0][1]+a[1][1]*b[1][1], a[1][0]*b[0][2]+a[1][1]*b[1][2]+a[1][2]],
  ];
}
export function inverse(m) {
  const det = m[0][0]*m[1][1]-m[0][1]*m[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Singular layer transform');
  const a=m[1][1]/det, b=-m[0][1]/det, c=-m[1][0]/det, d=m[0][0]/det;
  return [[a,b,-a*m[0][2]-b*m[1][2]],[c,d,-c*m[0][2]-d*m[1][2]]];
}
