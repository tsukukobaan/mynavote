# 暗号設計（IVXV準拠）

## 概要

IVXVでは ElGamal + 閾値復号 + ミックスネット を使用しているが、MVPではlibsodiumの
sealed box（X25519 + XSalsa20-Poly1305）で同等の「匿名暗号化」を実現する。

```
┌─────────────────────────────────────────────────────────┐
│ 二重封筒方式（Double Envelope）                            │
│                                                         │
│  内側の封筒（投票内容の暗号化）:                             │
│    plaintext = { candidateId, randomNonce, timestamp }   │
│    encrypted = crypto_box_seal(plaintext, electionPubKey)│
│    → 選挙用公開鍵でのみ復号可能                             │
│    → 暗号化した人（投票者）を特定できない                     │
│                                                         │
│  外側の封筒（本人認証）:                                    │
│    認証API経由で取得した sub（PPID）のハッシュで              │
│    一人一票を管理。投票データとは別テーブルで分離保管          │
│                                                         │
│  開票時:                                                  │
│    1. 外側の封筒（認証情報）を分離・破棄                     │
│    2. 内側の封筒のみを秘密鍵で復号                          │
│    3. 復号結果を集計                                       │
│    → 誰がどの候補に投票したか追跡不可能                      │
└─────────────────────────────────────────────────────────┘
```

## 実装参考コード

```typescript
// lib/crypto.ts — IVXVの設計思想をlibsodiumで実装

import _sodium from 'libsodium-wrappers';

// === 選挙セットアップ（管理者が実行）===
export async function generateElectionKeys() {
  await _sodium.ready;
  const sodium = _sodium;
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    secretKey: sodium.to_base64(keyPair.privateKey),
  };
}

// === 投票暗号化（ブラウザ側で実行）===
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

// === 投票復号（開票時、オフライン環境で実行）===
export async function decryptBallot(
  encryptedBallotB64: string,
  publicKeyB64: string,
  secretKeyB64: string,
): Promise<{ candidateId: string }> {
  await _sodium.ready;
  const sodium = _sodium;
  const encrypted = sodium.from_base64(encryptedBallotB64);
  const publicKey = sodium.from_base64(publicKeyB64);
  const secretKey = sodium.from_base64(secretKeyB64);
  const decrypted = sodium.crypto_box_seal_open(encrypted, publicKey, secretKey);
  const ballot = JSON.parse(sodium.to_string(decrypted));
  return { candidateId: ballot.candidateId };
}

// === Ballot Tracker生成 ===
export async function generateBallotTracker(encryptedBallotB64: string): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const hash = sodium.crypto_generichash(32, sodium.from_base64(encryptedBallotB64));
  return sodium.to_base64(hash);
}
```

## 将来的な暗号強化（IVXV完全準拠に向けて）

- **閾値復号（Threshold Decryption）**: 秘密鍵を複数管理者に分割。IVXVの`key/`ディレクトリ参照
- **ミックスネット**: 復号前に投票データの順序をシャッフル。IVXVの`processor/`参照
- **ゼロ知識証明**: 投票が正しく暗号化されたことの証明。IVXVではBulletproofsを使用
- **掲示板（Bulletin Board）**: 暗号化投票の公開掲示板。第三者が集計の正当性を検証可能
