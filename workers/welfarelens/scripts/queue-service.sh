#!/usr/bin/env bash
# Run from the Worker repository on the VM after queue deployment is approved.
set -euo pipefail

operation=${1:-}
case "$operation" in
 stop) exec docker stop -t 45 welfarelens-worker-queue ;;
 logs) exec docker logs --tail 50 --follow welfarelens-worker-queue ;;
 verify|start) ;;
 *) echo 'Usage: bash scripts/queue-service.sh verify|start|stop|logs' >&2; exit 2 ;;
esac

: "${WELFARELENS_QUEUE_IMAGE:?Set the approved image reference}"
: "${WELFARELENS_QUEUE_ENV_FILE:?Set the private environment file path}"
: "${WELFARELENS_QUEUE_LEDGER_HOST:?Set the persistent private ledger directory}"
if [[ ! $WELFARELENS_QUEUE_IMAGE =~ ^ghcr\.io/[a-z0-9_./-]+@sha256:[0-9a-f]{64}$ ]] &&
   [[ ! $WELFARELENS_QUEUE_IMAGE =~ ^sha256:[0-9a-f]{64}$ ]]; then
 echo 'Use a GHCR digest or a verified local image ID.' >&2
 exit 2
fi
if [[ $WELFARELENS_QUEUE_LEDGER_HOST != /* || ! -d $WELFARELENS_QUEUE_LEDGER_HOST ||
      -L $WELFARELENS_QUEUE_LEDGER_HOST || $(stat -c %a:%u "$WELFARELENS_QUEUE_LEDGER_HOST") != 700:1000 ]]; then
 echo 'The persistent ledger directory must be private (0700) and owned by the Worker user (UID 1000).' >&2
 exit 2
fi
if [[ ! -f $WELFARELENS_QUEUE_ENV_FILE || -L $WELFARELENS_QUEUE_ENV_FILE ]] ||
   [[ $(stat -c %a "$WELFARELENS_QUEUE_ENV_FILE") != 600 ]]; then
 echo 'The private environment file must be a regular file with permissions 600.' >&2
 exit 2
fi

compose=(docker compose --profile approved-queue -f compose.queue.yaml)
case "$operation" in
 verify|start)
  if [[ $WELFARELENS_QUEUE_IMAGE == ghcr.io/* ]]; then
   docker pull "$WELFARELENS_QUEUE_IMAGE"
  fi
  docker run --rm --network none "$WELFARELENS_QUEUE_IMAGE" --self-test
  "${compose[@]}" config --quiet
  if [[ $operation == start ]]; then
   "${compose[@]}" up -d
  fi
  ;;

esac
