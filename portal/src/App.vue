<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const menuOpen = ref(false)
const headerCompact = ref(false)
const configuredWorkbenchUrl = import.meta.env.VITE_WORKBENCH_URL?.trim() || ''
const workbenchUrl = configuredWorkbenchUrl || '#workflow'
const workbenchTarget = configuredWorkbenchUrl ? '_blank' : undefined
const workbenchLabel = configuredWorkbenchUrl ? '打开工作台' : '查看部署方式'
const productPreviewUrl = `${import.meta.env.BASE_URL}shotai-product-preview.png`

function handleScroll() {
  headerCompact.value = window.scrollY > 24
}

function closeMenu() {
  menuOpen.value = false
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="portal">
    <a class="skip-link" href="#main">跳转到主要内容</a>

    <header class="site-header" :class="{ compact: headerCompact }">
      <a class="wordmark" href="#top" aria-label="ShotAI 首页" @click="closeMenu">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 24.5C12 23 20.5 17 27 5.5" />
          <path d="m16.5 18.5 3.8-9 6.7-4-2.2 7.5-8.3 5.5Z" />
          <path d="M8 26h17" />
        </svg>
        <span>SHOT<i>AI</i></span>
        <small>完全离线的智能助手</small>
      </a>

      <button
        class="menu-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="site-navigation"
        aria-label="打开或关闭导航"
        @click="menuOpen = !menuOpen"
      >
        <span></span><span></span>
      </button>

      <nav id="site-navigation" :class="{ open: menuOpen }" aria-label="主要导航">
        <a href="#workbench" @click="closeMenu">工作台</a>
        <a href="#creation" @click="closeMenu">图片创作</a>
        <a href="#capabilities" @click="closeMenu">能力</a>
        <a href="#workflow" @click="closeMenu">流程</a>
        <a href="#lan" @click="closeMenu">多人使用</a>
      </nav>

      <a
        class="header-cta"
        :href="workbenchUrl"
        :target="workbenchTarget"
        :rel="workbenchTarget ? 'noreferrer' : undefined"
      >
        {{ workbenchLabel }}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </a>
    </header>

    <main id="main">
      <section id="top" class="hero">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="hero-grid"></div>

        <div class="hero-content">
          <div class="mission-label">
            <span class="live-dot"></span>
            SHOTAI 1.1.3 · WINDOWS 客户端 · 完全离线
          </div>
          <h1>本地 AI，<br /><span>现在也会创作</span></h1>
          <p class="hero-lead">
            在一台 Windows 电脑上完成对话、看图、读文档、资料问答与图片创作。
            支持参考图修改，其他电脑打开浏览器也能共享同一套本地能力。
          </p>
          <div class="hero-actions">
            <a
              class="button button-primary"
              :href="workbenchUrl"
              :target="workbenchTarget"
              :rel="workbenchTarget ? 'noreferrer' : undefined"
            >
              {{ workbenchLabel }}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </a>
            <a class="button button-ghost" href="#workflow">查看使用步骤</a>
          </div>
          <div class="hero-meta">
            <div><span>核心能力</span><strong>对话 + 创作</strong></div>
            <div><span>数据边界</span><strong>本机与内网</strong></div>
            <div><span>使用方式</span><strong>桌面端 + 浏览器</strong></div>
          </div>
        </div>

        <div class="hero-visual" aria-label="ShotAI 工作台界面示意">
          <div class="visual-index">工作台预览</div>
          <div class="workbench-frame">
            <div class="mock-sidebar">
              <div class="mock-brand">
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <path d="M4 24.5C12 23 20.5 17 27 5.5" />
                  <path d="m16.5 18.5 3.8-9 6.7-4-2.2 7.5-8.3 5.5Z" />
                  <path d="M8 26h17" />
                </svg>
                <span>SHOTAI</span>
              </div>
              <div class="mock-new">+ 新建对话 <i></i></div>
              <div class="mock-nav active"><b>01</b><span>对话</span></div>
              <div class="mock-nav"><b>02</b><span>我的资料</span></div>
              <div class="mock-nav"><b>03</b><span>图片创作</span></div>
              <div class="mock-nav"><b>04</b><span>运行检查</span></div>
              <div class="mock-offline"><span class="live-dot"></span> 本地服务已连接</div>
            </div>
            <div class="mock-main">
              <div class="mock-topbar">
                <div><small>当前对话</small><strong>离线智能会话</strong></div>
                <div class="mock-model">能力自动分工 · 已就绪</div>
              </div>
              <div class="mock-secure">
                <span>◇</span>
                <div><strong>对话、识图与图片创作均已就绪</strong><small>ShotAI 会自动选择对应的本地模型</small></div>
              </div>
              <div class="mock-chat">
                <div class="mock-avatar">SA</div>
                <div class="mock-message">
                  <small>SHOTAI</small>
                  <p>可以直接在输入框里提问，也可以添加参考图创作新的画面。</p>
                  <ul>
                    <li>本地对话、看图和文档总结</li>
                    <li>文字生成图片与参考图修改</li>
                    <li>创作过程可停止、预览和保存</li>
                  </ul>
                </div>
              </div>
              <div class="mock-input">
                输入问题，或添加参考图开始创作…
                <span>对话 · 文件 · 创作</span>
              </div>
            </div>
          </div>
          <div class="visual-caption">
            <span>界面预览</span>
            <p>对话、资料与图片创作统一在一个入口</p>
          </div>
        </div>

        <a class="scroll-cue" href="#manifest">
          <span>向下查看更多</span>
          <i></i>
        </a>
      </section>

      <section id="manifest" class="trust-rail" aria-label="产品关键特性">
        <span>完全离线</span>
        <span>本地图片生成与修改</span>
        <span>Windows 独立客户端</span>
        <span>内网浏览器共享</span>
      </section>

      <section class="manifest section">
        <div class="section-number">01 / 产品介绍</div>
        <div class="manifest-copy">
          <p class="eyebrow">产品使命</p>
          <h2>从理解内容，<br />到生成新内容。</h2>
        </div>
        <div class="manifest-body">
          <p>
            ShotAI 将模型、对话记录、文件分析、单位资料和图片创作集中在一台电脑中，
            全程不依赖云端 AI 服务。
          </p>
          <p>
            Windows 客户端负责启动与托盘常驻，内网使用者无需安装模型或运行组件。
          </p>
        </div>
      </section>

      <section id="workbench" class="section product-showcase">
        <div class="showcase-heading">
          <div>
            <div class="section-number">02 / 工作台</div>
            <p class="eyebrow">真实工作台预览</p>
            <h2>一个入口，完成日常 AI 工作。</h2>
          </div>
          <p>
            从日常对话到图片、文件和单位资料问答，再到本地图片生成与修改，
            所有能力都从同一个输入框开始。
          </p>
        </div>
        <figure class="product-preview-frame">
          <img
            :src="productPreviewUrl"
            width="1672"
            height="941"
            loading="lazy"
            alt="ShotAI 离线 AI 工作台，展示多人使用、模型和文件功能"
          />
          <figcaption>
            <span>工作台实际界面</span>
            <span>对话 · 资料 · 图片创作 · 内网共享</span>
          </figcaption>
        </figure>
      </section>

      <section id="creation" class="creation-section">
        <div class="section creation-inner">
          <div class="creation-copy">
            <div class="section-number">03 / 图片创作</div>
            <p class="eyebrow">从一句描述，到一张新图</p>
            <h2>能生成，<br />也能照着改。</h2>
            <p>
              直接在聊天输入框切换到图片创作。输入画面要求即可本地生成；
              添加一张参考图后，ShotAI 会自动进入图片修改并沿用原图比例。
            </p>
            <ul class="creation-points">
              <li><span>01</span><strong>文生图</strong><small>描述画面，选择比例，直接生成</small></li>
              <li><span>02</span><strong>参考图修改</strong><small>添加原图，并调整改动幅度</small></li>
              <li><span>03</span><strong>过程可控</strong><small>显示进度，可随时停止、预览和保存</small></li>
            </ul>
          </div>

          <div class="creation-visual" role="img" aria-label="ShotAI 本地图片创作与参考图修改示意">
            <div class="studio-bar">
              <span><i></i> 本地图片组件已连接</span>
              <strong>创作图片</strong>
              <small>FLUX.2 · LOCAL</small>
            </div>
            <div class="studio-canvas">
              <div class="generated-art">
                <span class="art-orbit orbit-a"></span>
                <span class="art-orbit orbit-b"></span>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <path d="M18 91C44 86 68 60 98 22" />
                  <path d="m56 70 14-36 28-12-11 30-31 18Z" />
                  <path d="M31 98h58" />
                </svg>
                <div><small>生成完成</small><strong>1024 × 1024</strong></div>
              </div>
              <div class="reference-card">
                <span>参考图</span>
                <div class="reference-thumb"></div>
                <small>保持原图比例</small>
              </div>
              <div class="studio-status">
                <span>图片修改</span>
                <i><b></b></i>
                <strong>100%</strong>
              </div>
            </div>
            <div class="studio-prompt">
              <span>把光线改成清晨，并保留主体构图</span>
              <b>生成</b>
            </div>
          </div>
        </div>
      </section>

      <section id="experience" class="section experience">
        <div class="experience-heading">
          <div>
            <div class="section-number">04 / 对话体验</div>
            <p class="eyebrow">真正可控的 AI 对话</p>
            <h2>长任务不失控，<br />每一步都能修改。</h2>
          </div>
          <p>
            ShotAI 不只是一个输入框。长内容可以滚动，回答可以停止，
            以前的问题也可以修改后重新回答。
          </p>
        </div>
        <div class="experience-grid">
          <article>
            <span>01 / 长内容</span>
            <h3>长问题也能轻松输入</h3>
            <p>输入区自动增高，达到上限后独立滚动，长材料不会撑乱工作区。</p>
            <strong>最多 8,000 字</strong>
          </article>
          <article>
            <span>02 / 随时停止</span>
            <h3>随时停止生成</h3>
            <p>回答期间会显示停止按钮，也可以按 Esc 键立即停止。</p>
            <strong>点击或按键即可停止</strong>
          </article>
          <article>
            <span>03 / 修改问题</span>
            <h3>编辑并重新回答</h3>
            <p>以前的问题可以直接修改，ShotAI 会根据新问题重新回答。</p>
            <strong>修改后再次回答</strong>
          </article>
          <article>
            <span>04 / 常用操作</span>
            <h3>消息操作简单清楚</h3>
            <p>复制问题、复制回答、重新回答和停止都有清晰提示。</p>
            <strong>复制 · 修改 · 重试</strong>
          </article>
        </div>
      </section>

      <section id="capabilities" class="section capabilities">
        <div class="section-head">
          <div>
            <div class="section-number">05 / 主要功能</div>
            <p class="eyebrow">核心能力</p>
            <h2>为离线环境设计的完整工作台</h2>
          </div>
          <p>从桌面启动、模型检查到内容理解与创作，关键环节都由 ShotAI 统一管理。</p>
        </div>

        <div class="capability-grid">
          <article class="feature feature-wide">
            <div class="feature-top">
              <span class="feature-index">功能 01 · 新增</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
                <path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
              </svg>
            </div>
            <div>
              <h3>本地图片生成与修改</h3>
              <p>
                文字生成图片、参考图修改、改动幅度和画布比例都在对话输入框中完成。
                生成过程可停止，结果可预览、保存并保留在当前对话。
              </p>
            </div>
            <div class="file-telemetry">
              <span>本地图片组件</span>
              <i><b></b></i>
              <strong>创作完成</strong>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 02</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="9" width="14" height="11" />
                <path d="M8 9V6a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div>
              <h3>Windows 独立客户端</h3>
              <p>
                独立窗口、任务栏图标与托盘菜单；关闭窗口后仍可继续为内网提供服务，
                运行状态和日志也统一管理。
              </p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 03</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16v12H4zM8 10h8M8 14h5" />
              </svg>
            </div>
            <div>
              <h3>完整的本地对话</h3>
              <p>流式回答可停止、继续、修改问题、重新生成和复制，并支持回答思路与参数设置。</p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 04</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16v11H7l-3 3V5z" />
                <path d="M8 9h8M8 12h5" />
              </svg>
            </div>
            <div>
              <h3>图片与文档理解</h3>
              <p>支持 PNG、JPEG、WebP、TXT、Markdown、PDF 和 DOCX，并自动寻找能看图的模型。</p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 05</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 4 7v5c0 4.8 3.4 7.5 8 9 4.6-1.5 8-4.2 8-9V7l-8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>我的资料</h3>
              <p>建立本地资料库后，回答会检索相关内容并显示实际参考过的文件。</p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 06</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
              </svg>
            </div>
            <div>
              <h3>安全的模型导入</h3>
              <p>支持聊天、视觉和图片创作模型；GGUF 导入前检查结构、张量与配套文件完整性。</p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 07</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M6 4h12v16H6zM9 11h6M9 15h4" />
              </svg>
            </div>
            <div>
              <h3>主机与内网分权</h3>
              <p>默认仅主机可以管理模型，内网电脑专注使用，降低误删或误改运行环境的风险。</p>
            </div>
          </article>

          <article class="feature">
            <div class="feature-top">
              <span class="feature-index">功能 08</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 4 7v5c0 4.8 3.4 7.5 8 9 4.6-1.5 8-4.2 8-9V7l-8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>浏览器本地保存</h3>
              <p>对话、资料、偏好和最近创作自动保存在当前浏览器中，清理范围清晰可控。</p>
            </div>
          </article>
        </div>
      </section>

      <section id="workflow" class="workflow-section">
        <div class="section workflow-inner">
          <div class="workflow-intro">
            <div class="section-number">06 / 使用步骤</div>
            <p class="eyebrow">开箱即用</p>
            <h2>从启动到多人使用，<br />只需要四步。</h2>
            <p>
              Windows 客户端统一启动网页、对话和图片服务，
              内网电脑无需逐台安装。
            </p>
          </div>

          <ol class="workflow-list">
            <li>
              <span class="step-number">01</span>
              <div><small>安装</small><h3>安装 ShotAI 客户端</h3><p>在负责运行的 Windows 电脑上完成一次安装。</p></div>
              <span class="step-state">安装完成</span>
            </li>
            <li>
              <span class="step-number">02</span>
              <div><small>准备能力</small><h3>添加需要的本地模型</h3><p>按需准备对话、看图或图片创作模型，导入前会自动检查。</p></div>
              <span class="step-state">模型可用</span>
            </li>
            <li>
              <span class="step-number">03</span>
              <div><small>启动</small><h3>打开 ShotAI</h3><p>客户端自动连接本地组件，关闭窗口后也可在托盘继续运行。</p></div>
              <span class="step-state">服务就绪</span>
            </li>
            <li>
              <span class="step-number">04</span>
              <div><small>其他电脑</small><h3>浏览器打开内网地址</h3><p>即可对话、读资料、分析文件并使用主机完成图片创作。</p></div>
              <span class="step-state">可以使用</span>
            </li>
          </ol>
        </div>
      </section>

      <section id="lan" class="section security lan-section">
        <div class="lan-visual" aria-label="ShotAI 多人使用方式">
          <div class="lan-host">
            <small>运行电脑</small>
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect x="7" y="4" width="18" height="24" />
              <path d="M11 9h10M11 14h10M11 19h6" />
              <circle cx="21" cy="24" r="1" />
            </svg>
            <strong>SHOTAI 正在运行</strong>
            <span><i></i> 服务正常</span>
          </div>
          <div class="lan-link">
            <span>单位内部网络</span>
          </div>
          <div class="lan-clients">
            <div v-for="client in ['01', '02', '03', 'N']" :key="client">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <rect x="5" y="6" width="22" height="16" />
                <path d="M10 27h12M16 22v5" />
              </svg>
              <span>使用电脑 {{ client }}</span>
            </div>
          </div>
        </div>

        <div class="security-copy">
          <div class="section-number">07 / 多人使用</div>
          <p class="eyebrow">单位内部使用</p>
          <h2>模型只装一次，<br />浏览器随处可用。</h2>
          <p>
            一台电脑统一运行模型和图片组件，其他电脑只负责显示网页。
            使用者不需要安装运行环境，也不能默认修改主机模型。
          </p>
          <ul>
            <li><span>01</span><div><strong>模型只安装一次</strong><small>统一放在运行电脑上</small></div></li>
            <li><span>02</span><div><strong>其他电脑直接使用</strong><small>打开浏览器即可</small></div></li>
            <li><span>03</span><div><strong>主机集中管理</strong><small>内网电脑默认只使用、不改模型</small></div></li>
          </ul>
        </div>
      </section>

      <section id="models" class="model-section">
        <div class="section">
          <div class="model-heading">
            <div>
              <div class="section-number">08 / 能力调度</div>
              <p class="eyebrow">自由选择模型</p>
              <h2>模型各司其职，<br />切换交给 ShotAI。</h2>
            </div>
            <p>
              对话、图片理解、资料查找和图片创作使用不同的本地能力，
              ShotAI 会根据任务自动选择，不打断当前对话。
            </p>
          </div>
          <div class="model-recommendation-grid">
            <article>
              <span>自动分工 · 无需手动来回切换</span>
              <h3>任务决定使用哪种能力</h3>
              <p>发送参考图会进入图片修改，上传图片会寻找视觉模型，普通问题继续使用聊天模型。</p>
              <code>对话 / 识图 / 资料查找 / 图片创作</code>
            </article>
            <article>
              <span>导入检查 · 提前发现问题</span>
              <h3>模型文件先检查，再安装</h3>
              <p>读取 GGUF 版本、张量和模型说明，视觉与图片模型的配套文件也会自动识别。</p>
              <code>结构检查 / 配套识别 / 能力检测</code>
            </article>
          </div>
          <p class="model-runtime-note">
            模型权重由管理员自行准备。主机负责导入和管理，内网使用者默认只使用已经就绪的能力。
          </p>
          <div class="model-rail" aria-label="示例兼容模型">
            <div><span>文字问答</span><small>日常对话</small></div>
            <div><span>图片识别</span><small>图片和文字</small></div>
            <div><span>图片创作</span><small>文字生成图片</small></div>
            <div><span>参考图修改</span><small>保持比例再创作</small></div>
            <div><span>文件总结</span><small>读取常见文件</small></div>
            <div><span>资料问答</span><small>显示参考来源</small></div>
          </div>
        </div>
      </section>

      <section id="download" class="final-cta">
        <div class="cta-grid"></div>
        <div class="section-number">09 / 准备使用</div>
        <p class="eyebrow">准备建立本地智能能力</p>
        <h2>把理解与创作，<br />都留在自己的电脑里。</h2>
        <p>一台 Windows 电脑启动，即可把完整本地 AI 能力分享给单位内部。</p>
        <div class="hero-actions">
          <a
            class="button button-primary"
            :href="workbenchUrl"
            :target="workbenchTarget"
            :rel="workbenchTarget ? 'noreferrer' : undefined"
          >
            {{ workbenchLabel }}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </a>
          <a class="button button-ghost" href="#capabilities">查看全部能力</a>
        </div>
      </section>
    </main>

    <footer>
      <a class="wordmark footer-mark" href="#top" aria-label="返回首页顶部">
        <span>SHOT<i>AI</i></span>
        <small>完全离线的智能助手</small>
      </a>
      <p>本地对话、资料问答与图片创作工作台</p>
      <div><span>SHOTAI 1.1.3</span><span>© 2026 SHOTAI</span></div>
    </footer>
  </div>
</template>
