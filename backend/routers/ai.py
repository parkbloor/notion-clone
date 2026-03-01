# ==============================================
# backend/routers/ai.py
# 역할: AI 텍스트 생성 엔드포인트 (OpenAI / Claude / Ollama)
# Python으로 치면: Blueprint('ai', url_prefix='/api')
# ==============================================

import json as json_lib

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

# Python으로 치면: blueprint = Blueprint('ai', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["ai"])

# -----------------------------------------------
# 공통 시스템 프롬프트
# Python으로 치면: SYSTEM_MSG = "당신은 노트 앱의 AI 작문 도우미입니다."
# -----------------------------------------------
SYSTEM_MSG = (
    "당신은 노트 앱의 AI 작문 도우미입니다. "
    "사용자의 요청에 따라 텍스트를 다듬거나, 요약하거나, 번역하거나, 이어서 씁니다. "
    "결과물만 출력하고 설명은 생략하세요."
)


# -----------------------------------------------
# 요청 본문 스키마
# provider: 'openai' | 'claude' | 'ollama'
# api_key:  OpenAI/Claude = API 키, Ollama = 빈 문자열
# base_url: Ollama 전용 (기본값 http://localhost:11434/v1)
# Python으로 치면: @dataclass class AIGenerateRequest: ...
# -----------------------------------------------
class AIGenerateRequest(BaseModel):
    provider: str
    model: str
    api_key: str = ""
    base_url: Optional[str] = None  # Ollama 전용
    prompt: str
    context: str = ""


class AITestRequest(BaseModel):
    provider: str
    model: str
    api_key: str = ""
    base_url: Optional[str] = None  # Ollama 전용


# -----------------------------------------------
# 공통 헬퍼: 선택 텍스트 + 지시문 조합
# Python으로 치면: def build_prompt(context, prompt): ...
# -----------------------------------------------
def build_prompt(context: str, prompt: str) -> str:
    if context.strip():
        return f"[대상 텍스트]\n{context}\n\n{prompt}"
    return prompt


# -----------------------------------------------
# POST /api/ai/generate — AI 텍스트 생성
# Python으로 치면: def generate(body): return {'text': result}
# -----------------------------------------------
@router.post("/ai/generate")
def generate_ai(body: AIGenerateRequest):
    full_prompt = build_prompt(body.context, body.prompt)

    # ── OpenAI ──────────────────────────────────────────────
    if body.provider == "openai":
        if not body.api_key.strip():
            raise HTTPException(status_code=400, detail="API 키가 없습니다. 설정 → AI 탭에서 입력해 주세요.")
        try:
            import openai
            client = openai.OpenAI(api_key=body.api_key.strip())
            response = client.chat.completions.create(
                model=body.model,
                messages=[
                    {"role": "system", "content": SYSTEM_MSG},
                    {"role": "user",   "content": full_prompt},
                ],
                max_tokens=1500,
                temperature=0.7,
            )
            return {"text": (response.choices[0].message.content or "").strip()}
        except openai.AuthenticationError:
            raise HTTPException(status_code=401, detail="OpenAI API 키가 잘못되었습니다.")
        except openai.RateLimitError:
            raise HTTPException(status_code=429, detail="API 한도 초과. 잠시 후 다시 시도해 주세요.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI 오류: {str(e)}")

    # ── Claude (Anthropic) ───────────────────────────────────
    if body.provider == "claude":
        if not body.api_key.strip():
            raise HTTPException(status_code=400, detail="API 키가 없습니다. 설정 → AI 탭에서 입력해 주세요.")
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=body.api_key.strip())
            message = client.messages.create(
                model=body.model,
                max_tokens=1500,
                system=SYSTEM_MSG,
                messages=[{"role": "user", "content": full_prompt}],
            )
            text = message.content[0].text if message.content else ""
            return {"text": text.strip()}
        except anthropic.AuthenticationError:
            raise HTTPException(status_code=401, detail="Claude API 키가 잘못되었습니다.")
        except anthropic.RateLimitError:
            raise HTTPException(status_code=429, detail="API 한도 초과. 잠시 후 다시 시도해 주세요.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Claude 오류: {str(e)}")

    # ── Ollama (로컬) ────────────────────────────────────────
    # Ollama는 OpenAI 호환 API 제공 → base_url만 바꿔서 재사용
    # Python으로 치면: client = openai.OpenAI(base_url='http://localhost:11434/v1', api_key='ollama')
    if body.provider == "ollama":
        base_url = (body.base_url or "http://localhost:11434").rstrip("/") + "/v1"
        try:
            import openai
            client = openai.OpenAI(base_url=base_url, api_key="ollama")
            response = client.chat.completions.create(
                model=body.model,
                messages=[
                    {"role": "system", "content": SYSTEM_MSG},
                    {"role": "user",   "content": full_prompt},
                ],
                max_tokens=1500,
                temperature=0.7,
            )
            return {"text": (response.choices[0].message.content or "").strip()}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ollama 오류: {str(e)}\nOllama가 실행 중인지 확인해 주세요.")

    raise HTTPException(status_code=400, detail=f"지원하지 않는 제공자: {body.provider}")


# -----------------------------------------------
# POST /api/ai/stream — AI 텍스트 스트리밍 생성 (SSE)
# 형식: "data: {\"text\": \"청크\"}\n\n" 반복, 완료 시 "data: [DONE]\n\n"
# 에러: "data: {\"error\": \"메시지\"}\n\n"
# Python으로 치면: def stream(body): yield sse_chunk(...)
# -----------------------------------------------
@router.post("/ai/stream")
def stream_ai(body: AIGenerateRequest):
    full_prompt = build_prompt(body.context, body.prompt)

    # SSE 메시지 포맷 헬퍼 — JSON으로 직렬화 후 SSE 형식으로 감싸기
    # Python으로 치면: def sse(data): return f"data: {json.dumps(data)}\n\n"
    def sse(data: dict) -> str:
        return f"data: {json_lib.dumps(data, ensure_ascii=False)}\n\n"

    def generate():
        try:
            # ── OpenAI 스트리밍 ─────────────────────────────────
            if body.provider == "openai":
                if not body.api_key.strip():
                    yield sse({"error": "API 키가 없습니다. 설정 → AI 탭에서 입력해 주세요."})
                    return
                import openai
                client = openai.OpenAI(api_key=body.api_key.strip())
                stream = client.chat.completions.create(
                    model=body.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_MSG},
                        {"role": "user",   "content": full_prompt},
                    ],
                    max_tokens=1500,
                    temperature=0.7,
                    stream=True,
                )
                for chunk in stream:
                    text = chunk.choices[0].delta.content
                    if text:
                        yield sse({"text": text})
                yield "data: [DONE]\n\n"
                return

            # ── Claude 스트리밍 ──────────────────────────────────
            # client.messages.stream() 컨텍스트 매니저 → text_stream 이터레이터
            # Python으로 치면: with client.messages.stream(...) as s: yield from s.text_stream
            if body.provider == "claude":
                if not body.api_key.strip():
                    yield sse({"error": "API 키가 없습니다. 설정 → AI 탭에서 입력해 주세요."})
                    return
                import anthropic
                client = anthropic.Anthropic(api_key=body.api_key.strip())
                with client.messages.stream(
                    model=body.model,
                    max_tokens=1500,
                    system=SYSTEM_MSG,
                    messages=[{"role": "user", "content": full_prompt}],
                ) as stream:
                    for text in stream.text_stream:
                        if text:
                            yield sse({"text": text})
                yield "data: [DONE]\n\n"
                return

            # ── Ollama 스트리밍 ──────────────────────────────────
            # Ollama는 OpenAI 호환 API — base_url만 변경 후 동일하게 stream=True
            # Python으로 치면: client = openai.OpenAI(base_url=ollama_url+'/v1', api_key='ollama')
            if body.provider == "ollama":
                base_url = (body.base_url or "http://localhost:11434").rstrip("/") + "/v1"
                import openai
                client = openai.OpenAI(base_url=base_url, api_key="ollama")
                stream = client.chat.completions.create(
                    model=body.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_MSG},
                        {"role": "user",   "content": full_prompt},
                    ],
                    max_tokens=1500,
                    temperature=0.7,
                    stream=True,
                )
                for chunk in stream:
                    text = chunk.choices[0].delta.content
                    if text:
                        yield sse({"text": text})
                yield "data: [DONE]\n\n"
                return

            yield sse({"error": f"지원하지 않는 제공자: {body.provider}"})

        except Exception as e:
            # 스트리밍 중 예외 → 에러 SSE 메시지로 전달
            # Python으로 치면: except Exception as e: yield sse({'error': str(e)})
            yield sse({"error": str(e)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",      # 중간 프록시/브라우저 캐시 방지
            "X-Accel-Buffering": "no",        # nginx 버퍼링 방지 (리버스 프록시 환경)
        },
    )


# -----------------------------------------------
# POST /api/ai/test — 연결 테스트
# Python으로 치면: def test_connection(body): ...
# -----------------------------------------------
@router.post("/ai/test")
def test_ai(body: AITestRequest):

    # ── OpenAI 테스트 ────────────────────────────
    if body.provider == "openai":
        try:
            import openai
            client = openai.OpenAI(api_key=body.api_key.strip())
            response = client.chat.completions.create(
                model=body.model,
                messages=[{"role": "user", "content": "안녕"}],
                max_tokens=5,
            )
            return {"ok": True, "model": response.model}
        except openai.AuthenticationError:
            raise HTTPException(status_code=401, detail="API 키가 잘못되었습니다.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # ── Claude 테스트 ────────────────────────────
    if body.provider == "claude":
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=body.api_key.strip())
            message = client.messages.create(
                model=body.model,
                max_tokens=5,
                messages=[{"role": "user", "content": "안녕"}],
            )
            return {"ok": True, "model": body.model}
        except anthropic.AuthenticationError:
            raise HTTPException(status_code=401, detail="API 키가 잘못되었습니다.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # ── Ollama 테스트 ────────────────────────────
    if body.provider == "ollama":
        base_url = (body.base_url or "http://localhost:11434").rstrip("/") + "/v1"
        try:
            import openai
            client = openai.OpenAI(base_url=base_url, api_key="ollama")
            response = client.chat.completions.create(
                model=body.model,
                messages=[{"role": "user", "content": "안녕"}],
                max_tokens=5,
            )
            return {"ok": True, "model": response.model}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ollama 연결 실패: {str(e)}")

    raise HTTPException(status_code=400, detail=f"지원하지 않는 제공자: {body.provider}")
