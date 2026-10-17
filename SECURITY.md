# Security

Report suspected credential exposure or authorization vulnerabilities privately
to the repository owner. Do not put credentials, provider subjects, session
cookies or private CA material in public issues, logs or uploaded diagnostics.

This composition is for local development. Only loopback HTTPS is published.
The Docker daemon and the current user's private instance directory are trusted
administrative boundaries. A development CA must not be used for production.

If a secret is exposed, revoke it first, then investigate Git history and rotate
dependent credentials. Deleting a file or adding a scanner exemption is not
remediation. Check both structural and real installation gates after a fix.
