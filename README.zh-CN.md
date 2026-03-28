# Polar Mapper

[English README](./README.md)

一个面向晶圆厚度/轮廓数据的轻量级可视化工具。项目目前是纯前端静态页面，不依赖构建流程，打开即可使用。它支持将离散测点数据映射为 2D 等高线图，并生成 1D 剖面曲线，适合快速查看 wafer profile、比较两片 wafer 的差值分布，以及做一些基础统计分析。

## 功能概览

- 支持两套内置坐标模板：`49P` 和 `361P`
- 支持单片厚度图和双片差值图 `W2 - W1`
- 自动计算基础统计量：
  - `Avg`
  - `Max`
  - `Min`
  - `NU%`（Non-Uniformity）
  - `S2S%`（Site-to-Site / 平面倾斜相关指标）
- 使用 `IDW` 插值生成 2D contour map
- 使用高斯模糊做后处理，减少局部尖峰和锯齿感
- 支持 1D line profile：
  - `Horizontal (Y≈0)`
  - `Vertical (X≈0)`
  - `Circumference (0°-360°)`
- 支持本地保存常用 THK 数据
- 支持导入/导出备份 JSON
- 支持历史结果卡片和备注

## 界面说明

页面主入口是 [`THK MAP v9.html`](./THK%20MAP%20v9.html)。

左侧输入区：

- `XY Coord Pattern`
  - 选择测点坐标模板，目前支持 `49P` 和 `361P`
- `Wafer 1 THK`
  - 输入或加载第一片 wafer 的厚度数据
- `Wafer 2 THK`
  - 可选
  - 如果填写，系统会自动计算 `W2 - W1`
- `Generate Maps`
  - 生成 2D 图和 1D 剖面图

右侧图形区：

- `2D Contour Map`
  - 显示插值后的 wafer map
  - 可切换色表、颜色范围、等高线层数、标签显示
- `IDW Tuning`
  - 支持自动/手动调整插值幂次与 blur 次数
- `Wafer Statistics`
  - 显示历史结果卡片
  - 点击历史卡片可恢复对应图形
- `1D Line Profile`
  - 显示某一方向上的剖面曲线

## 输入数据格式

### 1. 厚度数据

厚度数据按“每行一个数值”的形式输入，例如：

```text
5.1200
5.0830
5.0975
5.1012
...
```

要求：

- `49P` 模式下需要 49 个数值
- `361P` 模式下需要 361 个数值
- 可以带空行，程序会自动忽略无法解析的行
- 当 `Wafer 2 THK` 有值时，长度必须与 `Wafer 1 THK` 一致

### 2. 坐标模板

坐标模板定义在 [`coords.js`](./coords.js) 中。当前内置：

- `49P`
- `361P`

如果后续要扩展新的测点格式，只需要在 `rawCoords` 中补充新的坐标数据，解析逻辑会自动生成对应的 `COORD_PRESETS`。

## 结果与统计说明

### 1. 单片模式

当只提供 `Wafer 1 THK` 时，页面生成该 wafer 的 thickness map。

统计项含义：

- `Avg`：平均值
- `Max`：最大值
- `Min`：最小值
- `NU%`：`((Max - Min) / (2 * Avg)) * 100`
- `S2S%`：基于平面拟合得到的全片倾斜相关指标

### 2. 差值模式

当同时提供 `Wafer 1 THK` 和 `Wafer 2 THK` 时，页面生成：

```text
Delta = W2 - W1
```

在差值模式下：

- 色表会使用适合正负差异的配色
- `mapLbl` 会变成 `Delta (W2-W1)`
- `NU%` 和 `S2S%` 会显示为 `N/A`

## 可视化与算法说明

### 1. 2D 插值

工具使用 `IDW (Inverse Distance Weighting)` 对离散测点进行插值，生成规则网格上的 `contour` 数据。

可调参数：

- `Power`
  - 控制距离衰减速度
  - 数值越高，局部点影响越强
- `Blur`
  - 使用高斯模糊进行后处理
  - 用于减弱噪声、降低局部尖峰

工具默认提供 `Auto` 模式，会根据点数自动选择参数：

- `49P` 更平滑、更偏全局
- `361P` 更偏局部细节，并配更高 blur

### 2. 1D 剖面

提供三种剖面方式：

- `Horizontal (Y≈0)`：提取接近水平中心线的数据点
- `Vertical (X≈0)`：提取接近垂直中心线的数据点
- `Circumference (0°-360°)`：提取靠近 wafer 边缘的点，并按角度排序

### 3. 颜色与显示控制

支持：

- 切换颜色表
- 自动或手动设置颜色范围
- 调整等高线层数
- 显示/隐藏原始测点数值标签

## 数据保存与备份

工具会使用浏览器 `localStorage` 保存部分本地数据。

当前用到的主要 key：

- `wafer_app_thk`
- `wafer_app_notes`

这意味着：

- 同一个浏览器、同一个 origin 下，刷新页面后数据还会在
- `file://` 和 `http://localhost:xxxx` 是不同的存储空间
- 换一个端口，例如 `8765` 和 `8766`，也会被视为不同 origin

### 导出备份

点击 `Export Backup` 会导出一个 JSON 文件。当前仓库中提供的 [`wafer_data_backup.json`](./wafer_data_backup.json) 为脱敏 demo 数据，可用于演示导入流程。

### 导入备份

点击 `Import Data` 并选择导出的 JSON 文件即可恢复：

- 保存过的 THK 数据
- 历史结果
- 备注

## 本地运行

### 方式一：直接打开文件

直接双击 [`THK MAP v9.html`](./THK%20MAP%20v9.html) 即可。

适合：

- 快速查看
- 个人本地使用

### 方式二：通过 localhost 打开

推荐使用本地 HTTP 服务，尤其是在调试缓存、存储隔离或准备部署到 GitHub Pages 时。

```bash
cd "Polar Mapper V0.4.3"
python3 -m http.server 8766
```

浏览器访问：

```text
http://localhost:8766/THK%20MAP%20v9.html
```

## 文件结构

```text
Polar Mapper V0.4.3/
├── THK MAP v9.html        # 主页面，包含 UI、统计逻辑、绘图逻辑
├── coords.js              # 坐标模板数据库与自动解析逻辑
├── wafer_data_backup.json # 脱敏后的 demo 备份数据
├── README.md              # 英文版项目说明
├── README.zh-CN.md        # 中文版项目说明
└── LICENSE                # MIT 许可证
```

## 技术栈

- 原生 `HTML`
- 原生 `CSS`
- 原生 `JavaScript`
- [Plotly.js](https://plotly.com/javascript/) 用于 2D / 1D 可视化

说明：

- 当前通过 CDN 加载 Plotly
- 如果网络环境受限，页面可能无法正常加载 Plotly 脚本

## 已知限制

- 当前主逻辑集中在单个 HTML 文件中，便于快速迭代，但不利于后续维护和模块化
- 页面仍依赖 `innerHTML` 拼接部分 UI，如果后续要做公开分发，建议改为更安全的 DOM 构造方式
- 仓库当前主入口文件名包含空格，部署到 GitHub Pages 虽然可用，但后续更适合改为 `index.html`
- 目前没有自动化测试
- 目前没有专门的移动端交互优化，主要面向桌面浏览器

## 后续可改进方向

- 将主逻辑拆分为独立 JS 模块
- 增加更多坐标模板，例如 `137P`
- 增加 CSV / TSV 导入
- 增加截图导出或图像导出
- 增加一键清空本地缓存按钮
- 改造为更适合 GitHub Pages 的标准静态站点结构

## 隐私与样例数据说明

仓库中的 [`wafer_data_backup.json`](./wafer_data_backup.json) 已做脱敏处理：

- 不包含真实 wafer ID
- 不包含真实生产厚度数据
- 仅保留与演示相关的点数结构和示例数值分布

如果你要公开发布这个项目，建议继续保持：

- 不上传真实生产样本
- 不上传客户信息
- 不上传公司内部标识信息

## License

MIT. See [`LICENSE`](./LICENSE).
