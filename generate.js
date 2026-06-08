// 매일 오늘의 패턴 3개 + 단어 5개를 Claude로 생성해 content/YYYY-MM-DD.json 으로 저장
// GitHub Actions에서 실행됨. API 키는 ANTHROPIC_API_KEY 시크릿으로 주입.
const fs = require('fs');
const path = require('path');

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY 가 없습니다.'); process.exit(1); }

// 한국 시간(KST) 기준 오늘 날짜
function todayKST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

const CONTENT_DIR = path.join(__dirname, '..', 'content');
fs.mkdirSync(CONTENT_DIR, { recursive: true });

const dateKey = process.argv[2] || todayKST();
const outFile = path.join(CONTENT_DIR, `${dateKey}.json`);

if (fs.existsSync(outFile)) {
  console.log(`이미 존재: ${dateKey}.json — 건너뜀`);
  process.exit(0);
}

// 지금까지 쓴 단어/패턴 모아 중복 방지
const used = new Set();
for (const f of fs.readdirSync(CONTENT_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    (d.words || []).forEach(w => used.add((w.word || '').toLowerCase()));
    (d.patterns || []).forEach(p => used.add((p.pattern || '').toLowerCase()));
  } catch {}
}
const avoid = [...used].slice(-120).join(', ');

const prompt = `너는 한국인 영어 학습자를 위한 콘텐츠 생성기다. 오늘의 학습 자료를 JSON으로만 출력하라. 설명·코드블록·마크다운 없이 순수 JSON만.

구성:
- patterns: 자주 쓰는 영어 회화 패턴 3개. {pattern(영어 패턴), meaning(한국어 의미), example(영어 예문 1문장), example_kr(예문 번역)}
- words: 실용 영어 단어 5개. {word, phonetic(IPA 발음기호 예 /ˈhæpi/), meaning(한국어 뜻), example(영어 예문), example_kr(예문 번역)}

난이도 중급. 일상·여행·업무 활용도 높은 것으로.
${avoid ? `다음은 이미 사용했으니 절대 중복 금지: ${avoid}` : ''}

형식:
{"patterns":[{"pattern":"","meaning":"","example":"","example_kr":""}],"words":[{"word":"","phonetic":"","meaning":"","example":"","example_kr":""}]}`;

async function main() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    console.error('API 오류:', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  let txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  txt = txt.replace(/```json|```/g, '').trim();
  const day = JSON.parse(txt);

  if (!Array.isArray(day.patterns) || !Array.isArray(day.words)) {
    throw new Error('형식이 올바르지 않습니다.');
  }

  fs.writeFileSync(outFile, JSON.stringify(day, null, 2), 'utf8');
  console.log(`생성 완료: ${dateKey}.json (패턴 ${day.patterns.length} · 단어 ${day.words.length})`);

  // 날짜 목록(인덱스) 갱신 — 앱이 사용 가능한 날짜를 알 수 있게
  const dates = fs.readdirSync(CONTENT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort();
  fs.writeFileSync(path.join(CONTENT_DIR, 'index.json'), JSON.stringify(dates, null, 2), 'utf8');
  console.log(`index.json 갱신: ${dates.length}일치`);
}

main().catch(e => { console.error(e); process.exit(1); });
