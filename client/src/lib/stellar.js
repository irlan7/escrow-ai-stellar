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
import freighterApi from "@stellar/freighter-api";
import * as freighterNamed from "@stellar/freighter-api";

const freighter = {
  isConnected: freighterApi?.isConnected || freighterNamed.isConnected,
  getPublicKey: freighterApi?.getPublicKey || freighterNamed.getPublicKey,
  setAllowed: freighterApi?.setAllowed || freighterNamed.setAllowed,
  isAllowed: freighterApi?.isAllowed || freighterNamed.isAllowed,
  signTransaction: freighterApi?.signTransaction || freighterNamed.signTransaction,
};

console.log("DEBUG freighter object:", freighter);

export const CONTRACT_ID = "CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4";
export const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const ARBITRATOR_ADDRESS = "GBYKGB7JKBF54BXVJ2JOVG6OE35GCRKNZK7M7RSMPJNFBT45WLAERR6K";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const USDC_DECIMALS = 7;

const server = new rpc.Server(RPC_URL);

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

export async function isFreighterInstalled() {
  try {
    const res = await freighter.isConnected();
    if (typeof res === "boolean") return res;
    if (res && typeof res === "object" && "isConnected" in res) return res.isConnected;
    return !!res;
  } catch {
    return false;
  }
}

export async function connectWallet() {
  const installed = await isFreighterInstalled();
  console.log("DEBUG isFreighterInstalled:", installed);
  if (!installed) {
    throw new Error("Freighter belum terpasang. Install dulu dari freighter.app");
  }

  if (typeof freighter.setAllowed === "function") {
    const allowResult = await freighter.setAllowed();
    console.log("DEBUG setAllowed result:", allowResult);
    if (allowResult?.error) throw new Error(allowResult.error);
  } else {
    console.log("DEBUG setAllowed tidak tersedia di API ini");
  }

  const result = await freighter.getPublicKey();
  console.log("DEBUG getPublicKey raw result:", result, "| typeof:", typeof result);

  if (typeof result === "string" && result.length > 0) return result;
  if (result?.error) throw new Error(result.error);
  if (result?.publicKey) return result.publicKey;
  if (result?.address) return result.address;

  throw new Error("Format hasil getPublicKey tidak dikenali atau kosong: " + JSON.stringify(result));
}

async function buildAndSend(fnName, scArgs, sourcePublicKey) {
  const account = await server.getAccount(sourcePublicKey);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fnName, ...scArgs))
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(tx);

  const signResult = await freighter.signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  let signedXdr;
  if (typeof signResult === "string") {
    signedXdr = signResult;
  } else if (signResult?.error) {
    throw new Error(signResult.error);
  } else if (signResult?.signedTxXdr) {
    signedXdr = signResult.signedTxXdr;
  } else if (signResult?.xdr) {
    signedXdr = signResult.xdr;
  } else {
    throw new Error("Format hasil signTransaction tidak dikenali: " + JSON.stringify(signResult));
  }

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status === "ERROR") {
    throw new Error(
      "Transaksi ditolak network: " + JSON.stringify(sendResponse.errorResult)
    );
  }

  let getResponse = await server.getTransaction(sendResponse.hash);
  let attempts = 0;
  while (getResponse.status === "NOT_FOUND" && attempts < 20) {
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await server.getTransaction(sendResponse.hash);
    attempts++;
  }

  if (getResponse.status !== "SUCCESS") {
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

  return {
    hash: sendResponse.hash,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sendResponse.hash}`,
    returnValue,
  };
}

export async function createEscrow({ buyer, seller, amount, description }) {
  const scArgs = [
    new Address(buyer).toScVal(),
    new Address(seller).toScVal(),
    new Address(USDC_SAC).toScVal(),
    nativeToScVal(usdcToStroops(amount), { type: "i128" }),
    nativeToScVal(description, { type: "string" }),
  ];
  return buildAndSend("create_escrow", scArgs, buyer);
}

export async function releaseEscrow({ escrowId, caller }) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
  ];
  return buildAndSend("release_escrow", scArgs, caller);
}

export async function raiseDispute({ escrowId, caller, reason }) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
    nativeToScVal(reason, { type: "string" }),
  ];
  return buildAndSend("raise_dispute", scArgs, caller);
}

export async function resolveDispute({ escrowId, caller, releaseToSeller }) {
  const scArgs = [
    nativeToScVal(BigInt(escrowId), { type: "u64" }),
    new Address(caller).toScVal(),
    nativeToScVal(releaseToSeller, { type: "bool" }),
  ];
  return buildAndSend("resolve_dispute", scArgs, caller);
}

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
