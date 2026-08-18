//! The simulation substrate described in `docs/DESIGN.md` §6.
//!
//! Scope: this crate implements M0 and M1 of §17 — the deterministic core, the
//! material table, and the impulse resolver. Nothing above L2 of the §6 layer
//! stack exists yet, deliberately: §17 M1 says the substrate must prove itself
//! against the §6.4 ship gate before any of it gets built.
//!
//! Two rules govern every line in here:
//!
//! * **§6.1** — no system may ask what *kind* of entity it is looking at. There
//!   is no `Player`, no `Enemy`, no `Item`. Grep this crate for those words and
//!   you will find them only in comments.
//! * **§6.3** — there is no damage type enum. Everything that happens to
//!   anything is an [`Impulse`](impulse::Impulse).

pub mod abi;
pub mod body;
pub mod ecs;
pub mod events;
pub mod fixed;
pub mod form;
pub mod hash;
pub mod impulse;
pub mod material;
pub mod rng;
pub mod scenarios;
pub mod sim;

pub use fixed::Fx;
