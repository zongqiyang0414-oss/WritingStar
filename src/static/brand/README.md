# 写字星正式品牌素材

用户于2026-10-16确认横版和图标版 Logo 作为后续开发使用的品牌素材。2026-10-22按浏览器反馈新增透明横版衍生素材，原始文件继续保留。

| 文件 | 用途 | 原图 |
| --- | --- | --- |
| [writingstar-logo-horizontal.png](writingstar-logo-horizontal.png) | 页面页头、登录页、文档等横向品牌展示；含中文和英文 | 铅笔镂空流星横版，原始生成编号 exec-10b99098-b98d-42e7-b46b-1d12e1594783 |
| [writingstar-logo-app.png](writingstar-logo-app.png) | 微信小程序、App、圆形头像展示；上图下字，仅中文 | 圆形裁切安全留白方形版，原始生成编号 exec-bddaebae-f5c1-4cb5-89c2-3326ad2bddaa |
| [writingstar-logo-horizontal-transparent.png](writingstar-logo-horizontal-transparent.png) | 页面页头等需要透出背景的横向品牌展示；含中文和英文 | 由确认过的横版原图通过图像编辑生成透明衍生版，生成编号 exec-08151926-b995-445c-bd52-4c263b7891a7 |

## 使用约定

- 后续新增或替换品牌展示统一使用以上文件，不使用早期 WS 融合草稿或其他历史 Logo。
- 保持原始长宽比，使用等比缩放（如 `mode="aspectFit"` / `object-fit: contain`），不拉伸、不压扁。
- 图标版保留原有白色留白，圆形展示由容器裁切，避免进一步放大裁掉文字和流星尾迹。
- 原横版文件实际为1914×822的RGB PNG，没有alpha通道，因此白底属于图片本身；图标版原图也继续保留原有白色留白。透明横版衍生文件为1914×822的RGBA PNG，alpha范围0—255，外部背景、铅笔镂空及字形孔洞可透出页面底色。
- 透明横版保留“写字星 / writingstar”、橙色流星铅笔及整体排版；它由图像编辑模型去底生成，边缘存在细微变化，不作为逐像素无损抠图或原始矢量文件。原图继续作为品牌确认依据。
- 透明图仍有安全留白；布局可等比裁出可见图形，不应拉伸。实际主体（alpha大于128）包围盒约为`(91,184)—(1741,720)`，全alpha非零包围盒为`(49,27)—(1785,784)`；低透明边缘不宜作为视觉对齐边界。
- 本次收录确立品牌素材，不代表已完成各业务页面的 Logo 替换或微信平台图标配置。

![横版](writingstar-logo-horizontal.png)

![图标版](writingstar-logo-app.png)


![透明横版](writingstar-logo-horizontal-transparent.png)
