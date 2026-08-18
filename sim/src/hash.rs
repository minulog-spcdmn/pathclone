//! FNV-1a 64, used to fingerprint simulation state.
//!
//! §12.4 rule 6 needs a cheap, order-sensitive, integer-only digest that gives
//! the same answer on x86-64 and wasm32. Cryptographic strength is irrelevant
//! here; what matters is that nothing in the hash path touches a float, a
//! pointer value, or an unordered container.

const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
const PRIME: u64 = 0x0000_0100_0000_01b3;

#[derive(Clone, Copy, Debug)]
pub struct Hasher {
    state: u64,
}

impl Default for Hasher {
    fn default() -> Self {
        Self::new()
    }
}

impl Hasher {
    #[inline]
    pub const fn new() -> Hasher {
        Hasher {
            state: OFFSET_BASIS,
        }
    }

    #[inline]
    pub fn write_u8(&mut self, v: u8) {
        self.state ^= v as u64;
        self.state = self.state.wrapping_mul(PRIME);
    }

    #[inline]
    pub fn write_u32(&mut self, v: u32) {
        for b in v.to_le_bytes() {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn write_u64(&mut self, v: u64) {
        for b in v.to_le_bytes() {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn write_i64(&mut self, v: i64) {
        self.write_u64(v as u64);
    }

    #[inline]
    pub fn write_u16(&mut self, v: u16) {
        self.write_u8((v & 0xff) as u8);
        self.write_u8((v >> 8) as u8);
    }

    #[inline]
    pub fn write_bool(&mut self, v: bool) {
        self.write_u8(v as u8);
    }

    #[inline]
    pub fn finish(&self) -> u64 {
        self.state
    }
}
