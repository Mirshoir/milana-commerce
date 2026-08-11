# Backend capacity baseline

Measured on 2026-08-11 against the real local website catalog handler using an
isolated SQLite database with 120 products. Each request returned the bounded
mobile page `/api/products?limit=96&offset=0&meta=1`. No production traffic or
production data was used.

| Requests | Concurrency | Errors | Throughput | p50 | p95 | p99 | Max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 25 | 0 | 44.85 req/s | 521.9 ms | 686.1 ms | 1,063.3 ms | 1,230.4 ms |
| 2,000 | 50 | 0 | 46.78 req/s | 1,045.5 ms | 1,074.0 ms | 2,091.1 ms | 2,155.4 ms |

The local release gates are:

- concurrency 25: p95 at or below 1,000 ms and error rate at or below 1%;
- concurrency 50: p95 at or below 2,000 ms and error rate at or below 1%.

This baseline validates handler behavior and response serialization on the
development machine. Before a high-volume launch, repeat the same command
against an isolated staging deployment with production-equivalent PostgreSQL,
instance count, memory, network, and CDN configuration. The tool blocks remote
and production targets unless they are deliberately authorized.
