// lib.rs
#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token,
    Address, Env, String, Vec, BytesN,
};

// TTL: sama seperti Escrow AI — extend rent tiap kali entry ditulis.
const BUMP_THRESHOLD: u32 = 17_280 * 7;
const BUMP_AMOUNT: u32 = 17_280 * 30;

// ============================================================
// FASE 1 (scope hackathon) — sesuai
// Escrow-Bounty-AI-Logic-and-Verification-Plan.md §11:
//   - Tier 1 saja (objektif/deterministik)
//   - 3 check_type tetap: ContractDeployed, FunctionCalled, EventEmitted
//   - Satu RPC provider (di sisi off-chain verifier service)
//   - Challenge window: TIDAK diimplementasi on-chain di fase ini
//     (didokumentasikan eksplisit sebagai simplifikasi, bukan disembunyikan)
//   - Tier 2 diarahkan ke status Disputed, diputuskan arbitrator manusia
//     lewat resolve_dispute() — pola sama seperti Escrow AI Payment.
// ============================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BountyStatus {
    Open,       // dana terkunci, menunggu klaim hunter
    Verifying,  // hunter sudah submit klaim, menunggu hasil verifikasi
    Verified,   // Tier 1 lolos semua check -> otomatis lanjut Paid
    Paid,       // reward sudah cair ke hunter
    Rejected,   // verifikasi gagal, hunter boleh submit ulang sebelum deadline
    Disputed,   // Tier 2 atau kasus butuh arbitrator manusia
    Expired,    // deadline lewat tanpa klaim valid, sponsor bisa refund
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bounty {
    pub id: u64,
    pub sponsor: Address,
    pub hunter: Option<Address>,
    pub reward: i128,
    pub token: Address,
    pub tier: u32,                       // 1 = objektif, 2 = semi-subjektif
    pub criteria_hash: BytesN<32>,       // hash kriteria, di-anchor supaya immutable
    pub criteria_text: String,           // teks asli sponsor, untuk transparansi/audit
    pub status: BountyStatus,
    pub deadline_ledger: u32,            // ledger sequence, bukan timestamp
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,       // alamat arbitrator (untuk kasus Tier 2 / Disputed)
    Verifier,    // alamat verifier service off-chain (submit hasil Tier 1)
    Counter,
    Bounty(u64),
}

#[contract]
pub struct BountyContract;

#[contractimpl]
impl BountyContract {
    // ------------------------------------------------------------
    // Setup awal: tentukan arbitrator (untuk Tier 2/Disputed) dan
    // verifier service (untuk submit hasil Tier 1). Dipanggil sekali.
    // ------------------------------------------------------------
    pub fn initialize(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract sudah di-initialize");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::Counter, &0u64);
    }

    // ------------------------------------------------------------
    // Sponsor membuat bounty baru — kunci reward + anchor kriteria.
    // Kriteria terkunci (immutable) begitu bounty dibuat — sponsor
    // tidak bisa "memindahkan gawang" setelah hunter mulai kerja
    // (lihat §9.2 dokumen: perlindungan hunter).
    // ------------------------------------------------------------
    pub fn create_bounty(
        env: Env,
        sponsor: Address,
        token_address: Address,
        reward: i128,
        criteria_hash: BytesN<32>,
        criteria_text: String,
        tier: u32,
        deadline_ledger: u32,
    ) -> u64 {
        sponsor.require_auth();
        assert!(reward > 0, "reward harus lebih dari 0");
        assert!(tier == 1 || tier == 2, "tier harus 1 atau 2");
        assert!(
            deadline_ledger > env.ledger().sequence(),
            "deadline harus di masa depan"
        );

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&sponsor, &env.current_contract_address(), &reward);

        let mut counter: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        counter += 1;

        let bounty = Bounty {
            id: counter,
            sponsor: sponsor.clone(),
            hunter: None,
            reward,
            token: token_address,
            tier,
            criteria_hash,
            criteria_text,
            status: BountyStatus::Open,
            deadline_ledger,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Bounty(counter), &bounty);
        env.storage().persistent().extend_ttl(&DataKey::Bounty(counter), BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage().instance().set(&DataKey::Counter, &counter);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        counter
    }

    // ------------------------------------------------------------
    // Hunter mengajukan klaim — memicu proses verifikasi off-chain.
    // Bisa dipanggil lagi setelah status Rejected (resubmit dengan
    // bukti baru) selama masih sebelum deadline — §9.2.
    // ------------------------------------------------------------
    pub fn submit_claim(env: Env, hunter: Address, bounty_id: u64) {
        hunter.require_auth();

        let mut bounty: Bounty = env
            .storage()
            .persistent()
            .get(&DataKey::Bounty(bounty_id))
            .expect("bounty tidak ditemukan");

        assert!(
            bounty.status == BountyStatus::Open || bounty.status == BountyStatus::Rejected,
            "bounty tidak dalam status yang bisa diklaim"
        );
        assert!(
            env.ledger().sequence() < bounty.deadline_ledger,
            "deadline sudah lewat"
        );

        bounty.hunter = Some(hunter);
        bounty.status = BountyStatus::Verifying;
        env.storage().persistent().set(&DataKey::Bounty(bounty_id), &bounty);
        env.storage().persistent().extend_ttl(&DataKey::Bounty(bounty_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------------------
    // Verifier service (off-chain, RPC-based deterministic check)
    // submit hasil verifikasi. INI YANG PALING PENTING SESUAI
    // PRINSIP DOKUMEN §2: yang dikirim ke sini adalah HASIL
    // KOMPUTASI DETERMINISTIK, bukan opini AI. AI tidak pernah
    // memanggil fungsi ini secara langsung sebagai "keputusan".
    //
    // Tier 1 + passed=true  -> auto-payout langsung ke hunter.
    // Tier 1 + passed=false -> Rejected, hunter boleh resubmit.
    // Tier 2                -> selalu ke Disputed, arbitrator putuskan.
    // ------------------------------------------------------------
    pub fn submit_verification_result(env: Env, caller: Address, bounty_id: u64, passed: bool) {
        caller.require_auth();
        assert!(Self::is_verifier(&env, &caller), "hanya verifier terdaftar yang boleh submit hasil");

        let mut bounty: Bounty = env
            .storage()
            .persistent()
            .get(&DataKey::Bounty(bounty_id))
            .expect("bounty tidak ditemukan");

        assert!(
            bounty.status == BountyStatus::Verifying,
            "bounty harus berstatus Verifying"
        );

        if bounty.tier == 2 {
            // Tier 2 (semi-subjektif) selalu ke arbitrator, sesuai §2:
            // AI/sistem tidak pernah memicu payout otomatis untuk kriteria non-objektif.
            bounty.status = BountyStatus::Disputed;
        } else if passed {
            let hunter = bounty.hunter.clone().expect("hunter belum ada");
            let token_client = token::Client::new(&env, &bounty.token);
            token_client.transfer(&env.current_contract_address(), &hunter, &bounty.reward);
            bounty.status = BountyStatus::Paid;
        } else {
            bounty.status = BountyStatus::Rejected;
        }

        env.storage().persistent().set(&DataKey::Bounty(bounty_id), &bounty);
        env.storage().persistent().extend_ttl(&DataKey::Bounty(bounty_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------------------
    // Arbitrator memutuskan kasus Tier 2 / Disputed — pola identik
    // dengan resolve_dispute() di Escrow AI Payment (sudah teruji).
    // ------------------------------------------------------------
    pub fn resolve_dispute(env: Env, caller: Address, bounty_id: u64, pay_hunter: bool) {
        caller.require_auth();
        assert!(Self::is_admin(&env, &caller), "hanya arbitrator yang boleh resolve dispute");

        let mut bounty: Bounty = env
            .storage()
            .persistent()
            .get(&DataKey::Bounty(bounty_id))
            .expect("bounty tidak ditemukan");

        assert!(bounty.status == BountyStatus::Disputed, "bounty harus berstatus Disputed");

        let token_client = token::Client::new(&env, &bounty.token);

        if pay_hunter {
            let hunter = bounty.hunter.clone().expect("hunter belum ada");
            token_client.transfer(&env.current_contract_address(), &hunter, &bounty.reward);
            bounty.status = BountyStatus::Paid;
        } else {
            token_client.transfer(&env.current_contract_address(), &bounty.sponsor, &bounty.reward);
            bounty.status = BountyStatus::Rejected;
        }

        env.storage().persistent().set(&DataKey::Bounty(bounty_id), &bounty);
        env.storage().persistent().extend_ttl(&DataKey::Bounty(bounty_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------------------
    // Sponsor ambil kembali dana kalau deadline lewat tanpa ada
    // klaim valid yang dibayar — §9.1 perlindungan sponsor.
    // ------------------------------------------------------------
    pub fn claim_expired_refund(env: Env, caller: Address, bounty_id: u64) {
        caller.require_auth();

        let mut bounty: Bounty = env
            .storage()
            .persistent()
            .get(&DataKey::Bounty(bounty_id))
            .expect("bounty tidak ditemukan");

        assert!(caller == bounty.sponsor, "hanya sponsor yang boleh refund");
        assert!(
            env.ledger().sequence() >= bounty.deadline_ledger,
            "deadline belum lewat"
        );
        assert!(
            bounty.status == BountyStatus::Open
                || bounty.status == BountyStatus::Rejected
                || bounty.status == BountyStatus::Verifying,
            "bounty sudah selesai (Paid), tidak bisa di-refund"
        );

        let token_client = token::Client::new(&env, &bounty.token);
        token_client.transfer(&env.current_contract_address(), &bounty.sponsor, &bounty.reward);
        bounty.status = BountyStatus::Expired;

        env.storage().persistent().set(&DataKey::Bounty(bounty_id), &bounty);
        env.storage().persistent().extend_ttl(&DataKey::Bounty(bounty_id), BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    // ------------------------------------------------------------
    // Baca
    // ------------------------------------------------------------
    pub fn get_bounty(env: Env, bounty_id: u64) -> Bounty {
        env.storage()
            .persistent()
            .get(&DataKey::Bounty(bounty_id))
            .expect("bounty tidak ditemukan")
    }

    pub fn get_all_bounties(env: Env) -> Vec<Bounty> {
        let counter: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let mut result = Vec::new(&env);
        let mut i: u64 = 1;
        while i <= counter {
            if let Some(bounty) = env.storage().persistent().get(&DataKey::Bounty(i)) {
                result.push_back(bounty);
            }
            i += 1;
        }
        result
    }

    // ------------------------------------------------------------
    // Helper internal
    // ------------------------------------------------------------
    fn is_admin(env: &Env, caller: &Address) -> bool {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract belum di-initialize");
        *caller == admin
    }

    fn is_verifier(env: &Env, caller: &Address) -> bool {
        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .expect("contract belum di-initialize");
        *caller == verifier
    }
}