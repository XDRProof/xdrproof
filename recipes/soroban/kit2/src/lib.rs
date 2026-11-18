#![no_std]
//! xdrproof-kit2: the second test contract. Built with soroban-sdk 28 (interface protocol 28), so it
//! loads on P28 and P30 networks. One Wasm plays four roles in the recipes:
//! - a contract with a constructor that takes arguments (CAP-0058);
//! - a writer of the same key in persistent, temporary and instance storage at once, so one contract
//!   holds entries whose identity differs only by durability;
//! - an owner of executable-reference entries that other contracts run as their code (CAP-0085);
//! - a custom account that authenticates only by delegation (CAP-0071-01): it forwards each check to
//!   the delegated signers attached to the auth entry, which may delegate further.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, Address, BytesN, Env, String, Symbol, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoDelegates = 1,
    UnknownDelegate = 2,
}

#[contracttype]
enum Key {
    Owner,
    Tag,
    Signer(Address),
}

#[contract]
pub struct Kit2;

#[contractimpl]
impl Kit2 {
    /// Stores `owner` and `tag` in instance storage and registers `signers` as the delegates this
    /// instance accepts when it acts as a custom account.
    pub fn __constructor(env: Env, owner: Address, tag: Symbol, signers: Vec<Address>) {
        env.storage().instance().set(&Key::Owner, &owner);
        env.storage().instance().set(&Key::Tag, &tag);
        for s in signers.iter() {
            env.storage().persistent().set(&Key::Signer(s), &());
        }
    }

    /// Writes `v` under the same key `k` in persistent, temporary and instance storage, and emits
    /// it once. Persistent and temporary give two ledger entries that differ only by durability.
    pub fn put_all(env: Env, k: Val, v: Val) -> Val {
        env.storage().persistent().set(&k, &v);
        env.storage().temporary().set(&k, &v);
        env.storage().instance().set(&k, &v);
        env.events().publish((symbol_short!("put_all"), k), v);
        v
    }

    /// Points an executable-reference entry owned by this contract at an uploaded Wasm (CAP-0085).
    /// The entry is keyed by an `SCV_EXECUTABLE_TAG` value and can never be removed.
    pub fn set_ref(env: Env, tag: String, wasm_hash: BytesN<32>) {
        env.executable_refs().set(&tag, &wasm_hash);
    }
}

#[contractimpl]
impl CustomAccountInterface for Kit2 {
    type Signature = ();
    type Error = Error;

    /// Accepts an authorization only through delegated signers registered by the constructor, and
    /// forwards the check to each one (CAP-0071-01 `delegate_account_auth`).
    fn __check_auth(env: Env, _payload: Hash<32>, _signature: (), _contexts: Vec<Context>) -> Result<(), Error> {
        let delegates = env.custom_account().get_delegated_signers();
        if delegates.is_empty() {
            return Err(Error::NoDelegates);
        }
        for d in delegates.iter() {
            if !env.storage().persistent().has(&Key::Signer(d.clone())) {
                return Err(Error::UnknownDelegate);
            }
        }
        for d in delegates.iter() {
            env.custom_account().delegate_auth(&d);
        }
        Ok(())
    }
}
