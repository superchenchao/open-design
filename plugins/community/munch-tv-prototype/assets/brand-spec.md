# brand-spec — TV Drama Vocab (Silicon Valley)

## 来源

- **结构参考**: ogden.munch.love — 卡片式 850 词,中英对照,键盘翻转,极简高对比。
- **视觉参考**: HBO《硅谷》剧集 — 科技灰 + Pied Piper 绿,混凝土/玻璃/木质,startup 办公室现代极简。

## 颜色 (OKLch)

```css
:root {
  --bg:      oklch(97% 0.004 150);   /* off-white concrete */
  --surface: oklch(100% 0 0);
  --fg:      oklch(18% 0.012 150);   /* near-black ink */
  --muted:   oklch(50% 0.012 150);   /* secondary text */
  --border:  oklch(90% 0.006 150);   /* hairline */
  --accent:  oklch(68% 0.18 145);    /* Pied Piper electric green */
  --accent-ink: oklch(28% 0.10 145); /* dark green for filled buttons */
  --shell:   oklch(12% 0.006 150);   /* dark deck/iframe surround */
}
```

- 背景永远是冷白(略偏绿,呼应混凝土感),不要 beige/peach/暖白。
- 绿色一屏最多用两次 — 主操作 + 高亮单词。
- 高亮台词中的目标词时,使用 `background: oklch(94% 0.06 145)` 加 1px 绿色下划线。

## 字体

```css
--font-display: 'Iowan Old Style', 'Charter', Georgia, serif;
--font-body:    -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;
```

- 单词本身用 serif display(编辑感,呼应 ogden)。
- 中文释义、按钮、UI 用 sans。
- 时间戳、剧集编号、进度计数用 mono。

## 排版/布局规则

- **手机优先** — 390×844(iPhone 15 Pro)。所有屏幕用 `/frames/iphone-15-pro.html` 框。
- **无圆角浮夸** — 卡片 8-12px 圆角,按钮 8px。混凝土感拒绝 24px+ 大圆角。
- **无阴影** — 用 1px hairline border 区分层级。
- **绿色仅强调** — 不要绿色渐变背景。绿色只用在: ① 主 CTA 按钮; ② 当前学习的单词高亮。
- **底部安全区** — iPhone 15 Pro 底部 home indicator 留 34px 安全区。

## 内容真实度

- 取材《硅谷》第 1 季的真实台词和真实出现过的科技/创业词汇:
  pivot, burn rate, ramen profitable, vesting, 10x engineer, stack rank,
  middle-out, lossless compression, NDA, term sheet, equity, cap table,
  acquihire, MVP, churn, etc.
- 例句必须是剧中真实出现过(或风格上完全符合)的台词,不要发明数据。
- 中文释义:学习者能直接用的口语化解释 + 一个剧中场景注释,不要词典式翻译。
