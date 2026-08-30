# GitHub PR workflow

Record the base branch and commit before changing code. Use a dedicated
`forgeoptimizer/run-{short-id}` branch, commit meaningful optimizations, run the
full validation gate, and require explicit human approval before creating a PR.
Never push directly to the default branch, expose credentials, or merge
automatically.
