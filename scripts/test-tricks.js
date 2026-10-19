import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiplier, trickNames, trickTitle, scoreTrick } from '../src/tricks.js';

const none = { backflips: 0, frontflips: 0, spinsL: 0, spinsR: 0, rollsL: 0, rollsR: 0 };
const c = (o) => ({ ...none, ...o });

test('multiplier words', () => {
  assert.equal(multiplier(1), '');
  assert.equal(multiplier(2), 'DOUBLE');
  assert.equal(multiplier(3), 'TRIPLE');
  assert.equal(multiplier(5), 'QUINTUPLE');
  assert.equal(multiplier(10), 'DECUPLE');
  assert.equal(multiplier(11), 'UNDECUPLE');
  assert.equal(multiplier(12), 'DUODECUPLE');
  assert.equal(multiplier(14), 'QUATTUORDECUPLE');
  assert.equal(multiplier(17), 'SEPTENDECUPLE');
  assert.equal(multiplier(20), 'VIGINTUPLE');
  assert.equal(multiplier(23), 'TREVIGINTUPLE');
  assert.equal(multiplier(40), 'QUADRAGINTUPLE');
  assert.equal(multiplier(99), 'NOVEMNONAGINTUPLE');
  assert.equal(multiplier(100), 'CENTUPLE');
  assert.equal(multiplier(250), 'CENTUPLE');
});

test('single tricks', () => {
  assert.deepEqual(trickNames(c({ backflips: 1 })), ['BACKFLIP']);
  assert.deepEqual(trickNames(c({ frontflips: 2 })), ['DOUBLE FRONT FLIP']);
  assert.deepEqual(trickNames(c({ spinsL: 1 })), ['360 SPIN']);
  assert.deepEqual(trickNames(c({ spinsR: 14 })), ['5040 SPIN']);
  assert.deepEqual(trickNames(c({ rollsL: 1, rollsR: 2 })), ['TRIPLE BARREL ROLL']);
  assert.deepEqual(trickNames(c({ backflips: 14 })), ['QUATTUORDECUPLE BACKFLIP']);
});

test('combos are named in order: flips, spins, rolls', () => {
  assert.equal(trickTitle(c({ backflips: 3, spinsL: 1 })), 'TRIPLE BACKFLIP + 360 SPIN COMBO!');
  assert.equal(trickTitle(c({ backflips: 1, frontflips: 1 })), 'BACKFLIP + FRONT FLIP COMBO!');
  assert.equal(
    trickTitle(c({ rollsR: 2, spinsL: 2, backflips: 11 })),
    'UNDECUPLE BACKFLIP + 720 SPIN + DOUBLE BARREL ROLL COMBO!',
  );
  assert.equal(trickTitle(c({ backflips: 1 })), 'BACKFLIP!');
  assert.equal(trickTitle(none), '');
});

test('no tricks: only air points', () => {
  const s = scoreTrick(none, { airTime: 2 });
  assert.equal(s.points, 200);
  assert.equal(s.stars, 0);
  assert.equal(scoreTrick(none, { airTime: 0.5 }).points, 0);
});

test('more rotations always score more', () => {
  for (const key of ['backflips', 'frontflips', 'spinsL', 'rollsR']) {
    let prev = 0;
    for (let n = 1; n <= 30; n++) {
      const p = scoreTrick(c({ [key]: n })).points;
      assert.ok(p > prev, `${key} ${n}: ${p} > ${prev}`);
      prev = p;
    }
  }
});

test('mixing tricks beats the same number of rotations in one trick', () => {
  for (let n = 2; n <= 20; n++) {
    const single = scoreTrick(c({ backflips: n })).points;
    const mixed = scoreTrick(c({ backflips: n - 1, spinsL: 1 })).points;
    assert.ok(mixed > single, `n=${n}: ${mixed} > ${single}`);
  }
});

test('multipliers and stars', () => {
  const plain = scoreTrick(c({ backflips: 3 }));
  assert.equal(plain.points, 6000);
  assert.equal(plain.stars, 3);
  assert.equal(scoreTrick(c({ backflips: 3 }), { mega: true }).points, 9000);
  assert.equal(scoreTrick(c({ backflips: 3 }), { doublePoints: true }).points, 12000);
  const combo = scoreTrick(c({ backflips: 3, spinsL: 1 }));
  assert.equal(combo.points, (6000 + 600) * 2);
  assert.deepEqual(combo.multipliers, ['×2 COMBO']);
  assert.equal(scoreTrick(c({ backflips: 40, spinsL: 40 })).stars, 13); // capped
});

test('tier words rise with points', () => {
  assert.equal(scoreTrick(c({ backflips: 1 })).word, 'WOW!');
  assert.equal(scoreTrick(c({ backflips: 30, spinsL: 30, rollsL: 30 })).word, 'OUT OF THIS WORLD!');
});
