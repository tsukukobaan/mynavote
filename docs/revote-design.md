# 再投票（Revote）設計

## 概要

IVXVの設計に倣い、投票期間中は何度でも再投票できる。最後の投票のみが有効となる。
これにより強制投票（coercion）への耐性を持たせる — 脅迫されて投票した場合でも、
後から自分の意思で再投票すれば最終的な投票は自分の意思を反映する。

## 課題：投票の秘密との両立

BallotテーブルにはsubjectHash（投票者識別子）を含めない設計（投票の秘密を保護）のため、
「この投票者の最新のBallotはどれか」を直接判定できない。

## 解決策：VoterRegistryにlatestBallotIdを保持

```
VoterRegistry                         Ballot
┌──────────────────────┐             ┌──────────────────────┐
│ id                   │             │ id                   │
│ electionId           │             │ electionId           │
│ subjectHash          │             │ encryptedVote        │
│ hasVoted             │             │ ballotTracker        │
│ latestBallotId  ─────┼────────────→│ hmac                 │
│ voteCount (回数)      │             │ previousHash         │
│ votedAt              │             │ isLatest (bool)      │
└──────────────────────┘             │ timestamp            │
                                     └──────────────────────┘
```

### 投票時のフロー

1. 初回投票:
   - Ballotレコードを作成（isLatest = true）
   - VoterRegistryにlatestBallotId = 新BallotのID、voteCount = 1 を設定
   - hasVoted = true

2. 再投票:
   - 旧BallotのisLatestをfalseに更新
   - 新Ballotレコードを作成（isLatest = true）
   - VoterRegistryのlatestBallotIdを新BallotのIDに更新、voteCount++
   - 監査ログにVOTE_REVOTEを記録

### 開票時のフロー

1. `Ballot WHERE electionId = ? AND isLatest = true` で有効投票のみ取得
2. VoterRegistryのlatestBallotIdとBallotのidが一致することを検証
3. 有効投票数 = VoterRegistryのhasVoted=trueの件数 と一致することを確認
4. 有効投票のみを復号・集計

### セキュリティ考慮

- **VoterRegistry → Ballot の参照は開票前の検証にのみ使用**。開票処理自体は
  isLatest=true のBallotだけを対象とし、VoterRegistryとは切り離して復号する
- **latestBallotIdから投票内容は追跡不可能** — Ballotの中身はsealed boxで暗号化されている
- **旧Ballotは削除しない** — ハッシュチェーンの整合性を保つため。ただし復号対象からは除外
- **voteCount**: 異常な再投票回数（例: 10回以上）を検知するための指標

## Prismaスキーマの変更点

```prisma
model VoterRegistry {
  id             String    @id @default(cuid())
  electionId     String
  election       Election  @relation(fields: [electionId], references: [id])
  subjectHash    String
  district       String?
  hasVoted       Boolean   @default(false)
  latestBallotId String?   // 最新の投票BallotのID
  voteCount      Int       @default(0)  // 投票回数（再投票の追跡）
  votedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([electionId, subjectHash])
}

model Ballot {
  id            String   @id @default(cuid())
  electionId    String
  election      Election @relation(fields: [electionId], references: [id])
  encryptedVote String
  ballotTracker String
  hmac          String
  previousHash  String
  isLatest      Boolean  @default(true)  // 最新の投票かどうか
  timestamp     DateTime @default(now())
}
```

## 開票時のバリデーション手順

```typescript
async function validateBeforeCounting(electionId: string) {
  // 1. 有効投票数の整合性チェック
  const latestBallotCount = await prisma.ballot.count({
    where: { electionId, isLatest: true },
  });
  const votedCount = await prisma.voterRegistry.count({
    where: { electionId, hasVoted: true },
  });
  if (latestBallotCount !== votedCount) {
    throw new Error(`投票数不一致: Ballot=${latestBallotCount}, Registry=${votedCount}`);
  }

  // 2. latestBallotIdの整合性チェック
  const registries = await prisma.voterRegistry.findMany({
    where: { electionId, hasVoted: true },
    select: { latestBallotId: true },
  });
  const latestBallotIds = new Set(registries.map(r => r.latestBallotId));
  const actualLatestBallots = await prisma.ballot.findMany({
    where: { electionId, isLatest: true },
    select: { id: true },
  });
  for (const ballot of actualLatestBallots) {
    if (!latestBallotIds.has(ballot.id)) {
      throw new Error(`孤立したBallot検出: ${ballot.id}`);
    }
  }

  // 3. ハッシュチェーン検証
  // 4. 各BallotのHMAC検証
  // → これらはcounting処理内で実施
}
```
