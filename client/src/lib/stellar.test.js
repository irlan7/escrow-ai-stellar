import { describe, it, expect, vi } from "vitest";

// stellar.js imports wallet.js at the top (for connectWallet/signWithKit),
// and wallet.js constructs a real StellarWalletsKit instance at module scope.
// That pulls in @stellar/freighter-api, which has a CJS/ESM interop issue
// under Vitest's Node environment. We only need the pure utility functions
// here (usdcToStroops, stroopsToUsdc, normalizeStatus), so the kit is mocked
// out — same pattern as wallet.test.js.
vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    openModal: vi.fn(),
    setWallet: vi.fn(),
    getAddress: vi.fn(),
    signTransaction: vi.fn(),
  })),
  WalletNetwork: { TESTNET: "TESTNET" },
  FREIGHTER_ID: "freighter",
  FreighterModule: vi.fn(),
  AlbedoModule: vi.fn(),
  xBullModule: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/walletconnect.module", () => ({
  WalletConnectModule: vi.fn(),
  WalletConnectAllowedMethods: { SIGN: "SIGN" },
}));

const { usdcToStroops, stroopsToUsdc, normalizeStatus } = await import("./stellar.js");

describe("usdcToStroops", () => {
  it("converts a whole number USDC amount to stroops (7 decimals)", () => {
    expect(usdcToStroops("5")).toBe(50000000n);
  });

  it("converts a decimal USDC amount correctly", () => {
    expect(usdcToStroops("1.5")).toBe(15000000n);
  });

  it("converts a small decimal amount without losing precision", () => {
    expect(usdcToStroops("0.01")).toBe(100000n);
  });

  it("rounds to the nearest stroop for floating point edge cases", () => {
    // 0.1 + 0.2 style floating point artifacts should still resolve cleanly
    expect(usdcToStroops("0.1")).toBe(1000000n);
  });

  it("returns a BigInt type", () => {
    expect(typeof usdcToStroops("1")).toBe("bigint");
  });
});

describe("stroopsToUsdc", () => {
  it("converts stroops back to a formatted USDC string with 2 decimals", () => {
    expect(stroopsToUsdc(50000000n)).toBe("5.00");
  });

  it("handles a numeric (non-BigInt) stroops input", () => {
    expect(stroopsToUsdc(10000000)).toBe("1.00");
  });

  it("handles small amounts correctly", () => {
    expect(stroopsToUsdc(100000)).toBe("0.01");
  });

  it("round-trips with usdcToStroops for a typical amount", () => {
    const original = "12.34";
    const stroops = usdcToStroops(original);
    expect(stroopsToUsdc(stroops)).toBe("12.34");
  });

  it("handles zero", () => {
    expect(stroopsToUsdc(0)).toBe("0.00");
  });
});

describe("normalizeStatus", () => {
  it("returns a plain string status unchanged", () => {
    expect(normalizeStatus("Pending")).toBe("Pending");
  });

  it("extracts status from an array-wrapped enum (e.g. from raw XDR decoding)", () => {
    expect(normalizeStatus(["Disputed"])).toBe("Disputed");
  });

  it("extracts status from a tag-object enum shape", () => {
    expect(normalizeStatus({ tag: "Released" })).toBe("Released");
  });

  it("falls back to String() conversion for unrecognized shapes", () => {
    expect(normalizeStatus(42)).toBe("42");
  });

  it("handles all four known Escrow statuses", () => {
    expect(normalizeStatus("Pending")).toBe("Pending");
    expect(normalizeStatus("Disputed")).toBe("Disputed");
    expect(normalizeStatus("Released")).toBe("Released");
    expect(normalizeStatus("Refunded")).toBe("Refunded");
  });
});
