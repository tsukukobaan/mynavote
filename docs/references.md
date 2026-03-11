# 参考オープンソースプロジェクト

## エストニア IVXV（暗号設計の主要参考）
- **リポジトリ**: `github.com/valimised/ivxv`（Go 52%, Java 31%）
- **用途**: 暗号化・復号・検証ロジックの設計参考
- **参照すべきディレクトリ**:
  - `common/java/src/.../crypto/` — ElGamal暗号化、鍵生成、証明
  - `key/` — 閾値鍵生成・鍵管理
  - `processor/` — ミックスネット（投票順序のシャッフル）
  - `verification/` — 投票検証アプリロジック
  - `voting/` — 投票受付サーバー
  - `auditor/` — 監査ツール
- **検証アプリ**: `github.com/valimised/ivotingverification`（Android）

## Helios Voting（UI/UXフローの主要参考）
- **リポジトリ**: `github.com/benadida/helios-server`（Python/Django）
- **用途**: 投票画面フロー、Ballot Tracker、ブラウザ内暗号化のUI設計
- **参照すべきファイル**:
  - `heliosbooth/vote.html` — 投票ブース
  - `helios/templates/voters_list.html` — 有権者管理画面
  - `helios/templates/` — 選挙管理・結果表示のテンプレート群
- **注**: Heliosは強制投票（coercion）耐性が弱い。IVXVの再投票機能で補完する

## Belenios（暗号プロトコルの学術的参考）
- **リポジトリ**: `github.com/glondu/belenios`（OCaml）
- **用途**: Helios-Cプロトコルの形式検証済み実装。セキュリティ証明の参考
- **公式サイト**: `belenios.org`
