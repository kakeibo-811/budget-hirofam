# 夫婦家計簿 / Budget HiroFam

夫婦の家計を一元管理するためのウェブアプリ。Cloudflare Workers + D1 + Pages で動作。

---

## このREADMEを読む順序

1. **クイックスタート**（下記）に従ってセットアップ
2. 動かなかったら**トラブルシュート**を見る
3. 仕様の詳細は**設計**セクション

---

## クイックスタート（手間最小手順）

### 必要なもの

- Windows PC（PowerShell 5.1 以降）
- Node.js 20+ がインストール済み
- Cloudflare アカウント（無料プランでOK）
- Wrangler が必要（`npx wrangler` で初回自動DL）

### 手順

```powershell
# 1. プロジェクトを展開
cd C:\Users\thiro\OneDrive\デスクトップ
Expand-Archive budget-hirofam.zip -DestinationPath .
cd budget-hirofam

# 2. セットアップ（npm install → wrangler login → D1作成 → マイグレーション）
./scripts/setup.ps1
```

`setup.ps1` は以下を**自動で**実行する：

- `npm install` を全モジュールに対して
- `wrangler login`（ブラウザが開く、Cloudflare にログイン）
- D1 データベース2つを作成（`budget-hirofam-preview`, `budget-hirofam-prod`）
- 取得した `database_id` を `worker/wrangler.toml` に**自動で書き込み**
- Preview DB にマイグレーションを適用
- Production DB にも適用するか確認（`y` で適用）

### Cloudflare Access 設定（手動 ・ 一度だけ）

セットアップ完了後、Cloudflare Access の設定だけは管理画面操作が必要：

1. https://one.dash.cloudflare.com/ → **Access** → **Applications** → **Add an application**
2. 「Self-hosted」を選択
3. **Application domain**: `budget-hirofam-preview.<your-subdomain>.workers.dev`（最初は preview だけでOK）
4. **Identity provider**: One-time PIN（メール認証）が一番簡単
5. **Policy** を追加：Toshi と Lisa のメールアドレスを Allow
6. 作成後、以下の2つの値をコピーする：
   - **Application Audience (AUD) Tag**
   - **Team domain**（例：`hirofam.cloudflareaccess.com`）

7. `worker/wrangler.toml` を開いて、以下の2か所（preview と production）を編集：

```toml
[env.preview.vars]
CF_ACCESS_TEAM_DOMAIN = "hirofam.cloudflareaccess.com"  # ← コピーした値
CF_ACCESS_AUD = "abc123def456..."                       # ← コピーした値
```

production 用の Access アプリは preview の動作確認後に同じ手順で作成。

### Preview デプロイ

```powershell
./scripts/deploy-preview.ps1
```

ブラウザで Worker のURL（コンソール出力に表示される）を開く → Cloudflare Access でメール認証 → 家計簿アプリが表示される。

このとき**書き込みは無効**（読み取り専用モード）。バナーで明示。すべてのタブが正しく描画されるか、件数が0でもエラーが出ないかを確認。

### 書き込みを有効にする

Preview で動作確認できたら：

```powershell
./scripts/enable-write.ps1 -Env preview -Enable $true
./scripts/deploy-preview.ps1
```

これで Preview 環境で書き込みが効くようになる。明細・固定費・収入の追加・編集をテスト。

### 本番昇格

```powershell
./scripts/promote-prod.ps1
```

このスクリプトは以下を行う：

1. Production D1 をバックアップ（`backups/prod-<timestamp>.sql`）
2. 事前チェックリストを表示
3. `yes` 入力で確認
4. クリーンビルド & 本番デプロイ
5. ヘルスチェック案内

本番でも書き込みは初期 false。動作確認が済んでから：

```powershell
./scripts/enable-write.ps1 -Env production -Enable $true
./scripts/deploy-preview.ps1  # ※ deploy-production.ps1 ではなく promote-prod.ps1 を使う
```

---

## 何かあったとき

### トラブル: ヘルスチェックで `db.ok: false`

D1 binding が効いていない。`worker/wrangler.toml` の `database_id` が正しいか確認：

```powershell
npx wrangler d1 list
```

出した ID を `wrangler.toml` の該当 env に貼り直して、再デプロイ。

### トラブル: `/api/health` で 401 が返る

Cloudflare Access の認証が通っていない。ブラウザで一度アプリのURLを開いて Access 認証を済ませる。

それでもダメなら `wrangler.toml` の `CF_ACCESS_AUD` と `CF_ACCESS_TEAM_DOMAIN` が正しいか確認。

### トラブル: `wrangler login` セッションが切れる

```powershell
npx wrangler login
```

を再実行。

### ロールバック

本番でおかしくなったら：

```powershell
# 直近のバックアップから戻す
./scripts/rollback.ps1 backups/prod-20260509-103000.sql
```

`backups/` フォルダに自動で時刻付きファイルが溜まっていく。

### バックアップを手動で取る

```powershell
./scripts/backup.ps1
```

---

## 開発ロードマップ（3セッション計画）

このパッケージは**セッション1**の成果物。

### セッション1（このパッケージ）

- ✅ 13タブの枠組み、日英、5テーマ、バージョン表示、月セレクタ集約
- ✅ Worker + Hono + D1、Cloudflare Access JWT 検証、書き込みフラグ
- ✅ DB マイグレーション完全版（UNIQUE制約・インデックス含む）
- ✅ 主要API：明細、カード、口座、収入、固定費、月別精算、概要、診断、CSVエクスポート
- ✅ PowerShellスクリプト一式（セットアップ、デプロイ、バックアップ、ロールバック）
- ⚠️ 全タブは**読み取り表示**のみ。書き込みUIは最低限（精算ロジック等のテスト目的）
- ⚠️ 資産・負債タブは設定一覧のみ（推移グラフはセッション2）

### セッション2

- 資産・負債の月次推移計算（住宅ローン・修繕積立・貸付金）
- 貸付金一括返済時の自動再計算
- 給与サイクル基準の分析タブ
- 12か月以上の月別推移グラフ
- 明細・固定費の編集・追加 UI を全タブに

### セッション3

- CSV取り込み（Shift-JIS / UTF-8 BOM 自動判定、列マッピングUI、件数確認）
- メッセージボード（書き込み）
- チュートリアル拡充
- 既存D1（`kakeibo-production`）からのデータ移行（必要なら）

---

## 設計（要点）

### 二重計上防止：ledger_links テーブル

過去に発生した「貸付金返済の連動ボタン複数回押下で二重計上」バグ対策として、`ledger_links` に `UNIQUE(source_type, source_id, owner, month)` 制約を強制。

連動して明細を作る処理はすべて `idempotentLink()` 関数（`worker/src/db/helpers.ts`）を経由する。

### 書き込みフラグ：WRITE_ENABLED

`wrangler.toml` の env vars に書く文字列フラグ。`/api/*` のすべての書き込みリクエスト（POST/PATCH/PUT/DELETE）はこのフラグが `"true"` のときのみ通る。それ以外は HTTP 423 を返す。

ただし `/api/diag/*` は例外（読み取り専用なので常に通す）。

### 過去月ロック：fixed_cost_snapshots.locked

固定費は2層管理：マスター（テンプレ）と月次スナップショット。`locked = 1` のスナップショットは一括更新の対象外。過去月の値を意図せず上書きしない設計。

### 環境分離：env を必ず明示

過去に `wrangler deploy`（env未指定）で別環境の binding が使われた事故対策として：

- `wrangler.toml` のトップレベルに `d1_databases` を書かない
- すべてのデプロイは `--env preview` または `--env production` を明示
- スクリプト経由でしかデプロイしない

### CSV エクスポートの BOM

Excel 文字化け対策として、エクスポートCSVは UTF-8 BOM (`\uFEFF`) 付きで配信。

---

## ファイル構成

```
budget-hirofam/
├── README.md                    ← これ
├── package.json                 ← トップレベル（特に意味なし、利便性用）
├── .gitignore
├── frontend/                    ← Vite + TypeScript
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts              ← エントリポイント
│       ├── style.css            ← 5テーマ
│       ├── i18n/index.ts        ← 日英辞書
│       ├── utils/index.ts       ← API client, formatter
│       ├── components/
│       │   └── month-picker.ts  ← 月セレクタ
│       └── tabs/
│           ├── dashboard.ts
│           ├── expenses.ts
│           ├── ...
│           └── settings-and-diag.ts
├── worker/                      ← Cloudflare Workers + Hono
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml            ← env 設定。setup.ps1 が DB ID を埋める
│   └── src/
│       ├── index.ts             ← エントリ
│       ├── middleware/
│       │   ├── cf-access.ts     ← JWT検証
│       │   ├── error-handler.ts ← D1エラー和訳
│       │   └── write-guard.ts   ← WRITE_ENABLED フラグ
│       ├── db/
│       │   └── helpers.ts       ← bulk insert / idempotentLink
│       └── routes/
│           ├── expenses.ts
│           ├── cards.ts
│           └── ...
├── migrations/                  ← D1 マイグレーション
│   ├── 0001_initial_schema.sql
│   └── 0002_seed_data.sql
└── scripts/                     ← PowerShell スクリプト
    ├── setup.ps1                ← 初回セットアップ（最初に1回だけ）
    ├── deploy-preview.ps1       ← Preview デプロイ
    ├── promote-prod.ps1         ← 本番昇格
    ├── backup.ps1               ← 手動バックアップ
    ├── rollback.ps1             ← ロールバック
    └── enable-write.ps1         ← WRITE_ENABLED フラグ切替
```

---

## バージョン

- v1.0.0 (26/5/9版) - セッション1 初期リリース
