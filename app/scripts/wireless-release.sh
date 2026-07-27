#!/usr/bin/env bash
# wireless-release.sh — ADB 无线调试配对 + kids-mobile 生产 Release 打包安装
#
# Android 11+「无线调试」有两个端口，不要混用：
#   1) 配对端口（弹窗「使用配对码配对设备」）→ adb pair
#   2) 连接端口（无线调试主页「IP 地址和端口」）→ adb connect
#
# 用法（在 apps/kids-mobile 目录下执行）：
#   bash scripts/wireless-release.sh pair  192.168.0.2:38165 406628
#   bash scripts/wireless-release.sh connect 192.168.0.2:XXXXX
#   bash scripts/wireless-release.sh release
#   bash scripts/wireless-release.sh all 192.168.0.2:38165 406628 [CONNECT_IP:PORT]
#
# 环境变量（可选）：
#   ANDROID_HOME  Android SDK 根目录（未设则用 %LOCALAPPDATA%/Android/Sdk）
#   LUMO_GATEWAY_URL  覆盖本地开发网关（默认 http://127.0.0.1:19001）
#   ADB_TIMEOUT_SEC    pair/connect 超时秒数（默认 30）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ADB_TIMEOUT_SEC="${ADB_TIMEOUT_SEC:-30}"

# ---------------------------------------------------------------------------
# 解析 adb 可执行文件（Git Bash / MSYS / 原生 Windows 均可）
# ---------------------------------------------------------------------------
resolve_adb() {
  local home="${ANDROID_HOME:-}"
  if [[ -z "$home" ]]; then
    if [[ -n "${LOCALAPPDATA:-}" ]]; then
      home="${LOCALAPPDATA}/Android/Sdk"
    else
      home="${HOME}/AppData/Local/Android/Sdk"
    fi
  fi
  if command -v cygpath >/dev/null 2>&1; then
    home="$(cygpath -u "$home" 2>/dev/null || echo "$home")"
  fi

  local candidates=(
    "${home}/platform-tools/adb.exe"
    "${home}/platform-tools/adb"
    "$(command -v adb 2>/dev/null || true)"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -n "$c" && -x "$c" ]]; then
      echo "$c"
      return 0
    fi
    if [[ -n "$c" && -f "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  echo "找不到 adb。请设置 ANDROID_HOME，或把 platform-tools 加入 PATH。" >&2
  exit 1
}

ADB="$(resolve_adb)"

# 强制行缓冲，避免 Git Bash 下日志迟迟不刷出
log()  { printf '\033[36m[wireless-release]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[32m[wireless-release]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[33m[wireless-release]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[wireless-release]\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\033[36m[wireless-release]\033[0m —— %s\n' "$*" >&2; }

usage() {
  cat <<'EOF'
用法:
  bash scripts/wireless-release.sh pair    <PAIR_IP:PORT> <CODE>
  bash scripts/wireless-release.sh connect [CONNECT_IP:PORT]
  bash scripts/wireless-release.sh release
  bash scripts/wireless-release.sh all     <PAIR_IP:PORT> <CODE> [CONNECT_IP:PORT]
  bash scripts/wireless-release.sh devices
  bash scripts/wireless-release.sh mdns

说明:
  pair     用配对码配对（手机「使用配对码配对设备」里的 IP:端口 + 6 位码）
  connect  连接到无线调试端口（主页「IP 地址和端口」）；省略参数则尝试 mDNS 自动发现
  release  生产 Release：同步资源 + 打 node-runtime + installRelease + 启动
  all      pair → connect → release 一条龙
  devices  列出当前 adb 设备
  mdns     列出 _adb-tls-connect / _adb-tls-pairing 服务

示例:
  bash scripts/wireless-release.sh all 192.168.0.2:38165 406628 192.168.0.2:41461
EOF
}

# ---------------------------------------------------------------------------
# 带超时执行命令；stdout/stderr 实时输出到终端（不用 $() 吞日志）
# 优先 timeout；Git Bash 常无则用后台进程 + 心跳日志
# ---------------------------------------------------------------------------
run_with_timeout() {
  local secs="$1"
  local label="$2"
  shift 2

  log "执行: $* （超时 ${secs}s）"
  if command -v timeout >/dev/null 2>&1; then
    set +e
    timeout "$secs" "$@"
    local ec=$?
    set -e
    if [[ $ec -eq 124 ]]; then
      fail "${label} 超时（${secs}s）。请确认：手机配对弹窗仍开着、IP/端口正确、与电脑同一局域网。"
    fi
    return $ec
  fi

  # 无 GNU timeout：后台跑，前台打心跳，结束时取退出码
  "$@" &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [[ $waited -ge $secs ]]; then
      warn "${label} 超时，正在终止 PID $pid …"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      fail "${label} 超时（${secs}s）。请确认：手机配对弹窗仍开着、IP/端口正确、与电脑同一局域网。"
    fi
    sleep 1
    waited=$((waited + 1))
    if (( waited % 5 == 0 )); then
      log "…仍在等待 ${label}（已 ${waited}s / ${secs}s）"
    fi
  done
  set +e
  wait "$pid"
  local ec=$?
  set -e
  return $ec
}

# ---------------------------------------------------------------------------
# 粗测 TCP 端口是否可达（PowerShell；失败仅警告）
# ---------------------------------------------------------------------------
probe_tcp() {
  local endpoint="$1"
  local ip="${endpoint%%:*}"
  local port="${endpoint##*:}"
  if [[ -z "$ip" || -z "$port" || "$ip" == "$port" ]]; then
    warn "无法解析端点格式: $endpoint（期望 IP:PORT）"
    return 1
  fi
  log "探测 TCP $ip:$port …"
  if command -v powershell.exe >/dev/null 2>&1; then
    if powershell.exe -NoProfile -Command \
      "\$t=New-Object Net.Sockets.TcpClient; try { \$t.ConnectAsync('$ip',$port).Wait(3000) | Out-Null; if(\$t.Connected){exit 0}else{exit 1} } catch { exit 1 } finally { \$t.Dispose() }" \
      >/dev/null 2>&1; then
      ok "TCP $ip:$port 可达"
      return 0
    fi
    warn "TCP $ip:$port 不可达（弹窗关闭/端口过期/不在同一网段？）仍继续尝试 adb…"
    return 1
  fi
  warn "无 powershell，跳过 TCP 探测"
  return 0
}

# ---------------------------------------------------------------------------
# 启动时打印环境信息
# ---------------------------------------------------------------------------
print_env() {
  step "环境检查"
  log "ADB = $ADB"
  local ver
  ver="$("$ADB" version 2>&1 | head -n 2 | tr '\n' ' ' | sed 's/\r//g')"
  log "ADB 版本: $ver"
  log "超时: ${ADB_TIMEOUT_SEC}s（可用 ADB_TIMEOUT_SEC 覆盖）"
}

# ---------------------------------------------------------------------------
# 确认至少有一台 device 在线
# ---------------------------------------------------------------------------
ensure_device() {
  step "检查设备列表"
  local out lines
  out="$("$ADB" devices -l)"
  printf '%s\n' "$out" >&2
  lines="$(printf '%s\n' "$out" | tail -n +2 | sed 's/\r$//' | awk 'NF && $2=="device" {print $1}')"
  if [[ -z "$lines" ]]; then
    # 区分 unauthorized / offline
    if printf '%s\n' "$out" | grep -qE 'unauthorized|offline'; then
      fail "设备存在但未就绪（unauthorized/offline）。请在手机上点允许调试，或重新 connect。"
    fi
    fail "没有在线设备。请先 pair + connect，或检查手机无线调试是否仍开启。"
  fi
  ok "设备在线: $(echo "$lines" | tr '\n' ' ')"
}

# ---------------------------------------------------------------------------
# 配对：adb pair HOST[:PORT] PAIRING_CODE（第二参数，勿用 --help 探测）
# ---------------------------------------------------------------------------
cmd_pair() {
  local host="${1:-}"
  local code="${2:-}"
  [[ -n "$host" && -n "$code" ]] || fail "用法: pair <PAIR_IP:PORT> <CODE>"

  print_env
  step "1/2 配对准备"
  log "配对端点: $host"
  log "配对码:   $code"
  log "提示: 配对端口来自手机「使用配对码配对设备」弹窗；配对成功后该端口会关闭。"
  probe_tcp "$host" || true

  step "2/2 执行 adb pair"
  # 正确语法: adb pair HOST[:PORT] [PAIRING CODE]
  # 切勿执行 adb pair --help（会被当成主机名而挂起）
  local ec=0
  set +e
  run_with_timeout "$ADB_TIMEOUT_SEC" "adb-pair" "$ADB" pair "$host" "$code"
  ec=$?
  set -e
  if [[ $ec -ne 0 ]]; then
    fail "配对失败（退出码 $ec）。请重新打开「使用配对码配对设备」弹窗，换一组新端口+新码再试。"
  fi
  ok "配对成功（adb pair 退出码 0）"
  log "下一步: 用无线调试主页的「IP 地址和端口」执行 connect（不要用配对端口）"
  log "  bash scripts/wireless-release.sh connect <CONNECT_IP:PORT>"
}

# ---------------------------------------------------------------------------
# 从 mDNS 解析 _adb-tls-connect._tcp 端点
# ---------------------------------------------------------------------------
discover_connect_endpoint() {
  local services line host
  log "查询 mDNS 服务列表…"
  services="$("$ADB" mdns services 2>&1 || true)"
  printf '%s\n' "$services" >&2
  line="$(printf '%s\n' "$services" | grep '_adb-tls-connect\._tcp' | head -n1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  host="$(printf '%s\n' "$line" | awk '{print $NF}' | sed 's/\r$//')"
  [[ -n "$host" ]] || return 1
  printf '%s\n' "$host"
}

# ---------------------------------------------------------------------------
# 连接无线调试端口
# ---------------------------------------------------------------------------
cmd_connect() {
  local host="${1:-}"
  print_env

  if [[ -z "$host" ]]; then
    step "1/3 自动发现连接端点"
    log "未指定 CONNECT_IP:PORT，尝试 mDNS 发现 _adb-tls-connect …"
    host="$(discover_connect_endpoint || true)"
    if [[ -z "$host" ]]; then
      fail "mDNS 未发现连接端点。请在手机「开发者选项 → 无线调试」主页查看「IP 地址和端口」，再执行:
  bash scripts/wireless-release.sh connect <IP:PORT>"
    fi
    ok "mDNS 发现: $host"
  else
    step "1/3 使用指定连接端点"
    log "连接端点: $host"
  fi

  step "2/3 探测并 connect"
  probe_tcp "$host" || true
  log "执行: $ADB connect $host"
  local connect_out
  set +e
  connect_out="$("$ADB" connect "$host" 2>&1)"
  local ec=$?
  set -e
  # 立即回显 adb 原文，避免“无反馈”
  printf '%s\n' "$connect_out" >&2
  if [[ $ec -ne 0 ]]; then
    fail "connect 失败（退出码 $ec）。确认用的是主页「IP 地址和端口」，不是配对端口。"
  fi
  if printf '%s\n' "$connect_out" | grep -qiE 'cannot connect|failed|refused|unable to connect'; then
    fail "connect 被拒绝。配对端口不能 connect；请用主页端口，或重新 pair 后再试。"
  fi
  if printf '%s\n' "$connect_out" | grep -qi 'connected to'; then
    ok "已连接: $host"
  else
    warn "未明确看到 connected to，继续检查 devices…"
  fi

  step "3/3 等待设备就绪"
  sleep 1
  ensure_device
  ok "connect 完成"
}

# ---------------------------------------------------------------------------
# 生产 Release：复用现有 node scripts/dev-run.mjs --release
# ---------------------------------------------------------------------------
cmd_release() {
  print_env
  ensure_device
  step "生产 Release 打包安装"
  log "目录: $APP_DIR"
  log "将执行: node scripts/dev-run.mjs --release"
  log "（同步 Live2D → 打 node-runtime → installRelease → 启动；连生产 Gateway，不依赖 Metro）"
  cd "$APP_DIR"
  node scripts/dev-run.mjs --release
  ok "Release 完成"
}

# ---------------------------------------------------------------------------
# 一条龙
# ---------------------------------------------------------------------------
cmd_all() {
  local pair_host="${1:-}"
  local code="${2:-}"
  local connect_host="${3:-}"
  [[ -n "$pair_host" && -n "$code" ]] || fail "用法: all <PAIR_IP:PORT> <CODE> [CONNECT_IP:PORT]"

  log "==== 全流程开始: pair → connect → release ===="
  if [[ -n "$connect_host" && "$connect_host" == "$pair_host" ]]; then
    warn "警告: CONNECT 与 PAIR 端点相同（$pair_host）。"
    warn "配对端口在 pair 成功后通常会关闭，connect 很可能失败。"
    warn "请确认第三个参数是无线调试主页的「IP 地址和端口」。"
  fi

  cmd_pair "$pair_host" "$code"
  step "等待连接端口就绪（2s）…"
  sleep 2
  cmd_connect "$connect_host"
  cmd_release
  ok "==== 全流程结束 ===="
}

cmd_devices() {
  print_env
  step "adb devices -l"
  "$ADB" devices -l
}

cmd_mdns() {
  print_env
  step "adb mdns services"
  "$ADB" mdns services
}

# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    pair)    cmd_pair "$@" ;;
    connect) cmd_connect "$@" ;;
    release) cmd_release "$@" ;;
    all)     cmd_all "$@" ;;
    devices) cmd_devices ;;
    mdns)    cmd_mdns ;;
    -h|--help|help|"") usage ;;
    *) fail "未知命令: $cmd（用 --help 查看用法）" ;;
  esac
}

main "$@"
