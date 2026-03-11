# 認証設計

## 使用するAPI：認証APIのみ

デジタル認証アプリの認証APIは、利用者証明用電子証明書（4桁PIN）で本人認証を行い、同時に券面事項入力補助APから基本4情報を読み取る。

| 項目 | 内容 |
|---|---|
| 認証方式 | OpenID Connect（認可コードフロー + PKCE） |
| ユーザーPIN | 4桁数字（利用者証明用） |
| 取得できる情報 | sub（PPID）、氏名、住所、生年月日、性別 |
| Sandboxエンドポイント | `https://sb-auth-and-sign.go.jp/api/realms/main/protocol/openid-connect/auth` |
| 本番エンドポイント | `https://auth-and-sign.go.jp/api/realms/main/protocol/openid-connect/auth` |
| クライアント認証 | private_key_jwt |
| IDトークン署名 | ES256 |

## 署名APIを使わない理由

- 署名APIは6〜16桁英数字PINが必要でユーザーのハードルが高い
- 署名APIを使う場合、PF事業者（プラットフォーム事業者）との連携が必須
- 認証APIだけで本人確認＋住所取得（＝選挙区判定）が完結する
- 投票内容への電子署名はアプリ側の暗号化で代替可能

## モックOIDCプロバイダー（Phase 1で使用）

デジタル庁との準備契約が完了するまで、ローカルにモックOIDCプロバイダーを立てて開発する。

```typescript
// lib/mock-oidc.ts — モックOIDCプロバイダーのレスポンス
// デジタル認証アプリAPIのレスポンス形式に合わせたモックデータ

export const MOCK_USERS = [
  {
    sub: "mock-user-001-ppid",  // PPID（サービスごとに異なる識別子）
    name: "山田 太郎",
    address: "千葉県松戸市根本387番地の5",
    birthdate: "19850315",
    gender: "1",  // 1:男性, 2:女性
  },
  {
    sub: "mock-user-002-ppid",
    name: "佐藤 花子",
    address: "千葉県松戸市小根本45番地3",
    birthdate: "19900721",
    gender: "2",
  },
  {
    sub: "mock-user-003-ppid",
    name: "鈴木 一郎",
    address: "東京都千代田区永田町1丁目7番1号",  // 松戸市外 → 選挙区外
    birthdate: "19780110",
    gender: "1",
  },
];
```

## 本番接続時の切り替え

```typescript
// lib/auth.ts — 環境変数で切り替え
const AUTH_CONFIG = {
  issuer: process.env.USE_MOCK_AUTH === "true"
    ? "http://localhost:3001"
    : process.env.DIGITAL_AUTH_ISSUER!,
  authorizationEndpoint: process.env.USE_MOCK_AUTH === "true"
    ? "http://localhost:3001/authorize"
    : `${process.env.DIGITAL_AUTH_ISSUER}/api/realms/main/protocol/openid-connect/auth`,
  tokenEndpoint: process.env.USE_MOCK_AUTH === "true"
    ? "http://localhost:3001/token"
    : `${process.env.DIGITAL_AUTH_ISSUER}/api/realms/main/protocol/openid-connect/token`,
  userinfoEndpoint: process.env.USE_MOCK_AUTH === "true"
    ? "http://localhost:3001/userinfo"
    : `${process.env.DIGITAL_AUTH_ISSUER}/api/realms/main/protocol/openid-connect/userinfo`,
};
```
