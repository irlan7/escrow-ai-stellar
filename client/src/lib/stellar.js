import {
  Contract,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { connectWallet as kitConnectWallet, signWithKit, WalletError } from "./wallet.js";

export { WalletError };

// ============================================================
// KONFIGURASI
// ============================================================
export const CONTRACT_ID = "CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4";
export const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const ARBITRATOR_ADDRESS = "GBYKGB7JKBF54BXVJ2JOVG6OE35GCRKNZK7M7RSMPJNFBT45WLAERR6K";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const USDC_DECIMALS = 7;

const server = new rpc.Server(RPC_URL);

// ============================================================
// Helper konversi & normalisasi
// ============================================================
export function usdcToStroops(amount) {
  return BigInt(Math.round(parseFloat(amount) * 10 ** USDC_DECIMALS));
}

export function stroopsToUsdc(stroops) {
  return (Number(BigInt(stroops)) / 10 ** USDC_DECIMALS).toFixed(2);
}

export function normalizeStatus(status) {
  if (typeof status === "string") return status;
  if (Array.isArray(status) && typeof status[0] === "string") return status[0];
  if (status && typeof status === "object" && "tag" in status) return status.tag;
  return String(status);
}

// ============================================================
// Wallet — sekarang lewat StellarWalletsKit (multi-wallet)
// ============================================================
export async function connectWallet() {
  const { address } = await kitConnectWallet();
  return address;
}

// ============================================================
// Transaction status tracking (pending -> success/fail)
// onStatus(stage, detail) dipanggil di tiap transisi status,
// supaya UI bisa tampilkan indikator granular, bukan cuma toast tunggal.
// Stages: "building" -> "simulating" -> "awaiting_signature" ->
//         "submitting" -> "pending" -> "success" | "failed"
// ============================================================
async function buildAndSend(fnName, scArgs, sourcePublicKey, onStatus = () => {}) {
  try {
    onStatus("building");
    const account = await server.getAccount(sourcePublicKey);
    const contract = new Contract(CONTRACT_ID);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(fnName, ...scArgs))
      .setTimeout(300)
      .build();

    onStatus("simulating");
    const prepared = await server.prepareTransaction(tx);

    onStatus("awaiting_signature");
    const signedXdr = await signWithKit(prepared.toXDR(), {
      address: sourcePublicKey,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    onStatus("submitting");
    const sendResponse = await server.sendTransaction(signedTx);
    if (sendResponse.status === "ERROR") {
      const err = new Error("Transaksi ditolak network: " + JSON.stringify(sendResponse.errorResult));
      onStatus("failed", err.message);
      throw err;
    }

    onStatus("pending", sendResponse.hash);
    let getResponse = await server.getTransaction(sendResponse.hash);
    let attempts = 0;
    while (getResponse.status === "NOT_FOUND" && attempts < 20) {
      await new Promise((r) => setTimeout(r, 1500));
      getResponse = await server.getTransaction(sendResponse.hash);
      attempts++;
    }

    if (getResponse.status !== "SUCCESS") {
      onStatus("failed", getResponse.status);
      throw new Error("Transaksi gagal, status: " + getResponse.status);
    }

    let returnValue = null;
    try {
      if (getResponse.returnValue) {
        returnValue = scValToNative(getResponse.returnValue);
      }
    } catch {
      // beberapa fungsi tidak punya return value, aman diabaikan
    }

    onStatus("success", sendResponse.hash);

    return {
      hash: sendResponse.hash,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sendResponse.hash}`,
      returnValue,
    };
  } catch (err) {
    if (err instanceof WalletError) {
      onStatus("failed", err.message);
    }
    throw err;
  }
}

// ============================================================
// Write calls
// ============================================================
export async function createEscrow({ buyer, seller, amount, description }, onStatus) {
  const scArgs = [
    new Address(buyer).toScVal(),
    new Address(seller).toScVal(),
    new Address(USDC_SAC).toScVal(),
    nativeToScVal(usdcToStroops(amount), { type: "i128" }),
    nativeToScVal(description, { type: "string" }),
  ];
  return buildAndSend("create_escrow", scArgs, buyer, onStatus);
}

export async function releaseEscrow({ escrowId, caller }, onStatus) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
  ];
  return buildAndSend("release_escrow", scArgs, caller, onStatus);
}

export async function raiseDispute({ escrowId, caller, reason }, onStatus) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
    nativeToScVal(reason, { type: "string" }),
  ];
  return buildAndSend("raise_dispute", scArgs, caller, onStatus);
}

export async function resolveDispute({ escrowId, caller, releaseToSeller }, onStatus) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
    nativeToScVal(releaseToSeller, { type: "bool" }),
  ];
  return buildAndSend("resolve_dispute", scArgs, caller, onStatus);
}

// ============================================================
// Read-only calls (simulate saja, tanpa signature/fee)
// ============================================================
async function simulateRead(fnName, scArgs = []) {
  const account = await server.getAccount(ARBITRATOR_ADDRESS);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fnName, ...scArgs))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  return scValToNative(sim.result.retval);
}

export async function getEscrow(escrowId) {
  const raw = await simulateRead("get_escrow", [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
  ]);
  return normalizeEscrow(raw);
}

export async function getAllEscrows() {
  const raw = await simulateRead("get_all_escrows");
  return (raw || []).map(normalizeEscrow);
}

function normalizeEscrow(raw) {
  if (!raw) return null;
  return {
    id: Number(raw.id),
    buyer: raw.buyer,
    seller: raw.seller,
    amount: raw.amount,
    token: raw.token,
    status: normalizeStatus(raw.status),
    description: raw.description,
    disputeReason: raw.dispute_reason ?? null,
    createdAt: raw.created_at ? new Date(Number(raw.created_at) * 1000) : null,
  };
}

// ============================================================
// Event listening & state sync
// Soroban RPC tidak punya push/websocket native — pola standar
// dApp Soroban adalah polling getEvents() secara berkala. Ini
// memantau event on-chain sungguhan (bukan simulasi) dari contract
// kita (termasuk event transfer token SEP-41 saat dana dikunci/
// dilepas), lalu trigger callback saat ada perubahan.
// ============================================================
export async function getLatestLedger() {
  const health = await server.getLatestLedger();
  return health.sequence;
}

export async function pollContractEvents(sinceLedger, onEvent) {
  try {
    const res = await server.getEvents({
      startLedger: sinceLedger,
      filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
      limit: 50,
    });
    if (res.events && res.events.length > 0) {
      res.events.forEach((ev) => onEvent(ev));
    }
    return res.latestLedger;
  } catch (err) {
    // getEvents bisa gagal kalau sinceLedger terlalu jauh di belakang
    // (di luar retention window RPC) — aman diabaikan, lanjut polling berikutnya
    console.warn("pollContractEvents:", err.message);
    return sinceLedger;
  }
}

// Hook-friendly: subscribe dengan interval, return fungsi unsubscribe
export function subscribeToContractEvents(onEvent, intervalMs = 6000) {
  let cancelled = false;
  let cursor = null;

  (async () => {
    try {
      cursor = (await getLatestLedger()) - 10; // mulai dari ~10 ledger terakhir
    } catch {
      cursor = null;
    }

    while (!cancelled) {
      if (cursor !== null) {
        const next = await pollContractEvents(cursor, onEvent);
        cursor = next ? next + 1 : cursor;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();

  return () => {
    cancelled = true;
  };
}
