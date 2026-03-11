import _sodium from "libsodium-wrappers";

export async function generateElectionKeys() {
  await _sodium.ready;
  const sodium = _sodium;
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    secretKey: sodium.to_base64(keyPair.privateKey),
  };
}

export async function encryptBallot(
  candidateId: string,
  electionPublicKeyB64: string
) {
  await _sodium.ready;
  const sodium = _sodium;
  const publicKey = sodium.from_base64(electionPublicKeyB64);
  const ballot = JSON.stringify({
    candidateId,
    nonce: sodium.to_base64(sodium.randombytes_buf(32)),
    timestamp: new Date().toISOString(),
  });
  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(ballot),
    publicKey
  );
  return sodium.to_base64(encrypted);
}

export async function decryptBallot(
  encryptedBallotB64: string,
  publicKeyB64: string,
  secretKeyB64: string
): Promise<{ candidateId: string }> {
  await _sodium.ready;
  const sodium = _sodium;
  const encrypted = sodium.from_base64(encryptedBallotB64);
  const publicKey = sodium.from_base64(publicKeyB64);
  const secretKey = sodium.from_base64(secretKeyB64);
  const decrypted = sodium.crypto_box_seal_open(
    encrypted,
    publicKey,
    secretKey
  );
  const ballot = JSON.parse(sodium.to_string(decrypted));
  return { candidateId: ballot.candidateId };
}

export async function generateBallotTracker(
  encryptedBallotB64: string
): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const hash = sodium.crypto_generichash(
    32,
    sodium.from_base64(encryptedBallotB64),
    null
  );
  return sodium.to_base64(hash);
}
