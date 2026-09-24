/* 沙具库 —— 心绪 · 沙盘
 *
 * 48 个内联 SVG 微缩模型，8 个类别（对应沙盘治疗的经典分类）。
 * 统一 64×64 viewBox，底部对齐 y=64 作为「落脚点」。
 * 配色由 CSS 变量继承：--fg / --fg2 / --line / --ac / --ac2
 * 绘制顺序遵循画家算法：后面的部件先画，前面的后画，自然遮挡。
 */
window.Shelf = (function () {
  "use strict";

  function s(inner) { return '<svg viewBox="0 0 64 64" aria-hidden="true">' + inner + "</svg>"; }

  var CATS = [
    /* ---------------- 人物 ---------------- */
    {
      key: "people", name: "人物", items: [
        { k: "man", n: "男人", s: s(
          '<rect x="18" y="22" width="5.5" height="17" rx="2.8"/>' +
          '<rect x="40.5" y="22" width="5.5" height="17" rx="2.8"/>' +
          '<rect x="25" y="40" width="6" height="22" rx="3"/>' +
          '<rect x="33" y="40" width="6" height="22" rx="3"/>' +
          '<rect x="24.5" y="21" width="15" height="24" rx="6.5"/>' +
          '<circle cx="32" cy="14" r="7"/>') },

        { k: "woman", n: "女人", s: s(
          '<rect x="18" y="24" width="5" height="15" rx="2.5"/>' +
          '<rect x="41" y="24" width="5" height="15" rx="2.5"/>' +
          '<path d="M26 22 Q32 17 38 22 L45 58 L19 58 Z"/>' +
          '<circle cx="32" cy="13" r="7"/>' +
          '<path class="a" d="M26 8 Q32 3 38 8 Q34 12 26 8 Z"/>') },

        { k: "child", n: "孩子", s: s(
          '<rect x="24" y="30" width="5" height="14" rx="2.5"/>' +
          '<rect x="35" y="30" width="5" height="14" rx="2.5"/>' +
          '<rect x="27" y="46" width="5" height="16" rx="2.5"/>' +
          '<rect x="32" y="46" width="5" height="16" rx="2.5"/>' +
          '<rect x="25.5" y="29" width="13" height="20" rx="6"/>' +
          '<circle cx="32" cy="21" r="8"/>') },

        { k: "elder", n: "老人", s: s(
          '<rect class="a" x="46" y="26" width="3" height="36" rx="1.5"/>' +
          '<rect x="17" y="26" width="5" height="15" rx="2.5"/>' +
          '<rect x="26" y="42" width="6" height="20" rx="3"/>' +
          '<rect x="34" y="42" width="6" height="20" rx="3"/>' +
          '<path d="M24 27 Q32 20 40 28 L40 46 L24 46 Z"/>' +
          '<circle cx="31" cy="17" r="7"/>' +
          '<path class="l" d="M24 13 Q31 7 38 13 Q34 17 24 13 Z"/>') },

        { k: "pair", n: "牵手的一对", s: s(
          '<rect x="16" y="32" width="4.5" height="12" rx="2.2"/>' +
          '<rect x="19" y="44" width="5" height="18" rx="2.5"/>' +
          '<rect x="26" y="44" width="5" height="18" rx="2.5"/>' +
          '<rect x="17.5" y="31" width="15" height="19" rx="7"/>' +
          '<rect x="43.5" y="32" width="4.5" height="12" rx="2.2"/>' +
          '<rect x="33" y="44" width="5" height="18" rx="2.5"/>' +
          '<rect x="40" y="44" width="5" height="18" rx="2.5"/>' +
          '<rect x="31.5" y="31" width="15" height="19" rx="7"/>' +
          '<circle cx="25" cy="24" r="6"/>' +
          '<circle cx="39" cy="24" r="6"/>' +
          '<rect class="a" x="24" y="37" width="16" height="4.5" rx="2.2"/>') },
      ]
    },

    /* ---------------- 动物 ---------------- */
    {
      key: "animal", name: "动物", items: [
        { k: "dog", n: "狗", s: s(
          '<rect x="19" y="50" width="5" height="12" rx="2.5"/>' +
          '<rect x="27" y="50" width="5" height="12" rx="2.5"/>' +
          '<rect x="35" y="50" width="5" height="12" rx="2.5"/>' +
          '<rect x="42" y="50" width="5" height="12" rx="2.5"/>' +
          '<path class="n" d="M17 45 Q10 38 13 28" stroke-width="5" stroke-linecap="round"/>' +
          '<ellipse cx="31" cy="44" rx="15" ry="10"/>' +
          '<circle cx="48" cy="32" r="8"/>' +
          '<path d="M43 27 L45 17 L52 25 Z"/>' +
          '<circle class="a" cx="51" cy="31" r="1.8"/>') },

        { k: "cat", n: "猫", s: s(
          '<rect x="19" y="52" width="5" height="10" rx="2.5"/>' +
          '<rect x="28" y="52" width="5" height="10" rx="2.5"/>' +
          '<rect x="36" y="52" width="5" height="10" rx="2.5"/>' +
          '<path class="n" d="M20 47 Q9 41 16 27" stroke-width="5" stroke-linecap="round"/>' +
          '<ellipse cx="32" cy="46" rx="14" ry="9"/>' +
          '<circle cx="47" cy="33" r="8"/>' +
          '<path d="M42 28 L43 18 L50 26 Z"/>' +
          '<path d="M49 26 L53 17 L56 27 Z"/>' +
          '<circle class="a" cx="50" cy="33" r="1.8"/>') },

        { k: "horse", n: "马", s: s(
          '<rect x="17" y="44" width="5" height="18" rx="2.2"/>' +
          '<rect x="25" y="46" width="5" height="16" rx="2.2"/>' +
          '<rect x="34" y="46" width="5" height="16" rx="2.2"/>' +
          '<rect x="42" y="44" width="5" height="18" rx="2.2"/>' +
          '<path class="n" d="M46 36 Q56 42 52 56" stroke-width="5" stroke-linecap="round"/>' +
          '<ellipse cx="31" cy="38" rx="17" ry="10"/>' +
          '<path d="M38 38 L46 16 L57 21 L47 40 Z"/>' +
          '<path d="M45 20 Q54 10 61 15 Q64 20 58 23 L48 25 Z"/>' +
          '<path d="M46 17 L45 8 L52 15 Z"/>' +
          '<circle class="a" cx="56" cy="17" r="1.8"/>') },

        { k: "bird", n: "鸟", s: s(
          '<rect x="27" y="46" width="4" height="16" rx="2"/>' +
          '<rect x="34" y="46" width="4" height="16" rx="2"/>' +
          '<path d="M20 40 L4 30 L8 50 Z"/>' +
          '<ellipse cx="31" cy="36" rx="15" ry="12"/>' +
          '<path class="n" d="M22 32 Q31 22 41 34" stroke-width="3.5"/>' +
          '<circle cx="47" cy="24" r="8"/>' +
          '<path class="a" d="M54 22 L63 25 L54 28 Z"/>' +
          '<circle class="a" cx="50" cy="22" r="1.8"/>') },

        { k: "snake", n: "蛇", s: s(
          '<path class="n" d="M8 52 Q20 28 32 46 Q44 62 56 36" stroke-width="9" stroke-linecap="round"/>' +
          '<circle cx="55" cy="32" r="7.5"/>' +
          '<circle class="a" cx="57" cy="30" r="1.8"/>') },

        { k: "fish", n: "鱼", s: s(
          '<path d="M8 34 L24 20 L24 48 Z"/>' +
          '<path class="a" d="M32 22 L38 8 L46 22 Z"/>' +
          '<ellipse cx="38" cy="34" rx="21" ry="14"/>' +
          '<circle class="a" cx="50" cy="30" r="2"/>') },

        { k: "turtle", n: "龟", s: s(
          '<rect x="12" y="48" width="9" height="11" rx="4"/>' +
          '<rect x="28" y="50" width="9" height="10" rx="4"/>' +
          '<rect x="40" y="48" width="9" height="11" rx="4"/>' +
          '<path class="n" d="M10 52 L4 56" stroke-width="4" stroke-linecap="round"/>' +
          '<ellipse cx="31" cy="40" rx="21" ry="14"/>' +
          '<path class="a" d="M31 26 L37 34 L31 40 L25 34 Z"/>' +
          '<circle cx="54" cy="42" r="7"/>' +
          '<circle class="a" cx="56" cy="40" r="1.6"/>') },

        { k: "butterfly", n: "蝴蝶", s: s(
          '<path class="n" d="M31 14 Q24 3 19 8 M33 14 Q40 3 45 8" stroke-width="2"/>' +
          '<path class="b" d="M29 28 Q6 12 10 30 Q12 42 29 41 Z"/>' +
          '<path class="b" d="M35 28 Q58 12 54 30 Q52 42 35 41 Z"/>' +
          '<path class="a" d="M29 44 Q11 48 16 57 Q21 63 30 51 Z"/>' +
          '<path class="a" d="M35 44 Q53 48 48 57 Q43 63 34 51 Z"/>' +
          '<ellipse cx="32" cy="38" rx="3.2" ry="14"/>' +
          '<circle cx="32" cy="20" r="4.5"/>') },
      ]
    },

    /* ---------------- 植物 ---------------- */
    {
      key: "plant", name: "植物", items: [
        { k: "tree", n: "大树", s: s(
          '<rect x="28.5" y="36" width="7" height="26" rx="3.5"/>' +
          '<circle cx="18" cy="34" r="12"/>' +
          '<circle cx="46" cy="34" r="12"/>' +
          '<circle cx="32" cy="22" r="16"/>') },

        { k: "pine", n: "松树", s: s(
          '<rect x="29.5" y="50" width="5" height="13" rx="2.5"/>' +
          '<path d="M32 4 L46 26 L18 26 Z"/>' +
          '<path d="M32 18 L50 42 L14 42 Z"/>' +
          '<path d="M32 34 L56 58 L8 58 Z"/>') },

        { k: "flower", n: "花", s: s(
          '<rect x="30.5" y="32" width="3" height="30" rx="1.5"/>' +
          '<path class="n" d="M31 46 Q18 42 16 53 Q27 57 31 46" stroke-width="2"/>' +
          '<path class="n" d="M33 54 Q46 50 48 59 Q37 63 33 54" stroke-width="2"/>' +
          '<circle class="b" cx="32" cy="11" r="6.5"/>' +
          '<circle class="b" cx="21" cy="17" r="6.5"/>' +
          '<circle class="b" cx="43" cy="17" r="6.5"/>' +
          '<circle class="b" cx="24" cy="29" r="6.5"/>' +
          '<circle class="b" cx="40" cy="29" r="6.5"/>' +
          '<circle class="a" cx="32" cy="21" r="6"/>') },

        { k: "cactus", n: "仙人掌", s: s(
          '<rect x="13" y="26" width="10" height="18" rx="5"/>' +
          '<rect x="13" y="36" width="16" height="9" rx="4.5"/>' +
          '<rect x="41" y="20" width="10" height="18" rx="5"/>' +
          '<rect x="35" y="30" width="16" height="9" rx="4.5"/>' +
          '<rect x="26" y="12" width="12" height="50" rx="6"/>' +
          '<path class="n" d="M32 24 V50" stroke-width="1.6" stroke-dasharray="3 4"/>') },

        { k: "bamboo", n: "竹子", s: s(
          '<rect x="19" y="10" width="7" height="52" rx="3.5"/>' +
          '<rect x="29" y="4" width="7" height="58" rx="3.5"/>' +
          '<rect x="39" y="14" width="7" height="48" rx="3.5"/>' +
          '<rect class="a" x="18" y="24" width="9" height="2.6" rx="1.3"/>' +
          '<rect class="a" x="18" y="42" width="9" height="2.6" rx="1.3"/>' +
          '<rect class="a" x="28" y="18" width="9" height="2.6" rx="1.3"/>' +
          '<rect class="a" x="28" y="38" width="9" height="2.6" rx="1.3"/>' +
          '<rect class="a" x="38" y="28" width="9" height="2.6" rx="1.3"/>' +
          '<rect class="a" x="38" y="46" width="9" height="2.6" rx="1.3"/>' +
          '<path class="n" d="M27 12 Q16 4 12 12 Q20 18 27 12" stroke-width="2"/>' +
          '<path class="n" d="M37 6 Q48 0 52 8 Q44 14 37 6" stroke-width="2"/>') },
      ]
    },

    /* ---------------- 建筑 ---------------- */
    {
      key: "build", name: "建筑", items: [
        { k: "house", n: "房子", s: s(
          '<rect x="10" y="30" width="44" height="32" rx="3"/>' +
          '<path d="M4 33 L32 8 L60 33 L56 37 L32 16 L8 37 Z"/>' +
          '<rect class="b" x="16" y="38" width="9" height="9" rx="1.5"/>' +
          '<rect class="b" x="39" y="38" width="9" height="9" rx="1.5"/>' +
          '<rect class="a" x="27" y="44" width="11" height="18" rx="1.5"/>') },

        { k: "castle", n: "城堡", s: s(
          '<rect x="8" y="20" width="12" height="42"/>' +
          '<rect x="44" y="20" width="12" height="42"/>' +
          '<rect x="16" y="32" width="32" height="30"/>' +
          '<rect class="a" x="7" y="14" width="5" height="8" rx="1"/>' +
          '<rect class="a" x="15" y="14" width="5" height="8" rx="1"/>' +
          '<rect class="a" x="43" y="14" width="5" height="8" rx="1"/>' +
          '<rect class="a" x="51" y="14" width="5" height="8" rx="1"/>' +
          '<rect class="b" x="11" y="30" width="6" height="10" rx="3"/>' +
          '<rect class="b" x="47" y="30" width="6" height="10" rx="3"/>' +
          '<path class="a" d="M26 62 V48 A6 6 0 0 1 38 48 V62 Z"/>') },

        { k: "bridge", n: "桥", s: s(
          '<path class="n" d="M4 62 Q32 22 60 62" stroke-width="6" stroke-linecap="round"/>' +
          '<rect class="n" x="10" y="24" width="3" height="14" stroke-width="3"/>' +
          '<rect class="n" x="22" y="24" width="3" height="14" stroke-width="3"/>' +
          '<rect class="n" x="34" y="24" width="3" height="14" stroke-width="3"/>' +
          '<rect class="n" x="46" y="24" width="3" height="14" stroke-width="3"/>' +
          '<rect class="n" x="6" y="25" width="52" height="3" stroke-width="3"/>' +
          '<rect x="0" y="34" width="64" height="9" rx="4.5"/>') },

        { k: "tower", n: "塔", s: s(
          '<path d="M22 28 L42 28 L38 62 L26 62 Z"/>' +
          '<rect class="b" x="29" y="36" width="6" height="10" rx="3"/>' +
          '<rect class="b" x="29" y="50" width="6" height="8" rx="3"/>' +
          '<path d="M18 30 L32 4 L46 30 Z"/>' +
          '<rect class="a" x="30" y="0" width="4" height="6" rx="2"/>') },

        { k: "fence", n: "篱笆", s: s(
          '<rect x="2" y="36" width="60" height="5" rx="2.5"/>' +
          '<rect x="2" y="50" width="60" height="5" rx="2.5"/>' +
          '<rect x="6" y="30" width="6" height="32" rx="3"/>' +
          '<rect x="22" y="24" width="6" height="38" rx="3"/>' +
          '<rect x="38" y="30" width="6" height="32" rx="3"/>' +
          '<rect x="54" y="24" width="6" height="38" rx="3"/>') },

        { k: "door", n: "门", s: s(
          '<path d="M12 62 V24 A20 20 0 0 1 52 24 V62 Z"/>' +
          '<path class="l" d="M18 62 V26 A14 14 0 0 1 46 26 V62 Z"/>' +
          '<rect class="a" x="30" y="24" width="4" height="38" rx="2"/>' +
          '<circle class="a" cx="25" cy="44" r="2.4"/>') },
      ]
    },

    /* ---------------- 自然 ---------------- */
    {
      key: "nature", name: "自然", items: [
        { k: "stone", n: "石头", s: s(
          '<path d="M7 58 Q1 42 14 30 Q26 18 40 25 Q57 32 56 47 Q55 60 41 60 Z"/>' +
          '<path class="l" d="M18 34 Q26 24 36 29 Q28 36 22 44 Z"/>') },

        { k: "mountain", n: "山", s: s(
          '<path d="M0 62 L22 16 L35 38 L45 20 L64 62 Z"/>' +
          '<path class="l" d="M16 28 L22 16 L28 28 L22 35 Z"/>' +
          '<path class="l" d="M40 30 L45 20 L50 30 L45 37 Z"/>') },

        { k: "shell", n: "贝壳", s: s(
          '<path d="M32 60 Q9 38 9 24 A23 23 0 0 1 55 24 Q55 38 32 60 Z"/>' +
          '<path class="n" d="M32 58 V6 M32 58 L17 12 M32 58 L47 12 M32 58 L8 25 M32 58 L56 25" stroke-width="1.6"/>') },

        { k: "cloud", n: "云", s: s(
          '<circle class="l" cx="19" cy="34" r="13"/>' +
          '<circle class="l" cx="34" cy="26" r="16"/>' +
          '<circle class="l" cx="48" cy="35" r="12"/>' +
          '<rect class="l" x="6" y="38" width="52" height="12" rx="6"/>') },

        { k: "sun", n: "太阳", s: s(
          '<path class="n" d="M32 2 V14 M32 50 V62 M2 32 H14 M50 32 H62 M11 11 L19 19 M45 45 L53 53 M53 11 L45 19 M19 45 L11 53" stroke-width="3.5" stroke-linecap="round"/>' +
          '<circle class="a" cx="32" cy="32" r="15"/>') },

        { k: "moon", n: "月亮", s: s(
          '<path class="a" d="M40 6 Q14 18 14 34 Q14 50 40 62 Q20 54 20 34 Q20 14 40 6 Z"/>') },

        { k: "fire", n: "火", s: s(
          '<path class="a" d="M32 4 Q43 24 40 34 Q49 28 49 40 Q49 60 32 62 Q15 60 15 40 Q15 28 24 34 Q21 24 32 4 Z"/>' +
          '<path class="l" d="M32 32 Q38 42 36 48 Q36 57 32 59 Q28 57 28 48 Q26 42 32 32 Z"/>') },
      ]
    },

    /* ---------------- 交通 ---------------- */
    {
      key: "vehicle", name: "交通", items: [
        { k: "car", n: "汽车", s: s(
          '<rect x="4" y="32" width="56" height="17" rx="7"/>' +
          '<path d="M16 33 L23 20 L41 20 L48 33 Z"/>' +
          '<rect class="b" x="25" y="23" width="14" height="8" rx="2"/>' +
          '<circle cx="17" cy="51" r="8"/>' +
          '<circle cx="47" cy="51" r="8"/>' +
          '<circle class="a" cx="17" cy="51" r="3"/>' +
          '<circle class="a" cx="47" cy="51" r="3"/>') },

        { k: "boat", n: "船", s: s(
          '<rect class="n" x="30" y="6" width="3" height="38" stroke-width="3"/>' +
          '<path class="a" d="M27 12 L27 42 L8 42 Z"/>' +
          '<path class="l" d="M36 10 L36 42 L58 42 Z"/>' +
          '<path d="M4 42 L60 42 L49 60 L15 60 Z"/>') },

        { k: "plane", n: "飞机", s: s(
          '<path d="M28 32 L17 8 L26 8 L41 31 Z"/>' +
          '<path d="M28 41 L17 62 L26 62 L41 42 Z"/>' +
          '<path class="a" d="M49 30 L58 16 L62 19 L56 32 Z"/>' +
          '<path d="M4 33 Q30 25 57 32 L61 35 L61 39 L57 42 Q30 48 4 41 Z"/>' +
          '<circle class="b" cx="20" cy="36" r="3.5"/>') },

        { k: "train", n: "火车", s: s(
          '<rect x="9" y="10" width="11" height="16" rx="2"/>' +
          '<rect class="b" x="26" y="16" width="15" height="11" rx="2"/>' +
          '<rect x="45" y="30" width="17" height="20" rx="5"/>' +
          '<rect class="b" x="49" y="35" width="9" height="8" rx="2"/>' +
          '<rect x="3" y="24" width="42" height="26" rx="6"/>' +
          '<circle cx="14" cy="53" r="7"/>' +
          '<circle cx="33" cy="53" r="7"/>' +
          '<circle cx="54" cy="53" r="7"/>' +
          '<circle class="a" cx="14" cy="53" r="2.6"/>' +
          '<circle class="a" cx="33" cy="53" r="2.6"/>' +
          '<circle class="a" cx="54" cy="53" r="2.6"/>') },

        { k: "bike", n: "自行车", s: s(
          '<circle class="n" cx="16" cy="44" r="15" stroke-width="3.5"/>' +
          '<circle class="n" cx="48" cy="44" r="15" stroke-width="3.5"/>' +
          '<path class="n" d="M16 44 L29 22 L42 22 L48 44 M29 22 L35 44 M16 44 L35 44" stroke-width="3.5"/>' +
          '<path class="n" d="M24 17 L36 17" stroke-width="3.5" stroke-linecap="round"/>' +
          '<path class="n" d="M42 17 L52 17" stroke-width="3.5" stroke-linecap="round"/>') },
      ]
    },

    /* ---------------- 神话象征 ---------------- */
    {
      key: "myth", name: "神话象征", items: [
        { k: "angel", n: "天使", s: s(
          '<path class="l" d="M27 26 Q3 12 5 34 Q8 51 27 44 Z"/>' +
          '<path class="l" d="M37 26 Q61 12 59 34 Q56 51 37 44 Z"/>' +
          '<ellipse class="a" cx="32" cy="7" rx="12" ry="3.5"/>' +
          '<path d="M32 22 L45 62 L19 62 Z"/>' +
          '<rect x="26" y="20" width="12" height="20" rx="6"/>' +
          '<circle cx="32" cy="14" r="7"/>') },

        { k: "dragon", n: "龙", s: s(
          '<path class="n" d="M10 54 L2 44" stroke-width="7" stroke-linecap="round"/>' +
          '<path class="n" d="M10 52 Q18 28 32 40 Q46 52 54 30" stroke-width="11" stroke-linecap="round"/>' +
          '<path class="b" d="M28 34 Q16 6 32 6 Q44 7 41 22 Z"/>' +
          '<circle cx="56" cy="26" r="9"/>' +
          '<path class="a" d="M52 19 L48 7 L57 14 Z"/>' +
          '<circle class="a" cx="60" cy="24" r="2"/>') },

        { k: "shadow", n: "暗影", s: s(
          '<path d="M32 3 Q45 3 45 19 Q45 30 41 34 L47 61 L17 61 L23 34 Q19 30 19 19 Q19 3 32 3 Z"/>' +
          '<circle class="a" cx="27" cy="21" r="2.4"/>' +
          '<circle class="a" cx="37" cy="21" r="2.4"/>') },

        { k: "chest", n: "宝箱", s: s(
          '<rect class="b" x="11" y="20" width="5" height="11" rx="2.5"/>' +
          '<rect class="b" x="48" y="20" width="5" height="11" rx="2.5"/>' +
          '<rect x="5" y="28" width="54" height="33" rx="4"/>' +
          '<path d="M5 28 Q5 10 32 10 Q59 10 59 28 Z"/>' +
          '<rect class="a" x="27" y="26" width="10" height="16" rx="2.5"/>' +
          '<circle class="l" cx="32" cy="34" r="2.4"/>') },

        { k: "mirror", n: "镜子", s: s(
          '<rect x="27" y="42" width="10" height="20" rx="5"/>' +
          '<ellipse class="a" cx="32" cy="24" rx="21" ry="23"/>' +
          '<ellipse class="b" cx="32" cy="24" rx="15" ry="17"/>' +
          '<path class="l" d="M24 16 Q30 12 36 12" stroke="none" fill="none"/>') },

        { k: "clock", n: "时钟", s: s(
          '<path class="n" d="M22 58 L20 63 M42 58 L44 63" stroke-width="4" stroke-linecap="round"/>' +
          '<circle class="l" cx="32" cy="30" r="25"/>' +
          '<path class="n" d="M32 10 V16 M32 44 V50 M12 30 H18 M46 30 H52" stroke-width="3" stroke-linecap="round"/>' +
          '<path class="n" d="M32 30 V16 M32 30 L43 36" stroke-width="3.5" stroke-linecap="round"/>' +
          '<circle class="a" cx="32" cy="30" r="2.6"/>') },
      ]
    },

    /* ---------------- 器物 ---------------- */
    {
      key: "object", name: "器物", items: [
        { k: "key", n: "钥匙", s: s(
          '<circle class="n" cx="17" cy="32" r="12" stroke-width="6"/>' +
          '<rect x="25" y="29" width="35" height="6" rx="3"/>' +
          '<rect x="43" y="35" width="5" height="10" rx="2.5"/>' +
          '<rect x="52" y="35" width="5" height="10" rx="2.5"/>') },

        { k: "ladder", n: "梯子", s: s(
          '<rect x="14" y="3" width="6" height="59" rx="3"/>' +
          '<rect x="44" y="3" width="6" height="59" rx="3"/>' +
          '<rect x="14" y="14" width="36" height="5.5" rx="2.7"/>' +
          '<rect x="14" y="28" width="36" height="5.5" rx="2.7"/>' +
          '<rect x="14" y="42" width="36" height="5.5" rx="2.7"/>' +
          '<rect x="14" y="56" width="36" height="5.5" rx="2.7"/>') },

        { k: "well", n: "井", s: s(
          '<rect class="n" x="13" y="16" width="4" height="30" stroke-width="4"/>' +
          '<rect class="n" x="47" y="16" width="4" height="30" stroke-width="4"/>' +
          '<rect class="n" x="15" y="20" width="34" height="3" stroke-width="3"/>' +
          '<rect class="a" x="28" y="21" width="9" height="9" rx="2"/>' +
          '<path d="M4 34 L32 12 L60 34 Z"/>' +
          '<rect x="9" y="44" width="46" height="18" rx="5"/>' +
          '<ellipse class="b" cx="32" cy="44" rx="15" ry="5"/>') },

        { k: "lamp", n: "路灯", s: s(
          '<rect x="28" y="18" width="6" height="44" rx="3"/>' +
          '<rect x="28" y="12" width="22" height="5" rx="2.5"/>' +
          '<path class="a" d="M40 17 L52 17 L57 25 L57 40 L35 40 L40 25 Z"/>' +
          '<rect class="l" d="M40 22 L53 22 L55 28 L38 28 Z"/>' +
          '<rect x="20" y="59" width="22" height="5" rx="2.5"/>') },

        { k: "flag", n: "旗帜", s: s(
          '<rect x="9" y="3" width="5" height="59" rx="2.5"/>' +
          '<path class="a" d="M14 10 Q29 3 43 10 Q50 14 59 8 L59 34 Q50 40 43 36 Q29 29 14 36 Z"/>') },

        { k: "book", n: "书", s: s(
          '<path d="M3 14 Q18 6 32 14 Q46 6 61 14 L61 52 Q46 44 32 52 Q18 44 3 52 Z"/>' +
          '<path class="n" d="M32 14 V52" stroke-width="2.5"/>' +
          '<rect class="a" x="9" y="24" width="16" height="2.8" rx="1.4"/>' +
          '<rect class="a" x="9" y="32" width="13" height="2.8" rx="1.4"/>' +
          '<rect class="a" x="39" y="24" width="16" height="2.8" rx="1.4"/>' +
          '<rect class="a" x="39" y="32" width="13" height="2.8" rx="1.4"/>') },
      ]
    },
  ];

  /* 打平，便于按 key 查找 */
  var ALL = [];
  CATS.forEach(function (c) {
    c.items.forEach(function (it) { it.cat = c.key; it.catName = c.name; ALL.push(it); });
  });

  function find(k) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].k === k) return ALL[i];
    return null;
  }

  return { CATS: CATS, ALL: ALL, find: find };
})();
