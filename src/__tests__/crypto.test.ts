import { describe, it, expect } from "vitest";
import {
  generateElectionKeys,
  encryptBallot,
  decryptBallot,
  generateBallotTracker,
} from "@/lib/crypto";

describe("crypto", () => {
  it("generates a valid key pair", async () => {
    const keys = await generateElectionKeys();
    expect(keys.publicKey).toBeTruthy();
    expect(keys.secretKey).toBeTruthy();
    expect(keys.publicKey).not.toBe(keys.secretKey);
  });

  it("encrypts and decrypts a ballot correctly", async () => {
    const keys = await generateElectionKeys();
    const candidateId = "candidate-123";

    const encrypted = await encryptBallot(candidateId, keys.publicKey);
    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe("string");

    const decrypted = await decryptBallot(
      encrypted,
      keys.publicKey,
      keys.secretKey
    );
    expect(decrypted.candidateId).toBe(candidateId);
  });

  it("produces different ciphertexts for the same candidate (nonce)", async () => {
    const keys = await generateElectionKeys();
    const candidateId = "candidate-123";

    const encrypted1 = await encryptBallot(candidateId, keys.publicKey);
    const encrypted2 = await encryptBallot(candidateId, keys.publicKey);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("fails to decrypt with wrong secret key", async () => {
    const keys1 = await generateElectionKeys();
    const keys2 = await generateElectionKeys();
    const candidateId = "candidate-123";

    const encrypted = await encryptBallot(candidateId, keys1.publicKey);

    await expect(
      decryptBallot(encrypted, keys2.publicKey, keys2.secretKey)
    ).rejects.toThrow();
  });

  it("fails to decrypt corrupted ciphertext", async () => {
    const keys = await generateElectionKeys();

    await expect(
      decryptBallot("invalidbase64data==", keys.publicKey, keys.secretKey)
    ).rejects.toThrow();
  });

  it("generates consistent ballot tracker for same ciphertext", async () => {
    const keys = await generateElectionKeys();
    const encrypted = await encryptBallot("candidate-1", keys.publicKey);

    const tracker1 = await generateBallotTracker(encrypted);
    const tracker2 = await generateBallotTracker(encrypted);

    expect(tracker1).toBe(tracker2);
  });

  it("generates different ballot trackers for different ciphertexts", async () => {
    const keys = await generateElectionKeys();
    const encrypted1 = await encryptBallot("candidate-1", keys.publicKey);
    const encrypted2 = await encryptBallot("candidate-2", keys.publicKey);

    const tracker1 = await generateBallotTracker(encrypted1);
    const tracker2 = await generateBallotTracker(encrypted2);

    expect(tracker1).not.toBe(tracker2);
  });
});
