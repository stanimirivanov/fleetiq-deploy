# Inputs are snapshots from the independently verified observer context.
def condition($type): any(.status.conditions[]?; .type == $type and .status == "True");

def application($mode):
  split("\n") | map(sub("\r$"; "")) |
  map(
    if $mode == "bootstrap" and . == "platform operator bootstrapped" then {outcome: "bootstrapped"}
    elif $mode == "bootstrap" and . == "platform operator was already bootstrapped" then {outcome: "already-bootstrapped"}
    elif $mode == "rebuild" and . == "current-state rebuild committed" then {outcome: "rebuilt"}
    elif $mode == "register" and . == "calculator declaration registered or already present" then {outcome: "registered-or-existing"}
    elif $mode == "calculate" and . == "calculator evaluation persisted" then {outcome: "evaluation-persisted"}
    elif $mode == "reclaim" and IN("disabled", "protected", "denied") then {outcome: .}
    elif $mode == "reclaim" and test("^(reclaimed|already-reclaimed) ([1-9]|1[0-6])$") then
      capture("^(?<outcome>reclaimed|already-reclaimed) (?<count>[0-9]+)$") | .count |= tonumber
    elif $mode == "summarize" and test("^summary series=[1-9][0-9]{0,18} revision=[1-9][0-9]{0,18}$") then
      capture("^summary series=(?<series>[0-9]+) revision=(?<revision>[0-9]+)$") + {outcome: "summary-persisted"}
    elif $mode == "expire" and test("^history cleanup restores=([0-9]|1[0-6]) exports=([0-9]|1[0-6]) export_leases=([0-9]|1[0-6])$") then
      capture("^history cleanup restores=(?<restores>[0-9]+) exports=(?<exports>[0-9]+) export_leases=(?<exportLeases>[0-9]+)$") |
      map_values(tonumber) | . + {outcome: (if any(.[]; . > 0) then "cleanup-reported" else "no-work" end)}
    else empty end
  ) | if length == 1 then .[0] else {outcome: "unrecognized"} end;

def attempt: "k8s-infrastructure.io/demo-attempt";

($job[0] // {}) as $j | ($pods[0].items // []) as $p |
($p[0].status.containerStatuses[0] // {}) as $c |
($target + "-worker") as $node |
($launcher | sub("^demo-launch-"; "demo-run-")) as $account |
{format: "fleetiq-demo-admin-job.v1", target: $target, incarnation: $incarnation,
 namespace: $namespace, name: $name, launcher: $launcher, deployment: $deployment,
 backend: $backend, providerOperation: $operationDigest, operation: $mode} |
if ($j.metadata.namespace != $namespace or $j.metadata.name != $name
    or $j.metadata.uid == null or ($jobUID != "" and $j.metadata.uid != $jobUID)
    or $j.metadata.labels[attempt] != $launcher or $j.metadata.deletionTimestamp != null) then
   . + {execution: "uncertain", reason: "job-identity-unverified"}
elif ($j.spec.backoffLimit != 0 or $j.spec.podReplacementPolicy != "Failed"
      or $j.spec.parallelism != 1 or $j.spec.completions != 1
      or $j.spec.activeDeadlineSeconds != 300 or $j.spec.ttlSecondsAfterFinished != null
      or $j.spec.template.spec.restartPolicy != "Never"
      or $j.spec.template.spec.automountServiceAccountToken != false
      or $j.spec.template.spec.serviceAccountName != $account) then
   . + {jobUID: $j.metadata.uid, execution: "uncertain", reason: "job-envelope-unverified"}
elif ((($j | condition("Complete")) == ($j | condition("Failed")))
      or ($j.status.active // 0) != 0 or ($j.status.terminating // 0) != 0
      or ($p | length) != 1 or ($p[0].metadata.ownerReferences | length) != 1
      or ($p[0].metadata.ownerReferences[0] |
           .kind != "Job" or .name != $name or .uid != $j.metadata.uid or .controller != true)
      or $p[0].metadata.namespace != $namespace or $p[0].metadata.uid == null
      or $p[0].metadata.labels[attempt] != $launcher or $p[0].spec.nodeName != $node
      or $p[0].spec.automountServiceAccountToken != false or $p[0].spec.serviceAccountName != $account
      or ($p[0].spec.initContainers // [] | length) != 0
      or ($p[0].spec.ephemeralContainers // [] | length) != 0) then
   . + {jobUID: $j.metadata.uid, execution: "uncertain", reason: "terminal-pod-unverified"}
else
   . + {jobUID: $j.metadata.uid, podUID: $p[0].metadata.uid, node: $node} |
   if (($p[0].spec.containers | length) != 1
       or $p[0].spec.containers[0].image != $backend
       or ($p[0].status.containerStatuses | length) != 1
       or ($c.imageID // "" | split("@") | last | sub("^.*://"; "")) != $imageID
       or $c.restartCount != 0 or $c.state.terminated.exitCode == null) then
     . + {execution: "uncertain", reason: "container-unverified"}
   else
     . + {runtimeImageID: $imageID, exitCode: $c.state.terminated.exitCode} |
     if ($c.state.terminated.exitCode != 0 or ($j | condition("Complete") | not)
         or $p[0].status.phase != "Succeeded"
         or $j.status.succeeded != 1 or ($j.status.failed // 0) != 0) then
       . + {execution: "uncertain", reason: "job-or-process-failure"}
     else
       ($log | application($mode)) as $reported |
       . + {execution: (if $reported.outcome == "unrecognized" then "uncertain" else "exited-zero" end),
         application: $reported}
     end
   end
end
