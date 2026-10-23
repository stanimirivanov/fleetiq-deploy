# Argo bootstrap control graph

`local/` contains two registered project/application pairs: runtime and data.
They are inert bootstrap inputs, restricted to separate namespaces and plain
rendered manifests on the protected activation ref. They do not track main.

[Source operations](../docs/operations/argo-source-graphs.md) describes preparation,
read-only verification and remaining live admission. Do not apply these files as
part of an ordinary contribution or use them to bypass target authorization.
Candidate PRs cannot edit `releases/active/`. Source registration is enforced by
`tools/releases/source-graphs.mjs`; changes require matching policy and rejection
fixtures. No Secrets or private installation inputs belong here.
