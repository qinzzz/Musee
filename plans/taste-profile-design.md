# 艺术品味人格系统设计

## 背景

为 Musee 的 collect 模块设计用户品味 profile 系统，根据用户收藏的艺术作品自动推断其审美人格类型。

---

## 五个品味维度

每个维度取值 -1 / 0 / 1，0 表示中立。

| # | 维度 | -1 | 0 | +1 |
|---|------|----|---|----|
| 1 | 具象 ↔ 抽象 | 具象 | 中立 | 抽象 |
| 2 | 感性 ↔ 理性 | 感性 | 中立 | 理性 |
| 3 | 宁静 ↔ 张力 | 宁静 | 中立 | 张力 |
| 4 | 经典 ↔ 先锋 | 经典 | 中立 | 先锋 |
| 5 | 玩味 ↔ 严肃 | 玩味 | 中立 | 严肃 |

---

## 32 种人格类型

5 个维度各取两侧（忽略中立）= 2⁵ = 32 种组合。

| # | 具/抽 | 感/理 | 静/张 | 典/锋 | 玩/肃 | 人格名称 | 代表艺术家 / 作品 |
|---|------|------|------|------|------|---------|----------------|
| 1  | 具象 | 感性 | 宁静 | 经典 | 玩味 | 洛可可漫游者   | Fragonard《秋千》 |
| 2  | 具象 | 感性 | 宁静 | 经典 | 严肃 | 静光凝视者    | Vermeer《戴珍珠耳环的少女》 |
| 3  | 具象 | 感性 | 宁静 | 先锋 | 玩味 | 温柔超现实者  | Magritte《人子》 |
| 4  | 具象 | 感性 | 宁静 | 先锋 | 严肃 | 都市孤光者    | Edward Hopper《夜鹰》 |
| 5  | 具象 | 感性 | 张力 | 经典 | 玩味 | 巴洛克狂欢者  | Rubens《三美神》 |
| 6  | 具象 | 感性 | 张力 | 经典 | 严肃 | 明暗戏剧家    | Caravaggio《以扫拉杀死荷罗孚尼》 |
| 7  | 具象 | 感性 | 张力 | 先锋 | 玩味 | 街头诗人      | Basquiat《无题》 |
| 8  | 具象 | 感性 | 张力 | 先锋 | 严肃 | 肉身见证者    | Francis Bacon《三联画》 |
| 9  | 具象 | 理性 | 宁静 | 经典 | 玩味 | 奇想博物学家  | Arcimboldo《春》 |
| 10 | 具象 | 理性 | 宁静 | 经典 | 严肃 | 古典秩序者    | Holbein《大使》 |
| 11 | 具象 | 理性 | 宁静 | 先锋 | 玩味 | 概念玩家      | Jeff Koons《气球狗》 |
| 12 | 具象 | 理性 | 宁静 | 先锋 | 严肃 | 影像哲学家    | Cindy Sherman《无题电影剧照》 |
| 13 | 具象 | 理性 | 张力 | 经典 | 玩味 | 社会讽刺家    | Hogarth《浪子历程》 |
| 14 | 具象 | 理性 | 张力 | 经典 | 严肃 | 政治见证者    | Goya《1808年5月3日》 |
| 15 | 具象 | 理性 | 张力 | 先锋 | 玩味 | 游击美学家    | Banksy《执气球的女孩》 |
| 16 | 具象 | 理性 | 张力 | 先锋 | 严肃 | 批判现实者    | Kara Walker《剪影叙事》 |
| 17 | 抽象 | 感性 | 宁静 | 经典 | 玩味 | 色彩享乐者    | Matisse《舞蹈》 |
| 18 | 抽象 | 感性 | 宁静 | 经典 | 严肃 | 色场冥想者    | Rothko《橙与红》 |
| 19 | 抽象 | 感性 | 宁静 | 先锋 | 玩味 | 梦境植物学家  | Miró《哈里昆狂欢》 |
| 20 | 抽象 | 感性 | 宁静 | 先锋 | 严肃 | 静谧先知      | Hilma af Klint《十大之作》 |
| 21 | 抽象 | 感性 | 张力 | 经典 | 玩味 | 音乐绘画者    | Kandinsky《构成第八号》 |
| 22 | 抽象 | 感性 | 张力 | 经典 | 严肃 | 姿态哲学家    | de Kooning《女人一号》 |
| 23 | 抽象 | 感性 | 张力 | 先锋 | 玩味 | 涂鸦诗人      | Cy Twombly《黑板系列》 |
| 24 | 抽象 | 感性 | 张力 | 先锋 | 严肃 | 历史悲歌者    | Anselm Kiefer《德国精神英雄》 |
| 25 | 抽象 | 理性 | 宁静 | 经典 | 玩味 | 几何童话家    | Paul Klee《金鱼》 |
| 26 | 抽象 | 理性 | 宁静 | 经典 | 严肃 | 纯粹主义者    | Mondrian《红黄蓝构成》 |
| 27 | 抽象 | 理性 | 宁静 | 先锋 | 玩味 | 动态平衡者    | Alexander Calder《悬挂装置》 |
| 28 | 抽象 | 理性 | 宁静 | 先锋 | 严肃 | 极简哲人      | Donald Judd《无题·铝盒》 |
| 29 | 抽象 | 理性 | 张力 | 经典 | 玩味 | 形式解构者    | Picasso《亚维农少女》 |
| 30 | 抽象 | 理性 | 张力 | 经典 | 严肃 | 构成主义者    | El Lissitzky《用红楔子打白军》 |
| 31 | 抽象 | 理性 | 张力 | 先锋 | 玩味 | 制度挑衅者    | Maurizio Cattelan《香蕉》 |
| 32 | 抽象 | 理性 | 张力 | 先锋 | 严肃 | 概念抵抗者    | Ai Weiwei《葵花籽》 |

---

## 维度推断算法

### 单件作品：LLM 三选一

输入作品元数据（艺术家、标题、年份、媒介、描述），LLM 对每个维度输出 -1 / 0 / 1。

**Prompt 判断标准：**
```
对每个维度输出 -1、0 或 1：
 -1 = 明显偏向左侧
  0 = 中立，作品在这个维度上两侧兼具或无法判断
  1 = 明显偏向右侧

- 具象(-1) vs 抽象(1)：画面是否可辨认出现实事物？
- 感性(-1) vs 理性(1)：核心诉求是情绪还是观念？
- 宁静(-1) vs 张力(1)：视觉上平静还是紧张刺激？
- 经典(-1) vs 先锋(1)：遵循传统还是打破传统？
- 玩味(-1) vs 严肃(1)：轻盈幽默还是沉重严肃？
```

**输出格式：**
```json
{
  "dim_figurative_abstract": -1,
  "dim_emotive_conceptual": 1,
  "dim_serene_intense": 0,
  "dim_classical_avantgarde": 1,
  "dim_playful_serious": -1
}
```

### 聚合：对收藏取 AVG

```sql
SELECT
  AVG(dim_figurative_abstract)  AS score_figurative_abstract,
  AVG(dim_emotive_conceptual)   AS score_emotive_conceptual,
  AVG(dim_serene_intense)       AS score_serene_intense,
  AVG(dim_classical_avantgarde) AS score_classical_avantgarde,
  AVG(dim_playful_serious)      AS score_playful_serious,
  COUNT(*)                      AS analyzed_count
FROM collections
JOIN entities ON ...
WHERE entities.dim_status = 'done'
  AND collections.user_id = :user_id
```

**判断阈值：**
- AVG > 0.3 → 右侧（如：抽象）
- AVG < -0.3 → 左侧（如：具象）
- -0.3 ≤ AVG ≤ 0.3 → 兼容型，不做强判断

**最小样本量：**
- < 5 件：不输出结论
- 5–9 件：输出倾向，标注「样本较少」
- ≥ 10 件：正式输出人格类型

---

## 数据库 Schema

在 entity 表新增字段：

```sql
dim_figurative_abstract  SMALLINT   -- -1=具象, 0=中立, 1=抽象, NULL=未分析
dim_emotive_conceptual   SMALLINT   -- -1=感性, 0=中立, 1=理性
dim_serene_intense       SMALLINT   -- -1=宁静, 0=中立, 1=张力
dim_classical_avantgarde SMALLINT   -- -1=经典, 0=中立, 1=先锋
dim_playful_serious      SMALLINT   -- -1=玩味, 0=中立, 1=严肃

dim_status      VARCHAR(20) DEFAULT 'pending'  -- 'pending'|'processing'|'done'|'failed'
dim_analyzed_at TIMESTAMP
dim_error       TEXT
```

---

## 架构：Background API

维度分析不阻塞 critical path：

```
用户保存收藏
    │
    ▼
entity 写入 DB（dim_status = 'pending'）
    │
    ▼
立即返回响应          ← critical path 结束
    │
    ▼ fire-and-forget
POST /api/internal/entities/:id/analyze-dimensions
    │
    ├─ 读取元数据
    ├─ 更新 dim_status = 'processing'
    ├─ 调用 LLM
    ├─ 写入 5 个 dim 字段
    └─ dim_status = 'done' / 'failed'
```

- 接口为内部接口，加 internal secret header 鉴权
- 接口幂等：dim_status 已为 'done' 时直接返回
- Cron 定期扫描 dim_status = 'pending' 的记录兜底重试

---

## 待完成

- [ ] 32 种人格类型的文字描述（品味画像段落）
- [ ] Profile 页面渲染设计
- [ ] LLM prompt 完整版本与测试
- [ ] 维度阈值调参（0.3 是初始值，需要根据真实数据调整）
