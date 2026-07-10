#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token,
    Address, Env, String, Vec,
};

// TTL: extend storage rent setiap kali entry ditulis/dibaca-tulis.
// Threshold & extend_to dalam satuan ledger (~5 detik/ledger di Stellar).
// ~17280 ledger/hari -> extend 30 hari setiap kali menyentuh entry.
const BUMP_THRESHOLD: u32 = 17_280 * 7;   // extend kalau TTL tersisa < 7 hari
const BUMP_AMOUNT: u32 = 17_280 * 30;     // extend jadi 30 hari ke depan

// ============================================
// Struktur data escrow
// ============================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Pending,   // dana terkunci, menunggu release
    Released,  // dana sudah cair ke seller
    Disputed,  // sedang dispute
    Refunded,  // dana dikembalikan ke buyer
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Escrow {
    pub id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub token: Address,
    pub status: EscrowStatus,
    pub description: String,
    pub dispute_reason: Option<String>,
    pub created_at: u64,
}

// Key untuk penyimpanan di ledger
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,          // alamat arbitrator/admin
    Counter,        // counter untuk generate escrow id
    Escrow(u64),    // data escrow per id
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {

    // ------------------------------------------------
    // Setup awal: tentukan siapa arbitrator (admin)
    // Dipanggil SEKALI saja setelah deploy
    // ------------------------------------------------
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract sudah di-initialize");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Counter, &0u64);
    }

    // ------------------------------------------------
    // Buyer mengunci dana ke escrow baru
    // ------------------------------------------------
    pub fn create_escrow(
        env: Env,
        buyer: Address,
        seller: Address,
        token_address: Address,
        amount: i128,
        description: String,
    ) -> u64 {
        buyer.require_auth();
        assert!(amount > 0, "amount harus lebih dari 0");
        assert!(buyer != seller, "buyer dan seller tidak boleh sama");

        // transfer dana dari buyer ke contract (lock)
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        // generate id baru
        let mut counter: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        counter += 1;

        let escrow = Escrow {
            id: counter,
            buyer: buyer.clone(),
            seller,
            amount,
            token: token_address,
            status: EscrowStatus::Pending,
            description,
            dispute_reason: None,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Escrow(counter), &escrow);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(counter), BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage().instance().set(&DataKey::Counter, &counter);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        counter
    }

    // ------------------------------------------------
    // Lepas dana ke seller (dipanggil buyer kalau puas,
    // atau arbitrator setelah resolve dispute)
    // ------------------------------------------------
    pub fn release_escrow(env: Env, escrow_id: u64, caller: Address) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow tidak ditemukan");

        let is_buyer = caller == escrow.buyer;
        let is_admin = Self::is_admin(&env, &caller);
        assert!(is_buyer || is_admin, "hanya buyer atau arbitrator yang boleh release");
        assert!(
            escrow.status == EscrowStatus::Pending,
            "escrow harus berstatus Pending untuk di-release"
        );

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.seller, &escrow.amount);

        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(escrow_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------
    // Buyer atau seller mengajukan dispute
    // ------------------------------------------------
    pub fn raise_dispute(env: Env, escrow_id: u64, caller: Address, reason: String) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow tidak ditemukan");

        assert!(
            caller == escrow.buyer || caller == escrow.seller,
            "hanya buyer atau seller yang boleh raise dispute"
        );
        assert!(
            escrow.status == EscrowStatus::Pending,
            "hanya escrow berstatus Pending yang bisa di-dispute"
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason = Some(reason);
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(escrow_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------
    // Arbitrator memutuskan hasil dispute (final)
    // release_to_seller = true  -> dana ke seller
    // release_to_seller = false -> dana dikembalikan ke buyer
    // ------------------------------------------------
    pub fn resolve_dispute(env: Env, escrow_id: u64, caller: Address, release_to_seller: bool) {
        caller.require_auth();
        assert!(Self::is_admin(&env, &caller), "hanya arbitrator yang boleh resolve dispute");

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow tidak ditemukan");

        assert!(
            escrow.status == EscrowStatus::Disputed,
            "escrow harus berstatus Disputed"
        );

        let token_client = token::Client::new(&env, &escrow.token);

        if release_to_seller {
            token_client.transfer(&env.current_contract_address(), &escrow.seller, &escrow.amount);
            escrow.status = EscrowStatus::Released;
        } else {
            token_client.transfer(&env.current_contract_address(), &escrow.buyer, &escrow.amount);
            escrow.status = EscrowStatus::Refunded;
        }

        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(escrow_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------
    // Baca satu escrow
    // ------------------------------------------------
    pub fn get_escrow(env: Env, escrow_id: u64) -> Escrow {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow tidak ditemukan")
    }

    // ------------------------------------------------
    // Baca semua escrow (untuk ditampilkan di UI)
    // ------------------------------------------------
    pub fn get_all_escrows(env: Env) -> Vec<Escrow> {
        let counter: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let mut result = Vec::new(&env);
        let mut i: u64 = 1;
        while i <= counter {
            if let Some(escrow) = env.storage().persistent().get(&DataKey::Escrow(i)) {
                result.push_back(escrow);
            }
            i += 1;
        }
        result
    }

    // ------------------------------------------------
    // Helper internal: cek apakah caller adalah admin/arbitrator
    // ------------------------------------------------
    fn is_admin(env: &Env, caller: &Address) -> bool {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract belum di-initialize");
        *caller == admin
    }
}