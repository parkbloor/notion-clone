"""Shared parsing and export helpers for dailycapture blocks."""

import html
import json
import re


def parse_daily_capture_content(content: object) -> dict[str, str]:
    """Return a safe date/body pair without exposing the storage JSON envelope."""
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            if (
                isinstance(parsed, dict)
                and parsed.get("version") == 1
                and isinstance(parsed.get("date"), str)
                and isinstance(parsed.get("body"), str)
            ):
                return {"date": parsed["date"], "body": parsed["body"]}
            if (
                isinstance(parsed, dict)
                and parsed.get("version") == 2
                and isinstance(parsed.get("date"), str)
                and isinstance(parsed.get("entries"), list)
            ):
                lines = [item.get("text") for item in parsed["entries"] if isinstance(item, dict) and isinstance(item.get("text"), str)]
                return {"date": parsed["date"], "body": "\n".join(lines)}
        except (json.JSONDecodeError, TypeError):
            pass
        return {"date": "", "body": content}
    return {"date": "", "body": ""}


def daily_capture_to_plain_text(content: object) -> str:
    data = parse_daily_capture_content(content)
    return "\n".join(part for part in (data["date"], data["body"]) if part)


def daily_capture_to_markdown(content: object) -> str:
    data = parse_daily_capture_content(content)
    heading = f"### 📌 {data['date']}" if data["date"] else "### 📌 Daily Capture"
    return f"{heading}\n\n{data['body']}".rstrip()


def _inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", escaped)
    escaped = re.sub(
        r"(?<![\w#])#([\w-]+)",
        r'<span class="daily-capture-tag">#\1</span>',
        escaped,
        flags=re.UNICODE,
    )
    return escaped


def daily_capture_to_html(content: object) -> str:
    data = parse_daily_capture_content(content)
    date = html.escape(data["date"])
    lines = []
    for line in data["body"].splitlines() or [""]:
        checkbox = re.match(r"^- \[([ xX])\]\s?(.*)$", line)
        if checkbox:
            checked = " checked" if checkbox.group(1).lower() == "x" else ""
            lines.append(
                f'<div class="daily-capture-line task-item">'
                f'<input type="checkbox"{checked} disabled> {_inline_markdown(checkbox.group(2))}</div>'
            )
        elif line:
            lines.append(f'<div class="daily-capture-line">{_inline_markdown(line)}</div>')
        else:
            lines.append('<div class="daily-capture-line"><br></div>')
    return (
        '<section class="daily-capture">'
        f'<h3>📌 {date}</h3>'
        f'{"".join(lines)}'
        '</section>'
    )
