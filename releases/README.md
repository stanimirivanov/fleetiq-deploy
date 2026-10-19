# Candidate and active selections

Candidates belong under `releases/candidates/<environment>/<release-id>.json`
and follow the [contracts](../contracts/releases/README.md). A normal pull request
can propose them; merging it cannot activate a workload.

`releases/active/` is reserved for separately protected
`environments/<environment>/active` branches. Ordinary candidate/main PRs cannot
add, modify, rename or delete records there. D05 validates proposed compare-and-
swap operations but does not execute them. D06 registers real environment source
graphs; D08 integrates the release principal.

No accepted sample selection is committed: upstream publication and provider
qualification are independent prerequisites. Offline chart fixtures remain under
`environments/local-preview/` and are not active selections.
