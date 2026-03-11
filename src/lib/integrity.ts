import { createHash, createHmac, timingSafeEqual } from "crypto";

export function createBallotHmac(
  encryptedVote: string,
  electionId: string,
  timestamp: string
): string {
  const key = process.env.BALLOT_INTEGRITY_KEY;
  if (!key) throw new Error("BALLOT_INTEGRITY_KEY is not set");
  const hmac = createHmac("sha256", key);
  hmac.update(encryptedVote);
  hmac.update(electionId);
  hmac.update(timestamp);
  return hmac.digest("hex");
}

export function verifyBallotHmac(
  encryptedVote: string,
  electionId: string,
  timestamp: string,
  expectedHmac: string
): boolean {
  const computed = createBallotHmac(encryptedVote, electionId, timestamp);
  if (computed.length !== expectedHmac.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHmac));
}

export function computeChainHash(
  previousHash: string,
  encryptedVote: string,
  timestamp: string
): string {
  return createHash("sha256")
    .update(previousHash)
    .update(encryptedVote)
    .update(timestamp)
    .digest("hex");
}

export function verifyBallotChain(
  ballots: Array<{
    encryptedVote: string;
    previousHash: string;
    timestamp: Date;
  }>,
  storedFinalHash: string
): boolean {
  let previousHash = "genesis";
  for (const ballot of ballots) {
    if (ballot.previousHash !== previousHash) return false;
    previousHash = computeChainHash(
      previousHash,
      ballot.encryptedVote,
      ballot.timestamp.toISOString()
    );
  }
  return previousHash === storedFinalHash;
}
