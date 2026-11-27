package fleetiq.minimal_demo.rebuild

# The approved values come from the fixture inputs used to render the manifests.
deny_carrier contains "Rebuild carrier differs from the reviewed operation" if not valid_carrier

deny_routes contains "Rebuild Cilium policies differ from the reviewed route" if not valid_routes

valid_routes if input.routes == expected_routes

valid_carrier if {
	count(input.carrier) == 1
	carrier := input.carrier[0]
	carrier.kind == "ConfigMap"
	carrier.metadata == {"name": input.approved.name, "namespace": input.approved.namespace}
	raw := carrier.data["operation.json"]
	json.is_valid(raw)
	operation := json.unmarshal(raw)
	operation.name == input.approved.name
	operation.namespace == input.approved.namespace
	operation.deadlineSeconds == 300
	pod := operation.podSpec
	not "initContainers" in object.keys(pod)
	pod.securityContext == {"runAsUser": 10001, "runAsGroup": 10001}
	pod.volumes == [{"name": "database-ca", "configMap": {"name": "workload-database-ca"}}]
	count(pod.containers) == 1
	container := pod.containers[0]
	container.image == input.approved.image
	container.imagePullPolicy == "Never"
	container.command == ["/usr/local/bin/fleetiq-server"]
	container.args == ["rebuild-current"]
	container.volumeMounts == [{"name": "database-ca", "mountPath": "/etc/fleetiq/database", "readOnly": true}]
	container.securityContext == {"readOnlyRootFilesystem": true}
	container.resources == {
		"requests": {"cpu": "100m", "memory": "192Mi"},
		"limits": {"cpu": "1", "memory": "384Mi"},
	}
	container.env == [
		{"name": "DATABASE_URL", "valueFrom": {"secretKeyRef": {"name": "fleetiq-db-rebuild-current-url", "key": "url"}}},
		{"name": "FLEETIQ_PROJECTION_REBUILD_TENANT", "value": input.approved.tenant},
	]
}

attempt_suffix := trim_prefix(input.approved.attempt, "demo-launch-")

client_labels := {
	"io.cilium.k8s.policy.serviceaccount": sprintf("demo-run-%s", [attempt_suffix]),
	"k8s-infrastructure.io/demo-attempt": input.approved.attempt,
}

database_labels := {"cnpg.io/cluster": "fleetiq-db"}

endpoint(namespace, labels) := {"matchLabels": object.union(labels, {"k8s:io.kubernetes.pod.namespace": namespace})}

policy(side, labels, rules) := {
	"apiVersion": "cilium.io/v2",
	"kind": "CiliumNetworkPolicy",
	"metadata": {
		"name": sprintf("fleetiq-demo-rebuild-current-%s-%s", [side, attempt_suffix]),
		"namespace": input.approved.namespace,
	},
	"spec": object.union({"endpointSelector": {"matchLabels": labels}}, rules),
}

postgres_ports := [{"ports": [{"port": "5432", "protocol": "TCP"}]}]

expected_routes := [
	policy("client", client_labels, {"egress": [
		{
			"toEndpoints": [endpoint("kube-system", {"k8s-app": "kube-dns"})],
			"toPorts": [{"ports": [{"port": "53", "protocol": "UDP"}, {"port": "53", "protocol": "TCP"}]}],
		},
		{
			"toEndpoints": [endpoint(input.approved.namespace, database_labels)],
			"toPorts": postgres_ports,
		},
	]}),
	policy("postgres", database_labels, {"ingress": [{
		"fromEndpoints": [endpoint(input.approved.namespace, client_labels)],
		"toPorts": postgres_ports,
	}]}),
]
