#![no_std]
//! xdrproof-kit: one tiny contract that lets a recipe put arbitrary ScVals into
//! storage, events and return values, and build nested authorization trees.
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol, Val, Vec};

#[contract]
pub struct Kit;

#[contractimpl]
impl Kit {
    /// Store `v` under key `k` (persistent), emit it as event data with topics
    /// ["put", k], and return it. The value reaches ledger entry changes,
    /// contract events and the return value unchanged.
    pub fn put(env: Env, k: Val, v: Val) -> Val {
        env.storage().persistent().set(&k, &v);
        env.events().publish((symbol_short!("put"), k), v);
        v
    }

    /// Require `a`'s authorization, then call `nest` on the next contract in
    /// `chain` with the rest. A chain of N contracts gives an authorization
    /// tree N+1 invocations deep.
    pub fn nest(env: Env, a: Address, chain: Vec<Address>) -> u32 {
        a.require_auth();
        let mut rest = chain.clone();
        match rest.pop_front() {
            Some(next) => {
                let d: u32 = env.invoke_contract(
                    &next,
                    &Symbol::new(&env, "nest"),
                    (a, rest).into_val(&env),
                );
                d + 1
            }
            None => 1,
        }
    }
}
use soroban_sdk::IntoVal;
