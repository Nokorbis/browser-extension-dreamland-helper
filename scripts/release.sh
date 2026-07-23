#!/usr/bin/env bash
#
# One-command release. Bumps package.json (the single source of truth WXT bakes into both
# manifests), commits, tags `v<version>`, and — after a confirmation prompt — pushes, which
# triggers .github/workflows/release.yml. See docs/PUBLISHING.md and docs/adr/0010.
#
# Usage:
#   pnpm release patch          # 0.1.0 -> 0.1.1
#   pnpm release minor          # 0.1.0 -> 0.2.0
#   pnpm release major          # 0.1.0 -> 1.0.0
#   pnpm release v0.5.0         # explicit version (leading v optional)
#   pnpm release patch --yes    # skip the confirmation prompt
set -euo pipefail

die() {
  echo "release: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: pnpm release <major|minor|patch|vX.Y.Z> [--yes]

  major|minor|patch   bump the corresponding semver component
  vX.Y.Z / X.Y.Z      set an explicit version
  --yes, -y           skip the confirmation prompt before pushing
EOF
  exit 1
}

# --- Parse args: one bump kind + optional --yes anywhere ---------------------
kind=""
assume_yes=0
for arg in "$@"; do
  case "$arg" in
    -y | --yes) assume_yes=1 ;;
    -h | --help) usage ;;
    -*) die "unknown option: $arg" ;;
    *)
      [ -z "$kind" ] || die "unexpected extra argument: $arg"
      kind="$arg"
      ;;
  esac
done
[ -n "$kind" ] || usage
kind="$(printf '%s' "$kind" | tr '[:upper:]' '[:lower:]')"

# --- Work from the repo root -------------------------------------------------
cd "$(git rev-parse --show-toplevel)"

# --- Guards ------------------------------------------------------------------
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || die "must be on 'main' to release (on '$branch')."

git diff --quiet && git diff --cached --quiet ||
  die "working tree is dirty; commit or stash your changes first."

echo "release: fetching origin/main ..."
git fetch --no-tags origin main
git merge-base --is-ancestor origin/main HEAD ||
  die "local 'main' is behind origin/main; pull first."

# --- Resolve the bump argument for pnpm --------------------------------------
case "$kind" in
  major | minor | patch)
    bump_arg="$kind"
    ;;
  *)
    explicit="${kind#v}"
    [[ "$explicit" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
      die "invalid version '$kind'; expected major|minor|patch or vX.Y.Z."
    bump_arg="$explicit"
    ;;
esac

old="$(node -p "require('./package.json').version")"

# --- Bump package.json only (no git side effects) ----------------------------
# Undo the write if anything after it fails or the user declines.
rollback() { git checkout --quiet -- package.json pnpm-lock.yaml 2>/dev/null || true; }

pnpm version --no-git-tag-version "$bump_arg" >/dev/null ||
  die "pnpm version failed (is '$bump_arg' the same as the current version?)."

new="$(node -p "require('./package.json').version")"
tag="v$new"

# --- Guard: tag must be unused (locally and on origin) -----------------------
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  rollback
  die "tag $tag already exists locally."
fi
if git ls-remote --exit-code --tags origin "$tag" >/dev/null 2>&1; then
  rollback
  die "tag $tag already exists on origin."
fi

# --- Confirm -----------------------------------------------------------------
cat <<EOF

  on main, tree clean
  $old -> $new
  commit "Release $new"
  tag    $tag
EOF

if [ "$assume_yes" -ne 1 ]; then
  printf 'Push origin main + %s? This triggers the AMO + GitHub release. [y/N] ' "$tag"
  read -r reply
  case "$reply" in
    y | Y)
      : # proceed
      ;;
    *)
      rollback
      echo "release: aborted; nothing shipped, working tree restored."
      exit 0
      ;;
  esac
fi

# --- Commit, tag, push -------------------------------------------------------
git commit --quiet -am "Release $new"
git tag "$tag"

echo "release: pushing origin main + $tag ..."
git push origin main "$tag"

cat <<EOF

release: $tag pushed. Track the release under the repo's Actions tab.
(If the push failed above, the commit and tag remain locally — fix and re-push.)
EOF
