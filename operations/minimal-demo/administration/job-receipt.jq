# Inputs are snapshots from the independently verified observer context.
def condition($type): any(.status.conditions[]?; .type == $type and .status == "True");

def application($mode):
  map(
    if . == "platform operator bootstrapped" then {mode: "bootstrap", outcome: "bootstrapped"}
    elif . == "platform operator was already bootstrapped" then {mode: "bootstrap", outcome: "already-bootstrapped"}
    elif . == "current-state rebuild committed" then {mode: "rebuild", outcome: "rebuilt"}
    elif . == "calculator declaration registered or already present" then {mode: "register", outcome: "registered-or-existing"}
    elif . == "calculator evaluation persisted" then {mode: "calculate", outcome: "evaluation-persisted"}
    elif IN("disabled", "protected", "denied") then {mode: "reclaim", outcome: .}
    elif test("^(reclaimed|already-reclaimed) ([1-9]|1[0-6])$") then
      capture("^(?<outcome>reclaimed|already-reclaimed) (?<count>[0-9]+)$") | (.count |= tonumber) | . + {mode: "reclaim"}
    elif test("^summary series=[1-9][0-9]{0,18} revision=[1-9][0-9]{0,18}$") then
      capture("^summary series=(?<series>[0-9]+) revision=(?<revision>[0-9]+)$") + {mode: "summarize", outcome: "summary-persisted"}
    elif test("^history cleanup restores=([0-9]|1[0-6]) exports=([0-9]|1[0-6]) export_leases=([0-9]|1[0-6])$") then
      capture("^history cleanup restores=(?<restores>[0-9]+) exports=(?<exports>[0-9]+) export_leases=(?<exportLeases>[0-9]+)$") |
      map_values(tonumber) + {mode: "expire", outcome: "cleanup-reported"}
    else empty end
  ) | if length == 1 and .[0].mode == $mode then .[0] | del(.mode) else null end;

def attempt: "k8s-infrastructure.io/demo-attempt";
def digest: type == "string" and test("^sha256:[0-9a-f]{64}$");
def timestamp:
  if type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$")
  then try (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) catch null
  else null end;

def args($mode):
  {
    bootstrap: ["bootstrap-platform-operator", "--check-schema"],
    rebuild: ["rebuild-current"],
    register: ["register-calculator"],
    calculate: ["calculate-once"],
    reclaim: ["reclaim-once"],
    summarize: ["summarize-once"],
    expire: ["expire-history-once"]
  }[$mode];

# Defaults admitted by Kubernetes on the reviewed PodSpec. Compare all other
# fields, including volumes, env, envFrom, Secret names/keys and mount details.
def pod_spec:
  .dnsPolicy //= "ClusterFirst" |
  .schedulerName //= "default-scheduler" |
  if .serviceAccount == .serviceAccountName then del(.serviceAccount) else . end |
  if .initContainers == [] then del(.initContainers) else . end |
  if .ephemeralContainers == [] then del(.ephemeralContainers) else . end |
  if (.volumes | type) == "array" then
    .volumes |= map(if has("configMap") then .configMap.defaultMode //= 420 else . end)
  else . end |
  .containers |= map(
    .terminationMessagePath //= "/dev/termination-log" |
    .terminationMessagePolicy //= "File" |
    if .envFrom == [] then del(.envFrom) else . end
  );

def observed_pod_spec:
  del(.nodeName) |
  if .priority == 0 then del(.priority) else . end |
  if .preemptionPolicy == "PreemptLowerPriority" then del(.preemptionPolicy) else . end |
  if (.tolerations | type) == "array" then
    .tolerations |= map(select(
      . != {key: "node.kubernetes.io/not-ready", operator: "Exists", effect: "NoExecute", tolerationSeconds: 300}
      and . != {key: "node.kubernetes.io/unreachable", operator: "Exists", effect: "NoExecute", tolerationSeconds: 300}
    )) | if .tolerations == [] then del(.tolerations) else . end
  else . end |
  pod_spec;

def job_spec:
  del(.template) |
  .completionMode //= "NonIndexed" |
  if has("suspend") | not then .suspend = false else . end |
  if has("manualSelector") | not then .manualSelector = false else . end;

def controller_labels($uid; $name):
  {"batch.kubernetes.io/controller-uid": $uid, "batch.kubernetes.io/job-name": $name,
   "controller-uid": $uid, "job-name": $name};

def log_messages($start; $finish):
  if ($log | utf8bytelength) == 0 or ($log | utf8bytelength) > 4096 or ($log | endswith("\n") | not)
  then null
  else
    $log | rtrimstr("\n") | split("\n") |
    map(try capture("^(?<time>[^ ]+) (?<message>.*)$") // {} ) |
    if all(.[]; (.time | timestamp) as $time | $time != null and $time >= $start and $time <= $finish)
    then map(.message | sub("\r$"; ""))
    else null end
  end;

($rendered[0] // {}) as $wanted |
($job[0] // {}) as $j | ($pods[0].items // []) as $p |
($p[0].status.containerStatuses[0] // {}) as $c |
($logPod[0] // {}) as $logged |
($intentAt | timestamp) as $intent |
($j.metadata.creationTimestamp | timestamp) as $created |
($p[0].metadata.creationTimestamp | timestamp) as $podCreated |
($c.state.terminated.startedAt | timestamp) as $started |
($c.state.terminated.finishedAt | timestamp) as $finished |
($target + "-worker") as $node |
($launcher | sub("^demo-launch-"; "demo-run-")) as $account |
({(attempt): $launcher}) as $labels |
($wanted.spec.template.spec // {}) as $reviewedPod |
{format: "fleetiq-demo-admin-job.v1", target: $target, incarnation: $incarnation,
 namespace: $namespace, name: $name, launcher: $launcher, deployment: $deployment,
 backend: $backend, providerOperation: $operationDigest, operation: $mode} |
if (($rendered | length) != 1 or ($operationDigest | digest | not)
    or $launcher != ("demo-launch-" + $operationDigest[7:31])
    or ($imageID | digest | not)
    or ($backend | test("^ghcr[.]io/stanimirivanov/fleetiq-platform@sha256:[0-9a-f]{64}$") | not)
    or $incarnation == "" or ($deployment | test("^[0-9a-f]{40}$") | not)
    or ($target | test("^[a-z][a-z0-9]*(-[a-z0-9]+)*-local$") | not)
    or $namespace != ($target | sub("-local$"; "-data"))
    or $wanted.apiVersion != "batch/v1" or $wanted.kind != "Job"
    or $wanted.metadata != {namespace: $namespace, name: $name, labels: $labels}
    or $wanted.spec.template.metadata != {labels: $labels}
    or $wanted.spec.backoffLimit != 0 or $wanted.spec.podReplacementPolicy != "Failed"
    or $wanted.spec.parallelism != 1 or $wanted.spec.completions != 1
    or $wanted.spec.activeDeadlineSeconds != 300 or $wanted.spec.ttlSecondsAfterFinished != null
    or $reviewedPod.restartPolicy != "Never" or $reviewedPod.enableServiceLinks != false
    or $reviewedPod.terminationGracePeriodSeconds != 60
    or $reviewedPod.automountServiceAccountToken != false or $reviewedPod.serviceAccountName != $account
    or ($reviewedPod.initContainers // [] | length) != 0
    or ($reviewedPod.ephemeralContainers // [] | length) != 0
    or ($reviewedPod.containers | length) != 1
    or $reviewedPod.containers[0].command != ["/usr/local/bin/fleetiq-server"]
    or args($mode) == null or $reviewedPod.containers[0].args != args($mode)
    or $reviewedPod.containers[0].image != $backend or $reviewedPod.containers[0].imagePullPolicy != "Never") then
   . + {execution: "uncertain", reason: "reviewed-expectation-unverified"}
elif (($job | length) != 1 or $j.apiVersion != "batch/v1" or $j.kind != "Job"
      or $j.metadata.namespace != $namespace or $j.metadata.name != $name
      or ($j.metadata.uid // "") == "" or ($jobUID != "" and $j.metadata.uid != $jobUID)
      or $j.metadata.labels != $labels or $j.metadata.deletionTimestamp != null
      or $intent == null or $created == null or $created < $intent) then
   . + {execution: "uncertain", reason: "job-identity-unverified"}
else
   ($labels + controller_labels($j.metadata.uid; $name)) as $podLabels |
   . + {jobUID: $j.metadata.uid} |
   if (($j.spec | job_spec) !=
        ($wanted.spec | job_spec | .selector = {matchLabels: {"batch.kubernetes.io/controller-uid": $j.metadata.uid}})
       or ($j.spec.template.metadata | del(.creationTimestamp)) != {labels: $podLabels}
       or ($j.spec.template.spec | pod_spec) != ($reviewedPod | pod_spec)) then
     . + {execution: "uncertain", reason: "job-envelope-unverified"}
   elif ((($j | condition("Complete")) == ($j | condition("Failed")))
         or ($j.status.active // 0) != 0 or ($j.status.terminating // 0) != 0
         or ($pods | length) != 1 or ($p | length) != 1 or ($p[0].metadata.ownerReferences | length) != 1
         or ($p[0].metadata.ownerReferences[0] |
              .apiVersion != "batch/v1" or .kind != "Job" or .name != $name or
              .uid != $j.metadata.uid or .controller != true)
         or $p[0].metadata.namespace != $namespace or ($p[0].metadata.uid // "") == ""
         or ($p[0].metadata.name // "") == "" or $p[0].metadata.deletionTimestamp != null
         or $p[0].metadata.labels != $podLabels or $p[0].spec.nodeName != $node
         or ($p[0].spec | observed_pod_spec) != ($reviewedPod | pod_spec)) then
     . + {execution: "uncertain", reason: "terminal-pod-unverified"}
   else
     . + {podUID: $p[0].metadata.uid, node: $node} |
     if (($p[0].status.containerStatuses | length) != 1 or $c.name != $reviewedPod.containers[0].name
         or ($c.imageID // "" | split("@") | last | sub("^.*://"; "")) != $imageID
         or $c.restartCount != 0 or ($c.containerID // "") == ""
         or $c.containerID != $c.state.terminated.containerID
         or ($c.state.terminated.exitCode | type) != "number"
         or $podCreated == null or $podCreated < $created or $started == null or $started < $podCreated
         or $finished == null or $finished < $started) then
       . + {execution: "uncertain", reason: "container-unverified"}
     else
       . + {runtimeImageID: $imageID, exitCode: $c.state.terminated.exitCode} |
       if ($c.state.terminated.exitCode != 0 or ($j | condition("Complete") | not)
           or $p[0].status.phase != "Succeeded"
           or $j.status.succeeded != 1 or ($j.status.failed // 0) != 0) then
         . + {execution: "uncertain", reason: "job-or-process-failure"}
       elif (($logPod | length) != 1 or $logged.metadata.uid != $p[0].metadata.uid
             or $logged.metadata.name != $p[0].metadata.name
             or $logged.metadata.namespace != $namespace or $logged.metadata.deletionTimestamp != null
             or $logged.metadata.labels != $podLabels
             or $logged.metadata.ownerReferences != $p[0].metadata.ownerReferences
             or $logged.status.containerStatuses != [$c]) then
         . + {execution: "uncertain", reason: "log-source-unverified"}
       else
         (log_messages($started; $finished) | if . == null then null else application($mode) end) as $reported |
         if $reported == null then . + {execution: "uncertain", reason: "application-marker-unverified"}
         else . + {execution: "exited-zero", application: $reported} end
       end
     end
   end
end
