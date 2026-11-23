from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
import sys

from .config import ParserConfig
from .pipeline import run_pipeline, run_preflight


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    if args.command in {"run", "preflight"}:
        config = _build_config(args)
        try:
            summary = run_pipeline(config) if args.command == "run" else run_preflight(config)
            print(json.dumps(summary, indent=2))

            status = str(summary.get("status", "failure")).lower()
            if status == "success":
                return
            if status == "degraded":
                if args.allow_degraded_exit_zero:
                    return
                sys.exit(2)

            sys.exit(1)
        except Exception as error:
            print(json.dumps({"status": "failure", "error": str(error)}, indent=2))
            sys.exit(1)

    parser.print_help()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rlsh-parser")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Run full discovery/fetch/parse/output pipeline")
    _add_common_options(run_parser)
    run_parser.add_argument("--force-refresh", action="store_true", help="Ignore cache and refetch pages")
    run_parser.add_argument(
        "--max-failure-ratio",
        type=float,
        default=0.35,
        help="Mark run degraded when (fetch+parse failures)/attempted exceeds this ratio",
    )
    run_parser.add_argument(
        "--min-successful-pages",
        type=int,
        default=1,
        help="Minimum successful fetched pages required before run is considered successful/degraded",
    )
    run_parser.add_argument(
        "--allow-degraded-exit-zero",
        action="store_true",
        help="Return exit code 0 for degraded runs (useful for local iteration)",
    )

    preflight_parser = subparsers.add_parser("preflight", help="Run discovery-only validation checks")
    _add_common_options(preflight_parser)
    preflight_parser.add_argument(
        "--allow-degraded-exit-zero",
        action="store_true",
        help="Return exit code 0 for degraded runs (useful for local iteration)",
    )
    return parser


def _add_common_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--base-url",
        default="https://wiki.rlsh.net/wiki/Category:RLSH_Directory",
        help="RLSH category URL used as discovery entrypoint",
    )
    parser.add_argument("--cache-dir", default="./.cache/pages", help="HTML cache directory")
    parser.add_argument("--output-dir", default="./output", help="Chunked JSON output directory")
    parser.add_argument("--chunk-size", type=int, default=120, help="Entries per output JSON chunk")
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=10.0,
        help="Delay between outbound requests",
    )
    parser.add_argument(
        "--request-timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout per request",
    )
    parser.add_argument("--max-retries", type=int, default=3, help="Retry attempts per failed request")
    parser.add_argument("--max-pages", type=int, default=None, help="Limit category pages for debug runs")
    parser.add_argument("--strict", action="store_true", help="Enable strict quality gates")
    parser.add_argument(
        "--min-discovered-urls",
        type=int,
        default=50,
        help="Strict mode: minimum discovered hero URLs required",
    )
    parser.add_argument(
        "--max-namespace-noise-ratio",
        type=float,
        default=0.20,
        help="Strict mode: maximum rejected/total discovery candidate ratio",
    )
    parser.add_argument(
        "--max-parse-failure-ratio",
        type=float,
        default=0.25,
        help="Strict mode: maximum parse failures/successful fetch ratio",
    )


def _build_config(args: argparse.Namespace) -> ParserConfig:
    return ParserConfig(
        base_url=args.base_url,
        cache_dir=Path(args.cache_dir),
        output_dir=Path(args.output_dir),
        request_delay_seconds=args.request_delay_seconds,
        request_timeout_seconds=args.request_timeout_seconds,
        max_retries=args.max_retries,
        chunk_size=args.chunk_size,
        max_pages=args.max_pages,
        force_refresh=getattr(args, "force_refresh", False),
        max_failure_ratio=getattr(args, "max_failure_ratio", 0.35),
        min_successful_pages=getattr(args, "min_successful_pages", 1),
        strict=args.strict,
        min_discovered_urls=args.min_discovered_urls,
        max_namespace_noise_ratio=args.max_namespace_noise_ratio,
        max_parse_failure_ratio=args.max_parse_failure_ratio,
    )


if __name__ == "__main__":
    main()