# 第三方组件声明

本插件自有代码以 MIT 许可发布，见 [LICENSE](LICENSE)。

下面两个组件由本插件分发（源码或二进制产物均在内），按其各自许可的要求，
此处逐字保留原始版权声明与许可全文。

---

## jmuxer

- 来源：https://github.com/webstream-labs/jmuxer
- 许可：MIT
- 用途：H.264 视频流在网页端解码播放
- 分发形式：`resources/jmuxer.min.js`（压缩版；该文件内未带许可头，故在此声明）

```text
License
(The MIT License)
Copyright (c) 2018 Samir Das 

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## HOScrcpy

- 来源：https://gitcode.com/OpenHarmonyToolkitsPlaza/HOScrcpy
- 许可：MIT
- 用途：sidecar 桥接程序所依赖的鸿蒙投屏实现
- 分发形式：`resources/hosScrcpy-1.0.18-beta.jar`（含其编译产物），
  以及基于其接口编写的 `Dev/src/Main.java`

> **上游声明缺失。** HOScrcpy 仓库的 LICENSE 只填了 MIT 模板，版权人一栏是未填写
> 的占位符 `Copyright (c) [year] [fullname]`；其 jar 内部也没有携带该许可
> （`META-INF/LICENSE.txt` 是它打包进来的 Checker Framework 的声明，与本项目无关）。
> 已就此向上游提 issue，等待其补齐。
>
> 本项声明由本插件补充于 **2026-09-22**。上游补齐版权人后，这里同步更新为真实署名。
> 下面按上游 LICENSE 原样照录，未作任何改动：

```text
MIT License
Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
