import { useState, useRef, useCallback } from "react";

const CAT_CLASS = {
  STRUCTURE: { bg: "#e6f1fb", color: "#0C447C" },
  PERCEPTION: { bg: "#EEEDFE", color: "#3C3489" },
  RESONANCE:  { bg: "#FAEEDA", color: "#633806" },
  HISTORY:    { bg: "#E1F5EE", color: "#085041" },
  INTENT:     { bg: "#FAECE7", color: "#712B13" },
};

const SKILL_TREE = {
  PERCEPTION: {
    label: "感知",
    skills: [
      { name: "色彩张力", desc: "冷暖对比情绪" },
      { name: "构图引力", desc: "视线被拉向哪里" },
      { name: "材料直觉", desc: "材料让你感受到什么" },
      { name: "尺度感",   desc: "大小如何影响身体" },
      { name: "细节猎人", desc: "藏在角落里的东西" },
    ],
  },
  HISTORY: {
    label: "历史",
    skills: [
      { name: "流派定位", desc: "它从哪里来" },
      { name: "历史回响", desc: "在和谁对话致敬" },
      { name: "时代印记", desc: "当时发生了什么" },
      { name: "收藏与市场", desc: "谁买它为什么" },
      { name: "身后影响", desc: "它改变了什么" },
    ],
  },
  INTENT: {
    label: "意图",
    skills: [
      { name: "生命痕迹", desc: "个人经历的痕迹" },
      { name: "主张",     desc: "对世界说什么" },
      { name: "执念",     desc: "什么驱动他反复做" },
      { name: "野心",     desc: "在挑战艺术本身" },
      { name: "为什么偏偏", desc: "为何这材料这地点" },
    ],
  },
  STRUCTURE: {
    label: "结构",
    skills: [
      { name: "隐藏机制", desc: "不说出来就看不见" },
      { name: "矛盾点",   desc: "作品内部打架的地方" },
      { name: "缺席与沉默", desc: "什么没有被画出来" },
      { name: "观看位置", desc: "怎么看被规定了" },
      { name: "时间性",   desc: "作品要求你等待吗" },
      { name: "场域",     desc: "放在哪里本身是意义" },
    ],
  },
  RESONANCE: {
    label: "共鸣",
    skills: [
      { name: "个人记忆", desc: "它唤起了什么" },
      { name: "身体反应", desc: "想靠近还是想逃" },
      { name: "道德直觉", desc: "这件事对不对" },
      { name: "跨界联想", desc: "让你想到艺术以外" },
      { name: "无法解释", desc: "说不清但就是有什么" },
    ],
  },
};

const SKILL_LIST_FOR_PROMPT = Object.entries(SKILL_TREE)
  .flatMap(([cat, { skills }]) => skills.map((s) => `${cat}::${s.name}（${s.desc}）`))
  .join("\n");

const SYSTEM_PROMPT = `你是一个艺术导览助手。用户上传了一张艺术作品的图片。

你必须从以下固定列表中选出3-4个最适合这件作品的切入角度，不能使用列表以外的名称：

${SKILL_LIST_FOR_PROMPT}

严格返回JSON，不包含任何其他文字：
{
  "skills": [
    {
      "id": 0,
      "name": "角度名称（必须与列表完全一致）",
      "desc": "对应的描述（与列表一致）",
      "cat": "对应的大类（PERCEPTION/HISTORY/INTENT/STRUCTURE/RESONANCE）",
      "observations": [
        "第一条观察陈述（一两句，有活力朋友口吻，不爹味，不用探讨象征体现等学术词）",
        "第二条观察陈述",
        "第三条观察陈述"
      ],
      "more": {
        "label": "大类中文名 · CAT",
        "text": "深度解读（3-4句，有活力朋友语气）",
        "question": "一个开放性问题（轻轻抛出，不强迫）"
      }
    }
  ]
}`;

async function callClaude(system, userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map((b) => b.text || "").join("").trim();
}

// Step 1: just pick skill names, no content
async function selectSkills(b64, mime) {
  const raw = await callClaude(
    `你是艺术导览助手。从以下列表中选出3个最适合这件作品的切入角度，严格返回JSON，不含其他文字：
{"skills":[{"name":"技能名","cat":"大类","desc":"描述"},...]}

规则：
- name和desc必须与列表完全一致，不能修改或扩写
- 只选3个

可选列表：
${SKILL_LIST_FOR_PROMPT}`,
    [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: "选3个最适合的角度，返回JSON。" },
    ]
  );
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean).skills.map((s, i) => ({ ...s, id: i, observations: [], more: null }));
}

// Step 2: generate first observation for a skill on demand
async function fetchObservation(skill, existingObs, b64, mime) {
  const prev = existingObs.length ? `之前已说过：\n${existingObs.join("\n")}\n\n` : "";
  return await callClaude(
    `你是艺术导览助手。针对"${skill.name}"（${skill.desc}）给出一条观察陈述。一两句，有活力朋友口吻，不爹味，不用"探讨""象征""体现"。只返回观察本身。`,
    [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: `${prev}请给出新的一条观察。` },
    ]
  );
}

// Step 3: deep dive on demand
async function fetchDeepDive(skill, b64, mime) {
  const raw = await callClaude(
    `你是艺术导览助手。针对"${skill.name}"给出深度解读和开放性问题。严格返回JSON不含其他文字：{"text":"3-4句深度解读，有活力朋友语气","question":"一个开放性问题"}`,
    [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: `请给出关于"${skill.name}"的深度解读。` },
    ]
  );
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── STYLES (inline) ───────────────────────────────────

const S = {
  wrap: { fontFamily: "'Noto Serif SC', 'Noto Serif SC', serif", background: "#f5f2ed", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" },
  header: { width: "100%", padding: "1.25rem 2rem", display: "flex", alignItems: "baseline", gap: ".75rem", borderBottom: "0.5px solid rgba(26,23,20,0.12)", position: "sticky", top: 0, background: "#f5f2ed", zIndex: 10 },
  logo: { fontSize: 20, fontWeight: 500, letterSpacing: ".04em", color: "#1a1714" },
  logoSub: { fontFamily: "monospace", fontSize: 10, color: "#9a9590", letterSpacing: ".08em" },
  flow: { width: "100%", maxWidth: 520, padding: "2.5rem 1.5rem 10rem", display: "flex", flexDirection: "column", gap: 0 },
  bubble: { display: "flex", flexDirection: "column", gap: 5, marginBottom: "1.75rem", position: "relative" },
  bubbleLabel: { fontFamily: "monospace", fontSize: 10, letterSpacing: ".08em", color: "#9a9590", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 },
  bubbleDot: { width: 5, height: 5, borderRadius: "50%", background: "#c4440a", flexShrink: 0 },
  bubbleText: { fontSize: 16, lineHeight: 1.9, fontWeight: 300, color: "#1a1714" },
  bubbleCard: { background: "#fff", border: "0.5px solid rgba(26,23,20,0.12)", borderRadius: 4, padding: "1.25rem 1.4rem" },
  cardFooter: { marginTop: "1rem", paddingTop: "1rem", borderTop: "0.5px solid rgba(26,23,20,0.12)", fontSize: 14, fontStyle: "italic", color: "#9a9590", lineHeight: 1.75 },
  chip: { width: "100%", padding: ".8rem 1rem", background: "#fff", border: "0.5px solid rgba(26,23,20,0.12)", borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" },
  chipLeft: { display: "flex", flexDirection: "column", gap: 2 },
  chipName: { fontSize: 14, fontWeight: 500, color: "#1a1714" },
  chipDesc: { fontSize: 11, color: "#9a9590", fontFamily: "monospace" },
  chipsHint: { fontFamily: "monospace", fontSize: 10, letterSpacing: ".07em", color: "#9a9590", textTransform: "uppercase", marginBottom: ".65rem" },
  chipsList: { display: "flex", flexDirection: "column", gap: 7 },
  respBtn: { width: "100%", padding: ".75rem 1rem", background: "transparent", border: "0.5px solid rgba(26,23,20,0.12)", borderRadius: 3, fontFamily: "inherit", fontSize: 13, color: "#1a1714", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" },
  respBtnStrong: { borderColor: "rgba(26,23,20,0.38)" },
  respArr: { color: "#9a9590", fontSize: 11 },
  respDivider: { fontFamily: "monospace", fontSize: 10, letterSpacing: ".08em", color: "#9a9590", textTransform: "uppercase", padding: ".4rem 0 .2rem" },
  sep: { width: "100%", height: "0.5px", background: "rgba(26,23,20,0.12)", margin: ".25rem 0 1.75rem" },
  uploadZone: { width: "100%", aspectRatio: "16/9", border: "1px dashed rgba(26,23,20,0.22)", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: ".6rem", cursor: "pointer", background: "rgba(255,255,255,0.4)", marginBottom: ".9rem", position: "relative", overflow: "hidden" },
  uploadIcon: { fontSize: 22, opacity: .22 },
  uploadLbl: { fontFamily: "monospace", fontSize: 11, color: "#9a9590", letterSpacing: ".06em" },
  btnGo: { padding: ".65rem 1.75rem", background: "#1a1714", color: "#f5f2ed", border: "none", borderRadius: 2, fontFamily: "inherit", fontSize: 13, letterSpacing: ".06em", cursor: "pointer" },
  errorMsg: { fontFamily: "monospace", fontSize: 12, color: "#c4440a", padding: ".75rem 1rem", border: "0.5px solid #c4440a", borderRadius: 3, marginBottom: "1.5rem", opacity: .85 },
  heart: (show) => ({ position: "absolute", right: -10, bottom: -10, width: 28, height: 28, background: "#fff", border: "0.5px solid rgba(26,23,20,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: show ? 1 : 0, transform: show ? "scale(1)" : "scale(0.5)", transition: "all 0.3s cubic-bezier(.34,1.56,.64,1)", pointerEvents: "none" }),
};

// ── COMPONENTS ────────────────────────────────────────

function Typing() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: "1.4rem" }}>
      {[0, 180, 360].map((delay) => (
        <div key={delay} style={{ width: 5, height: 5, background: "#9a9590", borderRadius: "50%", animation: `tp 1.1s ease-in-out ${delay}ms infinite` }} />
      ))}
      <style>{`@keyframes tp{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

function Bubble({ text, label, isCard, footer, showHeart }) {
  return (
    <div style={S.bubble}>
      {label && <div style={S.bubbleLabel}><span style={S.bubbleDot} />{label}</div>}
      <div style={{ position: "relative", display: "block" }}>
        {isCard ? (
          <div style={S.bubbleCard}>
            <p style={{ ...S.bubbleText, fontSize: 15 }}>{text}</p>
            {footer && <div style={S.cardFooter}>{footer}</div>}
          </div>
        ) : (
          <p style={S.bubbleText}>{text}</p>
        )}
        <span style={S.heart(showHeart)}>♥</span>
      </div>
    </div>
  );
}

function Chip({ skill, onClick, disabled }) {
  const catStyle = CAT_CLASS[skill.cat] || CAT_CLASS.STRUCTURE;
  return (
    <div
      style={{ ...S.chip, opacity: disabled ? .35 : 1, pointerEvents: disabled ? "none" : "auto" }}
      onClick={onClick}
    >
      <div style={S.chipLeft}>
        <span style={S.chipName}>{skill.name}</span>
        <span style={S.chipDesc}>{skill.desc}</span>
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: ".06em", padding: "2px 7px", borderRadius: 2, background: catStyle.bg, color: catStyle.color }}>{skill.cat}</span>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────

export default function App() {
  const [image, setImage] = useState(null);       // data URL
  const [imageB64, setImageB64] = useState(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [skills, setSkills] = useState([]);
  const [messages, setMessages] = useState([]);   // flow items
  const [phase, setPhase] = useState("upload");   // upload | analyzing | exploring
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSkillIdx, setCurrentSkillIdx] = useState(null);
  const [usedSkills, setUsedSkills] = useState(new Set());
  const [heartedIds, setHeartedIds] = useState(new Set());
  const [lockedResponses, setLockedResponses] = useState(new Set());
  const bottomRef = useRef(null);
  const msgIdRef = useRef(0);
  const skillsRef = useRef([]);
  const currentSkillRef = useRef(null);
  const usedSkillsRef = useRef(new Set());

  const nextId = () => ++msgIdRef.current;

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
  }, []);

  const addMsg = useCallback((msg) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
    scrollBottom();
  }, [scrollBottom]);

  // ── UPLOAD ─────────────────────────────────────────

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImage(dataUrl);
      setImageB64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }

  // ── ANALYZE ────────────────────────────────────────

  async function startAnalysis() {
    setPhase("analyzing");
    setLoading(true);
    setError(null);
    try {
      const loaded = await selectSkills(imageB64, imageMime);
      setSkills(loaded);
      skillsRef.current = loaded;
      setPhase("exploring");
      addMsg({ type: "sys", text: "发现了几个可以进入的角度。" });
      addMsg({ type: "chips", skillsSnapshot: loaded });
    } catch (err) {
      console.error(err);
      setError(err.message || "分析失败，请重试");
      setPhase("upload");
    } finally {
      setLoading(false);
    }
  }

  // ── PICK SKILL ─────────────────────────────────────

  async function pickSkill(idx) {
    const newUsed = new Set([...usedSkillsRef.current, idx]);
    usedSkillsRef.current = newUsed;
    setUsedSkills(newUsed);
    currentSkillRef.current = idx;
    setCurrentSkillIdx(idx);

    addMsg({ type: "sep" });
    setLoading(true);
    try {
      const skill = skillsRef.current[idx];
      const obs = await fetchObservation(skill, [], imageB64, imageMime);
      const updated = [...skillsRef.current];
      updated[idx] = { ...updated[idx], observations: [obs] };
      skillsRef.current = updated;
      setSkills(updated);
      const obsId = nextId();
      addMsg({ type: "obs", text: obs, label: skill.name, obsId, skillIdx: idx, obsIdx: 0 });
      addMsg({ type: "responses", respFor: obsId, skillIdx: idx, obsIdx: 0, isLast: false });
    } catch (err) {
      addMsg({ type: "error", text: "加载失败，请重试" });
    } finally {
      setLoading(false);
    }
  }

  // ── HANDLERS ───────────────────────────────────────

  async function onNoticed(respId, skillIdx, obsIdx) {
    setLockedResponses((prev) => new Set([...prev, respId]));
    setHeartedIds((prev) => new Set([...prev, respId]));

    const skill = skillsRef.current[skillIdx];
    const maxObs = 3;
    const nextObsIdx = obsIdx + 1;
    const isLast = nextObsIdx >= maxObs - 1;

    setLoading(true);
    try {
      const newObs = await fetchObservation(skill, skill.observations, imageB64, imageMime);
      const updated = [...skillsRef.current];
      updated[skillIdx] = { ...updated[skillIdx], observations: [...updated[skillIdx].observations, newObs] };
      skillsRef.current = updated;
      setSkills(updated);
      const obsId = nextId();
      addMsg({ type: "obs", text: newObs, label: skill.name, obsId, skillIdx, obsIdx: nextObsIdx });
      addMsg({ type: "responses", respFor: obsId, skillIdx, obsIdx: nextObsIdx, isLast });
    } catch (err) {
      addMsg({ type: "error", text: "加载失败，请重试" });
    } finally {
      setLoading(false);
    }
  }

  async function onMore(respId, skillIdx) {
    setLockedResponses((prev) => new Set([...prev, respId]));
    const skill = skillsRef.current[skillIdx];
    setLoading(true);
    try {
      let text, question, label;
      if (skill.more) {
        ({ text, question, label } = skill.more);
      } else {
        const result = await fetchDeepDive(skill, imageB64, imageMime);
        text = result.text; question = result.question; label = skill.name;
        const updated = [...skillsRef.current];
        updated[skillIdx] = { ...updated[skillIdx], more: { text, question, label } };
        skillsRef.current = updated;
        setSkills(updated);
      }
      const deepId = nextId();
      addMsg({ type: "deep", text, label, question, deepId });
      addMsg({ type: "pickAnother", respFor: deepId });
    } catch (err) {
      addMsg({ type: "error", text: "加载失败，请重试" });
    } finally {
      setLoading(false);
    }
  }

  function onNext(respId) {
    setLockedResponses((prev) => new Set([...prev, respId]));
    showPicker();
  }

  function onPickAnother(respId) {
    setLockedResponses((prev) => new Set([...prev, respId]));
    showPicker();
  }

  function showPicker() {
    const available = skillsRef.current.filter((_, i) => !usedSkillsRef.current.has(i));
    if (available.length === 0) {
      addMsg({ type: "sep" });
      addMsg({ type: "sys", text: "你已经走过所有角度了。" });
      return;
    }
    addMsg({ type: "sep" });
    addMsg({ type: "picker", available });
  }

  function onPickFromInline(respId, idx) {
    setLockedResponses((prev) => new Set([...prev, respId]));
    pickSkill(idx);
  }

  // ── RENDER MESSAGES ────────────────────────────────

  function renderMsg(msg) {
    const locked = lockedResponses.has(msg.respFor) || lockedResponses.has(msg.id);
    const available = skillsRef.current.filter((_, i) => !usedSkillsRef.current.has(i));

    switch (msg.type) {
      case "sys":
        return <Bubble key={msg.id} text={msg.text} />;

      case "obs":
        return <Bubble key={msg.id} text={msg.text} label={msg.label} showHeart={heartedIds.has(msg.respFor || msg.id)} />;

      case "deep":
        return <Bubble key={msg.id} text={msg.text} label={msg.label} isCard footer={msg.question} />;

      case "error":
        return <div key={msg.id} style={S.errorMsg}>{msg.text}</div>;

      case "sep":
        return <div key={msg.id} style={S.sep} />;

      case "chips":
        return (
          <div key={msg.id} style={{ marginBottom: "1.75rem" }}>
            <div style={S.chipsHint}>选一个你最好奇的</div>
            <div style={S.chipsList}>
              {msg.skillsSnapshot.map((s, i) => (
                <Chip key={i} skill={s} disabled={usedSkills.has(i)} onClick={() => !usedSkills.has(i) && pickSkill(i)} />
              ))}
            </div>
          </div>
        );

      case "picker":
        return (
          <div key={msg.id} style={{ marginBottom: "1.75rem" }}>
            <div style={S.chipsHint}>选一个角度继续</div>
            <div style={S.chipsList}>
              {msg.available.map((s) => {
                const idx = skillsRef.current.indexOf(s);
                return <Chip key={idx} skill={s} disabled={locked || usedSkills.has(idx)} onClick={() => !locked && !usedSkills.has(idx) && pickSkill(idx)} />;
              })}
            </div>
          </div>
        );

      case "responses": {
        const { respFor, skillIdx, obsIdx, isLast } = msg;
        const avail = skillsRef.current.filter((_, i) => !usedSkillsRef.current.has(i));
        return (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: "1.75rem" }}>
            {isLast ? (
              <>
                <button style={{ ...S.respBtn, ...S.respBtnStrong, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onMore(respFor, skillIdx)}>
                  说说更多 <span style={S.respArr}>→</span>
                </button>
                {avail.length > 0 && (
                  <>
                    <div style={S.respDivider}>探索别的角度</div>
                    {avail.map((s) => {
                      const idx = skillsRef.current.indexOf(s);
                      return (
                        <button key={idx} style={{ ...S.respBtn, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onPickFromInline(respFor, idx)}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: "#9a9590", fontFamily: "monospace", flex: 1, marginLeft: 8 }}>{s.desc}</span>
                          <span style={S.respArr}>→</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              <>
                <button style={{ ...S.respBtn, ...S.respBtnStrong, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onNoticed(respFor, skillIdx, obsIdx)}>
                  我也注意到了 <span style={S.respArr}>→</span>
                </button>
                <button style={{ ...S.respBtn, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onMore(respFor, skillIdx)}>
                  说说更多 <span style={S.respArr}>→</span>
                </button>
                <button style={{ ...S.respBtn, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onNext(respFor)}>
                  下一个 <span style={S.respArr}>→</span>
                </button>
              </>
            )}
          </div>
        );
      }

      case "pickAnother":
        return (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: "1.75rem" }}>
            <button style={{ ...S.respBtn, ...S.respBtnStrong, opacity: locked ? .3 : 1 }} disabled={locked} onClick={() => onPickAnother(msg.respFor)}>
              探索别的角度 <span style={S.respArr}>→</span>
            </button>
          </div>
        );

      default: return null;
    }
  }

  // ── RENDER ─────────────────────────────────────────

  return (
    <div style={S.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button:hover { background: rgba(255,255,255,0.6) !important; border-color: rgba(26,23,20,0.35) !important; }
      `}</style>

      <header style={S.header}>
        <span style={S.logo}>看见</span>
        <span style={S.logoSub}>art guide · AI</span>
      </header>

      <div style={S.flow}>

        {/* Upload block */}
        {phase === "upload" && (
          <div style={S.bubble}>
            <div style={S.bubbleLabel}><span style={S.bubbleDot} />开始</div>
            <p style={{ ...S.bubbleText, marginBottom: ".9rem" }}>上传一件让你好奇的作品。</p>
            <label style={S.uploadZone}>
              {image
                ? <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                : <><span style={S.uploadIcon}>⊕</span><span style={S.uploadLbl}>点击上传图片</span></>
              }
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            </label>
            {error && <div style={S.errorMsg}>{error}</div>}
            <button style={{ ...S.btnGo, opacity: image ? 1 : .28, cursor: image ? "pointer" : "not-allowed" }} disabled={!image || loading} onClick={startAnalysis}>
              开始看 →
            </button>
          </div>
        )}

        {/* Analyzing */}
        {phase === "analyzing" && <Typing />}

        {/* Flow messages */}
        {messages.map(renderMsg)}

        {/* Loading indicator during skill interactions */}
        {phase === "exploring" && loading && <Typing />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
