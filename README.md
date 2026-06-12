# 公开版元素散点图工作台

这是纯前端版本，适合部署成公开网址。用户打开网页后自行上传 Excel，数据只在浏览器中解析和作图，不会上传到服务器。

## 本地预览

当前本地预览地址：

```text
http://127.0.0.1:8503
```

## 部署方式

把本目录中的 `index.html` 上传到任意静态网页托管服务即可，例如：

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

## 依赖

页面通过 CDN 加载 SheetJS：

```html
https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
```

因此公开部署后，访问者需要能访问该 CDN。若希望完全离线部署，可以把 `xlsx.full.min.js` 下载到同目录并把脚本地址改成本地文件。

## 当前功能

- 上传 `.xlsx/.xls/.xlsm/.csv`
- 选择工作表
- 选择 X/Y 轴
- 按 `Type` 分组和样式化散点
- Type 筛选
- log 坐标
- 手动坐标范围
- 新增简单比值列
- 导出当前图为 SVG
