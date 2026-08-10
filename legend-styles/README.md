# Legend Styles Archive

此目录用于归档元素作图工作台导出的图例样式 JSON。

- 工作台默认导出文件名：`legend-styles.json`
- 示例文件：`legend-styles.example.json`
- 导入入口：作图工作台 → 图例样式 → 导入图例设置

浏览器下载文件后，可以把需要长期保留的 `legend-styles.json` 复制到此目录，并根据用途重命名，例如：

```text
apollo-mission-legend.json
lunar-basalt-type-legend.json
```

导入图例时，工作台按当前图例分类名称匹配样式。分类名称不同的项目不会被强制应用。

此目录中的文件是可交换的配置，不是工作台程序代码。删除目录中的归档文件不会删除浏览器本地已经保存的样式；清理浏览器数据也不会删除已经归档到这里的 JSON。
