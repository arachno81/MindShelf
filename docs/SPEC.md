# MindShelf 仕様書

## 1. 文書の位置づけ

本書は、MindShelf v1の正式な仕様書である。

MindShelfの機能、画面、データ構造、認証方式、API、AIの挙動を定義し、実装・レビュー・テストの基準とする。実装と本書が異なる場合は、本書を正とする。

---

## 2. アプリケーション概要

MindShelfは、文章を中心とした情報を`Book`として保存し、補足情報、ファイル、変更履歴、AIとの会話を一つの場所にまとめるWebアプリケーションである。

各Bookは次の情報を持つ。

- タイトル
- Markdown形式の本文
- Category
- Tags
- Blocks
- Files
- Activity Logs
- Book専用AI Chat
- 背景画像
- アーカイブ状態
- ピン留め状態
- 詳細画面の既定表示領域

MindShelf内で情報の中心となる単位は、すべて`Book`と呼ぶ。

---

## 3. v1の技術構成

### 3.1 バックエンド

- PHP 8.2以上
- Laravel 12
- Laravel Sanctum
- Laravel Queue
- Laravel Storage
- ローカル開発ではSQLiteを使用できる
- 本番環境ではPostgreSQLを標準構成とする
- 本番環境のSession、Cache、QueueにはRedisを使用する

SQLiteは、ローカル開発、テスト、単一ユーザーによる簡易実行を目的とする。本番環境における複数プロセスからの継続的な書き込みを前提とした構成には使用しない。

データベースマイグレーションは、SQLiteとPostgreSQLの両方で実行できる状態を維持する。

### 3.2 フロントエンド

- Vue 3
- Vue Router
- Axios
- Vite
- Tailwind CSS
- `marked`
- `DOMPurify`
- `vuedraggable`

### 3.3 アプリケーション構成

- VueによるSPAとして実装する
- Laravelは認証、API、ファイル配信、AI連携を担当する
- フロントエンドとバックエンドは同一のMindShelfアプリケーションとして動作する
- 外部のユーザー管理・認証・セッションには依存しない

---

## 4. 用語

### Book

MindShelfで管理する情報の中心単位。

タイトルと本文を持ち、Blocks、Files、Activity Logs、AI Chatが紐づく。

### Block

Bookに追加する補足情報の単位。

Markdown形式の内容、表示順、作成者名、完了状態を持つ。

### File

Bookに添付されたファイル。

画像、テキストファイル、その他のダウンロード可能なファイルを扱う。

### Activity Log

BookまたはBlockに対して行われた主要な変更の記録。

### Room Memory

Book専用AI Chatから生成される、会話の要約および継続的に保持する事実情報。

### Persona

AIの人格、応答方針、口調を定義する設定。

---

## 5. 認証

### 5.1 認証方式

MindShelfはLaravel SanctumのファーストパーティSPA認証を使用する。

APIトークンやBearer Tokenではなく、LaravelのセッションCookieによってログイン状態を維持する。

認証フローは次のとおりとする。

1. フロントエンドが`GET /sanctum/csrf-cookie`を呼び出す
2. Laravelが`XSRF-TOKEN` Cookieを発行する
3. フロントエンドが`POST /login`へメールアドレスとパスワードを送信する
4. Laravelが認証に成功した場合、セッションを再生成する
5. 以後のAPI通信ではブラウザがセッションCookieを送信する
6. Axiosは`withCredentials: true`で通信する
7. 状態を変更するリクエストでは`X-XSRF-TOKEN`ヘッダーを送信する

セッションCookieは次の条件を満たす。

- `HttpOnly`
- `SameSite=Lax`
- 本番HTTPS環境では`Secure`
- セッションIDをログイン成功時に再生成する
- ログアウト時にセッションを無効化する

`XSRF-TOKEN` Cookieは、AxiosがCSRFヘッダーを生成するためにJavaScriptから参照可能とする。

### 5.2 MindShelfアカウント

MindShelfは独自の`users`テーブルを持つ。

ユーザーは次の情報を持つ。

- ID
- 表示名
- メールアドレス
- パスワードハッシュ
- メール確認日時
- Remember Token
- 作成日時
- 更新日時

パスワードは平文で保存せず、Laravel標準のパスワードハッシュ機構を使用する。

### 5.3 新規登録

v1ではMindShelf内での新規ユーザー登録を提供する。

登録画面では次を入力する。

- 表示名
- メールアドレス
- パスワード
- パスワード確認

登録APIは`POST /register`とする。

登録条件は次のとおりとする。

- メールアドレスは一意
- パスワードは8文字以上
- パスワード確認が一致している
- 登録成功後に認証済みセッションを開始する
- 確認メールを送信する

公開登録の可否は`.env`の`REGISTRATION_ENABLED`で制御する。既定値は`true`とする。

`false`の場合、登録画面と登録APIを無効化する。既存ユーザーのログインには影響しない。

公開登録を無効化した環境で最初のユーザーを作成するため、次のArtisanコマンドを提供する。

```bash
php artisan mindshelf:user-create
```

コマンドは表示名、メールアドレス、パスワードを対話形式で受け取り、メール確認済みのユーザーを作成する。

メールアドレスの重複、パスワードの最小文字数などには、新規登録APIと同じ入力条件を適用する。

### 5.4 メール確認

登録したユーザーにはメール確認を要求する。

メール未確認のユーザーはログインできるが、Bookを含むアプリケーション機能は利用できない。確認案内画面と確認メールの再送機能を表示する。

使用するエンドポイントは次のとおりとする。

- `GET /verify-email/{id}/{hash}`
- `POST /email/verification-notification`

Book、Block、File、Category、Tag、Activity Log、AI ChatのAPIには`auth:sanctum`と`verified`を適用する。

### 5.5 ログイン

ログイン画面では次を入力する。

- メールアドレス
- パスワード
- ログイン状態を保持するか

ログインAPIは`POST /login`とする。

ログイン成功後はBook一覧へ遷移する。

ログイン失敗時は、メールアドレスまたはパスワードのどちらが誤っているかを区別せず、認証に失敗したことだけを表示する。

連続したログイン試行にはレート制限を適用する。

### 5.6 ログアウト

ログアウトAPIは`POST /logout`とする。

ログアウト時は次を実行する。

- 現在のセッションを無効化
- セッションIDを破棄
- CSRF Tokenを再生成
- ログイン画面へ遷移

### 5.7 パスワード再設定

次の機能を提供する。

- パスワード再設定メールの要求
- メール内リンクからのパスワード再設定

使用するエンドポイントは次のとおりとする。

- `POST /forgot-password`
- `POST /reset-password`

### 5.8 認証状態の取得

フロントエンドは`GET /api/user`で現在のユーザーを取得する。

未認証の場合は`401 Unauthorized`を返す。

Vue Routerの認証必須画面へ未認証状態でアクセスした場合、ログイン画面へ遷移する。

### 5.9 データ所有権

すべてのユーザーデータは所有ユーザーに紐づく。

対象は次のとおり。

- Books
- Categories
- Tags
- Blocks
- Files
- Activity Logs
- AI Messages
- Room Memory
- PersonaのBook別選択状態

サーバーは、リクエストされたIDだけを信用してはならない。取得、更新、削除、並べ替え、ファイル表示、ダウンロードのすべてで、認証ユーザーが対象データを所有していることを確認する。

別ユーザーのデータを指定された場合は、そのデータの存在を公開しないため`404 Not Found`を返す。

---

## 6. 画面とナビゲーション

### 6.1 主要画面

v1は次の画面を持つ。

- ユーザー登録
- ログイン
- メール確認案内
- パスワード再設定
- Book一覧
- Book作成
- Book詳細
- ゴミ箱
- Category管理
- Activity Logs

### 6.2 初期画面

認証済みユーザーがMindShelfを開いた場合、最初にBook一覧を表示する。

- `/`へアクセスした認証済みユーザーは`/books`へ遷移する
- 未認証ユーザーは`/login`へ遷移する
- ログイン成功後は`/books`へ遷移する

Activity Logsは独立した画面として提供し、初期画面にはしない。

### 6.3 レスポンシブ表示

- デスクトップとモバイルの両方に対応する
- Book詳細のAI Chatは、デスクトップでは幅を変更できるサイドパネルとして表示する
- モバイルではAI Chatを全画面オーバーレイとして表示する

---

## 7. Book

### 7.1 データ構造

Bookは次のフィールドを持つ。

| フィールド | 型 | 内容 |
|---|---|---|
| `id` | bigint | Book ID |
| `user_id` | bigint | 所有ユーザー |
| `category_id` | bigint / null | Category |
| `title` | string | タイトル |
| `body` | longText / null | Markdown本文 |
| `main_panel` | enum | `body`、`files`、`blocks` |
| `persona_id` | string / null | Bookで選択されたPersona ID |
| `is_pinned` | boolean | ピン留め状態 |
| `is_archived` | boolean | アーカイブ状態 |
| `archived_at` | datetime / null | アーカイブ日時 |
| `deleted_at` | datetime / null | ゴミ箱へ移動した日時 |
| `background_image_path` | string / null | Storage内の背景画像の相対パス |
| `background_image_mime_type` | string / null | 背景画像のMIME Type |
| `created_at` | datetime | 作成日時 |
| `updated_at` | datetime | 更新日時 |

### 7.2 Book一覧

Book一覧はカード形式で表示する。

各カードには次を表示する。

- タイトル
- 本文の抜粋
- Category
- Tags
- 更新日時
- Block数
- アーカイブ状態
- 背景画像

Tagsは先頭3件まで表示し、それ以上ある場合は残り件数を表示する。

本文にMarkdown画像が含まれる場合、明示的な背景画像が設定されていないBookでは最初の画像をカード背景として利用できる。

### 7.3 並び順

Book一覧は次の順序で表示する。

1. ピン留めされたBook
2. `updated_at`の降順
3. `id`の降順

### 7.4 ページネーション

Book一覧はサーバー側でページネーションする。

- 1ページ20件
- レスポンスに現在ページ、最終ページ、総件数を含める

### 7.5 検索と絞り込み

次の条件を組み合わせて絞り込める。

- タイトルまたは本文の部分一致検索
- Category
- Tag
- アクティブなBook
- アーカイブ済みBook

アクティブとアーカイブ済みは同時には表示せず、一覧上の切り替え操作で変更する。

### 7.6 Book作成

作成時に指定できる項目は次のとおり。

- タイトル
- 本文
- Category
- Tags
- 最初に表示する領域

入力条件は次のとおり。

- タイトルは必須
- タイトルは255文字以内
- 本文は任意
- Categoryは認証ユーザーが所有するものに限る
- Tagsは認証ユーザーが所有するものに限る
- `main_panel`は`body`、`files`、`blocks`のいずれか
- `main_panel`の既定値は`body`

作成成功時はBook詳細画面へ遷移する。

### 7.7 Book詳細

Book詳細画面は次の3領域を持つ。

- Body
- Files
- Blocks

`main_panel`に指定された領域を主要表示として開く。

ユーザーが主要表示を切り替えた場合、その値をBookへ保存し、次回も同じ領域を主要表示として開く。

詳細画面では次を実行できる。

- タイトルの編集
- 本文の編集
- Markdownプレビュー
- Categoryの変更
- Tagsの変更
- Activity Messageの入力
- 背景画像の設定と解除
- ピン留めと解除
- アーカイブ
- アーカイブからの復元
- ゴミ箱への移動
- AI Chatの表示

### 7.8 Markdown

Book本文はMarkdownとして保存する。

表示時は次の処理を行う。

1. MarkdownをHTMLへ変換する
2. `DOMPurify`でサニタイズする
3. サニタイズ後のHTMLだけを描画する

保存された本文から生成した未処理HTMLを直接描画してはならない。

### 7.9 Activity Message

Book本文を更新する際、任意でActivity Messageを入力できる。

- 最大255文字
- Activity Logの`meta.message`へ保存する
- タイトル、Category、Tagsなどだけを変更した場合はBook更新ログを作成しない
- 本文が変更された場合だけBook更新ログを作成する

### 7.10 背景画像

画像をアップロードし、Bookの背景として設定できる。

- 対応形式はJPEG、PNG、GIF、WebP
- 最大10MB
- 実ファイルは`FILESYSTEM_DISK`で指定されたStorageへ保存する
- 実ファイル名にはUUIDを使用する
- データベースにはStorage内の相対パスを`background_image_path`として保存する
- データベースには検証済みのMIME Typeを`background_image_mime_type`として保存する
- Storage上の実パスや公開URLをデータベースへ保存しない
- Book APIのレスポンスでは、認可付き表示エンドポイントを指す`background_image_url`を動的に生成して返す
- ユーザーが任意の外部URLを背景画像として保存する方式にはしない

背景画像の表示には、次のエンドポイントを使用する。

`GET /api/books/{book}/background-image`

このエンドポイントは認証とBookの所有権を検証し、保存されたMIME Typeを`Content-Type`として画像データを返す。

背景画像を差し替える場合は、新しい画像を保存した後にBookの保存情報を更新し、以前の実ファイルをStorageから削除する。

背景画像を解除する場合は、Bookの保存情報を`null`へ更新し、以前の実ファイルをStorageから削除する。

データベース更新または実ファイル操作の途中で失敗した場合は、成功として応答してはならない。保存情報を直前の状態へ戻すか、再試行可能な状態としてエラーを運用ログへ記録する。新旧どちらからも参照されない実ファイルを放置してはならない。

Bookを完全削除する場合は、`background_image_path`が示す実ファイルも削除する。

### 7.11 ピン留め

Bookはピン留めできる。

ピン留め状態は本文中の特殊文字列ではなく、`is_pinned`フィールドに保存する。

### 7.12 アーカイブ

アーカイブ時は次を実行する。

- `is_archived`を`true`にする
- `archived_at`へ現在日時を保存する
- アクティブ一覧から除外する
- アーカイブ一覧へ表示する

復元時は次を実行する。

- `is_archived`を`false`にする
- `archived_at`を`null`にする
- アクティブ一覧へ戻す

### 7.13 Bookの削除とゴミ箱

Bookに対する通常の削除操作は、即時の完全削除ではなくゴミ箱への移動とする。

Bookは`deleted_at`を持ち、LaravelのSoft Deletesを使用する。

#### ゴミ箱への移動

Book詳細で削除を選択した場合は、確認ダイアログを表示する。

確認後は次を実行する。

- `deleted_at`へ現在日時を保存する
- 通常のBook一覧から除外する
- アーカイブ一覧から除外する
- ゴミ箱へ表示する
- 関連するBlocks、Files、Activity Logs、AIデータは削除しない
- 保存済みファイルもStorageから削除しない

ゴミ箱にあるBookとその関連データは、通常のBook APIから取得できない。

#### ゴミ箱

ゴミ箱では次を表示する。

- Bookタイトル
- 削除日時
- 完全削除予定日
- 復元操作
- 今すぐ完全削除する操作

ゴミ箱へ移動したBookは、削除日時から30日間保持する。

#### 復元

保持期間内のBookは復元できる。

復元時は`deleted_at`を`null`へ戻す。

ゴミ箱へ移動する前にアーカイブされていたBookは、復元後もアーカイブ状態とする。アクティブだったBookは、復元後もアクティブ状態とする。

Blocks、Files、Activity Logs、AI Messages、Room Memory、Persona設定もそのまま利用可能な状態へ戻す。

#### 自動完全削除

`deleted_at`から30日を経過したBookは、定期実行処理によって完全削除する。

完全削除では次を削除する。

- Book
- Blocks
- Filesのデータベースレコード
- Storage上の実ファイル
- Activity Logs
- AI Messages
- Room Memory
- Book別Persona設定
- Category・Tagとの関連

CategoryとTagそのものは削除しない。

関連データの削除とBookの削除は、一つの完全削除処理として実行する。途中で失敗した場合はエラーを記録し、残りの削除を再試行できる状態にする。

#### 手動での完全削除

ユーザーはゴミ箱から保持期間を待たずに完全削除できる。

誤操作を防ぐため、完全削除時には次を要求する。

1. 完全削除すると復元できないことを表示する
2. 対象Bookのタイトルを入力させる
3. 入力されたタイトルが完全一致した場合だけ実行する

完全削除APIには、確認用のBookタイトルをリクエスト本文として送信する。

```json
{
  "title": "削除するBookのタイトル"
}
```

サーバーは、送信された`title`と削除対象Bookの現在のタイトルを完全一致で比較する。

一致しない場合は完全削除を実行せず、`422 Unprocessable Entity`と次のエラーコードを返す。

```json
{
  "message": "Bookタイトルが一致しません。",
  "code": "BOOK_TITLE_MISMATCH"
}
```

完全削除後は、MindShelfから対象データを復元できない。

### 7.14 Book参照

Book本文またはBlock内の`#数字`をBook参照として扱う。

例：

```text
#123
```

参照先が認証ユーザーの所有するBookである場合、タイトルと本文抜粋を含むリンク付きプレビューを表示する。

次の場合は参照として展開しない。

- 参照先が存在しない
- 別ユーザーのBook
- 現在表示しているBook自身
- 数字以外を含む

---

## 8. Category

### 8.1 データ構造

Categoryは次のフィールドを持つ。

- `id`
- `user_id`
- `name`
- `created_at`
- `updated_at`

Category名はユーザー単位で一意とする。

### 8.2 機能

ユーザーは次を実行できる。

- Category一覧の取得
- Category作成
- Category名の変更
- Category削除

一覧は名前の昇順で返す。

Categoryを削除した場合、そのCategoryを使用していたBookの`category_id`を`null`にする。Book自体は削除しない。

---

## 9. Tag

### 9.1 データ構造

Tagは次のフィールドを持つ。

- `id`
- `user_id`
- `name`
- `created_at`
- `updated_at`

Tag名はユーザー単位で一意とする。

BookとTagは多対多で関連する。

### 9.2 機能

v1では次を提供する。

- Tag一覧の取得
- Tag作成
- BookへのTag設定と解除

一覧は名前の昇順で返す。

---

## 10. Block

### 10.1 データ構造

Blockは次のフィールドを持つ。

| フィールド | 型 | 内容 |
|---|---|---|
| `id` | bigint | Block ID |
| `book_id` | bigint | 所属Book |
| `user_id` | bigint | 所有ユーザー |
| `author_name` | string / null | 表示上の作成者名 |
| `content` | longText | Markdown内容 |
| `sort_order` | integer | 表示順 |
| `is_done` | boolean | 完了状態 |
| `created_at` | datetime | 作成日時 |
| `updated_at` | datetime | 更新日時 |

### 10.2 Block一覧

Block一覧はサーバー側でページネーションする。

表示順は次のとおりとする。

1. `sort_order`の昇順
2. `id`の昇順

1ページの表示件数は5件とする。

フロントエンドは、表示するページに含まれるBlockだけをAPIから取得する。Bookに属するすべてのBlockを最初に取得し、クライアント側で分割してはならない。

取得APIは次の形式とする。

```http
GET /api/books/{book}/blocks?page=1&per_page=5
```

レスポンスには次を含める。

```json
{
  "data": [],
  "meta": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 5,
    "from": 1,
    "to": 5,
    "total": 0
  }
}
```

Book詳細画面では、レスポンスの`meta`を使用してページ切り替えを表示する。

Blockを作成した場合、新しいBlockは末尾へ追加する。作成成功後は、新しいBlockが含まれる最終ページを表示する。

現在のページにある最後のBlockを削除し、そのページが空になった場合は、一つ前のページを表示する。

### 10.3 作成

Block作成時に指定できる項目は次のとおり。

- 内容
- 作成者名

入力条件は次のとおり。

- 内容は必須
- Markdownを使用できる
- 作成者名は255文字以内
- 作成者名が未入力の場合は`自分`
- `sort_order`は既存の最大値に1を加えた値
- `is_done`の初期値は`false`

### 10.4 編集

次を変更できる。

- 内容
- 作成者名
- 完了状態
- Activity Message

Activity Messageは任意で、最大255文字とする。

### 10.5 完了状態

Blockは完了・未完了を切り替えられる。

完了状態の変更もBlock更新としてActivity Logへ記録する。

### 10.6 並べ替え

Blockの並べ替えは、Book全体における絶対位置を使用する。

並べ替えAPIには、移動するBlock IDと移動先の位置を送信する。

```http
PUT /api/books/{book}/blocks/reorder
```

```json
{
  "block_id": 42,
  "target_position": 17
}
```

`target_position`は、1からBook内のBlock総数までの整数とする。

バックエンドは次を検証する。

- 対象Bookを認証ユーザーが所有している
- Blockが対象Bookに属している
- 移動先が有効な範囲内である
- 対象Bookがゴミ箱に入っていない

並べ替えはデータベーストランザクション内で実行する。

Blockを現在位置より後方へ移動する場合は、元の位置より後から移動先までのBlockについて、`sort_order`を1ずつ減らす。

Blockを現在位置より前方へ移動する場合は、移動先から元の位置より前までのBlockについて、`sort_order`を1ずつ増やす。

最後に、移動したBlockの`sort_order`を`target_position`へ更新する。

並べ替え完了後、フロントエンドは現在のページを再取得する。

ページ内でドラッグ＆ドロップした場合、移動先の絶対位置は次の式で算出する。

```text
target_position
= (current_page - 1) × per_page
+ ページ内の移動先番号
```

フロントエンドは、Blockを現在のページ内だけでなく、別ページの任意の位置へ移動する操作を提供する。

別ページへ移動する場合も、Book全体における絶対位置を`target_position`として使用する。

`sort_order`の欠番または重複が検出された場合、バックエンドは対象BookのBlockを現在の順序で並べ、`sort_order`を1から始まる連続した整数へ正規化する。

### 10.7 削除

Blockは完全削除する。

削除前に確認操作を要求する。

---

## 11. Files

### 11.1 データ構造

Fileは次のフィールドを持つ。

- `id`
- `book_id`
- `user_id`
- `original_name`
- `stored_name`
- `mime_type`
- `extension`
- `size`
- `is_text`
- `comment`
- `created_at`
- `updated_at`

### 11.2 アップロード

Book詳細からファイルをアップロードできる。

- 1ファイルあたり最大10MB
- 任意のコメントを設定可能
- 実ファイル名にはUUIDを使用する
- 元のファイル名は表示用として別に保存する
- 保存先はBook単位で分離する
- ファイル名をそのまま保存パスとして使用しない

### 11.3 テキストファイル

次の拡張子をテキストファイルとして扱う。

- `txt`
- `md`
- `json`
- `js`
- `ts`
- `css`
- `scss`
- `html`
- `htm`
- `pde`
- `glsl`
- `vue`
- `py`
- `php`
- `rb`
- `sh`
- `xml`
- `csv`
- `log`
- `yml`
- `yaml`

テキストファイルでは次を提供する。

- 内容の表示
- 内容の編集
- 保存
- ダウンロード
- 削除

### 11.4 画像

MIME Typeが`image/`で始まるファイルは、画面内でプレビューできる。

### 11.5 その他のファイル

テキストまたは画像として表示できないファイルは、ファイル情報とダウンロード操作を表示する。

### 11.6 認可

ファイルの一覧、表示、内容取得、更新、ダウンロード、削除のすべてで、親Bookの所有権を検証する。

Storage上のパスを直接公開して、認可を迂回できる状態にしてはならない。

### 11.7 削除

Fileを削除する場合は次の順で処理する。

1. 所有権を検証
2. Storageから実ファイルを削除
3. データベースレコードを削除

実ファイルの削除に失敗した場合、成功として応答してはならない。

---

## 12. Activity Logs

### 12.1 画面

Activity LogsはBook一覧とは別の画面として提供する。

認証ユーザー自身の記録だけを表示する。

Activity Log一覧はサーバー側でページネーションする。

- 1ページ20件
- `created_at`の降順で表示する
- `created_at`が同じ場合は`id`の降順で表示する
- レスポンスに現在ページ、最終ページ、1ページの件数、総件数を含める

フロントエンドは、表示するページに含まれるActivity LogだけをAPIから取得する。

### 12.2 記録対象

v1で記録するイベントは次の4種類とする。

| イベント | 発生条件 |
|---|---|
| `book_created` | Bookを作成した |
| `book_updated` | Book本文を変更した |
| `block_created` | Blockを作成した |
| `block_updated` | Blockの内容、作成者名、完了状態のいずれかを変更した |

次の操作は、BookまたはBlockの内容変更ではないため、v1のActivity Log対象に含めない。

- Bookのアーカイブ
- Bookのアーカイブからの復元
- Bookのゴミ箱への移動
- Bookのゴミ箱からの復元
- Bookの手動完全削除
- Bookの自動完全削除
- Fileのアップロード、更新、削除
- Categoryの作成、更新、削除
- Tagの作成およびBookへの設定解除

完全削除処理の成功または失敗はActivity Logではなく、サーバーの運用ログへ記録する。運用ログにはBook本文、Block内容、AI会話などのユーザーコンテンツを含めない。

### 12.3 データ構造

Activity Logは次のフィールドを持つ。

| フィールド | 型 | 内容 |
|---|---|---|
| `id` | bigint | Activity Log ID |
| `user_id` | bigint | 所有ユーザー |
| `book_id` | bigint | 対象Book |
| `action_type` | string | `book_created`、`book_updated`、`block_created`、`block_updated` |
| `target_type` | string | `book`または`block` |
| `target_id` | bigint | 対象BookまたはBlockのID |
| `title` | string | イベント発生時点のBookタイトル |
| `body` | text / null | 作成イベントで保存する本文またはBlock内容の先頭120文字 |
| `diff` | longText / null | 行単位のUnified Diff |
| `before_hash` | char(64) / null | 変更前のテキスト内容のSHA-256ハッシュ |
| `after_hash` | char(64) / null | 作成時または変更後のテキスト内容のSHA-256ハッシュ |
| `meta` | json | イベント固有の補足情報 |
| `created_at` | datetime | 作成日時 |
| `updated_at` | datetime | 更新日時 |

`title`には、すべてのイベントでイベント発生時点のBookタイトルを保存する。

`body`には、`book_created`では作成時のBook本文の先頭120文字、`block_created`では作成時のBlock内容の先頭120文字を保存する。`book_updated`および`block_updated`では`null`とする。

`diff`には変更された行と、その前後3行だけを含むUnified Diff形式の文字列を保存する。Book本文またはBlock内容を更新した場合にだけ保存し、`book_created`、`block_created`およびテキスト内容を変更していない`block_updated`では`null`とする。

`before_hash`と`after_hash`には、テキスト内容から生成したSHA-256ハッシュを保存する。Book本文またはBlock内容を更新した場合は両方を保存する。`book_created`および`block_created`では`before_hash`を`null`、`after_hash`を作成時の内容から生成した値とする。テキスト内容を変更していない`block_updated`では両方を`null`とする。

`meta`はJSONオブジェクトとして保存する。Activity Message、作成者名の変更、完了状態の変更など、イベントごとの補足情報を格納する。保存する補足情報がない場合は空のJSONオブジェクト`{}`とする。

Activity LogへBook本文またはBlock内容の全文を保存してはならない。

### 12.4 保存内容

#### Book作成

- Book ID
- Bookタイトル
- 作成時の本文の先頭120文字
- 作成時の本文から生成した`after_hash`

Book本文の全文は保存しない。

#### Book本文更新

- Book ID
- Bookタイトル
- 更新前と更新後の行単位差分
- `before_hash`
- `after_hash`
- 任意のActivity Message

更新前後の本文全文は保存しない。

本文に実質的な変更がない場合はActivity Logを作成しない。

#### Block作成

- Book ID
- Block ID
- Block内容の先頭120文字
- Block内容から生成した`after_hash`

#### Block更新

Blockの内容、作成者名、完了状態のいずれかが変更された場合、`block_updated`を記録する。

Activity Logには次を保存する。

- Book ID
- Block ID
- 任意のActivity Message

Block内容が変更された場合は、次も保存する。

- 更新前と更新後の行単位差分
- 更新前の内容から生成した`before_hash`
- 更新後の内容から生成した`after_hash`

Block内容が変更されていない場合は、`diff`、`before_hash`、`after_hash`を`null`とする。

作成者名を変更した場合は、`meta.author_name`へ変更前後の値を保存する。

```json
{
  "author_name": {
    "before": "変更前の作成者名",
    "after": "変更後の作成者名"
  }
}
```

完了状態を変更した場合は、`meta.is_done`へ変更前後の値を保存する。

```json
{
  "is_done": {
    "before": false,
    "after": true
  }
}
```

Activity Messageが入力された場合は、`meta.message`へ保存する。

内容、作成者名、完了状態の複数項目を同時に変更した場合は、一つの`block_updated`へすべての変更内容を保存する。

更新前後で実際の変更が一つもない場合は、Activity Logを作成しない。

### 12.5 差分の生成

差分とハッシュは、Book本文またはBlock内容が実際に変更された場合だけ生成する。

処理順序は次のとおりとする。

1. 更新前のBookまたはBlockを取得する
2. 更新後の入力内容を検証する
3. 本文、Block内容、作成者名、完了状態の各項目について、実際に変更された項目を判定する
4. Book本文またはBlock内容が変更された場合は、更新前後のSHA-256ハッシュと行単位のUnified Diffを生成する
5. テキスト内容が変更されていない場合は、`diff`、`before_hash`、`after_hash`を`null`とする
6. BookまたはBlockを更新する
7. 実際の変更が一つ以上ある場合だけActivity Logを保存する

データ更新とActivity Logの保存は、同一のデータベーストランザクション内で行う。

差分には変更箇所の前後3行を含める。変更のない長い範囲は保存しない。

### 12.6 差分表示

Activity Logs画面は、保存済みの`diff`を解析して次のように表示する。

- 追加行
- 削除行
- 変更されていない文脈行
- 変更箇所の行番号
- 省略された範囲

Book本文の全文を取得して、Activity Logs画面で差分を再計算してはならない。

Activity Logsは変更内容の確認を目的とし、過去の本文を完全に復元する機能は提供しない。将来、過去状態への復元が必要になった場合は、Activity Logsとは別にBookの改訂履歴機能を定義する。

### 12.7 Activity Messageの接頭辞

Activity Messageが次の接頭辞で始まる場合、接頭辞に応じた表示スタイルを適用する。

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `style:`
- `chore:`

接頭辞の使用は任意とする。

---

## 13. Book専用AI Chat

### 13.1 基本単位

各Bookは独立したAI Chatを一つ持つ。

AIの会話履歴、Room Memory、PersonaはBook単位で分離する。

別のBookの会話履歴やRoom Memoryを混在させてはならない。

内部ではBook IDを使用して会話ルームを一意に識別する。

### 13.2 画面

Book詳細画面からAI Chatを開く。

#### デスクトップ

- 詳細画面の右側にサイドパネルとして表示
- パネル幅を変更可能
- Bookを閲覧しながら会話可能

#### モバイル

- 全画面オーバーレイで表示
- 閉じる操作でBook詳細へ戻る

### 13.3 AIへ渡すBookコンテキスト

AIへは、現在のBookの次の情報を渡す。

- `title`
- `body`

本文が未入力の場合も、空の本文として明示する。

BlocksおよびFilesの内容は自動的には渡さない。

Bookコンテキストは会話開始時だけでなく、メッセージ送信時点の最新内容を使用する。会話途中でBook本文を更新した場合、次回の送信から更新後の内容を使用する。

コンテキストはユーザーの発言と混同せず、Book情報であることが分かる構造でシステムメッセージへ含める。

#### コンテキスト上限

バックエンドは、選択されたModelのコンテキスト上限を超えないよう、送信前に入力トークン数を確認する。

Model設定には次を含める。

- `context_window`
- `max_output_tokens`
- `input_safety_tokens`

入力に利用できる最大トークン数は、次の式で算出する。

```text
最大入力トークン数
= context_window
- max_output_tokens
- input_safety_tokens
```

`input_safety_tokens`の既定値は1024とする。

#### 情報の優先順位

コンテキストを構成する情報の優先順位は次のとおりとする。

1. MindShelf共通のシステムルール
2. Persona
3. 今回のユーザーメッセージ
4. Bookのタイトル
5. Bookの本文
6. Room Memory
7. 直近の会話履歴

会話履歴をすべて含めると上限を超える場合は、古い会話履歴から除外する。直近の会話を優先し、除外した過去の内容はRoom Memoryによって補う。

Bookのタイトルと本文は、ユーザーへの通知なしに切り詰めてはならない。

#### Bookが長すぎる場合

システムルール、Persona、今回のユーザーメッセージ、Bookのタイトル、Bookの本文を含めた時点で上限を超える場合、AI APIへリクエストを送信しない。

APIは`422 Unprocessable Entity`と、次のエラーコードを返す。

```json
{
  "message": "このBookは選択したModelのコンテキスト上限を超えています。",
  "code": "BOOK_CONTEXT_TOO_LARGE",
  "details": {
    "estimated_input_tokens": 0,
    "available_input_tokens": 0
  }
}
```

フロントエンドは次を表示する。

- Bookが選択中のModelには長すぎること
- 推定入力トークン数
- 利用可能な入力トークン数
- より大きなコンテキストに対応するModelがある場合は、そのModelへの変更案内

Book本文を黙って切り詰めたり、一部だけを渡して通常どおり応答させたりしてはならない。

将来、長大なBookを扱う必要が生じた場合は、本文の要約、分割、関連箇所検索を独立した機能として追加する。v1では自動要約や部分抽出による代替は行わない。

### 13.4 プロンプト構成

AIへ送るメッセージは次の順序で構成する。

1. MindShelf共通のシステムルール
2. 選択されたPersonaのシステムプロンプト
3. Room Memory
4. Bookのタイトルと本文
5. 直近の会話履歴
6. 今回のユーザーメッセージ

Book本文または過去の会話に、システム命令を上書きする記述が含まれていても、アプリケーションのシステムルールより優先してはならない。

### 13.5 会話履歴

ユーザー発言とAI応答をデータベースへ保存する。

AI Messageは次のフィールドを持つ。

- `id`
- `user_id`
- `book_id`
- `role`
- `content`
- `client_id`
- `model_key`
- `created_at`
- `updated_at`

`role`は`user`または`assistant`とする。

履歴は古いメッセージを追加取得できるページネーション形式とし、1回20件を返す。

画面を閉じたり再ログインしたりしても履歴を維持する。

### 13.6 重複送信防止

フロントエンドは、ユーザーがメッセージを送信するたびに一意な`client_id`を生成する。

同じ送信処理から生成されたユーザー発言とAI応答は、同じ`client_id`を持つ。

データベースでは、`user_id`、`book_id`、`client_id`、`role`の組み合わせを一意とする。同じ`client_id`について、`user`と`assistant`をそれぞれ1件まで保存できる。

チャットAPIは、受信した`client_id`について次のように処理する。

- ユーザー発言とAI応答のどちらも存在しない場合は、ユーザー発言を保存してからAI応答を生成する
- ユーザー発言だけが存在する場合は、同じ発言を追加せず、AI応答の生成を再開する
- ユーザー発言とAI応答の両方が存在する場合は、新しいメッセージを保存せず、保存済みのAI応答を返す
- AI応答だけが存在する場合はデータ不整合として処理し、エラーを運用ログへ記録する

通信再送または二重クリックによって、同じユーザー発言またはAI応答を複数保存してはならない。

### 13.7 Room Memory

Room Memoryは次の情報を持つ。

- `user_id`
- `book_id`
- `summary`
- `facts`
- `created_at`
- `updated_at`

Room MemoryはBookごとに1件だけ保持し、`book_id`を一意とする。

`summary`は会話全体の要約、`facts`は今後の会話で維持すべき事実情報とする。

Room Memoryは次の場合に更新候補とする。

- Room Memoryがまだ存在しない
- 前回更新後に12件以上のメッセージが追加された
- ユーザーがAI Chat内のRoom Memory更新操作を実行した

AI Chatには、ユーザーが任意のタイミングで実行できるRoom Memory更新操作を表示する。

この操作が実行された場合、フロントエンドは`POST /api/books/{book}/ai/memory/refresh`を呼び出す。

サーバーは対象Bookの所有権を確認した後、Room Memory生成処理をQueueへ登録する。同じBookに対するRoom Memory生成Jobがすでに待機中または実行中の場合は、重複するJobを追加しない。

ユーザーのメッセージ内容だけを解析して、訂正であるかどうかを暗黙的に判定してはならない。

Room MemoryとしてAIプロンプトへ挿入する`summary`と`facts`の合計は、最大2048トークンとする。

生成されたRoom Memoryが2048トークンを超えた場合は、Room Memory生成用Modelを使用して、より短い内容への再要約を1回実行する。

再要約後も上限を超えた場合は、新しいRoom Memoryを保存せず、既存のRoom Memoryを維持する。既存のRoom Memoryがない場合は空の状態を維持し、エラーを運用ログへ記録する。

本番環境ではRoom Memoryの生成をRedis Queueで非同期実行し、通常のチャット応答を待たせない。

ローカル開発環境で`QUEUE_CONNECTION=sync`を使用する場合は、Room Memory生成がチャットレスポンスを遅延させることを許容する。

Room Memoryの内容はBook詳細のAI Chat内から確認できる。

### 13.8 Persona

Personaは`config/mindshelf_personas.php`で定義する。

各Personaは次の情報を持つ。

- 一意なID
- 表示名
- システムプロンプト
- 挨拶文
- UI用アクセント

まだ`persona_id`が設定されていないBookでは、ユーザーがチャット開始前にPersonaを選択する。

最初のメッセージ送信時に、サーバーは選択されたPersona IDが`config/mindshelf_personas.php`に存在することを検証し、そのIDをBookの`persona_id`へ保存する。

`persona_id`が設定済みのBookでは、別のPersonaへ変更できない。以後のAI Chatでは、Bookに保存された`persona_id`に対応するPersonaを使用する。

設定済みのPersona IDを`config/mindshelf_personas.php`から削除してはならない。

Persona IDは一度公開した後に変更または再利用してはならない。

### 13.9 Model選択

AI ChatにはModel選択UIを表示する。

選択肢はバックエンド設定から取得し、フロントエンドへモデルIDを直接ハードコードしない。

各Model設定は次を持つ。

- MindShelf内部のModel Key
- 表示名
- 接続先へ送信するModel ID
- コンテキスト上限
- 最大出力トークン数
- 入力用の安全予約トークン数
- Reasoning対応の有無
- ウェブ検索対応の有無
- Model固有の追加設定
- 有効・無効状態

Model Keyは`config/llm.php`の`models`配列のキーとする。設定値の中に重複して`key`フィールドを持たせない。

送信時には`model_key`を指定する。

サーバーは、設定に存在し有効になっている`model_key`だけを受け付ける。

### 13.10 ウェブ検索

選択中のモデルが対応している場合に限り、ウェブ検索の使用を切り替えられる。

対応していないモデルでは切り替えUIを表示しないか、無効状態にする。

### 13.11 LLM接続

MindShelfは、OpenAI API互換のChat Completions APIを通じてLLMへ接続する。

特定のLLMサービスをアプリケーションの固有機能として扱わない。実際の接続先とAPIキーは環境変数で指定し、接続処理、モデル定義、エラー表現にはベンダー非依存の名称を使用する。

OpenAI API互換とはAPIのリクエストおよびレスポンス形式を指し、特定のLLMサービスを使用することを意味しない。

#### 設定の保存場所

LLM接続に関する設定は`config/llm.php`へ集約する。

アプリケーションコードは`env()`を直接呼び出さず、Laravelの`config()`を通して設定を取得する。環境変数の参照は`config/llm.php`内だけで行う。

次の情報は`.env`で指定する。

- APIのベースURL
- APIキー
- タイムアウト秒数
- 既定のチャットModel
- Room Memory生成用Model

最低限、次の環境変数を使用する。

```dotenv
LLM_API_KEY=
LLM_BASE_URL=
LLM_TIMEOUT=120
LLM_DEFAULT_MODEL=primary
LLM_SUMMARY_MODEL=summary
```

`LLM_DEFAULT_MODEL`と`LLM_SUMMARY_MODEL`には、接続先へ送信する生のモデルIDではなく、`config/llm.php`で定義したMindShelf内部のModel Keyを指定する。

#### `config/llm.php`

`config/llm.php`は次の構造を持つ。

```php
<?php

return [
    'connection' => [
        'driver' => 'openai_compatible',
        'base_url' => env('LLM_BASE_URL'),
        'api_key' => env('LLM_API_KEY'),
        'timeout' => (int) env('LLM_TIMEOUT', 120),
    ],

    'default_model' => env('LLM_DEFAULT_MODEL', 'primary'),
    'summary_model' => env('LLM_SUMMARY_MODEL', 'summary'),

    'models' => [
        'primary' => [
            'label' => 'Primary',
            'model_id' => 'provider-model-id',
            'context_window' => 128000,
            'max_output_tokens' => 4096,
            'input_safety_tokens' => 1024,

            'capabilities' => [
                'reasoning' => false,
                'web_search' => false,
            ],

            'request_options' => [],
            'enabled' => true,
        ],

        'summary' => [
            'label' => 'Summary',
            'model_id' => 'provider-summary-model-id',
            'context_window' => 128000,
            'max_output_tokens' => 2048,
            'input_safety_tokens' => 1024,

            'capabilities' => [
                'reasoning' => false,
                'web_search' => false,
            ],

            'request_options' => [],
            'enabled' => true,
        ],
    ],
];
```

実装時は、`provider-model-id`および`provider-summary-model-id`を実際に使用するモデルIDへ置き換える。

Model IDはAPIキーのような秘密情報ではない。ただし、公開リポジトリ上で運用環境の構成を明示したくない場合は、Model IDも環境変数から取得できる。

```php
'model_id' => env('LLM_PRIMARY_MODEL_ID'),
```

その場合は、対応する環境変数を`.env`へ追加する。

```dotenv
LLM_PRIMARY_MODEL_ID=
LLM_SUMMARY_MODEL_ID=
```

`.env.example`では値を空にし、実際のModel IDを記載しない。

#### Model Key

Model Keyは、MindShelf内部でModelを識別するための安定した文字列とする。

例：

- `primary`
- `fast`
- `reasoning`
- `summary`

接続先の生のモデルIDを、APIルート、データベース、フロントエンドの状態管理における識別子として使用してはならない。

ユーザーが選択したModelは、MindShelf内部の`model_key`として保存する。

LLM APIへリクエストを送信する直前に、`config/llm.php`を参照して`model_key`を接続先の`model_id`へ変換する。

フロントエンドへ返すModel情報は次に限定する。

- `key`
- `label`
- `context_window`
- `max_output_tokens`
- `capabilities`

次の情報はフロントエンドへ返してはならない。

- `model_id`
- `base_url`
- `api_key`
- `request_options`

#### Model設定

各Modelは次の設定を持つ。

| 設定 | 内容 |
|---|---|
| `label` | UI上の表示名 |
| `model_id` | 接続先へ送信するModel ID |
| `context_window` | 入出力を合わせたコンテキスト上限 |
| `max_output_tokens` | 最大出力トークン数 |
| `input_safety_tokens` | 上限超過を避けるための予約量 |
| `capabilities.reasoning` | Reasoning機能への対応 |
| `capabilities.web_search` | ウェブ検索への対応 |
| `request_options` | Model固有の追加設定 |
| `enabled` | ユーザーが選択できるか |

`enabled`が`false`のModelは、Model一覧APIから返さず、新しいチャット送信にも使用できない。

過去のAI Messageが無効化されたModel Keyを持っていても、履歴の表示には影響させない。

#### 実装インターフェース

LLMとの通信は、ベンダー非依存の`LlmClient`インターフェースを通して行う。

```php
interface LlmClient
{
    public function chat(
        array $messages,
        LlmRequestOptions $options
    ): LlmResponse;
}
```

`LlmRequestOptions`は少なくとも次を持つ。

- `modelKey`
- `maxOutputTokens`
- `temperature`
- `topP`
- `reasoning`
- `webSearch`

`LlmResponse`は少なくとも次を持つ。

- 応答本文
- 使用されたModel Key
- 終了理由
- 入力トークン数
- 出力トークン数
- 接続先が返したRequest ID

トークン数またはRequest IDが接続先から返されない場合は`null`を許容する。

#### OpenAI互換クライアント

OpenAI互換APIとの通信は`OpenAICompatibleClient`で実装する。

```php
final class OpenAICompatibleClient implements LlmClient
{
    public function chat(
        array $messages,
        LlmRequestOptions $options
    ): LlmResponse {
        // config/llm.phpを参照してリクエストを構築する
    }
}
```

特定のLLMサービス名を含むクラス、インターフェース、メソッド、APIルートは作成しない。

接続先を変更する場合に、Controller、会話履歴、Room Memory、Bookコンテキストの実装を変更する必要がない構造とする。

#### API URL

リクエスト先は、`LLM_BASE_URL`の末尾のスラッシュを除去したURLへ`/chat/completions`を加えて生成する。

```text
{LLM_BASE_URL}/chat/completions
```

`LLM_BASE_URL`自体に`/chat/completions`を含めてはならない。

アプリケーションコードへ既定の接続先URLをハードコードしてはならない。

`LLM_BASE_URL`が未設定の場合、起動自体は可能とするが、AI Chatを利用不可状態として扱う。

#### 認証

LLM APIの認証にはBearer Tokenを使用する。

```http
Authorization: Bearer {LLM_API_KEY}
Accept: application/json
Content-Type: application/json
```

`LLM_API_KEY`が未設定の場合、LLM APIへリクエストを送信してはならない。

MindShelfのユーザー認証とLLM APIのBearer Tokenは別の認証である。LLM APIキーをMindShelfのフロントエンド認証に使用してはならない。

#### 標準リクエスト

標準的なチャットリクエストでは、OpenAI互換形式の次の項目を使用する。

- `model`
- `messages`
- `max_tokens`
- `temperature`
- `top_p`

リクエスト例：

```json
{
  "model": "provider-model-id",
  "messages": [
    {
      "role": "system",
      "content": "System instructions"
    },
    {
      "role": "user",
      "content": "User message"
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.7,
  "top_p": 1.0
}
```

`model`には、ユーザーが指定した`model_key`を`config/llm.php`で変換した`model_id`を設定する。

#### 標準レスポンス

通常の応答本文は、次の位置から取得する。

```text
choices[0].message.content
```

応答本文が空で、かつ終了理由が出力上限である場合は、Model設定の範囲内で一度だけ再試行できる。

再試行後も応答本文を取得できない場合は、空のAI Messageを保存せず、LLM APIエラーとして扱う。

接続先のレスポンス全体を、そのままデータベースへ保存してはならない。

#### 接続先固有の追加機能

Reasoningやウェブ検索など、標準的なChat Completionsに含まれない機能はModelの`capabilities`で管理する。

機能を有効にできるのは、次の条件をすべて満たす場合だけとする。

- Modelの該当Capabilityが`true`
- ユーザーが機能を有効にしている
- 接続クライアントがその機能のリクエスト変換に対応している

対応していないModelへ接続先固有の追加パラメーターを送信してはならない。

接続先固有の追加パラメーターは、標準リクエストを組み立てる処理から分離する。

フロントエンドは接続先固有のパラメーター名を送信せず、`reasoning`や`web_search`のようなMindShelf内部の機能名だけを送信する。

#### タイムアウト

LLM APIの通信タイムアウトには`LLM_TIMEOUT`を使用する。

既定値は120秒とする。

タイムアウトが発生した場合は、接続先の名称を含まないMindShelf共通のエラーへ変換する。

#### ログ

LLM APIのエラーを記録する場合は、次の情報だけを保存する。

- 発生日時
- HTTPステータス
- MindShelf内部のModel Key
- Request ID
- タイムアウトかどうか
- 例外種別

次の情報をログへ記録してはならない。

- APIキー
- Authorizationヘッダー
- Bookのタイトルまたは本文
- ユーザーのメッセージ
- Personaのプロンプト
- Room Memory
- LLMの応答本文
- 接続先が返したエラー本文の全文
- `.env`の内容

#### Public GitHubリポジトリ

Public GitHubリポジトリには次の情報を含めない。

- 実際の`LLM_BASE_URL`
- 実際の`LLM_API_KEY`
- 運用環境で使用しているLLMサービス名
- LLMサービスのアカウント情報
- 利用残高
- 請求情報
- 本番環境のRequest ID
- 本番環境のログ

`.env.example`ではAPIキー、接続先URL、Model IDなどの環境固有値を空にする。タイムアウトとMindShelf内部のModel Keyには、秘密情報ではない既定値を記載できる。

```dotenv
LLM_API_KEY=
LLM_BASE_URL=
LLM_TIMEOUT=120
LLM_DEFAULT_MODEL=primary
LLM_SUMMARY_MODEL=summary
```

Model IDも公開しない構成を採用する場合は、次を追加する。

```dotenv
LLM_PRIMARY_MODEL_ID=
LLM_SUMMARY_MODEL_ID=
```

#### 設定不備

次の場合、AI Chatを利用不可として扱う。

- `LLM_BASE_URL`が未設定
- `LLM_API_KEY`が未設定
- `LLM_DEFAULT_MODEL`に対応するModel設定が存在しない
- Model設定の`model_id`が未設定
- 既定Modelの`enabled`が`false`

AI Chat以外のBook、Block、File、Activity Logsは、LLM設定が未完了でも利用可能とする。

AI Chat画面には、接続先の名称を表示せず、次の共通メッセージを表示する。

```text
AI Chatは現在利用できません。管理者によるLLM接続設定が必要です。
```

#### テスト

自動テストでは外部LLM APIを呼び出さない。

`LlmClient`を`FakeLlmClient`へ差し替え、少なくとも次を検証する。

- Bookのタイトルと本文が渡される
- Personaが渡される
- Room Memoryが渡される
- Model KeyがModel IDへ変換される
- 無効なModel Keyが拒否される
- コンテキスト上限が検証される
- APIキーがレスポンスまたはログへ露出しない
- LLM未設定時もAI Chat以外の機能が利用できる

### 13.12 AI APIエラー

LLM APIが失敗した場合は次のように処理する。

- ユーザーへ送信失敗を表示する
- APIキーやプロバイダーの生レスポンスを画面へ表示しない
- 再送操作を提供する
- 同じ`client_id`による二重保存を防止する
- サーバーログには秘密情報を含めない

チャット応答はv1では非ストリーミングとし、応答全体を受信してから表示する。

---

## 14. API

`/api`エンドポイントは原則としてJSONを返す。

次のエンドポイントは、成功時にファイルまたは画像の内容を返すためJSONレスポンスの対象外とする。

- `GET /api/files/{file}/view`
- `GET /api/files/{file}/download`
- `GET /api/books/{book}/background-image`

これらのエンドポイントでも、認証、認可または入力検証に失敗した場合のエラーレスポンスはJSONとする。

### 14.1 Books

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/books` | Book一覧 |
| POST | `/api/books` | Book作成 |
| GET | `/api/books/refs` | 複数Bookの参照情報 |
| GET | `/api/books/{book}` | Book詳細 |
| PUT | `/api/books/{book}` | Book更新 |
| DELETE | `/api/books/{book}` | Bookをゴミ箱へ移動 |
| GET | `/api/trash/books` | ゴミ箱内のBook一覧 |
| PUT | `/api/trash/books/{book}/restore` | Bookをゴミ箱から復元 |
| DELETE | `/api/trash/books/{book}` | Bookを直ちに完全削除 |
| PUT | `/api/books/{book}/archive` | アーカイブ |
| PUT | `/api/books/{book}/restore` | Bookをアーカイブから復元 |
| GET | `/api/books/{book}/background-image` | 背景画像表示 |
| POST | `/api/books/{book}/background-image` | 背景画像設定 |
| DELETE | `/api/books/{book}/background-image` | 背景画像解除 |

### 14.2 Blocks

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/books/{book}/blocks` | Block一覧 |
| POST | `/api/books/{book}/blocks` | Block作成 |
| PUT | `/api/blocks/{block}` | Block更新 |
| DELETE | `/api/blocks/{block}` | Block削除 |
| PUT | `/api/books/{book}/blocks/reorder` | 並べ替え |

### 14.3 Categories

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/categories` | Category一覧 |
| POST | `/api/categories` | Category作成 |
| PUT | `/api/categories/{category}` | Category更新 |
| DELETE | `/api/categories/{category}` | Category削除 |

### 14.4 Tags

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/tags` | Tag一覧 |
| POST | `/api/tags` | Tag作成 |

### 14.5 Files

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/books/{book}/files` | File一覧 |
| POST | `/api/books/{book}/files` | アップロード |
| GET | `/api/files/{file}` | File情報 |
| GET | `/api/files/{file}/view` | 内容またはプレビュー取得 |
| GET | `/api/files/{file}/download` | ダウンロード |
| PUT | `/api/files/{file}` | 内容・コメント更新 |
| DELETE | `/api/files/{file}` | File削除 |

### 14.6 Activity Logs

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/activity-logs` | Activity Log一覧 |

### 14.7 AI Chat

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/ai/models` | 利用可能なModel一覧 |
| GET | `/api/ai/personas` | Persona一覧 |
| GET | `/api/books/{book}/ai/messages` | 会話履歴 |
| POST | `/api/books/{book}/ai/chat` | メッセージ送信 |
| GET | `/api/books/{book}/ai/memory` | Room Memory取得 |
| POST | `/api/books/{book}/ai/memory/refresh` | Room Memory更新処理の登録 |
| GET | `/api/books/{book}/ai/persona` | BookのPersona取得 |
| PUT | `/api/books/{book}/ai/persona` | 初回Persona設定 |

### 14.8 Authentication

| Method | Endpoint | 内容 |
|---|---|---|
| GET | `/api/user` | 現在の認証ユーザーを取得 |

---

## 15. APIレスポンスとエラー

### 15.1 ステータスコード

| コード | 用途 |
|---|---|
| `200` | 取得・更新成功 |
| `201` | 作成成功 |
| `204` | レスポンス本文のない削除成功 |
| `401` | 未認証 |
| `403` | 認証済みだがメール未確認などで操作不可 |
| `404` | データが存在しない、または所有していない |
| `422` | 入力検証エラー |
| `429` | レート制限 |
| `500` | サーバー内部エラー |
| `502` | 外部AI APIの応答失敗 |

### 15.2 入力検証エラー

`422`では、フィールド単位のエラーを返す。

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "title": [
      "タイトルは必須です。"
    ]
  }
}
```

### 15.3 内部情報の非公開

本番環境のAPIレスポンスには次を含めない。

- スタックトレース
- SQL
- Storage上の実パス
- `.env`の値
- LLM APIキー
- セッションID
- 外部APIの認証情報

---

## 16. セキュリティ要件

- すべての状態変更リクエストにCSRF保護を適用する
- すべてのユーザーデータ操作で所有権を検証する
- Markdown表示時にHTMLをサニタイズする
- アップロードファイルを元のファイル名で保存しない
- MIME Typeと拡張子だけを信用して実行可能ファイルを実行しない
- ファイル配信時に認証と所有権を再確認する
- パスワードとAPIキーをログへ記録しない
- SQLクエリはEloquentまたはパラメータ化されたクエリを使用する
- ログイン、登録、パスワード再設定、AI Chatにはレート制限を適用する
- 本番環境ではHTTPSを必須とする
- CORSとSanctumのStateful Domainは、実際のフロントエンドURLだけを許可する

---

## 17. 環境設定

MindShelfは、用途に応じて次の実行構成を持つ。

### 17.1 ローカル開発構成

ローカル開発では、追加サービスなしで起動できることを優先する。

```dotenv
APP_NAME=MindShelf
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

FRONTEND_URL=http://localhost:5173

DB_CONNECTION=sqlite

SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=false
SESSION_SAME_SITE=lax

CACHE_STORE=file
QUEUE_CONNECTION=sync

SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173

REGISTRATION_ENABLED=true

MAIL_MAILER=log
MAIL_FROM_ADDRESS=hello@example.com
MAIL_FROM_NAME="${APP_NAME}"

FILESYSTEM_DISK=local

LLM_API_KEY=
LLM_BASE_URL=
LLM_TIMEOUT=120
LLM_DEFAULT_MODEL=primary
LLM_SUMMARY_MODEL=summary
```

ローカル開発構成では、Queue Jobをリクエストを処理するPHPプロセス内で同期実行する。

そのため、Room Memory生成などのQueue Jobが完了するまで、チャットレスポンスが遅延する場合がある。

メール確認およびパスワード再設定のメールは実際には送信せず、Laravelのログへ出力する。

この構成は開発、テスト、機能確認を目的とし、高い同時実行性能を保証しない。

### 17.2 本番環境構成

本番環境では、アプリケーションデータとSession、Cache、Queueの保存先を分離する。

```dotenv
APP_NAME=MindShelf
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://example.com

FRONTEND_URL=https://example.com

DB_CONNECTION=pgsql
DB_HOST=
DB_PORT=5432
DB_DATABASE=mindshelf
DB_USERNAME=
DB_PASSWORD=

SESSION_DRIVER=redis
SESSION_LIFETIME=120
SESSION_DOMAIN=
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax

CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_CLIENT=phpredis
REDIS_HOST=
REDIS_PASSWORD=
REDIS_PORT=6379

SANCTUM_STATEFUL_DOMAINS=example.com

REGISTRATION_ENABLED=true

MAIL_MAILER=smtp
MAIL_SCHEME=
MAIL_HOST=
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME="${APP_NAME}"

FILESYSTEM_DISK=local

LLM_API_KEY=
LLM_BASE_URL=
LLM_TIMEOUT=120
LLM_DEFAULT_MODEL=primary
LLM_SUMMARY_MODEL=summary
```

`MAIL_SCHEME`、`MAIL_HOST`、`MAIL_PORT`、`MAIL_USERNAME`、`MAIL_PASSWORD`、`MAIL_FROM_ADDRESS`には、使用するメールサービスの設定を指定する。

本番環境では、次の役割分担とする。

| 保存対象 | 保存先 |
|---|---|
| Books、Blocks、Activity Logs、AI履歴 | PostgreSQL |
| Session | Redis |
| Cache | Redis |
| Queue | Redis |
| アップロードファイル | Laravel Storageで設定された保存先 |

Queue WorkerはWebサーバーとは別プロセスとして常時実行する。

Room Memoryの生成はRedis Queueで非同期実行し、通常のチャットレスポンスを待たせない。

Queue Workerの再起動、異常終了時の再起動、ログ管理は、Supervisor、systemdまたはコンテナのプロセス管理機能で行う。

Laravel Schedulerを本番環境で継続的に実行する。

ゴミ箱へ移動してから30日を経過したBookを完全削除する処理は、Laravel Schedulerによって1日1回実行する。

サーバーでは`php artisan schedule:run`を毎分実行するCron、またはそれと同等のScheduler実行環境を構成する。

自動完全削除に失敗したBookは完全削除済みとして扱わず、エラーを運用ログへ記録し、次回以降のScheduler実行で再試行する。

### 17.3 テスト構成

自動テストでは、テストごとに状態を分離する。

```dotenv
APP_ENV=testing
DB_CONNECTION=sqlite
DB_DATABASE=:memory:
SESSION_DRIVER=array
CACHE_STORE=array
QUEUE_CONNECTION=sync
MAIL_MAILER=array
```

外部LLM APIは直接呼び出さず、FakeまたはMockへ置き換える。

### 17.4 SQLiteで非同期Queueを使用する場合

SQLiteでのDatabase Queueは、MindShelfの標準本番構成とはしない。

簡易的な単一ホスト運用で使用する場合は、少なくとも次の条件を満たす必要がある。

- SQLiteをWALモードにする
- Busy Timeoutを設定する
- Queue Workerを1プロセスに制限する
- 長時間のデータベーストランザクションを避ける
- `SQLITE_BUSY`またはデータベースロックを監視する

この構成は小規模運用向けの互換構成であり、本番環境の推奨構成ではない。

---

## 18. v1受け入れ条件

MindShelf v1は、少なくとも次の条件をすべて満たした時点で完成とする。

- ユーザー登録、メール確認、ログイン、ログアウト、パスワード再設定が動作する
- ログイン後にBook一覧が最初に表示される
- Bookを作成、表示、編集できる
- Bookをアーカイブし、アーカイブから復元できる
- Bookをゴミ箱へ移動し、30日以内であればゴミ箱から復元できる
- ゴミ箱へ移動してから30日を経過したBookが自動的に完全削除される
- Bookタイトルの完全一致による確認後、ゴミ箱からBookを直ちに完全削除できる
- ゴミ箱内のBookを復元した場合、Blocks、Files、Activity Logs、AI Messages、Room Memory、Persona設定も復元される
- Bookを完全削除した場合、関連するBlocks、Files、実ファイル、Activity Logs、AI Messages、Room Memory、Persona設定も削除される
- Bookを検索し、CategoryとTagで絞り込める
- Categoryを作成、編集、削除できる
- Tagを作成してBookへ設定できる
- Blockを作成、編集、完了、並べ替え、削除できる
- Fileをアップロード、表示、編集、ダウンロード、削除できる
- Activity Logsが定義された4種類のイベントを記録する
- Book本文の更新差分をActivity Logsで確認できる
- Bookごとに独立したAI Chatを利用できる
- AIへBookの最新のタイトルと本文が渡される
- AIの会話履歴が永続化される
- Room MemoryがBook単位で保存される
- PersonaをBook単位で選択できる
- Modelを選択してメッセージを送信できる
- LLM APIキーが`.env`だけに保存される
- 別ユーザーのBook、Block、File、Activity Log、AIデータへアクセスできない
- Markdownから危険なHTMLまたはスクリプトが実行されない
- デスクトップとモバイルの両方で主要機能を利用できる
- 公開登録を無効化した環境でArtisanコマンドから最初の確認済みユーザーを作成できる
- 背景画像を認可付きエンドポイントから表示できる
- 背景画像の差し替え、解除、Bookの完全削除によって不要になった実ファイルがStorageに残らない
- Activity Log一覧がサーバー側でページネーションされる
- Bookに選択したPersona IDが保存され、別のPersonaへ変更できない
- Room Memory更新操作によって、重複しない更新Jobを登録できる
