## Git staging preference
When staging changes with `git add -p` and isolation between my fix and
unrelated pre-existing redesign work is not possible at the hunk level
(e.g. the line is new and didn't exist in HEAD), always choose to stage
ONLY the minimal correct addition (the fix itself), and leave all other
redesign changes in that file unstaged. Do not ask me each time — proceed
with this default automatically, then show me a summary of what was staged.
