package main

import "dagger/oci-qualification/internal/dagger"

const registryImage = "docker.io/library/registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e"

const registryConfig = `version: 0.1
storage:
  filesystem:
    rootdirectory: /var/lib/registry
http:
  addr: :5000
`

type OciQualification struct{}

// Registry runs one transient registry inside the selected Dagger engine.
// Supply a new runID for each invocation.
func (m *OciQualification) Registry(runID string) *dagger.Service {
	return dag.Container().
		From(registryImage).
		WithUser("65532:65532").
		WithEnvVariable("FLEETIQ_QUALIFICATION_RUN", runID).
		WithNewFile("/etc/distribution/qualification.yaml", registryConfig).
		WithMountedTemp("/var/lib/registry", dagger.ContainerWithMountedTempOpts{Size: 64 * 1024 * 1024}).
		WithExposedPort(5000).
		AsService(dagger.ContainerAsServiceOpts{
			Args: []string{"/bin/registry", "serve", "/etc/distribution/qualification.yaml"},
		})
}
