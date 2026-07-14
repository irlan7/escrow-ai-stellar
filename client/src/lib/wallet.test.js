import { describe, it, expect, vi } from "vitest";

// StellarWalletsKit constructs a real client on import, which needs a browser-like
// environment it won't have under Vitest's default Node environment. We only need
// to test the pure `classifyError` logic here, so the kit itself is mocked out.
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

const { classifyError, WalletError } = await import("./wallet.js");

describe("classifyError", () => {
  it("classifies 'wallet not installed' as NOT_FOUND", () => {
    const result = classifyError(new Error("Freighter is not installed"));
    expect(result).toBeInstanceOf(WalletError);
    expect(result.kind).toBe("NOT_FOUND");
  });

  it("classifies 'no wallet' as NOT_FOUND", () => {
    const result = classifyError(new Error("no wallet extension detected"));
    expect(result.kind).toBe("NOT_FOUND");
  });

  it("classifies user rejection as REJECTED", () => {
    const result = classifyError(new Error("User rejected the request"));
    expect(result.kind).toBe("REJECTED");
  });

  it("classifies 'declined' as REJECTED", () => {
    const result = classifyError(new Error("Request declined by user"));
    expect(result.kind).toBe("REJECTED");
  });

  it("classifies 'cancelled' as REJECTED", () => {
    const result = classifyError(new Error("Transaction cancelled"));
    expect(result.kind).toBe("REJECTED");
  });

  it("classifies insufficient balance errors as INSUFFICIENT_BALANCE", () => {
    const result = classifyError(new Error("insufficient balance for transaction"));
    expect(result.kind).toBe("INSUFFICIENT_BALANCE");
  });

  it("classifies underfunded account errors as INSUFFICIENT_BALANCE", () => {
    const result = classifyError(new Error("account is underfunded"));
    expect(result.kind).toBe("INSUFFICIENT_BALANCE");
  });

  it("falls back to UNKNOWN for unrecognized errors", () => {
    const result = classifyError(new Error("some totally unrelated network error"));
    expect(result.kind).toBe("UNKNOWN");
  });

  it("handles a plain string thrown instead of an Error object", () => {
    const result = classifyError("wallet not found");
    expect(result.kind).toBe("NOT_FOUND");
  });

  it("classification is case-insensitive", () => {
    const result = classifyError(new Error("USER REJECTED THE REQUEST"));
    expect(result.kind).toBe("REJECTED");
  });
});

describe("WalletError", () => {
  it("is an instance of Error", () => {
    const err = new WalletError("UNKNOWN", "test message");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries the kind and message correctly", () => {
    const err = new WalletError("REJECTED", "user said no");
    expect(err.kind).toBe("REJECTED");
    expect(err.message).toBe("user said no");
  });
});
