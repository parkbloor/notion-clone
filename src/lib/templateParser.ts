// ==============================================
// src/lib/templateParser.ts
// 역할: 마크다운 형식 텍스트를 Block 배열로 변환
// 사용자가 작성한 템플릿 내용을 파싱
// Python으로 치면: def parse_template(md: str) -> list[Block]: ...
// ==============================================

import { Block, BlockType, createBlock } from '@/types/block'


// -----------------------------------------------
// 인라인 마크다운 → HTML 변환
// **굵게**, *기울임*, ~~취소선~~, `코드`
// Python으로 치면: def inline_to_html(text: str) -> str: ...
// -----------------------------------------------
function inlineToHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g,   '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,        '<em>$1</em>')
    .replace(/_(.*?)_/g,          '<em>$1</em>')
    .replace(/~~(.*?)~~/g,        '<del>$1</del>')
    .replace(/`([^`]+)`/g,        '<code>$1</code>')
}

// -----------------------------------------------
// 마크다운 텍스트 → Block 배열 파싱
//
// 지원 문법:
//   # / ## / ###   → heading1/2/3
//   - 항목          → bulletList (연속 줄 = 하나의 블록)
//   1. 항목         → orderedList
//   - [ ] / - [x]  → taskList
//   ---            → divider
//   ```...```      → code
//   일반 텍스트     → paragraph
//
// Python으로 치면:
//   def parse(content: str) -> list[Block]:
//       for line in content.split('\n'): match_and_append(line)
// -----------------------------------------------
export function parseTemplateContent(content: string): Block[] {
  // 줄 단위로 분리
  const lines = content.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── 빈 줄 → 건너뜀 ──────────────────────────
    if (line.trim() === '') {
      i++
      continue
    }

    // ── 구분선 ──────────────────────────────────
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      blocks.push(createBlock('divider'))
      i++
      continue
    }

    // ── 코드 블록 (```...```) ────────────────────
    // Python으로 치면: if line.startswith('```'): collect until next '```'
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++  // 닫는 ``` 건너뜀
      const b = createBlock('code')
      b.content = `<pre><code>${codeLines.join('\n')}</code></pre>`
      blocks.push(b)
      continue
    }

    // ── 제목 1 (# ) ─────────────────────────────
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      const b = createBlock('heading1')
      b.content = inlineToHtml(h1[1].trim())
      blocks.push(b)
      i++
      continue
    }

    // ── 제목 2 (## ) ────────────────────────────
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      const b = createBlock('heading2')
      b.content = inlineToHtml(h2[1].trim())
      blocks.push(b)
      i++
      continue
    }

    // ── 제목 3 (### ) ───────────────────────────
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      const b = createBlock('heading3')
      b.content = inlineToHtml(h3[1].trim())
      blocks.push(b)
      i++
      continue
    }

    // ── 태스크 리스트 (- [ ] / - [x] ) ──────────
    // - [ ] 미완료 항목  /  - [x] 완료 항목
    // Python으로 치면: if re.match(r'^- \[[ x]\]', line): collect_tasks()
    if (line.match(/^- \[[ xX]\]/)) {
      const taskItems: string[] = []
      while (i < lines.length && lines[i].match(/^- \[[ xX]\]/)) {
        taskItems.push(lines[i])
        i++
      }
      // Tiptap taskList HTML 형식으로 변환
      // Python으로 치면: '<ul>' + ''.join(f'<li data-checked="{c}">{t}</li>' for c,t in items) + '</ul>'
      const liHtml = taskItems.map(item => {
        const checked = /^- \[[xX]\]/.test(item)
        const text = inlineToHtml(item.replace(/^- \[[xX ]\] ?/, '').trim())
        return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? ' checked' : ''} /><span></span></label><div><p>${text}</p></div></li>`
      }).join('')
      const b = createBlock('taskList')
      b.content = `<ul data-type="taskList">${liHtml}</ul>`
      blocks.push(b)
      continue
    }

    // ── 순서 없는 목록 (- 항목) ─────────────────
    // Python으로 치면: if line.startswith('- '): collect_bullets()
    if (line.match(/^- /)) {
      const listItems: string[] = []
      while (
        i < lines.length &&
        lines[i].match(/^- /) &&
        !lines[i].match(/^- \[/)  // taskList와 구분
      ) {
        listItems.push(lines[i])
        i++
      }
      const liHtml = listItems.map(item => {
        const text = inlineToHtml(item.replace(/^- /, '').trim())
        return `<li><p>${text}</p></li>`
      }).join('')
      const b = createBlock('bulletList')
      b.content = `<ul>${liHtml}</ul>`
      blocks.push(b)
      continue
    }

    // ── 순서 있는 목록 (1. 항목) ─────────────────
    // Python으로 치면: if re.match(r'^\d+\. ', line): collect_ordered()
    if (line.match(/^\d+\. /)) {
      const listItems: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        listItems.push(lines[i])
        i++
      }
      const liHtml = listItems.map(item => {
        const text = inlineToHtml(item.replace(/^\d+\. /, '').trim())
        return `<li><p>${text}</p></li>`
      }).join('')
      const b = createBlock('orderedList')
      b.content = `<ol>${liHtml}</ol>`
      blocks.push(b)
      continue
    }

    // ── 인용구 (> 텍스트) → 기울임 단락으로 표현 ──
    if (line.match(/^> /)) {
      const b = createBlock('paragraph')
      b.content = `<em>${inlineToHtml(line.replace(/^> /, '').trim())}</em>`
      blocks.push(b)
      i++
      continue
    }

    // ── 일반 텍스트 → paragraph ──────────────────
    // Python으로 치면: else: blocks.append(Block(type='paragraph', content=line))
    const b = createBlock('paragraph')
    b.content = inlineToHtml(line)
    blocks.push(b)
    i++
  }

  // 빈 블록이 하나도 없으면 빈 paragraph 추가 (빈 템플릿 방지)
  // Python으로 치면: if not blocks: blocks.append(Block(type='paragraph'))
  if (blocks.length === 0) {
    blocks.push(createBlock('paragraph'))
  }

  return blocks
}


// -----------------------------------------------
// Block 배열 → 마크다운 텍스트 (역변환)
// 편집 화면에서 기존 블록을 다시 텍스트로 보여줄 때 사용
// Python으로 치면: def blocks_to_markdown(blocks: list[Block]) -> str: ...
// -----------------------------------------------
export function blocksToMarkdown(blocks: Block[]): string {
  // HTML 태그 제거 헬퍼
  function stripHtml(html: string): string {
    if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent ?? ''
  }

  return blocks.map(block => {
    const text = stripHtml(block.content).trim()
    switch (block.type as BlockType) {
      case 'heading1':    return `# ${text}`
      case 'heading2':    return `## ${text}`
      case 'heading3':    return `### ${text}`
      case 'divider':     return '---'
      case 'code': {
        // <pre><code>...</code></pre> → ```...```
        const div = document.createElement('div')
        div.innerHTML = block.content
        const code = div.textContent ?? ''
        return `\`\`\`\n${code}\n\`\`\``
      }
      case 'bulletList': {
        const div = document.createElement('div')
        div.innerHTML = block.content
        const items = div.querySelectorAll('li')
        return Array.from(items).map(li => `- ${li.textContent?.trim() ?? ''}`).join('\n')
      }
      case 'orderedList': {
        const div = document.createElement('div')
        div.innerHTML = block.content
        const items = div.querySelectorAll('li')
        return Array.from(items).map((li, idx) => `${idx + 1}. ${li.textContent?.trim() ?? ''}`).join('\n')
      }
      case 'taskList': {
        const div = document.createElement('div')
        div.innerHTML = block.content
        const items = div.querySelectorAll('li')
        return Array.from(items).map(li => {
          const checked = li.getAttribute('data-checked') === 'true'
          return `- [${checked ? 'x' : ' '}] ${li.textContent?.trim() ?? ''}`
        }).join('\n')
      }
      default:
        return text
    }
  }).filter(Boolean).join('\n\n')
}
