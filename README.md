# 🎄 圣诞联机装修树 (Christmas Multiplayer Decoration)

一个基于 **React**, **Three.js** 和 **FastAPI** 开发的实时多人联机 3D 圣诞互动游戏。玩家可以在温馨的雪夜场景中自由移动，装饰圣诞树，并与其他玩家实时聊天。

## ✨ 核心特性

-   **实时多人联机**：基于 WebSocket 的高效状态同步，支持多玩家同屏互动。
-   **3D 互动装修**：
    -   可自由放置铃铛、小帽子、彩条等装饰物到圣诞树上。
    -   支持点击树体精准挂载装饰。
    -   精美的圣诞树模型，包含树干、根部及半透明层次感叶片。
-   **卡通角色系统**：
    -   统一的“乌萨奇”可爱形象。
    -   流畅的行走动画（包含惯性、转向平滑、身体倾斜等物理细节）。
    -   可切换的圣诞帽饰品。
-   **精美环境渲染**：
    -   **动态天气**：持续飘落的雪花系统。
    -   **夜空特效**：包含月亮、星星以及偶尔飞过的麋鹿雪橇。
    -   **后期特效**：集成 Bloom（辉光）效果，让灯光和装饰更具节日氛围。
    -   **实时阴影**：增强场景的深度感和真实感。
-   **实时聊天系统**：
    -   支持多人实时聊天。
    -   记录发送者 IP。
    -   **管理员功能**：支持通过密码 (`20251225`) 清空聊天记录。
-   **持久化存储**：使用 MySQL 存储聊天日志和房间装修状态，使用 Redis 处理高频位置同步和热数据缓存。

## 🛠️ 技术栈

### 前端 (Frontend)
-   **Framework**: React 18 + TypeScript
-   **Rendering**: Three.js (WebGL)
-   **Build Tool**: Vite
-   **Post-processing**: UnrealBloomPass

### 后端 (Backend)
-   **Framework**: FastAPI (Python 3.8+)
-   **Database**: MySQL (SQLAlchemy 2.0)
-   **Cache/Queue**: Redis
-   **Real-time**: WebSockets

## 🚀 快速开始

### 1. 环境准备
确保已安装 Node.js, Python 3.8+, MySQL 和 Redis。

### 2. 后端配置
1.  进入后端目录：
    ```bash
    cd python
    ```
2.  安装依赖：
    ```bash
    pip install -r requirements.txt
    ```
3.  配置环境变量：
    在 `python/app/config.py` 或通过环境变量设置 MySQL 和 Redis 连接串。
4.  启动服务器：
    ```bash
    python -m app
    ```

### 3. 前端配置
1.  进入前端目录：
    ```bash
    cd frontend
    ```
2.  安装依赖：
    ```bash
    npm install
    ```
3.  启动开发服务器：
    ```bash
    npm run dev
    ```

### 4. 访问游戏
打开浏览器访问 `http://localhost:3000`。

## 🎮 操作说明

-   **WASD / 方向键**：控制角色移动。
-   **点击树上插槽**：将选中的装饰品挂载到对应位置。
-   **右侧 UI 面板**：
    -   选择不同的装饰品类型。
    -   切换戴上/摘下圣诞帽。
-   **左下角聊天框**：
    -   输入文字进行交流。
    -   管理员点击右下角微小入口，输入密码 `20251225` 可清空历史。

## 📄 开源协议

本项目采用 MIT 协议。
