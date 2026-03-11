# マイナンバーカード認証オンライン投票Webアプリ — CLAUDE.md v3

## プロジェクト概要

マイナンバーカードの公的個人認証（JPKI）を活用した、党内選挙・団体内選挙向けのオンライン投票Webアプリ。公職選挙法の適用外となる予備選挙・党首選・団体内役員選挙等をターゲットとする。

**重要な設計方針：**
- 認証はデジタル庁「デジタル認証アプリサービスAPI」の**認証API（4桁PIN）のみ**を使用
- 認証APIで基本4情報（氏名・住所・生年月日・性別）を取得し、住所から小選挙区を判定
- **開発はモックOIDCプロバイダーで先行し、デジタル庁Sandbox接続後に差し替える**

## 詳細設計ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/auth-design.md](docs/auth-design.md) | 認証設計（OIDC、モックプロバイダー、本番切替） |
| [docs/crypto-design.md](docs/crypto-design.md) | 暗号設計（IVXV準拠、二重封筒方式、sealed box） |
| [docs/security.md](docs/security.md) | セキュリティ要件（CSP、CSRF、レート制限、監査ログ等） |
| [docs/ui-flow.md](docs/ui-flow.md) | 画面遷移・投票フロー（Helios Voting参考） |
| [docs/revote-design.md](docs/revote-design.md) | 再投票設計（latestBallotId方式、開票時バリデーション） |
| [docs/address-parser.md](docs/address-parser.md) | 住所パーサー設計（テストケース一覧含む） |
| [docs/testing-strategy.md](docs/testing-strategy.md) | テスト戦略（ユニット/統合/E2E/セキュリティ） |
| [docs/digital-agency-onboarding.md](docs/digital-agency-onboarding.md) | デジタル庁への申込手順 |
| [docs/references.md](docs/references.md) | 参考OSSプロジェクト（IVXV、Helios、Belenios） |

---

## 技術スタック

- **Next.js 14+**（App Router） / TypeScript / Tailwind CSS + shadcn/ui
- **Prisma ORM** + **PostgreSQL**
- **Redis**（セッション管理・レート制限）— ローカル開発時はインメモリにフォールバック
- **libsodium-wrappers**（ブラウザ側暗号化）/ **sodium-native**（サーバー側）
- **Vitest**（ユニットテスト・統合テスト）/ **Playwright**（E2Eテスト）
- Vercel or AWS（HTTPS必須、TLS 1.2+）

---

## データベース設計（Prisma）

```prisma
model Election {
  id              String          @id @default(cuid())
  title           String
  description     String?
  organizationId  String
  status          ElectionStatus  @default(DRAFT)
  districtId      String?         // nullなら住所制限なし
  votingStartAt   DateTime
  votingEndAt     DateTime
  publicKey       String          // 暗号化用公開鍵（Base64）
  latestChainHash String?         // ハッシュチェーンの最終ハッシュ（開票時の検証用）
  allowRevote     Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  candidates      Candidate[]
  ballots         Ballot[]
  voterRegistry   VoterRegistry[]
  results         ElectionResult[]
}

enum ElectionStatus { DRAFT OPEN CLOSED COUNTING FINALIZED }

model Candidate {
  id          String   @id @default(cuid())
  electionId  String
  election    Election @relation(fields: [electionId], references: [id])
  name        String
  profile     String?
  displayOrder Int     @default(0)
  createdAt   DateTime @default(now())
}

model VoterRegistry {
  id             String    @id @default(cuid())
  electionId     String
  election       Election  @relation(fields: [electionId], references: [id])
  subjectHash    String    // sub（PPID）のSHA-256ハッシュ
  district       String?
  hasVoted       Boolean   @default(false)
  latestBallotId String?   // 最新の投票BallotのID（再投票対応）
  voteCount      Int       @default(0)
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
  hmac          String   // HMAC(encryptedVote + electionId + timestamp)
  previousHash  String   // ハッシュチェーン
  isLatest      Boolean  @default(true)  // 再投票時、旧Ballotはfalse
  timestamp     DateTime @default(now())
}

model ElectionResult {
  id          String   @id @default(cuid())
  electionId  String
  election    Election @relation(fields: [electionId], references: [id])
  candidateId String
  voteCount   Int
  finalizedAt DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  action     String
  electionId String?
  metadata   Json?
  createdAt  DateTime @default(now())
}
```

---

## 必須制約（実装時に常に遵守）

### セキュリティ（docs/security.md参照）
- **セッションに住所・氏名を保存しない**（選挙区判定後に即破棄）
- **ログに個人情報・トークン・PINを出力しない**
- **Ballotテーブルに投票者を特定できる情報を含めない**
- **エラーレスポンスに内部情報（スタックトレース等）を含めない**
- **すべてのAPI RouteでCSRFトークン検証とzodバリデーションを行う**
- **dangerouslySetInnerHTMLは一切使用禁止**
- セキュリティはPhase 1から全項目実装。「あとで追加」は不可

### 認証
- `USE_MOCK_AUTH`環境変数で完全にモック/本番を切り替え可能にする
- モックOIDCプロバイダーは松戸市在住2名、千代田区在住1名のテストユーザー

### 暗号化（docs/crypto-design.md参照）
- 投票内容はブラウザ内で`crypto_box_seal`（sealed box）で暗号化。サーバーは平文を見ない
- 秘密鍵はDBに保存しない。開票時にのみ手動で投入

### 再投票（docs/revote-design.md参照）
- 再投票時、旧BallotのisLatest=falseに更新し新Ballotを追加
- VoterRegistryのlatestBallotIdを更新
- 開票時はisLatest=trueのBallotのみ復号・集計
- 開票前にlatestBallotIdとisLatest=trueのBallot数の整合性を検証

### 投票データの完全性（docs/security.md §6参照）
- **HMAC**: `HMAC-SHA256(encryptedVote + electionId + timestamp)`。timestampはBallotレコードのtimestampと同じ値を使い、後から再検証可能にする
- **ハッシュチェーン**: 各BallotのpreviousHashに前Ballotのハッシュを格納。選挙ごとの最終ハッシュを`Election.latestChainHash`に保存し、開票時に照合
- **verifyBallotChainは最終ハッシュとの比較まで必ず実装する**（常にtrueを返す実装は禁止）

### 住所パーサー（docs/address-parser.md参照）
- 段階的パース: 都道府県除去 → 政令指定都市の区 → 東京23区 → 一般の市 → 郡部
- 政令指定都市リスト（20市）との照合で区の誤判定を防止
- ひらがな市名（さいたま市、つくばみらい市等）に対応
- 郡部（○○郡○○町/村）に対応
- docs/address-parser.mdのテストケースをすべてユニットテストでカバー

### Redis フォールバック
- Redis接続失敗時はインメモリストアにフォールバックし、ローカル開発を継続可能にする
- フォールバック時はコンソールに警告を出力
- 本番環境（NODE_ENV=production）ではフォールバック禁止（Redis必須）

### テスト（docs/testing-strategy.md参照）
- Vitest + Playwright
- lib/crypto.ts, lib/district.ts, lib/integrity.ts, lib/validation.ts は100%カバレッジ目標
- API Routesは90%以上
- E2Eで投票フロー全体、選挙区外拒否、再投票フローをカバー

---

## 実装の優先順位

### Phase 1：MVP（モック認証で全フロー動作）← いまここ
1. プロジェクトセットアップ（Next.js + Prisma + PostgreSQL + Vitest + Playwright）
2. セキュリティ基盤（セキュリティヘッダー、CSRF、入力検証、レート制限、監査ログ）
3. Redisクライアント（フォールバック付き）
4. モックOIDCプロバイダー
5. 住所パーサー + 選挙区判定（千葉6区・東京1区） + ユニットテスト
6. 管理画面（選挙作成・候補者登録・選挙区設定）
7. 投票画面UI（認証→選挙区判定→投票→暗号化→HMAC→ハッシュチェーン）
8. 再投票ロジック（latestBallotId方式）
9. 開票・集計（チェーン検証 + HMAC検証 + isLatest=trueのみ復号）
10. E2Eテスト + セキュリティチェックリスト全項目確認

### Phase 2：デジタル庁Sandbox接続
11. デジタル認証アプリAPI連携（モックから差し替え）
12. テストカード代替機能での動作確認
13. IDトークン検証（ES256署名検証、nonce/iss/aud/exp検証）

### Phase 3：本番準備
14. WAF設定 / 脆弱性診断 / 負荷テスト
15. 管理画面RBAC / 開票複数管理者承認
16. アクセシビリティ対応
17. 全289小選挙区マスターデータ完成
18. 第三者セキュリティ監査

---

## 環境変数（.env）

```env
DATABASE_URL="postgresql://user:password@localhost:5432/online_voting"
REDIS_URL="redis://localhost:6379"
USE_MOCK_AUTH="true"
DIGITAL_AUTH_CLIENT_ID=""
DIGITAL_AUTH_ISSUER="https://sb-auth-and-sign.go.jp"
DIGITAL_AUTH_REDIRECT_URI="http://localhost:3000/auth/callback"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SESSION_SECRET="generate-a-strong-secret-min-256bit"
BALLOT_INTEGRITY_KEY="generate-a-strong-hmac-key"
```
