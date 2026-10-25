// EAN-13 çizgi kodu kodlaması (GS1). Dokulara gerçek, okunabilir barkod çizer.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Bits(gtin: string): string | null {
  if (!/^\d{13}$/.test(gtin)) return null;
  const d = [...gtin].map(Number);
  const parity = PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

export function drawBarcode(ctx: CanvasRenderingContext2D, gtin: string, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 6, y - 6, w + 12, h + 26);
  const bits = ean13Bits(gtin);
  ctx.fillStyle = '#000000';
  if (bits) {
    const mw = w / bits.length;
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') ctx.fillRect(x + i * mw, y, Math.max(1, mw), h);
  } else {
    for (let i = 0; i < 40; i++) if ((i * 7) % 3) ctx.fillRect(x + (i * w) / 40, y, w / 80, h);
  }
  ctx.font = `600 ${Math.round(h * 0.28)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(gtin, x + w / 2, y + h + 2);
  ctx.restore();
}
