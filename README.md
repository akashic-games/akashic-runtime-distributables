# akashic-runtime-distributable

**akashic-runtime-distributable** は akashic-runtime のエンジンモジュールの成果物を配置したリポジトリです。

**akashic-runtime** は以下のモジュールの組み合わせを一意に特定するためのエンジンモジュール群です。

- [`@akashic/engine-files`](https://github.com/akashic-games/engine-files)
- [`@akashic/playlog-client`](https://github.com/akashic-games/akashic-system/tree/main/packages/playlog-client)
- [`@akashic/pdi-game-runner`](https://github.com/akashic-games/pdi-game-runner)

# 使い方

## バージョンの追加

以下のコマンドで新しいバージョンを versions.json に追加できます。

```sh
pnpm add-version 3.13.4
```

上記コマンドの場合、指定したバージョン（例: `3.13.4`）をもとに `versions.json` に新しいエントリ（例: `3.13.4-0` がすでに存在した場合は `3.13.4-1`）が追加されます。
engine-files 以外の依存モジュールのバージョンは、コマンド実行時点での latest となります。

追加したバージョン文字列（例: `3.13.4-0`）が stdout に出力されます。

```sh
NEW_VERSION=$(pnpm --silent add-version 3.13.4)
echo "$NEW_VERSION" # 3.13.4-0
```

## ビルド

以下のコマンドで特定のバージョンの akashic-runtime をビルドできます。
指定のバージョンが version.json で定義されていない場合はエラーとなります

成果物は `./dist/{akashic-runtime のバージョン}` ディレクトリに出力されます。
指定のディレクトリがすでに存在する場合は上書きされます。

```sh
pnpm build --version 3.13.4-0
```

以下のコマンドで versions.json で定義されたすべての akashic-runtime をビルドできます。

```sh
pnpm build:all
```

`--prebuilt-dist-zip` に zip ファイルを指定すると、zip 内に対象バージョンの成果物が含まれている場合はビルドステップを省略してそこから展開します。
zip にないバージョンは通常通りビルドします。
ビルドすべきバージョンが一つも存在しない場合はエラーとなります。

> [!WARNING]
> `--prebuilt-dist-zip` に指定する zip ファイルはビルドステップを省略して展開されます。
> 信頼できる出所のファイルであることを事前に確認してください。

`--prebuilt-dist-zip` オプションの実行には `unzip` コマンドが必要です。

```sh
pnpm build:all --prebuilt-dist-zip ./dist.zip
```

生成される成果物は以下です。

- `akashic-runtime`
  - full 版の engine-files の成果物を含む akashic-runtime
- `akashic-runtime-canvas`
  - canvas 版の engine-files の成果物を含む akashic-runtime
  - v2 移行のバージョンにのみ存在
- `entrypoint`
  - game-runner 向けの entrypoint

# 開発者向け

## バージョンの追加

GitHub Actions の [Add Version ワークフロー](.github/workflows/add-version.yml) を手動実行すると、`@akashic/engine-files` の指定バージョンを `versions.json` に追加する PullRequest を作成します。

## リリース

GitHub Actions の [Release ワークフロー](.github/workflows/release.yml) を手動実行すると、`versions.json` に定義された全バージョンの成果物をビルドし、`dist.zip` として GitHub Release にデプロイします。

`prebuilt_release` にリリースタグ（例: `2026-01-01`）を指定すると、そのリリースの `dist.zip` をビルド元として使用します（デフォルト: `latest`）。空白にするとすべてのバージョンをビルドします。

# 成果物

## akashic-runtime

```
* engineFilesV*_*_*{,_Canvas}.js
* playlogClientV*_*_*.js
```

## entrypoint

```
* bundle_info.txt
* entry.js
* bootstrap.js
* game-driver.js
* akashic-engine.js
* pdi-common-impl.js (optional)
```
