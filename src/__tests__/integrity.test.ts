import { describe, it, expect, beforeAll } from "vitest";
import {
  createBallotHmac,
  verifyBallotHmac,
  computeChainHash,
  verifyBallotChain,
} from "@/lib/integrity";

beforeAll(() => {
  process.env.BALLOT_INTEGRITY_KEY = "test-integrity-key-for-hmac-testing";
});

describe("HMAC", () => {
  it("creates and verifies HMAC correctly", () => {
    const encryptedVote = "base64encrypteddata==";
    const electionId = "election-123";
    const timestamp = "2026-04-01T09:00:00.000Z";

    const hmac = createBallotHmac(encryptedVote, electionId, timestamp);
    expect(hmac).toBeTruthy();
    expect(typeof hmac).toBe("string");

    const isValid = verifyBallotHmac(
      encryptedVote,
      electionId,
      timestamp,
      hmac
    );
    expect(isValid).toBe(true);
  });

  it("fails verification with different timestamp", () => {
    const hmac = createBallotHmac("data", "election-1", "2026-04-01T09:00:00.000Z");
    const isValid = verifyBallotHmac("data", "election-1", "2026-04-01T10:00:00.000Z", hmac);
    expect(isValid).toBe(false);
  });

  it("fails verification with different encrypted vote", () => {
    const hmac = createBallotHmac("data1", "election-1", "2026-04-01T09:00:00.000Z");
    const isValid = verifyBallotHmac("data2", "election-1", "2026-04-01T09:00:00.000Z", hmac);
    expect(isValid).toBe(false);
  });

  it("fails verification with different election ID", () => {
    const hmac = createBallotHmac("data", "election-1", "2026-04-01T09:00:00.000Z");
    const isValid = verifyBallotHmac("data", "election-2", "2026-04-01T09:00:00.000Z", hmac);
    expect(isValid).toBe(false);
  });

  it("fails verification with tampered HMAC", () => {
    const isValid = verifyBallotHmac("data", "election-1", "2026-04-01T09:00:00.000Z", "tamperedhmac");
    expect(isValid).toBe(false);
  });
});

describe("Hash Chain", () => {
  it("verifies a valid chain", () => {
    const ts1 = new Date("2026-04-01T09:00:00.000Z");
    const ts2 = new Date("2026-04-01T09:01:00.000Z");
    const ts3 = new Date("2026-04-01T09:02:00.000Z");

    const hash0 = "genesis";
    const hash1 = computeChainHash(hash0, "vote1", ts1.toISOString());
    const hash2 = computeChainHash(hash1, "vote2", ts2.toISOString());
    const hash3 = computeChainHash(hash2, "vote3", ts3.toISOString());

    const ballots = [
      { encryptedVote: "vote1", previousHash: hash0, timestamp: ts1 },
      { encryptedVote: "vote2", previousHash: hash1, timestamp: ts2 },
      { encryptedVote: "vote3", previousHash: hash2, timestamp: ts3 },
    ];

    expect(verifyBallotChain(ballots, hash3)).toBe(true);
  });

  it("fails when a ballot is tampered", () => {
    const ts1 = new Date("2026-04-01T09:00:00.000Z");
    const ts2 = new Date("2026-04-01T09:01:00.000Z");

    const hash0 = "genesis";
    const hash1 = computeChainHash(hash0, "vote1", ts1.toISOString());
    const hash2 = computeChainHash(hash1, "vote2", ts2.toISOString());

    const ballots = [
      { encryptedVote: "vote1", previousHash: hash0, timestamp: ts1 },
      { encryptedVote: "TAMPERED", previousHash: hash1, timestamp: ts2 },
    ];

    expect(verifyBallotChain(ballots, hash2)).toBe(false);
  });

  it("fails when a ballot is deleted from the chain", () => {
    const ts1 = new Date("2026-04-01T09:00:00.000Z");
    const ts2 = new Date("2026-04-01T09:01:00.000Z");
    const ts3 = new Date("2026-04-01T09:02:00.000Z");

    const hash0 = "genesis";
    const hash1 = computeChainHash(hash0, "vote1", ts1.toISOString());
    const hash2 = computeChainHash(hash1, "vote2", ts2.toISOString());
    const hash3 = computeChainHash(hash2, "vote3", ts3.toISOString());

    // Missing the second ballot
    const ballots = [
      { encryptedVote: "vote1", previousHash: hash0, timestamp: ts1 },
      { encryptedVote: "vote3", previousHash: hash2, timestamp: ts3 },
    ];

    expect(verifyBallotChain(ballots, hash3)).toBe(false);
  });

  it("fails when ballot order is swapped", () => {
    const ts1 = new Date("2026-04-01T09:00:00.000Z");
    const ts2 = new Date("2026-04-01T09:01:00.000Z");

    const hash0 = "genesis";
    const hash1 = computeChainHash(hash0, "vote1", ts1.toISOString());
    const hash2 = computeChainHash(hash1, "vote2", ts2.toISOString());

    // Swapped order
    const ballots = [
      { encryptedVote: "vote2", previousHash: hash1, timestamp: ts2 },
      { encryptedVote: "vote1", previousHash: hash0, timestamp: ts1 },
    ];

    expect(verifyBallotChain(ballots, hash2)).toBe(false);
  });

  it("fails when final hash does not match", () => {
    const ts1 = new Date("2026-04-01T09:00:00.000Z");
    const hash0 = "genesis";

    const ballots = [
      { encryptedVote: "vote1", previousHash: hash0, timestamp: ts1 },
    ];

    expect(verifyBallotChain(ballots, "wronghash")).toBe(false);
  });

  it("verifies empty chain against genesis", () => {
    // Empty chain: no ballots, final hash should be "genesis" (unchanged)
    expect(verifyBallotChain([], "genesis")).toBe(true);
  });
});
