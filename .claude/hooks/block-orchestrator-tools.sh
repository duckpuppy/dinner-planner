#!/bin/bash
#
# PreToolUse: Block orchestrator from implementation tools
#
# Orchestrators investigate and delegate - they don't implement.
#

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Always allow Task (delegation)
[[ "$TOOL_NAME" == "Task" ]] && exit 0

# NOTE: this hook previously tried to distinguish orchestrator vs. subagent
# tool calls by checking whether transcript_path's parent directory was
# literally named 'subagents'. That never matches in this harness -- a
# subagent's transcript_path is a flat .jsonl directly under the project's
# transcript directory, same shape as the orchestrator's. Detection was
# always false, so every subagent Edit/Write fell through to the
# orchestrator-only quick-fix-ask logic below, producing a permission
# prompt on every single subagent edit. Since supervisors in this project
# mostly work on feature branches directly in the main checkout (not
# .worktrees/, see CLAUDE.md's "Feature branch dispatch (default)"), there
# is no reliable cwd-based signal either. The orchestrator/subagent
# distinction has been dropped entirely below -- only the main/master
# branch check remains, applying equally to orchestrator and subagents.

# Allow Plan mode — orchestrator can write to ~/.claude/plans/
# Allow CLAUDE.md — orchestrator maintains project documentation
if [[ "$TOOL_NAME" == "Edit" ]] || [[ "$TOOL_NAME" == "Write" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if [[ "$FILE_PATH" == *"/.claude/plans/"* ]]; then
    exit 0
  fi
  # Allow CLAUDE.md updates (project documentation is orchestrator responsibility)
  if [[ "$(basename "$FILE_PATH")" == "CLAUDE.md" ]] || [[ "$(basename "$FILE_PATH")" == "CLAUDE.local.md" ]]; then
    exit 0
  fi
  # Allow git-issues.md updates (issue tracking is orchestrator responsibility)
  if [[ "$(basename "$FILE_PATH")" == "git-issues.md" ]]; then
    exit 0
  fi
  # Allow memory files (orchestrator maintains persistent learnings)
  if [[ "$FILE_PATH" == *"/.claude/"*"/memory/"* ]] || [[ "$FILE_PATH" == *"/.claude/memory/"* ]]; then
    exit 0
  fi
fi

# BRANCH ENFORCEMENT: block Edit/Write on main/master (orchestrator and
# subagents alike). On any other branch (feature branch or worktree),
# allow silently -- no per-edit prompt.
if [[ "$TOOL_NAME" == "Edit" ]] || [[ "$TOOL_NAME" == "Write" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

  # Check if editing within a worktree (always allowed)
  if [[ "$FILE_PATH" == *"/.worktrees/"* ]]; then
    exit 0
  fi

  # Check current branch
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

  # On main/master → hard deny, guide to alternatives
  if [[ "$CURRENT_BRANCH" == "main" ]] || [[ "$CURRENT_BRANCH" == "master" ]]; then
    cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Cannot edit files on $CURRENT_BRANCH branch.\n\nFor quick fixes (<10 lines):\n  git checkout -b quick-fix-description\n  Then retry the edit.\n\nFor larger changes:\n  Use the full bead workflow with supervisors."}}
EOF
    exit 0
  fi

  # On any feature branch → allow silently
  exit 0
fi

# Block NotebookEdit (no quick-fix escape for notebooks)
if [[ "$TOOL_NAME" == "NotebookEdit" ]]; then
  cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Tool '$TOOL_NAME' blocked. Orchestrators investigate and delegate via Task(). Supervisors implement."}}
EOF
  exit 0
fi

# Validate provider_delegator agent invocations - block implementation agents
if [[ "$TOOL_NAME" == "mcp__provider_delegator__invoke_agent" ]]; then
  AGENT=$(echo "$INPUT" | jq -r '.tool_input.agent // empty')
  CODEX_ALLOWED="scout|detective|architect|scribe|code-reviewer"

  if [[ ! "$AGENT" =~ ^($CODEX_ALLOWED)$ ]]; then
    cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Agent '$AGENT' cannot be invoked via Codex. Implementation agents (*-supervisor, discovery) must use Task() with BEAD_ID for beads workflow."}}
EOF
    exit 0
  fi
fi

# Validate Bash commands for orchestrator
if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  FIRST_WORD="${COMMAND%% *}"

  # ALLOW git commands (check second word for read vs write)
  if [[ "$FIRST_WORD" == "git" ]]; then
    SECOND_WORD=$(echo "$COMMAND" | awk '{print $2}')
    case "$SECOND_WORD" in
      status|log|diff|branch|checkout|merge|fetch|remote|stash|show)
        exit 0
        ;;
      add)
        # Allow git add for quick-fix flow
        exit 0
        ;;
      commit)
        # Block --no-verify to ensure pre-commit hooks run
        if [[ "$COMMAND" == *"--no-verify"* ]] || [[ "$COMMAND" == *"-n"* ]]; then
          cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git commit --no-verify is blocked.\n\nPre-commit hooks exist for a reason (type-check, lint, tests).\nRun the commit without --no-verify and fix any issues."}}
EOF
          exit 0
        fi
        exit 0
        ;;
    esac
  fi

  # ALLOW beads commands (with validation)
  if [[ "$FIRST_WORD" == "bd" ]]; then
    SECOND_WORD=$(echo "$COMMAND" | awk '{print $2}')

    # Validate bd create requires description
    if [[ "$SECOND_WORD" == "create" ]] || [[ "$SECOND_WORD" == "new" ]]; then
      if [[ "$COMMAND" != *"-d "* ]] && [[ "$COMMAND" != *"--description "* ]] && [[ "$COMMAND" != *"--description="* ]]; then
        cat << EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"bd create requires description (-d or --description) for supervisor context."}}
EOF
        exit 0
      fi
    fi

    exit 0
  fi

  # Allow other bash commands (npm, cargo, etc. for investigation)
  exit 0
fi

# Allow everything else
exit 0
