#!/usr/bin/env bash
# DSHAIred 一键安装器：把知识 Skill 铺进目标 CLI 的 skills 根，构建 MCP 工具箱，
# 并打印对应 CLI 的 MCP 注册命令/配置。支持 DSH / Claude Code / Codex CLI 三个目标。
#
# 用法：
#   scripts/install/install.sh [--target dsh|claude|codex] [SKILLS_TARGET_DIR]
#
# 默认 --target dsh，SKILLS_TARGET_DIR 默认按目标而定：
#   dsh    ${DSH_HOME:-$HOME/.dsh}/skills        （rank 400 user-dsh）
#   claude ${CLAUDE_HOME:-$HOME/.claude}/skills   （个人级；项目级传 <项目>/.claude/skills）
#   codex  ${CODEX_HOME:-$HOME/.codex}/skills     （个人级；项目级传 <项目>/.codex/skills）
#
# 不做的事：不改上游 CLI 核心、不写 secret、不部署云、不假装完成未验证的步骤。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
TOOLBOX_DIR="$REPO_ROOT/packages/mcp-toolbox"
SERVER_JS="$TOOLBOX_DIR/lib/server.js"

TARGET="dsh"
if [ "${1:-}" = "--target" ]; then
  TARGET="${2:?用法：--target dsh|claude|codex}"
  shift 2
fi
case "$TARGET" in
  dsh|claude|codex) ;;
  *) echo "错误：--target 必须是 dsh、claude 或 codex，收到：$TARGET"; exit 1 ;;
esac

default_skills_target() {
  case "$TARGET" in
    dsh)    echo "${DSH_HOME:-$HOME/.dsh}/skills" ;;
    claude) echo "${CLAUDE_HOME:-$HOME/.claude}/skills" ;;
    codex)  echo "${CODEX_HOME:-$HOME/.codex}/skills" ;;
  esac
}
SKILLS_TARGET="${1:-$(default_skills_target)}"

echo "==> DSHAIred 安装（目标：${TARGET}）"
echo "    仓库:        $REPO_ROOT"
echo "    Skill 目标:  $SKILLS_TARGET"

# 1) 依赖与构建（生成 lib/server.js）
echo "==> 安装依赖并构建 MCP 工具箱"
command -v pnpm >/dev/null 2>&1 || { echo "错误：需要 pnpm"; exit 1; }
( cd "$REPO_ROOT" && pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null )
( cd "$REPO_ROOT" && pnpm --filter @dshaired/mcp-toolbox build >/dev/null )
[ -f "$SERVER_JS" ] || { echo "错误：构建后未找到 $SERVER_JS"; exit 1; }
echo "    OK: $SERVER_JS"

# 2) 铺 Skill（每个 <name>/SKILL.md 目录，三个目标格式相同：<skills_root>/<name>/SKILL.md）
echo "==> 复制 Skill 到 $SKILLS_TARGET"
mkdir -p "$SKILLS_TARGET"
count=0
for d in "$SKILLS_SRC"/*/; do
  [ -f "${d}SKILL.md" ] || continue
  name="$(basename "$d")"
  rm -rf "${SKILLS_TARGET:?}/$name"
  cp -R "$d" "$SKILLS_TARGET/$name"
  count=$((count + 1))
done
echo "    已安装 $count 个 Skill"

# 3) 打印目标 CLI 的 MCP 注册方式
case "$TARGET" in
dsh)
cat <<EOF

==> 在 DSH profile（cordis patch）中加入以下一行以启用工具箱：

    - id: mcp-dshaired
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: dshaired
        transport: stdio
        command: node
        args: ['$SERVER_JS']

    启用后，工具将以 mcp__dshaired__<tool> 出现在模型工具列表中。

==> 完成。Skill 已就位（DSH 重启/重新发现后可用 /名字 调用）。
EOF
;;
claude)
cat <<EOF

==> 注册 MCP 工具箱到 Claude Code（一次性命令）：

    claude mcp add dshaired -- node '$SERVER_JS'

    注册后新开会话即可看到 mcp__dshaired__<tool>；Skill 已就位，
    /名字 可直接调用，模型也会按 description 自动加载。
EOF
;;
codex)
cat <<EOF

==> 注册 MCP 工具箱到 Codex CLI（一次性命令）：

    codex mcp add dshaired -- node '$SERVER_JS'

    注册后新开会话生效；Skill 已就位，模型按 SKILL.md 的 description
    自动加载或调用。
EOF
;;
esac

cat <<EOF
==> agent-swarm 侧：把同样的 Skill 目录与上面的 MCP 注册方式提供给你的
    Worker 环境（按你的 swarm 部署方式），本脚本不代管远端部署。
EOF
