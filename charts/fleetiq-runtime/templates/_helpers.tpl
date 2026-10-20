{{/* Keep the browser origin's port separate from the DNS hostname used by routes. */}}
{{- define "fleetiq.browserAuthority" -}}
{{- if eq (int .Values.public.port) 443 -}}
{{- .Values.public.host -}}
{{- else -}}
{{- printf "%s:%d" .Values.public.host (int .Values.public.port) -}}
{{- end -}}
{{- end -}}

{{/* Egress follows the actual HTTPS issuer port; no second, divergent port input. */}}
{{- define "fleetiq.oidcPort" -}}
{{- $issuer := urlParse .Values.backend.oidc.issuer -}}
{{- if or (hasKey $issuer "error") (ne $issuer.scheme "https") (empty $issuer.host) (hasSuffix ":" $issuer.host) -}}
{{- fail "OIDC requires a valid HTTPS issuer" -}}
{{- end -}}
{{- $port := int (default "443" (trimPrefix ":" (regexFind ":[0-9]+$" $issuer.host))) -}}
{{- if or (lt $port 1) (gt $port 65535) -}}
{{- fail "OIDC issuer port must be between 1 and 65535" -}}
{{- end -}}
{{- $port -}}
{{- end -}}
