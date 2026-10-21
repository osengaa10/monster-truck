// Trick names and scoring. Pure functions (no three.js, no DOM) so they can
// be tested with plain Node: `npm test`.

const SMALL = ['', '', 'DOUBLE', 'TRIPLE', 'QUADRUPLE', 'QUINTUPLE', 'SEXTUPLE', 'SEPTUPLE', 'OCTUPLE', 'NONUPLE', 'DECUPLE'];
const UNITS = ['', 'UN', 'DUO', 'TRE', 'QUATTUOR', 'QUIN', 'SEX', 'SEPTEN', 'OCTO', 'NOVEM'];
const TENS = ['', 'DECUPLE', 'VIGINTUPLE', 'TRIGINTUPLE', 'QUADRAGINTUPLE', 'QUINQUAGINTUPLE',
  'SEXAGINTUPLE', 'SEPTUAGINTUPLE', 'OCTOGINTUPLE', 'NONAGINTUPLE'];

// 1 -> '', 2 -> 'DOUBLE', 11 -> 'UNDECUPLE', 23 -> 'TREVIGINTUPLE', 100+ -> 'CENTUPLE'.
export function multiplier(n) {
  if (n < SMALL.length) return SMALL[n];
  if (n >= 100) return 'CENTUPLE';
  return UNITS[n % 10] + TENS[Math.floor(n / 10)];
}

const times = (n, trick) => {
  const m = multiplier(n);
  return m ? m + ' ' + trick : trick;
};

// counts: { backflips, frontflips, spinsL, spinsR, rollsL, rollsR } (all >= 0).
// Left and right spins/rolls share a name; back and front flips don't.
export function trickList(c) {
  const list = [];
  if (c.backflips) list.push({ kind: 'flip', n: c.backflips, name: times(c.backflips, 'BACKFLIP') });
  if (c.frontflips) list.push({ kind: 'flip', n: c.frontflips, name: times(c.frontflips, 'FRONT FLIP') });
  const spins = (c.spinsL || 0) + (c.spinsR || 0);
  if (spins) list.push({ kind: 'spin', n: spins, name: 360 * spins + ' SPIN' });
  const rolls = (c.rollsL || 0) + (c.rollsR || 0);
  if (rolls) list.push({ kind: 'roll', n: rolls, name: times(rolls, 'BARREL ROLL') });
  return list;
}

export function trickNames(c) {
  return trickList(c).map((t) => t.name);
}

// The full line shown on landing, e.g. "TRIPLE BACKFLIP + 360 SPIN COMBO!"
export function trickTitle(c) {
  const names = trickNames(c);
  if (!names.length) return '';
  return names.join(' + ') + (names.length > 1 ? ' COMBO!' : '!');
}

const BASE = { flip: 1000, roll: 800, spin: 600 };

export const TIERS = [
  { min: 0, word: 'WOW!' },
  { min: 4000, word: 'SUPER!' },
  { min: 12000, word: 'AMAZING!' },
  { min: 30000, word: 'INCREDIBLE!' },
  { min: 75000, word: 'ASSHOLE!' },
  { min: 180000, word: 'FART BOX!' },
  { min: 450000, word: 'MONSTER MADNESS!' },
  { min: 1200000, word: 'OUT OF THIS WORLD!' },
];

// Each extra rotation is worth more than the one before: base * n(n+1)/2.
// Mixing different tricks multiplies the whole thing.
export function scoreTrick(c, { airTime = 0, mega = false, doublePoints = false } = {}) {
  const list = trickList(c);
  const rotations = list.reduce((s, t) => s + t.n, 0);
  const air = airTime > 0.8 ? Math.round(airTime * 10) * 10 : 0;
  if (!rotations) return { points: air, air, rotations: 0, stars: 0, tier: -1, word: '', multipliers: [] };

  let points = list.reduce((s, t) => s + BASE[t.kind] * t.n * (t.n + 1) / 2, 0);
  const multipliers = [];
  if (list.length > 1) {
    points *= list.length;
    multipliers.push('×' + list.length + ' COMBO');
  }
  if (mega) {
    points *= 1.5;
    multipliers.push('×1.5 MEGA');
  }
  points += air;
  if (doublePoints) {
    points *= 2;
    multipliers.push('×2 POWER');
  }
  points = Math.round(points);

  let tier = 0;
  while (tier + 1 < TIERS.length && points >= TIERS[tier + 1].min) tier++;
  return {
    points,
    air,
    rotations,
    stars: 1 + Math.min(12, Math.ceil(rotations / 2)),
    tier,
    word: TIERS[tier].word,
    multipliers,
  };
}
