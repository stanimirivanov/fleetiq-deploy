{{- define "ociDraft.name" -}}
{{- $name := required "runName is required" .Values.runName -}}
{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$" $name) -}}
{{- fail "runName must be a DNS label of at most 48 characters" -}}
{{- end -}}
{{- $name -}}
{{- end -}}

{{- define "ociDraft.digest" -}}
{{- $digest := required "inputDigest is required" .Values.inputDigest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" $digest) -}}
{{- fail "inputDigest must be a SHA-256 digest" -}}
{{- end -}}
{{- $digest -}}
{{- end -}}

{{- define "ociDraft.restricted" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
{{- end -}}

{{- define "ociDraft.job" -}}
{{- $name := include "ociDraft.name" . -}}
{{- $digest := include "ociDraft.digest" . -}}
{{- $image := required "verifierImage is required" .Values.verifierImage -}}
{{- if not (regexMatch "^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$" $image) -}}
{{- fail "verifierImage must be an image reference pinned by digest" -}}
{{- end }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ $name | quote }}
  namespace: {{ .Release.Namespace | quote }}
  annotations:
    fleetiq.io/qualification-input: {{ $digest | quote }}
spec:
  activeDeadlineSeconds: 300
  backoffLimit: 0
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 10
      automountServiceAccountToken: false
      enableServiceLinks: false
      nodeSelector:
        kubernetes.io/os: linux
        kubernetes.io/arch: amd64
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      initContainers:
        - name: prepare-registry-storage
          image: registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e
          command: [/bin/busybox, mkdir, -m, "0700", /var/lib/registry/private]
          securityContext: {{- include "ociDraft.restricted" . | nindent 12 }}
          resources:
            requests: {cpu: 10m, memory: 8Mi}
            limits: {cpu: 100m, memory: 16Mi}
          volumeMounts:
            - {name: registry-data, mountPath: /var/lib/registry}
        - name: registry
          image: registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e
          restartPolicy: Always
          command: [/bin/registry, serve, /etc/distribution/qualification.yaml]
          startupProbe:
            exec:
              command: [/bin/busybox, wget, -q, -O, /dev/null, "http://127.0.0.1:5000/v2/"]
            periodSeconds: 2
            timeoutSeconds: 1
            failureThreshold: 15
          securityContext: {{- include "ociDraft.restricted" . | nindent 12 }}
          resources:
            requests: {cpu: 100m, memory: 64Mi}
            limits: {cpu: "1", memory: 192Mi}
          volumeMounts:
            - {name: registry-data, mountPath: /var/lib/registry}
            - name: inputs
              mountPath: /etc/distribution/qualification.yaml
              subPath: registry.yaml
              readOnly: true
      containers:
        - name: verifier
          image: {{ $image | quote }}
          command: [node, /opt/fleetiq-deploy/tools/releases/drafts/oci-qualification/verify.mjs]
          args: ["/inputs/reviewed.json", {{ $digest | quote }}, "/dev/termination-log"]
          env:
            - {name: TMPDIR, value: /scratch}
          terminationMessagePolicy: File
          securityContext: {{- include "ociDraft.restricted" . | nindent 12 }}
          resources:
            requests: {cpu: 100m, memory: 128Mi}
            limits: {cpu: "1", memory: 256Mi}
          volumeMounts:
            - {name: inputs, mountPath: /inputs, readOnly: true}
            - {name: scratch, mountPath: /scratch}
      volumes:
        - name: inputs
          configMap:
            name: {{ printf "%s-inputs" $name | quote }}
        - name: registry-data
          emptyDir: {medium: Memory, sizeLimit: 64Mi}
        - name: scratch
          emptyDir: {sizeLimit: 128Mi}
{{- end -}}

{{- define "ociDraft.inputs" -}}
{{- $name := include "ociDraft.name" . -}}
{{- $digest := include "ociDraft.digest" . -}}
{{- $bundle := required "reviewedBundle is required to stage inputs" .Values.reviewedBundle -}}
{{- if or (gt (len $bundle) 786432) (ne (printf "sha256:%s" (sha256sum $bundle)) $digest) -}}
{{- fail "reviewedBundle exceeds the limit or differs from the reviewed SHA-256" -}}
{{- end }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%s-inputs" $name | quote }}
  namespace: {{ .Release.Namespace | quote }}
  ownerReferences:
    - apiVersion: batch/v1
      kind: Job
      name: {{ $name | quote }}
      uid: {{ required "jobUID is required to stage inputs" .Values.jobUID | quote }}
immutable: true
binaryData:
  reviewed.json: {{ $bundle | b64enc | quote }}
data:
  registry.yaml: |
    version: 0.1
    storage:
      filesystem:
        rootdirectory: /var/lib/registry/private
    http:
      addr: 127.0.0.1:5000
{{- end -}}
