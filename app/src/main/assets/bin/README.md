This folder is git-ignored and populated in CI.
Expected files (arm64 only, 99% phones):
  arm64-v8a/opencode  (~25-40 MB, from opencode-ai/opencode linux-arm64 release, pinned in android.yml)
  arm64-v8a/busybox    (~1 MB, static aarch64, provides ls/cat/cp/grep/...)
App extracts them to filesDir/bin/ on first launch (AssetInstaller).
Do NOT commit binaries manually - let CI fetch them.
