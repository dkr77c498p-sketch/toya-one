# TOYA One（TOYA社内用）

株式会社TOYAの社内アプリです。
入口: https://dkr77c498p-sketch.github.io/toya-one/

## 2026-09-15 社員一覧の修正

- `private.toya_employee_admin` の一覧取得で、社員レコード変数 `e` とテーブル別名が衝突していました。一覧のテーブル別名だけを `el` に変更しています。
- 管理者・所属会社・契約・端末の確認、関数の実行権限、社員作成とパスワード再設定の処理は維持しています。保存済みの業務データを更新する変更はありません。
- ホーム画面上部とページタイトルに「TOYA社内用」を表示します。

`tests/company-access-database.sql` は一時的な会社・ユーザーで、空の一覧、登録済み社員の一覧、会社間の分離、管理者以外の拒否、社員作成・再設定を確認します。すべてのテストデータはトランザクションをロールバックして破棄します。

SQLの名前衝突については [PostgreSQL公式ドキュメント](https://www.postgresql.org/docs/17/plpgsql-implementation.html#PLPGSQL-VAR-SUBST) を参照してください。
