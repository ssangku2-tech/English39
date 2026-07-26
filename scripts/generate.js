// 매일 오늘의 패턴 5개(원어민 표현 3 + 문법 패턴 2) + 단어 5개를 Claude로 생성해 content/YYYY-MM-DD.json 으로 저장
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

// 지금까지 쓴 단어/패턴을 각각 모아 중복 방지 (패턴은 반복이 잦으므로 전체 이력을 본다)
const usedWords = new Set();
const usedPhrases = new Set();
// 문구 비교용 정규화: 대소문자·문장부호·공백 제거 → 표현이 같으면 중복으로 간주
const normPhrase = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const f of fs.readdirSync(CONTENT_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    (d.words || []).forEach(w => usedWords.add((w.word || '').toLowerCase().trim()));
    (d.patterns || []).forEach(p => usedPhrases.add(normPhrase(p.pattern)));
  } catch {}
}
// 표시용 원문 문구도 함께 모아 프롬프트에 넣는다 (최근 것 우선)
const phraseList = [];
const files = fs.readdirSync(CONTENT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    (d.patterns || []).forEach(p => { if (p.pattern) phraseList.push(p.pattern); });
  } catch {}
}
const avoidPhrases = phraseList.slice(-200).join(' / ');
const avoidWords = [...usedWords].slice(-150).join(', ');

const prompt = `너는 한국인 영어 학습자를 위한 콘텐츠 생성기다. 오늘의 학습 자료를 JSON으로만 출력하라. 설명·코드블록·마크다운 없이 순수 JSON만.

구성:
- patterns: 총 5개. 아래 순서대로 배열에 넣어라.
  * 앞의 3개: 미국 현지인이 일상 대화에서 실제로 자주 쓰는 자연스러운 "문구/표현".
    - 문법 공식이 아니라, 그대로 입에서 나오는 관용적 구어체 표현이어야 한다.
    - 예: "No worries.", "Let me get back to you.", "That works for me.", "I'm on it.", "It's up to you.", "Long story short,", "Give me a heads-up.", "My bad.", "Let's play it by ear." 같은 실제 원어민이 쓰는 문구.
    - 지나치게 격식적이거나 교과서적인 문장은 피하고, 친구·동료·가게 등에서 실제로 들리는 표현으로.
    - pattern 필드에는 표현 자체를 넣는다(문법 자리표시자 금지).
  * 마지막 2개: 실용적인 영어 "문법 회화 패턴"(빈칸 채우기형 공식).
    - 예: "I'd rather + 동사원형 + than + 동사원형", "It turns out (that) + 주어 + 동사", "I was about to + 동사원형", "feel free to + 동사원형" 처럼 자리표시자가 들어간 응용 가능한 패턴.
    - pattern 필드에 이런 공식 형태를 넣는다.
    - 두 패턴은 서로 다른 문법 요소(시제·조동사·가정법·비교·관계사 등)를 다루도록 하고, 형태가 비슷한 것끼리 넣지 마라.
  * 각 항목 형식: {pattern(영어 표현/패턴), meaning(한국어 의미·뉘앙스), example(자연스러운 대화체 예문), example_kr(예문 번역)}
- words: 실용 영어 단어 5개. {word, phonetic(IPA 발음기호 예 /ˈhæpi/), meaning(한국어 뜻), example(영어 예문), example_kr(예문 번역)}

난이도 중급. 일상·여행·업무 활용도 높은 것으로. 매일 서로 다른 상황(식당·직장·친구·여행·전화 등)에서 골라 다양성을 확보하라.
같은 날 안에서도 중복 금지 — patterns 5개끼리, words 5개끼리 서로 겹치는 항목이 하나도 없어야 한다.
${avoidPhrases ? `\n다음 문구들은 이미 사용했으니 의미가 겹치는 표현도 포함해 절대 중복 금지:\n${avoidPhrases}` : ''}
${avoidWords ? `\n이미 사용한 단어(중복 금지): ${avoidWords}` : ''}

형식:
{"patterns":[{"pattern":"","meaning":"","example":"","example_kr":""}],"words":[{"word":"","phonetic":"","meaning":"","example":"","example_kr":""}]}`;

async function callModel(extra) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt + (extra || '') }]
    })
  });
  if (!res.ok) {
    console.error('API 오류:', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  let txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  txt = txt.replace(/```json|```/g, '').trim();
  return JSON.parse(txt);
}

// 생성물의 문구/단어가 이미 쓴 것과 겹치는지 검사
// 과거 이력(usedPhrases/usedWords)뿐 아니라 같은 날 안에서 두 번 나온 것도 중복으로 본다
function findDupes(day) {
  const dupePhrases = [];
  const seenPhrases = new Set();
  for (const p of day.patterns || []) {
    const k = normPhrase(p.pattern);
    if (usedPhrases.has(k) || seenPhrases.has(k)) dupePhrases.push(p.pattern);
    seenPhrases.add(k);
  }
  const dupeWords = [];
  const seenWords = new Set();
  for (const w of day.words || []) {
    const k = (w.word || '').toLowerCase().trim();
    if (usedWords.has(k) || seenWords.has(k)) dupeWords.push(w.word);
    seenWords.add(k);
  }
  return { dupePhrases, dupeWords };
}

async function main() {
  let day = await callModel();

  if (!Array.isArray(day.patterns) || !Array.isArray(day.words)) {
    throw new Error('형식이 올바르지 않습니다.');
  }

  // 중복이 있으면 겹친 항목을 알려주고 1회 재생성 시도
  let { dupePhrases, dupeWords } = findDupes(day);
  if (dupePhrases.length || dupeWords.length) {
    console.warn(`중복 감지 — 문구: [${dupePhrases.join(', ')}] 단어: [${dupeWords.join(', ')}] → 재생성 시도`);
    const retry = await callModel(`\n\n방금 생성한 것 중 다음은 이미 사용된 중복이다. 완전히 다른 표현/단어로 전부 교체하라: 문구 [${dupePhrases.join(', ')}] 단어 [${dupeWords.join(', ')}]`);
    if (Array.isArray(retry.patterns) && Array.isArray(retry.words)) {
      day = retry;
      ({ dupePhrases, dupeWords } = findDupes(day));
    }
    if (dupePhrases.length || dupeWords.length) {
      console.warn(`재생성 후에도 남은 중복 — 문구: [${dupePhrases.join(', ')}] 단어: [${dupeWords.join(', ')}]`);
    }
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
