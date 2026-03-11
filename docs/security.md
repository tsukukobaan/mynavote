# サイバーセキュリティ要件

投票システムは民主的プロセスの根幹であり、セキュリティ侵害は選挙結果の信頼性を完全に破壊する。以下の対策はPhase 1からすべて実装すること。「あとで追加」は許容しない。

## 1. 通信セキュリティ

```typescript
// next.config.js — セキュリティヘッダー
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://sb-auth-and-sign.go.jp https://auth-and-sign.go.jp",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; ')
  },
];
```

- **HTTPS必須**: TLS 1.2以上。TLS 1.0/1.1は無効化
- **HSTS**: preload listへの登録を目指す
- **証明書ピンニング**: デジタル認証アプリAPIへの通信にはCA証明書を検証

## 2. 認証・セッション管理

```typescript
// lib/session.ts — セッション設計
const SESSION_CONFIG = {
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 15 * 60,
    path: '/',
    domain: process.env.COOKIE_DOMAIN,
  },
  store: redisStore,  // Redisが使えない場合はインメモリにフォールバック
};

interface VotingSession {
  subjectHash: string;
  district: string | null;
  authenticated: boolean;
  authenticatedAt: number;
  csrfToken: string;
}
```

- **セッション固定攻撃対策**: 認証成功時にセッションIDを再生成
- **セッションタイムアウト**: 認証から15分。投票完了後は即座にセッション破棄
- **同時セッション制限**: 1つのsubjectHashにつき同時に1セッションのみ
- **個人情報の非保持**: 住所・氏名はセッションに保存しない。選挙区判定後に即破棄

## 3. CSRF / リクエスト改ざん防止

```typescript
import { randomBytes, timingSafeEqual } from 'crypto';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function verifyCsrfToken(sessionToken: string, requestToken: string): boolean {
  if (!sessionToken || !requestToken) return false;
  const a = Buffer.from(sessionToken);
  const b = Buffer.from(requestToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- **Double Submit Cookie**: CSRFトークンをセッションとリクエストヘッダの両方で検証
- **SameSite Cookie**: `Lax`を設定（OIDCリダイレクトとの互換性を確保）
- **Origin/Refererヘッダ検証**: API Routeで自ドメインからのリクエストのみ許可

## 4. 入力検証・インジェクション対策

```typescript
import { z } from 'zod';

export const voteRequestSchema = z.object({
  electionId: z.string().cuid(),
  encryptedVote: z.string()
    .min(1)
    .max(10000)
    .regex(/^[A-Za-z0-9+/=]+$/),
  csrfToken: z.string().length(64),
});

export const createElectionSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  districtId: z.string().max(20).optional(),
  votingStartAt: z.string().datetime(),
  votingEndAt: z.string().datetime(),
  allowRevote: z.boolean(),
});
```

- **Prismaのパラメータ化クエリ**: SQLインジェクション防止
- **HTMLエスケープ**: dangerouslySetInnerHTMLは一切使用禁止
- **JSONパース**: 不正なJSONに対するエラーハンドリング

## 5. レート制限・DDoS対策

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const rateLimits = {
  authStart: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '1m'),
    prefix: 'rl:auth',
  }),
  vote: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(3, '1m'),
    prefix: 'rl:vote',
  }),
  admin: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, '1m'),
    prefix: 'rl:admin',
  }),
};
```

- **IPベース + セッションベースの二重レート制限**
- **CDN/WAF**: CloudFlare or AWS WAFでBot対策、Geographic制限、L7 DDoS保護

## 6. 投票データの保全・改ざん検知

```typescript
import { createHash, createHmac } from 'crypto';

// 投票受付時: HMACを生成（タイムスタンプはBallotレコードのtimestampと同一値を使用）
export function createBallotHmac(
  encryptedVote: string,
  electionId: string,
  timestamp: string,  // Ballotレコードと同じISO文字列を渡す
): string {
  const hmac = createHmac('sha256', process.env.BALLOT_INTEGRITY_KEY!);
  hmac.update(encryptedVote);
  hmac.update(electionId);
  hmac.update(timestamp);
  return hmac.digest('hex');
}

// HMAC再検証（開票時に全Ballotの完全性を確認）
export function verifyBallotHmac(
  encryptedVote: string,
  electionId: string,
  timestamp: string,
  expectedHmac: string,
): boolean {
  const computed = createBallotHmac(encryptedVote, electionId, timestamp);
  return timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHmac));
}

// ハッシュチェーン検証（開票時）
export function verifyBallotChain(
  ballots: Array<{ encryptedVote: string; previousHash: string; timestamp: Date }>,
  storedFinalHash: string,
): boolean {
  let previousHash = 'genesis';
  for (const ballot of ballots) {
    if (ballot.previousHash !== previousHash) return false;
    previousHash = createHash('sha256')
      .update(previousHash)
      .update(ballot.encryptedVote)
      .update(ballot.timestamp.toISOString())
      .digest('hex');
  }
  return previousHash === storedFinalHash;
}
```

- **ハッシュチェーン**: 各Ballotが前のBallotのハッシュを含む連鎖構造。`storedFinalHash`は選挙ごとにElectionテーブルに保存し、開票時に照合する
- **HMAC再検証**: タイムスタンプはBallotレコードのtimestampフィールドと同じ値を使うことで、いつでも再検証可能
- **イミュータブル設計**: Ballotレコードは一度作成したらUPDATE/DELETE禁止。再投票は新レコード追加のみ

## 7. 秘密鍵・シークレット管理

```
1. 選挙用暗号化秘密鍵: DBに保存しない。開票時にのみ手動で投入
   - MVP段階: 環境変数（ELECTION_SECRET_KEY）で管理。本番では HSM を検討
   - 鍵の分割保管: 将来的にShamir's Secret Sharingで複数管理者に分割

2. セッション秘密鍵: 環境変数（SESSION_SECRET）。最低256bit
3. BALLOT_INTEGRITY_KEY: HMAC用。環境変数。選挙ごとに異なる鍵を生成
4. private_key_jwt用秘密鍵: デジタル認証アプリAPI認証用
```

- `.env`はgitignore必須。本番ではVercel Environment Variables or AWS Secrets Manager
- 鍵ローテーション: SESSION_SECRETは定期的にローテーション
- ログへの秘密情報漏洩防止: リクエストログからトークン・PIN・個人情報をフィルタリング

## 8. 監査ログ・インシデント検知

```typescript
export enum AuditAction {
  AUTH_START = 'AUTH_START',
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
  VOTE_ELIGIBILITY_CHECK = 'VOTE_ELIGIBILITY_CHECK',
  VOTE_ELIGIBILITY_DENIED = 'VOTE_ELIGIBILITY_DENIED',
  VOTE_CAST = 'VOTE_CAST',
  VOTE_REVOTE = 'VOTE_REVOTE',
  VOTE_DUPLICATE_ATTEMPT = 'VOTE_DUPLICATE_ATTEMPT',
  ELECTION_CREATED = 'ELECTION_CREATED',
  ELECTION_STATUS_CHANGED = 'ELECTION_STATUS_CHANGED',
  COUNTING_STARTED = 'COUNTING_STARTED',
  COUNTING_COMPLETED = 'COUNTING_COMPLETED',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  INVALID_INPUT = 'INVALID_INPUT',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

const ALERT_THRESHOLDS = {
  authFailuresPerMinute: 10,
  voteAttemptsPerSession: 5,
  csrfViolationsPerMinute: 3,
  duplicateVoteAttempts: 3,
};
```

- 全操作を記録、個人情報は含めない（IPはハッシュ化）
- 異常検知アラート: 閾値超過時に管理者に通知
- 保存期間: 選挙終了後1年間保存

## 9. 管理画面のアクセス制御

```typescript
const ADMIN_ROLES = {
  SUPER_ADMIN: ['election:create', 'election:delete', 'election:count', 'admin:manage'],
  ELECTION_MANAGER: ['election:create', 'election:count'],
  OBSERVER: ['election:view', 'results:view'],
};
```

- Phase 1: 環境変数ベースの簡易認証
- Phase 3: RBAC（役割ベースアクセス制御）に移行
- 開票操作は複数管理者の承認を要求（Phase 3）

## 10. 依存パッケージ・サプライチェーンセキュリティ

- npm audit: CI/CDパイプラインで毎回実行
- lockfile (package-lock.json): gitにコミット
- 依存パッケージの最小化
- Dependabot / Renovate: 自動脆弱性検知を有効化

## セキュリティチェックリスト

```
□ すべてのAPI Routeでzodバリデーションを実施しているか
□ すべてのPOST/PUT/DELETEでCSRFトークンを検証しているか
□ セッションに個人情報（住所・氏名）を保存していないか
□ ログに個人情報・トークン・PINを出力していないか
□ エラーレスポンスに内部情報（スタックトレース等）を含めていないか
□ レート制限が適用されているか
□ 暗号化処理でcrypto_box_seal（匿名暗号化）を使用しているか
□ Ballotレコードに投票者を特定できる情報が含まれていないか
□ 環境変数に秘密情報がハードコードされていないか
□ npm auditでcritical/high脆弱性がないか
```
