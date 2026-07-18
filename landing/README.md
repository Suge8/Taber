# Taber Landing Page

双语(EN/中文)产品营销落地页,零构建、零运行时依赖的单文件静态站点。

## 预览

```bash
cd landing && python3 -m http.server 8765
# 打开 http://localhost:8765
```

也可直接双击 `index.html` 打开。

## 部署

已绑定 Vercel 项目 `taber-landing`(root directory = `landing`,git 集成 Suge8/taber `main` 分支):
推送到 `main` 即自动部署。生产地址:**https://taber-landing.vercel.app**

手动部署任意静态托管时,整个 `landing/` 目录即为完整站点(约 1.6MB)。

## 页面结构(营销优先级排序)

1. **Hero**:大标题 + 实时 Agent 模拟器(3 个双语任务循环,可暂停),配 gpt-image 生成、亮度阈值抠图的透明 3D 陶瓷光标,指针驱动 3D 倾斜
2. 任务跑马灯(双语示例任务)
3. 实拍演示视频(裁剪过的真实录屏,进入视口才播放,滚动缩放到位)
4. 证据区(真实产品截图 + 三个信任点,视差 + 微旋转)
5. 站点技能(截图 + 透明 3D 文档 + 内置 API 捷径)
6. 模型与隐私(BYOM + 本地低权限)
7. Under the hood 一行流(六个固定工具 + 主题说明,刻意低调)
8. CTA + 页脚

## 滚动编排

单一 rAF 循环驱动(rAF 节流):Hero 退场(文案上浮淡出 / 面板下沉缩放 / 光标旋走)、演示视频缩放上浮、截图视差 + 微旋转、3D 文档滚动旋转。全部 transform/opacity;`prefers-reduced-motion` 时全部静止。

## 说明

- **双语**:跟随 `localStorage(taber-lang)`,默认探测浏览器语言;字典在 `index.html` 内 `I18N`。
- **资产**:产品截图、演示视频、logo 来自 `design/promo/`(真实资产);3D 光标为 gpt-image 生成;字体自托管 Geist 可变字重 woff2。
- **性能**:首屏约 450KB;视频 `preload="none"` 且已裁剪去桌面黑边(1490×894)。
- **动效**:全部 transform/opacity;`prefers-reduced-motion` 时模拟器降级为静态完成态,倾斜/漂浮/跑马灯全部静止。
