# AGENTS.md

## File Naming

- HTML ファイルの命名規則は、日時 + `.html` とする。
- ゲームを修正したら、新しい日時名の HTML ファイルを作成し、`index.html` の転送先を最新の日時 HTML に更新する。

## Versioning

- 現在のバージョンは `script.js` の `GAME_VERSION` で管理し、画面右下に `ver X.X.X` と表示する。
- ゲームに修正を加えるたびに `GAME_VERSION` を上げる。

## Sharing

- X 共有は、対応ブラウザでは Web Share API で結果画像と投稿文を渡す。
- Web Share API が使えない場合は、X の投稿画面を投稿文付きで開き、可能なら結果画像をクリップボードにコピーする。

## Deployment

- このゲームを修正したら、毎回 GitHub Pages へデプロイする。
- GitHub Pages の公開設定は GitHub 側で行う前提。Actions workflow は使わない。
- 修正後は `index.html`, `styles.css`, `script.js` など公開対象ファイルを commit して `origin/main` に push する。
- 明示的に依頼された場合を除き、push 後に公開URLの反映確認はしない。
