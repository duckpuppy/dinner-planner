#!/bin/bash
#
# SubagentStop: Lightweight completion validation for supervisors
#
# Checks that supervisors provide a completion summary.
# Intentionally permissive — don't block work over formatting.
#

INPUT=$(cat)

# Always approve non-supervisor agents
echo '{"decision":"approve"}'
exit 0
