#!/usr/bin/env bash
# Install WebPro outreach systemd USER timers.
# No sudo required. Runs under your normal user account.
#
# Usage:
#   bash systemd/install.sh           # install + enable + start timers
#   bash systemd/install.sh status    # show status
#   bash systemd/install.sh stop      # stop + disable
#   bash systemd/install.sh logs      # tail journal logs

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
UNIT_DIR="${HOME}/.config/systemd/user"
UNITS=(
  webpro-email-outreach.service
  webpro-email-outreach.timer
  webpro-email-finder.service
  webpro-email-finder.timer
)

cmd="${1:-install}"

case "$cmd" in
  install)
    mkdir -p "$UNIT_DIR"
    for u in "${UNITS[@]}"; do
      cp -f "${SCRIPT_DIR}/${u}" "${UNIT_DIR}/${u}"
      echo "installed: ${UNIT_DIR}/${u}"
    done
    systemctl --user daemon-reload
    # Enable just the timers (services are oneshot, triggered by timers)
    systemctl --user enable --now webpro-email-outreach.timer
    systemctl --user enable --now webpro-email-finder.timer
    echo ""
    echo "✅ Installed. Timers enabled:"
    systemctl --user list-timers webpro-* --no-pager || true
    echo ""
    echo "Need lingering enabled so timers fire when you're logged out:"
    echo "   sudo loginctl enable-linger \"$USER\""
    ;;

  status)
    systemctl --user list-timers webpro-* --no-pager || true
    echo ""
    for u in "${UNITS[@]}"; do
      echo "--- $u ---"
      systemctl --user status "$u" --no-pager -l || true
    done
    ;;

  stop)
    systemctl --user disable --now webpro-email-outreach.timer || true
    systemctl --user disable --now webpro-email-finder.timer || true
    for u in "${UNITS[@]}"; do
      rm -f "${UNIT_DIR}/${u}" && echo "removed: ${UNIT_DIR}/${u}"
    done
    systemctl --user daemon-reload
    echo "✅ Uninstalled."
    ;;

  logs)
    journalctl --user -u 'webpro-*' -n 200 --no-pager -f
    ;;

  run-now)
    echo "Triggering one-off run of both services..."
    systemctl --user start webpro-email-finder.service
    systemctl --user start webpro-email-outreach.service
    ;;

  *)
    echo "Usage: $0 {install|status|stop|logs|run-now}"
    exit 1
    ;;
esac
