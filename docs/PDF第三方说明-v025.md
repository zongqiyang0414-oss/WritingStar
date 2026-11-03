# PDF第三方说明 · v0.25

- `pdfjs-dist` **6.5.438**，Mozilla PDF.js，Apache-2.0，来源 https://github.com/mozilla/pdf.js 。仅在设备本地解析／渲染上传的PDF，未接外部转换服务。固定版本并保留package-lock；微信引擎由本包legacy主模块与worker模块自包含构建，不能使用不同版本worker。
- `web-streams-polyfill` **4.5.0**，MIT，来源 https://github.com/MattiasBuelens/web-streams-polyfill 。为缺少ReadableStream的原生JS环境提供标准流实现。
- 构建时将PDF.js `LICENSE`、流库`LICENSE.web-streams-polyfill`放入输出`pdf-import/`。字体／CMap目录中的原许可证随对应资源原样复制。
- Node验证使用PDF.js的可选`@napi-rs/canvas`依赖绘制真实像素；未把该Node原生模块放入小程序或网页运行包。代码依赖及许可证可在相同锁文件安装后核对，不另行下载用户文档或上传测试文件。
