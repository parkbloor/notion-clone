import json

from backend.routers.export_import import (
    _blocks_to_html,
    _collect_period_export_items,
    _slice_blocks_for_record,
)


def test_record_header_exports_date_kind_title_and_anchor():
    block = {
        "id": "record-1",
        "type": "record",
        "content": json.dumps({
            "date": "2026-08-08",
            "kind": "생활",
            "title": "운동 기록",
        }),
        "children": [],
    }

    result = _blocks_to_html([block])

    assert 'id="record-record-1"' in result
    assert "2026-08-08" in result
    assert "생활" in result
    assert "운동 기록" in result


def test_record_header_escapes_user_text():
    block = {
        "id": "record-2",
        "type": "record",
        "content": json.dumps({
            "date": "2026-08-08",
            "kind": "<script>alert(1)</script>",
            "title": "<b>제목</b>",
        }),
        "children": [],
    }

    result = _blocks_to_html([block])

    assert "<script>" not in result
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in result
    assert "&lt;b&gt;제목&lt;/b&gt;" in result


def test_record_range_starts_at_selected_header_and_stops_before_next_header():
    blocks = [
        {"id": "before", "type": "paragraph", "content": "범위 밖 앞"},
        {"id": "record-1", "type": "record", "content": "{}"},
        {"id": "inside-1", "type": "paragraph", "content": "첫 본문"},
        {"id": "inside-2", "type": "image", "content": "{}"},
        {"id": "record-2", "type": "record", "content": "{}"},
        {"id": "after", "type": "paragraph", "content": "범위 밖 뒤"},
    ]

    result = _slice_blocks_for_record(blocks, "record-1")

    assert [block["id"] for block in result] == ["record-1", "inside-1", "inside-2"]


def test_record_range_returns_none_for_unknown_header():
    blocks = [{"id": "record-1", "type": "record", "content": "{}"}]

    assert _slice_blocks_for_record(blocks, "missing") is None


def test_dayplanner_html_keeps_routine_event_timeline_and_log():
    content = json.dumps({
        "eventsByDate": {
            "2026-08-08": [{
                "id": "routine-1",
                "title": "아침 운동",
                "start": "07:00",
                "end": "07:30",
                "color": "green",
                "done": True,
                "source": "routine",
                "routineId": "routine-template-1",
                "log": "완료",
            }],
        },
    })

    result = _blocks_to_html([{
        "id": "planner-1",
        "type": "dayplanner",
        "content": content,
    }], "2026-08-08")

    assert "아침 운동" in result
    assert "07:00" in result
    assert "완료" in result
    assert "position:absolute" in result


def test_period_export_collects_deduplicated_events_and_record_ranges():
    shared_event = {
        "id": "same-event", "title": "운동", "start": "07:00", "end": "07:30",
        "color": "green", "done": True,
    }
    pages = [{
        "id": "page-1", "title": "생활 기록", "icon": "📘",
        "blocks": [
            {"id": "planner-1", "type": "dayplanner", "content": json.dumps({
                "eventsByDate": {"2026-08-08": [shared_event]},
            })},
            {"id": "record-1", "type": "record", "content": json.dumps({
                "date": "2026-08-08", "kind": "생활", "title": "운동 기록",
            })},
            {"id": "inside", "type": "paragraph", "content": "본문"},
            {"id": "record-2", "type": "record", "content": json.dumps({
                "date": "2026-08-09", "title": "범위 밖",
            })},
        ],
    }, {
        "id": "page-2", "title": "중복 일정", "blocks": [
            {"id": "planner-2", "type": "dayplanner", "content": json.dumps({
                "eventsByDate": {"2026-08-08": [shared_event]},
            })},
        ],
    }]

    events_by_date, records = _collect_period_export_items(pages, "2026-08-08", "2026-08-08")

    assert [event["id"] for event in events_by_date["2026-08-08"]] == ["same-event"]
    assert len(records) == 1
    assert [block["id"] for block in records[0]["blocks"]] == ["record-1", "inside"]
