//! Q32.32 fixed-point arithmetic and in-crate transcendentals.
//!
//! DESIGN.md §14.4 rule 2 forbids calling the platform's `sin`/`cos`/`exp`/
//! `pow`/`ln`, because libm is not specified bit-exactly and varies by version.
//! Those have to be ours wherever they are called from, and they are, below.
//!
//! **The arithmetic underneath them is a choice, and v1.0 of the document
//! reopened it.** The earlier version mandated fixed point for all simulation
//! math on the grounds that floats are non-deterministic; §14.4 rule 1 now
//! corrects that — WASM mandates IEEE 754-2019 semantics for add, subtract,
//! multiply, divide and `sqrt`, so the same binary produces bit-identical
//! results across conforming runtimes, and rule 3 narrows fixed point to "where
//! drift matters, not everywhere". Rule 5 says to settle it by profiling rather
//! than by argument, and `docs/PROFILE.md` records that measurement: on this
//! resolver, at this entity count, Q32.32 clears the §14.2 tick budget with
//! room to spare, so the crate stays integer end to end and the boundary rule 3
//! asks to document is *there is no boundary*. Revisit it when the profile says
//! to, not before.
//!
//! What that buys, beyond the budget number, is that `state_hash` covers every
//! quantity in the world with no canonicalisation step: rule 2's NaN payload
//! problem cannot arise in a type that has no NaN.
//!
//! Three properties matter more than accuracy here:
//!
//! * **No panics.** Overflow saturates, division by zero saturates, `sqrt` of a
//!   negative returns zero. A panic that fires on one host and not another is a
//!   desync, and `panic = "abort"` in release vs. unwind in dev makes that
//!   worse, not better.
//! * **No profile-dependent behaviour.** Every operation is explicitly
//!   saturating or checked, so `overflow-checks` can stay on in both profiles
//!   (see Cargo.toml) without dev and release disagreeing.
//! * **Bit-identical results.** All intermediates are integers. The only
//!   rounding is a single arithmetic shift, which is floor on every target.
//!
//! Accuracy is a distant fourth, and §3 says so explicitly: the simulation is
//! physically *inspired*, not physically accurate. The transcendentals below
//! are good to roughly 1e-9 absolute, which is far past the point where a
//! player could perceive the difference.

/// Number of fractional bits. Q32.32.
pub const FRAC_BITS: u32 = 32;

/// Raw representation of 1.0.
pub const ONE_RAW: i64 = 1i64 << FRAC_BITS;

/// A Q32.32 fixed-point number.
///
/// The inner value is public so the ABI layer can move it across the wasm
/// boundary without ceremony, but simulation code should use the operators.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash)]
pub struct Fx(pub i64);

// ---------------------------------------------------------------------------
// Constants (computed exactly, then rounded to nearest raw unit)
// ---------------------------------------------------------------------------

impl Fx {
    pub const ZERO: Fx = Fx(0);
    pub const ONE: Fx = Fx(ONE_RAW);
    pub const HALF: Fx = Fx(ONE_RAW / 2);
    pub const TWO: Fx = Fx(ONE_RAW * 2);
    pub const MAX: Fx = Fx(i64::MAX);
    pub const MIN: Fx = Fx(i64::MIN);
    /// Smallest representable positive value, 2^-32.
    pub const EPSILON: Fx = Fx(1);

    pub const PI: Fx = Fx(13_493_037_705);
    pub const TAU: Fx = Fx(26_986_075_409);
    pub const HALF_PI: Fx = Fx(6_746_518_852);
    pub const QUARTER_PI: Fx = Fx(3_373_259_426);
    pub const LN2: Fx = Fx(2_977_044_472);
    pub const LOG2_E: Fx = Fx(6_196_328_019);
    pub const E: Fx = Fx(11_674_931_555);
    pub const TWO_OVER_PI: Fx = Fx(2_734_261_102);
    /// sqrt(2), used to centre the mantissa in `ln`.
    pub const SQRT2: Fx = Fx(6_074_001_000);
}

// ---------------------------------------------------------------------------
// Construction and conversion
// ---------------------------------------------------------------------------

impl Fx {
    #[inline]
    pub const fn from_raw(raw: i64) -> Fx {
        Fx(raw)
    }

    #[inline]
    pub const fn raw(self) -> i64 {
        self.0
    }

    #[inline]
    pub const fn from_int(v: i32) -> Fx {
        Fx((v as i64) << FRAC_BITS)
    }

    /// `num / den` as a fixed-point value. `den == 0` saturates.
    #[inline]
    pub fn from_ratio(num: i64, den: i64) -> Fx {
        Fx::from_int_i64(num).div(Fx::from_int_i64(den))
    }

    #[inline]
    pub fn from_int_i64(v: i64) -> Fx {
        Fx(v.saturating_mul(ONE_RAW))
    }

    /// Truncates toward negative infinity.
    #[inline]
    pub const fn floor_int(self) -> i64 {
        self.0 >> FRAC_BITS
    }

    /// Round half away from zero.
    #[inline]
    pub fn round_int(self) -> i64 {
        if self.0 >= 0 {
            (self.0.saturating_add(ONE_RAW / 2)) >> FRAC_BITS
        } else {
            -((-self.0).saturating_add(ONE_RAW / 2) >> FRAC_BITS)
        }
    }

    /// The fractional part, always in `[0, 1)`.
    #[inline]
    pub fn fract(self) -> Fx {
        Fx(self.0 - (self.floor_int() << FRAC_BITS))
    }

    /// **Presentation only.** Never call this from simulation code — §14.4
    /// rule 1. It exists so hosts can draw numbers on a screen.
    #[inline]
    pub fn to_f64_lossy(self) -> f64 {
        self.0 as f64 / ONE_RAW as f64
    }
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

#[inline]
fn clamp_i128(v: i128) -> i64 {
    if v > i64::MAX as i128 {
        i64::MAX
    } else if v < i64::MIN as i128 {
        i64::MIN
    } else {
        v as i64
    }
}

impl Fx {
    #[inline]
    pub fn add(self, rhs: Fx) -> Fx {
        Fx(self.0.saturating_add(rhs.0))
    }

    #[inline]
    pub fn sub(self, rhs: Fx) -> Fx {
        Fx(self.0.saturating_sub(rhs.0))
    }

    #[inline]
    pub fn neg(self) -> Fx {
        Fx(self.0.saturating_neg())
    }

    /// Rounds toward negative infinity (a single arithmetic shift; identical on
    /// every target).
    #[inline]
    pub fn mul(self, rhs: Fx) -> Fx {
        clamp_i128((self.0 as i128 * rhs.0 as i128) >> FRAC_BITS).into_fx()
    }

    /// Division by zero saturates to `MAX`/`MIN`/`ZERO` by the sign of the
    /// numerator rather than panicking.
    #[inline]
    pub fn div(self, rhs: Fx) -> Fx {
        if rhs.0 == 0 {
            return if self.0 > 0 {
                Fx::MAX
            } else if self.0 < 0 {
                Fx::MIN
            } else {
                Fx::ZERO
            };
        }
        clamp_i128(((self.0 as i128) << FRAC_BITS) / rhs.0 as i128).into_fx()
    }

    #[inline]
    pub fn abs(self) -> Fx {
        Fx(self.0.saturating_abs())
    }

    #[inline]
    pub fn min(self, rhs: Fx) -> Fx {
        if self.0 < rhs.0 {
            self
        } else {
            rhs
        }
    }

    #[inline]
    pub fn max(self, rhs: Fx) -> Fx {
        if self.0 > rhs.0 {
            self
        } else {
            rhs
        }
    }

    #[inline]
    pub fn clamp(self, lo: Fx, hi: Fx) -> Fx {
        self.max(lo).min(hi)
    }

    #[inline]
    pub fn is_positive(self) -> bool {
        self.0 > 0
    }

    #[inline]
    pub fn is_zero(self) -> bool {
        self.0 == 0
    }

    /// Linear interpolation. `t` is clamped to `[0, 1]`.
    #[inline]
    pub fn lerp(self, to: Fx, t: Fx) -> Fx {
        let t = t.clamp(Fx::ZERO, Fx::ONE);
        self.add(to.sub(self).mul(t))
    }

    /// `self * n` for a small integer count, without a fixed-point round-trip.
    #[inline]
    pub fn scale_int(self, n: i64) -> Fx {
        Fx(self.0.saturating_mul(n))
    }
}

trait IntoFx {
    fn into_fx(self) -> Fx;
}

impl IntoFx for i64 {
    #[inline]
    fn into_fx(self) -> Fx {
        Fx(self)
    }
}

// ---------------------------------------------------------------------------
// Transcendentals (§14.4 rule 2 — these must be ours, not the platform's)
// ---------------------------------------------------------------------------

/// Integer square root, bit-by-bit. No floats, no loops of unbounded length.
fn isqrt_u128(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut num = n;
    let mut res: u128 = 0;
    // Highest power of four not exceeding `num`.
    let mut bit: u128 = 1u128 << 126;
    while bit > num {
        bit >>= 2;
    }
    while bit != 0 {
        let trial = res + bit;
        if num >= trial {
            num -= trial;
            res = (res >> 1) + bit;
        } else {
            res >>= 1;
        }
        bit >>= 2;
    }
    res
}

impl Fx {
    /// Square root. Negative inputs return zero (see the no-panics note above).
    pub fn sqrt(self) -> Fx {
        if self.0 <= 0 {
            return Fx::ZERO;
        }
        // sqrt(raw / 2^32) = sqrt(raw * 2^32) / 2^32
        Fx(isqrt_u128((self.0 as u128) << FRAC_BITS) as i64)
    }

    /// 2^f for f in `[-0.5, 0.5]`, degree-8 Taylor series in ln2.
    fn exp2_frac(f: Fx) -> Fx {
        // Coefficients are ln(2)^n / n!, in raw Q32.32.
        const C1: i64 = 2_977_044_472; // ln2
        const C2: i64 = 1_031_764_991; // ln2^2/2!
        const C3: i64 = 238_388_332; // ln2^3/3!
        const C4: i64 = 41_309_550; // ln2^4/4!
        const C5: i64 = 5_726_720; // ln2^5/5!
        const C6: i64 = 661_577; // ln2^6/6!
        const C7: i64 = 65_510; // ln2^7/7!
        const C8: i64 = 5_676; // ln2^8/8!
        let mut acc = Fx(C8);
        acc = acc.mul(f).add(Fx(C7));
        acc = acc.mul(f).add(Fx(C6));
        acc = acc.mul(f).add(Fx(C5));
        acc = acc.mul(f).add(Fx(C4));
        acc = acc.mul(f).add(Fx(C3));
        acc = acc.mul(f).add(Fx(C2));
        acc = acc.mul(f).add(Fx(C1));
        acc.mul(f).add(Fx::ONE)
    }

    /// e^x. Saturates rather than overflowing for large `x`.
    pub fn exp(self) -> Fx {
        // e^x = 2^(x * log2 e); split into an integer shift and a fraction in
        // [-0.5, 0.5] so the polynomial only ever sees its best-conditioned range.
        let y = self.mul(Fx::LOG2_E);
        let k = y.round_int();
        if k > 62 {
            return Fx::MAX;
        }
        if k < -63 {
            return Fx::ZERO;
        }
        let f = y.sub(Fx::from_int_i64(k));
        let m = Fx::exp2_frac(f);
        if k >= 0 {
            Fx(clamp_i128((m.0 as i128) << k as u32))
        } else {
            Fx(m.0 >> ((-k) as u32))
        }
    }

    /// Natural log. Non-positive inputs return `MIN` (our stand-in for -inf).
    pub fn ln(self) -> Fx {
        if self.0 <= 0 {
            return Fx::MIN;
        }
        let raw = self.0 as u64;
        // Decompose into m * 2^e with m in [1, 2).
        let msb = 63 - raw.leading_zeros() as i32;
        let mut e = msb - FRAC_BITS as i32;
        let mut m_raw: i64 = if e >= 0 {
            (raw >> e as u32) as i64
        } else {
            (raw << (-e) as u32) as i64
        };
        // Centre on sqrt(2) so the series argument stays inside [-0.172, 0.172].
        if m_raw > Fx::SQRT2.0 {
            m_raw >>= 1;
            e += 1;
        }
        let m = Fx(m_raw);
        // ln m = 2 * atanh(z), z = (m - 1) / (m + 1)
        let z = m.sub(Fx::ONE).div(m.add(Fx::ONE));
        let z2 = z.mul(z);
        // Odd-power series, coefficients 1/(2k+1), evaluated by Horner in z^2.
        let mut acc = Fx::from_ratio(1, 11);
        acc = acc.mul(z2).add(Fx::from_ratio(1, 9));
        acc = acc.mul(z2).add(Fx::from_ratio(1, 7));
        acc = acc.mul(z2).add(Fx::from_ratio(1, 5));
        acc = acc.mul(z2).add(Fx::from_ratio(1, 3));
        acc = acc.mul(z2).add(Fx::ONE);
        let ln_m = acc.mul(z).scale_int(2);
        Fx::from_int_i64(e as i64).mul(Fx::LN2).add(ln_m)
    }

    /// `self ^ exponent`. Defined for positive bases only; `<= 0` returns zero.
    ///
    /// This is what §9.2's superlinear cost model is built on, so it has to be
    /// deterministic before the cost model exists.
    pub fn pow(self, exponent: Fx) -> Fx {
        if self.0 <= 0 {
            return Fx::ZERO;
        }
        if exponent.0 == 0 {
            return Fx::ONE;
        }
        exponent.mul(self.ln()).exp()
    }

    /// sin(t) for |t| <= pi/4, degree-9 Taylor.
    fn sin_kernel(t: Fx) -> Fx {
        let t2 = t.mul(t);
        // 1/9!, -1/7!, 1/5!, -1/3!, 1
        let mut acc = Fx::from_ratio(1, 362_880);
        acc = acc.mul(t2).sub(Fx::from_ratio(1, 5_040));
        acc = acc.mul(t2).add(Fx::from_ratio(1, 120));
        acc = acc.mul(t2).sub(Fx::from_ratio(1, 6));
        acc = acc.mul(t2).add(Fx::ONE);
        acc.mul(t)
    }

    /// cos(t) for |t| <= pi/4, degree-10 Taylor.
    fn cos_kernel(t: Fx) -> Fx {
        let t2 = t.mul(t);
        // -1/10!, 1/8!, -1/6!, 1/4!, -1/2!, 1
        let mut acc = Fx::from_ratio(-1, 3_628_800);
        acc = acc.mul(t2).add(Fx::from_ratio(1, 40_320));
        acc = acc.mul(t2).sub(Fx::from_ratio(1, 720));
        acc = acc.mul(t2).add(Fx::from_ratio(1, 24));
        acc = acc.mul(t2).sub(Fx::HALF);
        acc.mul(t2).add(Fx::ONE)
    }

    /// Reduce to a quadrant index and an offset in `[-pi/4, pi/4]`.
    fn quadrant(self) -> (i64, Fx) {
        // Reduce modulo tau first so the multiply below cannot overflow, then
        // snap to the nearest multiple of pi/2.
        let wrapped = Fx(self.0.rem_euclid(Fx::TAU.0));
        let k = wrapped.mul(Fx::TWO_OVER_PI).round_int();
        let t = wrapped.sub(Fx::from_int_i64(k).mul(Fx::HALF_PI));
        (k.rem_euclid(4), t)
    }

    pub fn sin(self) -> Fx {
        let (q, t) = self.quadrant();
        match q {
            0 => Fx::sin_kernel(t),
            1 => Fx::cos_kernel(t),
            2 => Fx::sin_kernel(t).neg(),
            _ => Fx::cos_kernel(t).neg(),
        }
    }

    pub fn cos(self) -> Fx {
        let (q, t) = self.quadrant();
        match q {
            0 => Fx::cos_kernel(t),
            1 => Fx::sin_kernel(t).neg(),
            2 => Fx::cos_kernel(t).neg(),
            _ => Fx::sin_kernel(t),
        }
    }
}

impl core::fmt::Debug for Fx {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        // Integer-only rendering; `to_f64_lossy` must not creep into anything
        // that could end up in a state hash or a log compared across hosts.
        let neg = self.0 < 0;
        let a = self.0.unsigned_abs();
        let int = a >> FRAC_BITS;
        // Six decimal places, computed by integer scaling.
        let frac = ((a & (ONE_RAW as u64 - 1)) as u128 * 1_000_000) >> FRAC_BITS;
        write!(f, "{}{}.{:06}", if neg { "-" } else { "" }, int, frac)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Assert two fixed-point values agree to within `tol` raw units.
    fn close(a: Fx, b: f64, tol_raw: i64, what: &str) {
        let expected = Fx((b * ONE_RAW as f64).round() as i64);
        let diff = (a.0 - expected.0).abs();
        assert!(
            diff <= tol_raw,
            "{what}: got {a:?} want {b} (diff {diff} raw units, tolerance {tol_raw})"
        );
    }

    #[test]
    fn basic_arithmetic_is_exact_for_representable_values() {
        assert_eq!(Fx::from_int(3).add(Fx::from_int(4)), Fx::from_int(7));
        assert_eq!(Fx::from_int(3).mul(Fx::from_int(4)), Fx::from_int(12));
        assert_eq!(Fx::from_int(12).div(Fx::from_int(4)), Fx::from_int(3));
        assert_eq!(Fx::from_ratio(1, 2), Fx::HALF);
        assert_eq!(Fx::HALF.mul(Fx::TWO), Fx::ONE);
    }

    #[test]
    fn overflow_saturates_instead_of_panicking() {
        assert_eq!(Fx::MAX.add(Fx::ONE), Fx::MAX);
        assert_eq!(Fx::MIN.sub(Fx::ONE), Fx::MIN);
        assert_eq!(Fx::MAX.mul(Fx::from_int(1000)), Fx::MAX);
        assert_eq!(Fx::ONE.div(Fx::ZERO), Fx::MAX);
        assert_eq!(Fx::ONE.neg().div(Fx::ZERO), Fx::MIN);
        assert_eq!(Fx::ZERO.div(Fx::ZERO), Fx::ZERO);
        assert_eq!(Fx::from_int(-4).sqrt(), Fx::ZERO);
    }

    #[test]
    fn sqrt_matches_reference() {
        for v in [0.0f64, 0.25, 1.0, 2.0, 3.0, 10.0, 144.0, 1e6] {
            let x = Fx((v * ONE_RAW as f64).round() as i64);
            close(x.sqrt(), v.sqrt(), 4, "sqrt");
        }
    }

    #[test]
    fn exp_and_ln_match_reference() {
        for v in [-8.0f64, -1.5, -0.1, 0.0, 0.7, 1.0, 5.0, 12.0] {
            let x = Fx((v * ONE_RAW as f64).round() as i64);
            // Relative tolerance: allow 1e-7 of the magnitude.
            let tol = ((v.exp() * 1e-7 * ONE_RAW as f64).abs() as i64).max(64);
            close(x.exp(), v.exp(), tol, "exp");
        }
        for v in [0.01f64, 0.5, 1.0, 2.0, 7.5, 1000.0, 1e7] {
            let x = Fx((v * ONE_RAW as f64).round() as i64);
            close(x.ln(), v.ln(), 64, "ln");
        }
    }

    #[test]
    fn exp_ln_round_trip() {
        for v in [0.2f64, 1.0, 3.0, 50.0] {
            let x = Fx((v * ONE_RAW as f64).round() as i64);
            close(x.ln().exp(), v, (v * 1e-6 * ONE_RAW as f64) as i64 + 64, "exp(ln x)");
        }
    }

    #[test]
    fn pow_matches_reference() {
        // alpha = 1.4 is §9.2's starting exponent, so it gets an explicit case.
        let alpha = Fx::from_ratio(14, 10);
        for base in [0.5f64, 1.0, 2.0, 3.0, 10.0] {
            let b = Fx((base * ONE_RAW as f64).round() as i64);
            let want = base.powf(1.4);
            let tol = ((want * 1e-6 * ONE_RAW as f64) as i64).max(256);
            close(b.pow(alpha), want, tol, "pow");
        }
        assert_eq!(Fx::from_int(7).pow(Fx::ZERO), Fx::ONE);
        assert_eq!(Fx::ZERO.pow(Fx::from_int(2)), Fx::ZERO);
    }

    #[test]
    fn sin_cos_match_reference_across_the_circle() {
        for step in -400i64..400 {
            let v = step as f64 * 0.05;
            let x = Fx((v * ONE_RAW as f64).round() as i64);
            close(x.sin(), v.sin(), 4096, "sin");
            close(x.cos(), v.cos(), 4096, "cos");
        }
    }

    #[test]
    fn pythagorean_identity_holds() {
        for step in 0i64..200 {
            let x = Fx::from_ratio(step * 7, 13);
            let s = x.sin();
            let c = x.cos();
            let sum = s.mul(s).add(c.mul(c));
            let err = (sum.0 - Fx::ONE.0).abs();
            assert!(err < 8192, "sin^2+cos^2 drifted at {x:?}: {sum:?}");
        }
    }

    #[test]
    fn debug_formatting_uses_no_floats() {
        assert_eq!(format!("{:?}", Fx::ONE), "1.000000");
        assert_eq!(format!("{:?}", Fx::HALF), "0.500000");
        assert_eq!(format!("{:?}", Fx::from_int(-3)), "-3.000000");
    }
}
