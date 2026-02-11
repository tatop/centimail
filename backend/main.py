import argparse
import json
from typing import List, Optional

from . import classifier


def _parse_csv(value: Optional[str]) -> Optional[List[str]]:
    if not value:
        return None
    items = [part.strip() for part in value.split(",")]
    return [item for item in items if item]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Classify unread Gmail messages with OpenRouter."
    )
    parser.add_argument("--max-results", type=int, default=5)
    parser.add_argument(
        "--label-ids",
        help="Comma-separated Gmail label IDs (default: INBOX,UNREAD)",
    )
    parser.add_argument("--model", help="Override OpenRouter model")
    parser.add_argument(
        "--labels",
        help="Comma-separated classification labels (default: built-in list)",
    )
    parser.add_argument("--max-tokens", type=int, default=800)
    parser.add_argument(
        "--no-structured-output",
        action="store_true",
        help="Disable response_format JSON schema and rely on prompt-only JSON",
    )
    parser.add_argument(
        "--include-reasoning",
        action="store_true",
        help="Include reasoning when supported by the model",
    )
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--pretty", action="store_true")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    result = classifier.classify_unread_gmail(
        max_results=args.max_results,
        label_ids=_parse_csv(args.label_ids),
        model=args.model,
        labels=_parse_csv(args.labels),
        max_tokens=args.max_tokens,
        exclude_reasoning=not args.include_reasoning,
        use_structured_output=not args.no_structured_output,
        timeout=args.timeout,
    )

    if args.pretty:
        print(json.dumps(result, indent=2, ensure_ascii=True))
    else:
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
