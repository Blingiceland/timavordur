// PINs that are too easy to guess for a colleague: repeated digits, straight
// sequences and common years. 4-digit PINs are only acceptable together with
// lock-out after failed attempts and the workplace network restriction.

export function isWeakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return true; // 0000, 1111 …
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10); // 1234, 7890
  const down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10); // 4321, 0987
  if (up || down) return true;
  if (d[0] === d[2] && d[1] === d[3]) return true; // 1212, 6969
  const n = Number(pin);
  if (n >= 1940 && n <= 2030) return true; // birth/current years
  return false;
}
