# Element Sets Archive

此目录用于归档元素作图工作台导出的元素组合 JSON。

- 工作台默认导出文件名：`element-sets.json`
- 示例文件：`element-sets.example.json`
- 导入入口：作图工作台 → 元素序列与平均方式 → 导入组合

一次导出会包含浏览器中当前保存的全部元素组合。浏览器下载完成后，可以把文件复制到此目录，并根据数据类型重命名，例如：

```text
ree-element-sets.json
normalized-element-sets.json
lunar-basalt-element-sets.json
```

导入时的规则：

- 一个文件可以包含多个组合。
- 同名组合会使用导入内容更新。
- 空名称、空组合和非数组内容会被忽略。
- 重复元素名称会自动去重。
- 当前数据中不存在的元素名称仍会保存在组合中；载入组合时只勾选当前数据实际拥有的列。

此目录中的 JSON 是长期归档文件。浏览器 `localStorage` 中的元素组合是工作时的快捷副本，两者不会自动同步。
