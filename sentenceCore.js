// sentenceCore.js

//문장 정리해주는 함수
function normalizeEnding(sentence) {
  // 1) 기본 어미 정규화
  let s = sentence
    .replace(/합니다\./g, "한다.")
    .replace(/합니다/g, "한다")
    .replace(/됩니다\./g, "된다.")
    .replace(/됩니다/g, "된다")
    .replace(/입니다\./g, "이다.")
    .replace(/입니다/g, "이다")
    .trim();

  // -----------------------------
  // ★ 2) 문서 주제어 추출 (currentTitle or keyword)
  //     - 어떤 문서든 공통으로 쓰는 "topicWord"
  // -----------------------------
  let topicWord = ""; // ★ 수정한 부분
  if (typeof currentTitle === "string" && currentTitle.trim().length > 0) {
    topicWord = currentTitle.trim();
  } else if (typeof keyword === "string" && keyword.trim().length > 0) {
    topicWord = keyword.trim();
  }

  // -----------------------------
  // ★ 3) 문장 앞에 긴 맥락 + 뒤쪽에 주제어가 나오는 경우
  //     - 예: "그녀 ... 자연스럽게 흰 코끼리도 불교를 상징하는 동물이 된 것이다."
  //     - 앞부분(그녀~자연스럽게...)은 버리고
  //       형용사+명사(흰 코끼리...)부터 남기기
  // -----------------------------
  if (topicWord) {
    const idx = s.indexOf(topicWord);
    if (idx > 0) {
      const prefix = s.slice(0, idx);
      const pronounStart = /^(그녀|그는|그가|그들은|그들|그것은|그것이|그것을)/; // ★ 수정한 부분

      if (pronounStart.test(prefix)) {
        // prefix 안에서 공백 위치 찾기
        const lastSpace = prefix.lastIndexOf(" ");
        const beforeLastSpace =
          lastSpace > 0 ? prefix.lastIndexOf(" ", lastSpace - 1) : -1;

        let cutFrom;
        if (beforeLastSpace >= 0) {
          // ★ 형용사 + 명사까지 살리기
          //    예: "... 자연스럽게 흰 " 까지가 prefix에 포함되어 있으므로
          //    beforeLastSpace 이후부터 → "흰 코끼리도 ..."가 살아남음
          cutFrom = beforeLastSpace + 1;
        } else {
          // 형용사 같은 게 없고 바로 "그녀는 코끼리를..." 같은 구조면
          // 그냥 주제어부터 자르기
          cutFrom = idx;
        }

        s = s.slice(cutFrom).trim();
      }
    }
  }

  // -----------------------------
  // ★ 4) "~~이 된 것이다/된것이다" → "~~이다"로 일반 변환
  //     - 띄어쓰기 유무 모두 처리 (된 것이다 / 된것이다)
  //     - 문장 끝에 . 이 있든 없든 처리
  //     - 예: "불교를 상징하는 동물이 된 것이다." → "불교를 상징하는 동물이다."
  // -----------------------------
  s = s.replace(/(.+?)이\s*된\s*것이다[\.]?$/g, "$1이다."); // ★ 수정한 부분

  // -----------------------------
  // ★ 5) 문장 맨 앞에 "~도 ..." → "~은/는 ..."으로 바꾸기
  //     - 형용사+명사 포함해서 전체 앞부분 보존
  //     - 예: "흰 코끼리도 불교를 상징..." → "흰 코끼리는 불교를 상징..."
  // -----------------------------
  s = s.replace(/^(.+?)도(\s+)/, (match, p1, space) => {
    const lastChar = p1[p1.length - 1];
    const code = lastChar.charCodeAt(0);

    // 한글이 아니면 건드리지 않음
    if (code < 0xac00 || code > 0xd7a3) return match;

    const jong = (code - 0xac00) % 28; // 종성
    const particle = jong === 0 ? "는" : "은"; // 받침 없으면 "는", 있으면 "은"
    return p1 + particle + space; // ★ "흰 코끼리"까지 그대로 두고 "는/은"만 교체
  });

  // ★ 문장 맨 앞의 괄호 조각 제거
  s = s.replace(/^[)\]]+\s*/, ""); // ← 이 줄만 넣으면 됨

  return s.trim();
}

//연결사 제거
function removeLeadingConnector(sentence) {
  return sentence
    .replace(
      /^(그러나|하지만|또한|그리고|반대로|한편|게다가|앞에서도 말했듯이)\s*/g,
      ""
    )
    .trim();
}

//쓰레기 문장 제거
function isGarbageSentence(sentence) {
  const s = sentence.trim();

  const patterns = [
    /^==.*==\.?$/,
    /^=+.*=+\.?$/,
    /위키미디어 공용/,
    /^같이 보기$/,
    /^외부 링크$/,
    /^참고 문헌$/,
    /^분류:/,
    /^\*$/, // 내용 없이 *만 있는 경우
    /항목을 포함한 모든 문서/,
    /위에 언급한바와 같이,/,
  ];

  return patterns.some((p) => p.test(s));
}

// 문단 텍스트를 문장 배열로 쪼개기
function splitIntoSentences(text) {
  const normalized = text.replace(/\n+/g, ". ");

  const raw = normalized.split(/([.?!])/);
  const sentences = [];

  for (let i = 0; i < raw.length; i += 2) {
    const part = raw[i].trim();
    if (!part) continue;
    const end = raw[i + 1] || ".";
    const sentence = (part + end).trim();
    if (sentence.length > 10) {
      sentences.push(sentence);
    }
  }

  return sentences;
}

// 전체 텍스트에서 상위 N개 문장 뽑기
function pickTopSentences(text, maxCount = 5) {
  let sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  // 🧹 여기에서 가비지 문장 제거!
  sentences = sentences.filter((s) => !isGarbageSentence(s));

  const scored = sentences.map((s) => ({
    text: s,
    score: scoreSentence(s),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .slice(0, maxCount)
    .map((item) => removeLeadingConnector(item.text))
    .map((s) => normalizeEnding(s));
}
