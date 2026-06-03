# munch.tv - Silicon Valley vocab prototype

语言：[English](README.md) | 简体中文

构建一个高对比度、卡片式的 Silicon Valley 词汇学习原型，支持中英双语闪卡和键盘友好的交互。

## 使用场景

- 为创业和产品术语创建交互式词汇学习原型。
- 将 munch.tv 风格的卡片流程改造成其他双语词汇表。
- 打包包含首页、节目页、单集页和词条详情页的精简学习体验。

## 试用

```bash
od plugin validate .
od plugin install .
od plugin apply munch-tv-prototype --input topic="Silicon Valley vocabulary" --input audience="Chinese-speaking founders"
```

## 文件

- `SKILL.md` - 可移植 agent 指令。
- `open-design.json` - 带版本的 Open Design marketplace 与 apply 元数据。
- `preview/` - 从 Open Design 项目复制的 HTML 原型和页面示例。
- `assets/` - 原型使用的源说明和词汇内容。

## Capabilities

- `prompt:inject` 让插件接收用户的主题、受众和改造需求。
- `fs:write` 让插件创建或更新本地原型文件。
