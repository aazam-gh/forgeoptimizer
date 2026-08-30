# Runtime AI instrumentation

Capture provider-neutral invocation metadata around configured sandbox scenarios.
Record provider, model, source location, token counts, latency, retries, errors,
cache status, and estimated cost when the provider supplies them. Use
`metadata_only` or `redacted` by default, never log credentials or raw prompts,
and keep full payload capture local-only and opt-in.
