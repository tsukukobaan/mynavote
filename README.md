# MynaVote - マイナンバーカード認証オンライン投票

マイナンバーカードの公的個人認証（JPKI）を活用した、党内選挙・団体内選挙向けのオンライン投票Webアプリです。

公職選挙法の適用外となる予備選挙・党首選・団体内役員選挙等をターゲットとしています。

## 特徴

- **マイナンバーカード認証**: デジタル庁「デジタル認証アプリ」の認証API（4桁PIN）で本人確認
- **住所による選挙区判定**: 認証時に取得した住所から小選挙区を自動判定
- **ブラウザ内暗号化**: 投票内容はブラウザ内でsealed box暗号化。サーバーは平文を一切見ない
- **投票の秘密**: 二重封筒方式（IVXV準拠）により、誰がどの候補に投票したか追跡不可能
- **Ballot Tracker**: 投票が正しく記録されたことを後から検証可能（Helios Voting方式）
- **再投票対応**: 投票期間中は再投票可能。強制投票への耐性を確保
- **改ざん検知**: HMAC + ハッシュチェーンによる投票データの完全性保証

## ユースケース

- 小選挙区の予備選挙（住所による選挙区判定が必要）
- 政党の党首選（全国党員投票）
- 政治塾・任意団体の内部役員選挙
- 政策諮問・意見集約（非法定）

## 技術スタック

- **フロントエンド**: Next.js 14+ (App Router) / TypeScript / Tailwind CSS / shadcn/ui
- **バックエンド**: Next.js API Routes / Prisma ORM / PostgreSQL
- **セッション・レート制限**: Redis（ローカル開発時はインメモリフォールバック）
- **暗号化**: libsodium-wrappers (ブラウザ) / sodium-native (サーバー)
- **テスト**: Vitest / Playwright

## セットアップ

### 前提条件

- Node.js 18+
- PostgreSQL
- Redis（オプション。なくてもインメモリフォールバックで開発可能）

### インストール

```bash
git clone https://github.com/tsukukobaan/mynavote.git
cd mynavote
npm install
```

### 環境変数

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

### データベースセットアップ

```bash
npx prisma migrate dev
```

### 開発サーバー起動

```bash
npm run dev
```

### テスト

```bash
# ユニットテスト・統合テスト
npm test

# E2Eテスト
npm run test:e2e
```

## 設計ドキュメント

| ドキュメント | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | プロジェクト概要・設計方針・制約 |
| [docs/auth-design.md](docs/auth-design.md) | 認証設計 |
| [docs/crypto-design.md](docs/crypto-design.md) | 暗号設計（IVXV準拠） |
| [docs/security.md](docs/security.md) | セキュリティ要件 |
| [docs/ui-flow.md](docs/ui-flow.md) | 画面遷移・投票フロー |
| [docs/revote-design.md](docs/revote-design.md) | 再投票設計 |
| [docs/address-parser.md](docs/address-parser.md) | 住所パーサー設計 |
| [docs/testing-strategy.md](docs/testing-strategy.md) | テスト戦略 |

## 暗号設計の参考

- [エストニア IVXV](https://github.com/valimised/ivxv) — 暗号化・復号・検証ロジック
- [Helios Voting](https://github.com/benadida/helios-server) — UI/UXフロー・Ballot Tracker
- [Belenios](https://github.com/glondu/belenios) — 暗号プロトコルの形式検証

## 開発ステータス

- [x] Phase 1: MVP（モック認証で全フロー動作） — 開発中
- [ ] Phase 2: デジタル庁Sandbox接続
- [ ] Phase 3: 本番準備

## ライセンス

MIT
