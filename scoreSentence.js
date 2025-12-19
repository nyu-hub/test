// scoreSentence.js
function scoreSentence(sentence) {
  let s = (sentence || "").trim();
  if (!s) return 0;

  // 카테고리 점수 초기화
  let languageScore = 0;
  let cultureScore = 0;
  let historyScore = 0;
  let oldTechScore = 0;
  let scienceScore = 0;
  let oddityScore = 0;
  let useContextScore = 0;

  // ✅ 추가: “핵심문장으로 뽑히면 좋은” 데이터/팩트/임팩트 점수
  let factScore = 0; // 연도/숫자/비율/순위/현재/기준 등
  let impactScore = 0; // 사회문화적 영향/대중성/상징성
  let anecdoteScore = 0; // 10명 중 1명 같은 의외의 사실/인용구

  // -----------------------------
  // 1) 언어 / 이름 / 방언 / 별칭
  // -----------------------------
  const languagePatterns = [
    /라고도 불린다/,
    /라고 불린다/,
    /라고도 부른다/,
    /라고 부른다/,
    /라고 한다/,
    /라고 알려져 있다/,
    /다른 이름으로는/,
    /별칭/,
    /어원/,
    /유래/,
    /뜻을 가진/,
    /명칭/,
    /(영어|일본어|중국어|문화어)에서는/,
    /현지에서는/,
  ];
  if (languagePatterns.some((p) => p.test(s))) languageScore = 5;

  // -----------------------------
  // 2) 문화 / 지역 / 전통 / 민속
  // -----------------------------
  const culturePatterns = [
    /(한국|영국|중국|일본|독일|프랑스|미국|북미|유럽)에서는/,
    /전통적으로/,
    /민간 설화/,
    /전통적인/,
    /문화/,
    /풍습/,
    /신화/,
    /설화/,
    /상징/,
    /(지역|지방)에서/,
    /지위 상징/,
    /대중(적|성)/,
    /패션/,
    /장신구/,
  ];
  if (culturePatterns.some((p) => p.test(s))) cultureScore = 4;

  // -----------------------------
  // 3) 역사 / 최초 기록 / 기원
  // -----------------------------
  const historyPatterns = [
    /처음/,
    /최초/,
    /세계 최초/,
    /기원/,
    /유래/,
    /초기에는/,
    /\d{3,4}년/,
    /근원/,
    /등장했다/,
    /출시되었다/,
    /시연(했|되)다/,
  ];
  if (historyPatterns.some((p) => p.test(s))) historyScore = 5;

  // -----------------------------
  // 4) 초기 기술 / 옛 방식 / 사라진 시스템
  // -----------------------------
  const oldTechPatterns = [
    /초창기/,
    /과거에는/,
    /옛날에는/,
    /예전에는/,
    /초기 모델/,
    /옛 방식/,
    /이전 방식/,
    /(0세대|1세대|2세대|3세대|4세대|5세대)/,
    /(아날로그|디지털)/,
  ];
  if (oldTechPatterns.some((p) => p.test(s))) oldTechScore = 4;

  // -----------------------------
  // 5) 과학적 원리 / 물리적 설명
  // -----------------------------
  const sciencePatterns = [
    /열/,
    /압력/,
    /마찰/,
    /구조/,
    /원리/,
    /현상/,
    /작동한다/,
    /때문에/,
    /효과/,
    /주파수/,
    /대역폭/,
    /지연\s*시간/,
    /밀리초/,
    /기가비트/,
    /네트워크/,
    /핸드오프/,
    /셀룰러/,
  ];
  if (sciencePatterns.some((p) => p.test(s))) scienceScore = 3;

  // -----------------------------
  // 6) 예외적 / 특이한 / 비정상적 패턴
  // -----------------------------
  const oddityPatterns = [
    /드물게/,
    /특이하게/,
    /예외적으로/,
    /보통과 달리/,
    /대부분.*지만/,
    /일부/,
    /그러나/,
    /반대로/,
    /논란/,
    /오해/,
    /소문/,
  ];
  if (oddityPatterns.some((p) => p.test(s))) oddityScore = 5;

  // -----------------------------
  // 7) 사용 용도 / 생활 잡지식 / 대중문화
  // -----------------------------
  const useContextPatterns = [
    /흔히 쓰인다/,
    /일상적으로/,
    /사용된다/,
    /대중 문화/,
    /영화/,
    /게임/,
    /인기/,
    /쓰인다/,
    /비상/,
    /결제/,
    /내비게이션/,
    /스트리밍/,
    /라디오/,
    /텔레비전/,
    /SNS/,
  ];
  if (useContextPatterns.some((p) => p.test(s))) useContextScore = 3;

  // ======================================================
  // ✅ 8) “핵심문장” 최적화: 데이터/팩트/임팩트/에피소드 보너스
  // ======================================================

  // 8-1) 데이터/팩트 점수: 연도/수치/비율/순위/현재/기준/상위 제조사 등
  const factPatterns = [
    /\d{3,4}\s*년/, // 연도
    /\d+(?:\.\d+)?\s*%/, // 퍼센트
    /\d+(?:\.\d+)?\s*(억|만|천만|백만)\s*명/, // 인구/가입자
    /\d+(?:\.\d+)?\s*(킬로그램|kg|lb|파운드)/, // 무게(2kg 같은 문장)
    /(현재|기준으로|당시|오늘날|이후)/,
    /(상위\s*\d+|TOP\s*\d+|세계\s*최대|가장\s*큰)/,
    /(점유율|판매량|가입자\s*수|제조사|순위)/,
    // 제조사/기관 언급 자체도 약간 가산
  ];

  // 8-2) 임팩트 점수: “보편화/확산/넘어섰다/가장 널리/상징/이모지/SMS”
  const impactPatterns = [
    /(가장\s*(널리|보편적으로)\s*(사용|판매))/,
    /(보편화|확산|급증|증가|넘어섰)/,
    /(지위\s*상징|상징적|문화적으로)/,
    /(SMS|문자\s*메시지|이모지|앱\s*스토어|스마트폰)/,
    /(TV.*휴대\s*전화|휴대\s*전화.*TV)/,
    /(문학\s*장르|휴대\s*전화\s*소설|시민저널리즘|행동주의)/,
  ];

  // 8-3) 에피소드/의외성 점수: “10명 중 1명”, “~라고 말했다” 같은 스토리
  const anecdotePatterns = [
    /\d+\s*명\s*중\s*\d+\s*명/,
    /라고\s*말했다/,
    /라고\s*밝혔다/,
    /연구에\s*따르면/,
    /추정된다/,
    /것으로\s*나타났다/,
    /보고했다/,
  ];

  if (factPatterns.some((p) => p.test(s))) factScore = 6;
  if (impactPatterns.some((p) => p.test(s))) impactScore = 6;
  if (anecdotePatterns.some((p) => p.test(s))) anecdoteScore = 5;

  // 8-4) “너무 기술표준/기관 나열만” 문장 약한 패널티 (그래도 완전 배제는 X)
  //      예: 기관명만 연속, 위원회/표준화 과정만 길게 설명하는 문장
  const dryStandardPatterns = [
    /(표준화\s*기관|위원회|양해각서|회의|Working Group|Technical Committee)/,
    /(설립되었고|이전되었고|부여하면서|되었다\.)/,
  ];
  let dryPenalty = 0;
  if (dryStandardPatterns.every((p) => p.test(s)) && s.length > 90)
    dryPenalty = 3;

  // -----------------------------
  // 9) 희귀 단어 기반 보너스 (문장 내 희귀 단어 수)
  // -----------------------------
  const words = s
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const commonWords = new Set([
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "에서",
    "그리고",
    "그러나",
    "또는",
    "으로",
    "하는",
    "있다",
    "한다",
    "에도",
    "the",
    "a",
    "an",
    "in",
    "on",
    "of",
    "is",
    "are",
  ]);

  let rareCount = 0;
  for (let w of words) {
    if (!commonWords.has(w)) rareCount++;
  }
  const curiosityBonus = rareCount * 0.25;

  // -----------------------------
  // 10) 기본 점수 합산 (✅ 핵심문장 성향으로 가중치 재조정)
  // -----------------------------
  let total =
    1.2 * languageScore +
    1.1 * cultureScore +
    1.25 * historyScore +
    1.05 * oldTechScore +
    1.05 * scienceScore +
    1.15 * oddityScore +
    0.95 * useContextScore +
    1.35 * factScore + // ✅ 데이터 문장 우대
    1.25 * impactScore + // ✅ 사회문화적 임팩트 우대
    1.15 * anecdoteScore + // ✅ 의외/스토리 우대
    curiosityBonus -
    dryPenalty;

  // ======================================================
  // ★ 여기부터 패널티들(기존 유지 + 약간 보강)
  // ======================================================

  // ★ 10-1) "많은 ~들은" 스타일의 일반론인데,
  //        문서 주제어(제목/검색어)가 안 들어간 경우 패널티
  let topicWord = "";
  if (typeof currentTitle === "string" && currentTitle.trim().length > 0) {
    topicWord = currentTitle.trim();
  } else if (typeof keyword === "string" && keyword.trim().length > 0) {
    topicWord = keyword.trim();
  }

  const genericPattern =
    /(많은\s+\S+들은|대부분의\s+\S+들은|많은\s+\S+은|많은\s+\S+는)/;

  if (topicWord && genericPattern.test(s) && !s.includes(topicWord)) {
    total -= 6;
  }

  // ★ 10-2) 표/목록 소개 문장 강한 패널티
  const metaSentencePatterns = [
    /다음은 .*연구에 기초한 .*계통 분류이다/,
    /다음은 .*계통 분류이다/,
    /다음은 .*연구에 기초한/,
    /다음은 .*표이다/,
    /다음.*(표|목록|리스트)입니다?/,
    /^다음은 .*이다.?$/,
  ];
  if (metaSentencePatterns.some((p) => p.test(s))) {
    total -= 10;
  }

  // ★ 10-3) 너무 짧은 문장(정보량 낮음) 패널티
  if (s.length < 28) total -= 2.5;

  // 최소 0 이상
  if (total < 0) total = 0;

  return Math.round(total * 10) / 10;
}
