//! Seeded PRNG, one per entity (§14.4 rule 7 — never a global RNG).
//!
//! PCG-XSH-RR 64/32. Every operation is wrapping, so it behaves identically
//! with `overflow-checks` on or off, and it carries its own stream selector so
//! two entities seeded from the same world seed never walk the same sequence.

use crate::fixed::{Fx, ONE_RAW};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
    inc: u64,
}

const MULT: u64 = 6_364_136_223_846_793_005;

impl Rng {
    /// `stream` is the per-entity selector — pass the entity id.
    pub fn seeded(seed: u64, stream: u64) -> Rng {
        let mut r = Rng {
            state: 0,
            inc: (stream << 1) | 1,
        };
        r.step();
        r.state = r.state.wrapping_add(seed);
        r.step();
        r
    }

    #[inline]
    fn step(&mut self) {
        self.state = self.state.wrapping_mul(MULT).wrapping_add(self.inc);
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.step();
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        ((self.next_u32() as u64) << 32) | self.next_u32() as u64
    }

    /// Uniform in `[0, n)`, rejection-sampled so it stays unbiased. `n == 0`
    /// returns 0.
    pub fn below(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        let threshold = n.wrapping_neg() % n;
        loop {
            let r = self.next_u32();
            if r >= threshold {
                return r % n;
            }
        }
    }

    /// Uniform in `[0, 1)`. A `u32` *is* the fractional part of a Q32.32 value,
    /// so this needs no scaling at all.
    pub fn unit(&mut self) -> Fx {
        debug_assert_eq!(ONE_RAW, 1i64 << 32);
        Fx::from_raw(self.next_u32() as i64)
    }

    /// Uniform in `[lo, hi]`.
    pub fn range(&mut self, lo: Fx, hi: Fx) -> Fx {
        lo.add(hi.sub(lo).mul(self.unit()))
    }

    pub fn state_words(&self) -> (u64, u64) {
        (self.state, self.inc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let mut a = Rng::seeded(42, 7);
        let mut b = Rng::seeded(42, 7);
        for _ in 0..1000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn different_streams_diverge() {
        let mut a = Rng::seeded(42, 1);
        let mut b = Rng::seeded(42, 2);
        let mut same = 0;
        for _ in 0..1000 {
            if a.next_u32() == b.next_u32() {
                same += 1;
            }
        }
        assert!(same < 5, "streams are correlated: {same} collisions");
    }

    #[test]
    fn unit_stays_in_range_and_spreads() {
        let mut r = Rng::seeded(9, 9);
        let mut buckets = [0u32; 10];
        for _ in 0..10_000 {
            let u = r.unit();
            assert!(u >= Fx::ZERO && u < Fx::ONE, "unit out of range: {u:?}");
            let b = u.mul(Fx::from_int(10)).floor_int() as usize;
            buckets[b.min(9)] += 1;
        }
        for (i, b) in buckets.iter().enumerate() {
            assert!(*b > 700 && *b < 1300, "bucket {i} is lumpy: {b}");
        }
    }

    #[test]
    fn below_is_bounded() {
        let mut r = Rng::seeded(3, 3);
        for _ in 0..5000 {
            assert!(r.below(7) < 7);
        }
        assert_eq!(r.below(0), 0);
    }
}
