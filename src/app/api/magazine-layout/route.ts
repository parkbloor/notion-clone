// =============================================
// src/app/api/magazine-layout/route.ts
// 역할: Claude 또는 OpenAI API로 블록 목록 → 잡지 레이아웃 계획(JSON) 반환
// provider 파라미터로 사용할 AI 선택
// Python으로 치면: @app.post("/api/magazine-layout") async def generate_layout(...): ...
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// 클라이언트는 첫 호출 시 초기화 (환경변수 없으면 해당 provider 호출 시 에러)
// Python으로 치면: _claude = None; _openai = None
let _claude: Anthropic | null = null
let _openai: OpenAI | null = null

// 요청마다 키가 달라질 수 있으므로 키를 인자로 받아 클라이언트 생성
// Python으로 치면: def get_claude_client(key): return anthropic.Anthropic(api_key=key)
function getClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

function getOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey })
}

// -----------------------------------------------
// 블록 → AI가 이해할 수 있는 한 줄 설명 변환
// Python으로 치면: def describe_block(block, index): str
// -----------------------------------------------
function describeBlock(
  block: { id: string; type: string; content: string },
  index: number,
): string {
  const text = block.content.replace(/<[^>]+>/g, '').trim()
  const preview = text.slice(0, 80)
  const charCount = text.length
  const idx = index + 1

  switch (block.type) {
    case 'heading1':    return `${idx}. [H1 대제목] id:"${block.id}" → "${preview}"`
    case 'heading2':    return `${idx}. [H2 소제목] id:"${block.id}" → "${preview}"`
    case 'heading3':    return `${idx}. [H3 항목] id:"${block.id}" → "${preview}"`
    case 'image':       return `${idx}. [이미지] id:"${block.id}"`
    case 'table':       return `${idx}. [표] id:"${block.id}" (데이터 테이블)`
    case 'chart':       return `${idx}. [차트] id:"${block.id}"`
    case 'mermaid':     return `${idx}. [다이어그램] id:"${block.id}"`
    case 'gantt':       return `${idx}. [간트 차트] id:"${block.id}"`
    case 'mindmap':     return `${idx}. [마인드맵] id:"${block.id}"`
    case 'excalidraw':  return `${idx}. [손그림] id:"${block.id}"`
    case 'admonition':  return `${idx}. [콜아웃/인용] id:"${block.id}" → "${preview}"`
    case 'code':        return `${idx}. [코드 블록] id:"${block.id}" (${charCount}자)`
    case 'bulletList':  return `${idx}. [불릿 목록] id:"${block.id}" (${charCount}자) → "${preview}"`
    case 'orderedList': return `${idx}. [번호 목록] id:"${block.id}" (${charCount}자) → "${preview}"`
    case 'taskList':    return `${idx}. [체크리스트] id:"${block.id}" (${charCount}자)`
    case 'paragraph':   return `${idx}. [단락] id:"${block.id}" (${charCount}자) → "${preview}${charCount > 80 ? '...' : ''}"`
    default:            return `${idx}. [${block.type}] id:"${block.id}" (${charCount}자)`
  }
}

// -----------------------------------------------
// 공통 프롬프트 생성
// Python으로 치면: def build_prompt(block_list): str
// -----------------------------------------------
function buildPrompt(blockList: string): string {
  return `당신은 경험 많은 잡지 편집 디자이너입니다.
아래 블록들을 분석하여 시각적으로 아름답고 읽기 좋은 잡지 레이아웃을 설계해주세요.

## 블록 목록 (원고 순서)
${blockList}

## 레이아웃 설계 원칙
1. H1 > H2 > H3 순서로 중요도가 높으며, 헤딩은 해당 내용보다 반드시 먼저 나와야 함
2. 이미지·표·차트·다이어그램은 featureBlockIds에 — 충분한 폭으로 두드러지게 표시됨
3. 본문 단락·목록은 bodyBlockIds에 — 자연스러운 열 흐름으로 배치됨
4. 콜아웃·인용은 accentBlockIds에 — 강조 스타일로 표시됨
5. H1/H2 기준으로 섹션을 나눔. 헤딩이 없으면 섹션 1개로 처리
6. featurePosition은 인접 섹션끼리 "left"/"right" 교대 배치 (시각적 리듬)
7. 모든 블록 id를 빠짐없이 포함해야 함 (누락 금지)

## 응답 형식 (JSON만 반환, 마크다운·설명 없음)
{
  "sections": [
    {
      "headingBlockId": "헤딩 블록 id 또는 null",
      "featureBlockIds": ["이미지/표/차트 블록 id"],
      "featurePosition": "left 또는 right",
      "bodyBlockIds": ["본문 블록 id (읽는 순서대로)"],
      "accentBlockIds": ["콜아웃 블록 id"]
    }
  ]
}`
}

// -----------------------------------------------
// JSON 응답 파싱 — 코드블록 안에 있을 수 있으므로 추출 후 파싱
// Python으로 치면: def parse_json_response(raw): dict
// -----------------------------------------------
function parseJsonResponse(raw: string): unknown {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlock ? codeBlock[1] : raw.match(/(\{[\s\S]*\})/)?.[0] ?? raw.trim()
  return JSON.parse(jsonStr)
}

// -----------------------------------------------
// Claude API 호출
// Python으로 치면: async def call_claude(prompt, model, api_key): dict
// -----------------------------------------------
async function callClaude(prompt: string, model: string, apiKey: string): Promise<unknown> {
  const claude = getClaudeClient(apiKey)
  const message = await claude.messages.create({
    model: model || 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseJsonResponse(raw)
}

// -----------------------------------------------
// OpenAI API 호출
// Python으로 치면: async def call_openai(prompt, model, api_key): dict
// -----------------------------------------------
async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<unknown> {
  const openai = getOpenAIClient(apiKey)
  const response = await openai.chat.completions.create({
    model: model || 'gpt-4o-mini',
    max_tokens: 2048,
    // JSON 모드: OpenAI가 항상 유효한 JSON을 반환하도록 강제
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: '당신은 잡지 편집 디자이너입니다. 항상 유효한 JSON만 반환합니다.',
      },
      { role: 'user', content: prompt },
    ],
  })
  const raw = response.choices[0]?.message?.content ?? ''
  return parseJsonResponse(raw)
}

// -----------------------------------------------
// API 키 유효성 확인 — 플레이스홀더 또는 미설정 감지
// Python으로 치면: def is_valid_key(key): bool
// -----------------------------------------------
function isValidKey(key: string | undefined): boolean {
  if (!key) return false
  if (key.startsWith('여기에')) return false
  if (key === 'your_key_here') return false
  if (key.length < 10) return false
  return true
}

// -----------------------------------------------
// POST /api/magazine-layout
// body: { blocks, provider: 'claude'|'openai', model?: string }
// 반환: AILayoutPlan JSON
// -----------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { blocks, provider = 'claude', model, apiKey: bodyApiKey } = await req.json() as {
      blocks: Array<{ id: string; type: string; content: string }>
      provider?: 'claude' | 'openai'
      model?: string
      apiKey?: string   // 설정 UI에서 직접 전달 — .env.local 없이도 동작
    }

    // 키 우선순위: 요청 body → 환경변수
    // Python으로 치면: key = body_key or os.environ.get('...')
    const resolvedKey = bodyApiKey && isValidKey(bodyApiKey)
      ? bodyApiKey
      : provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : process.env.ANTHROPIC_API_KEY

    // API 키 검증 — 없거나 플레이스홀더면 400
    if (!isValidKey(resolvedKey)) {
      const providerName = provider === 'openai' ? 'OpenAI' : 'Claude'
      return NextResponse.json(
        { error: `설정 → AI 탭에서 ${providerName} API 키를 입력해주세요.` },
        { status: 400 },
      )
    }

    // 빈 블록·구분선 필터링
    const VISUAL_TYPES = new Set(['image', 'table', 'chart', 'mermaid', 'gantt',
      'mindmap', 'excalidraw', 'canvas', 'video', 'embed', 'kanban'])

    const active = blocks.filter(b => {
      if (b.type === 'divider') return false
      if (VISUAL_TYPES.has(b.type)) return true
      return b.content.replace(/<[^>]+>/g, '').trim().length > 0
    })

    if (active.length === 0) {
      return NextResponse.json({ sections: [] })
    }

    const blockList = active.map((b, i) => describeBlock(b, i)).join('\n')
    const prompt = buildPrompt(blockList)

    // provider별 API 호출
    // Python으로 치면: result = call_claude(prompt) if provider == 'claude' else call_openai(prompt)
    let aiPlan: unknown
    if (provider === 'openai') {
      aiPlan = await callOpenAI(prompt, model ?? 'gpt-4o-mini', resolvedKey!)
    } else {
      aiPlan = await callClaude(prompt, model ?? 'claude-sonnet-4-6', resolvedKey!)
    }

    return NextResponse.json(aiPlan)

  } catch (err) {
    console.error('[magazine-layout] 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'AI 레이아웃 생성 실패', detail: message },
      { status: 500 },
    )
  }
}
