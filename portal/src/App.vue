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
        <a href="#experience" @click="closeMenu">交互</a>
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
            SHOTAI 1.0 · 完全离线 · 统一使用
          </div>
          <h1>一台电脑运行，<br /><span>单位内部都能用</span></h1>
          <p class="hero-lead">
            ShotAI 在一台电脑上运行，其他电脑打开浏览器就能使用。
            支持日常对话、图片分析、文件总结和根据单位资料回答问题。
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
            <div><span>运行方式</span><strong>完全离线</strong></div>
            <div><span>对话操作</span><strong>随时停止</strong></div>
            <div><span>使用范围</span><strong>单位内部</strong></div>
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
              <div class="mock-nav"><b>02</b><span>模型</span></div>
              <div class="mock-nav"><b>03</b><span>我的资料</span></div>
              <div class="mock-nav"><b>04</b><span>运行检查</span></div>
              <div class="mock-offline"><span class="live-dot"></span> AI 服务已连接</div>
            </div>
            <div class="mock-main">
              <div class="mock-topbar">
                <div><small>当前对话</small><strong>离线智能会话</strong></div>
                <div class="mock-model">图片模型 · 可以使用</div>
              </div>
              <div class="mock-secure">
                <span>▢</span>
                <div><strong>AI 服务运行正常</strong><small>已找到可用模型</small></div>
              </div>
              <div class="mock-chat">
                <div class="mock-avatar">SA</div>
                <div class="mock-message">
                  <small>SHOTAI</small>
                  <p>图片识别功能运行正常，可以上传图片或文件开始分析。</p>
                  <ul>
                    <li>自动找到已安装的模型</li>
                    <li>生成可停止，问题可编辑重试</li>
                    <li>我的资料与对话自动保存</li>
                  </ul>
                </div>
              </div>
              <div class="mock-input">
                添加图片、文档或输入问题…
                <span>按回车发送 · 可随时停止</span>
              </div>
            </div>
          </div>
          <div class="visual-caption">
            <span>界面预览</span>
            <p>统一管理模型、对话和运行状态</p>
          </div>
        </div>

        <a class="scroll-cue" href="#manifest">
          <span>向下查看更多</span>
          <i></i>
        </a>
      </section>

      <section id="manifest" class="trust-rail" aria-label="产品关键特性">
        <span>完全离线</span>
        <span>回答可随时停止</span>
        <span>支持图片和资料</span>
        <span>单位内部多人使用</span>
      </section>

      <section class="manifest section">
        <div class="section-number">01 / 产品介绍</div>
        <div class="manifest-copy">
          <p class="eyebrow">产品使命</p>
          <h2>把对话、图片和资料，<br />放进一套离线工作台。</h2>
        </div>
        <div class="manifest-body">
          <p>
            ShotAI 将模型、对话记录、文件分析和单位资料集中在一台电脑中，
            其他电脑通过浏览器直接使用。
          </p>
          <p>
            Windows 电脑双击启动文件即可运行，其他使用者无需安装额外软件。
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
            从日常对话到图片、文件和单位资料问答，再到停止、编辑与重新回答，
            所有功能统一在浏览器工作台完成。
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
            <span>对话 · 图片 · 文件 · 多人使用</span>
          </figcaption>
        </figure>
      </section>

      <section id="experience" class="section experience">
        <div class="experience-heading">
          <div>
            <div class="section-number">03 / 对话体验</div>
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
            <div class="section-number">04 / 主要功能</div>
            <p class="eyebrow">核心能力</p>
            <h2>为离线环境设计的完整工作台</h2>
          </div>
          <p>支持模型管理、日常对话、图片、文件、单位资料和多人使用。</p>
        </div>

        <div class="capability-grid">
          <article class="feature feature-wide">
            <div class="feature-top">
              <span class="feature-index">功能 01</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
              </svg>
            </div>
            <div>
              <h3>模型管理</h3>
              <p>
                自动找到已安装的模型，并显示是否可以使用、是否支持图片。
                主机可以直接添加下载好的模型文件，其他电脑只负责使用。
              </p>
            </div>
            <div class="file-telemetry">
              <span>模型文件正在检查</span>
              <i><b></b></i>
              <strong>检查完成</strong>
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
              <h3>图片与文档附件</h3>
              <p>
                支持常见图片、文本、PDF 和 Word 文件；
                发送图片前会自动检查当前模型能否识别图片。
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
              <h3>我的资料</h3>
              <p>添加单位资料后，ShotAI 可以根据资料回答，并显示回答参考了哪些文件。</p>
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
              <h3>完整的对话体验</h3>
              <p>支持长内容、多个对话、停止回答、修改问题、重新回答和回答偏好。</p>
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
              <h3>单位内部多人使用</h3>
              <p>一台电脑负责运行，其他电脑打开浏览器就可以直接使用。</p>
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
              <h3>自动保存与运行检查</h3>
              <p>对话、文件、资料和最近生成的图片会自动保存在当前浏览器中。</p>
            </div>
          </article>
        </div>
      </section>

      <section id="workflow" class="workflow-section">
        <div class="section workflow-inner">
          <div class="workflow-intro">
            <div class="section-number">05 / 使用步骤</div>
            <p class="eyebrow">开箱即用</p>
            <h2>从启动到多人使用，<br />只需要四步。</h2>
            <p>
              模型集中在一台电脑上运行，其他电脑只需要打开网页，
              无需逐台安装。
            </p>
          </div>

          <ol class="workflow-list">
            <li>
              <span class="step-number">01</span>
              <div><small>运行电脑</small><h3>准备一台运行电脑</h3><p>将 ShotAI 完整文件放到负责运行的电脑上。</p></div>
              <span class="step-state">准备完成</span>
            </li>
            <li>
              <span class="step-number">02</span>
              <div><small>选择模型</small><h3>安装需要的模型</h3><p>普通聊天选择文字模型，需要看图片就选择图片模型。</p></div>
              <span class="step-state">模型可用</span>
            </li>
            <li>
              <span class="step-number">03</span>
              <div><small>启动</small><h3>双击启动 ShotAI</h3><p>按照页面提示启动即可，无需单独安装其他工具。</p></div>
              <span class="step-state">已经启动</span>
            </li>
            <li>
              <span class="step-number">04</span>
              <div><small>其他电脑</small><h3>浏览器打开显示的网址</h3><p>输入启动页面显示的网址，即可开始对话和文件分析。</p></div>
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
          <div class="section-number">06 / 多人使用</div>
          <p class="eyebrow">单位内部使用</p>
          <h2>模型只装一次，<br />浏览器随处可用。</h2>
          <p>
            一台电脑统一运行模型，其他电脑只负责显示网页。
            使用者不需要安装模型，也不需要进行复杂设置。
          </p>
          <ul>
            <li><span>01</span><div><strong>模型只安装一次</strong><small>统一放在运行电脑上</small></div></li>
            <li><span>02</span><div><strong>其他电脑直接使用</strong><small>打开浏览器即可</small></div></li>
            <li><span>03</span><div><strong>多人同时访问</strong><small>输入页面显示的网址即可开始</small></div></li>
          </ul>
        </div>
      </section>

      <section id="models" class="model-section">
        <div class="section">
          <div class="model-heading">
            <div>
              <div class="section-number">07 / 模型选择</div>
              <p class="eyebrow">自由选择模型</p>
              <h2>模型由你选择，<br />能力不被平台锁定。</h2>
            </div>
            <p>
              可以根据工作需要选择普通聊天模型或图片识别模型，
              也可以添加已经下载到电脑上的模型文件。
            </p>
          </div>
          <div class="model-recommendation-grid">
            <article>
              <span>推荐 · 速度更快</span>
              <h3>图片模型 · 快速版</h3>
              <p>约 6.1GB，适合看图片、识别图片文字和中文问答。</p>
              <code>适合首次使用和现场演示</code>
            </article>
            <article>
              <span>效果更好 · 运行较慢</span>
              <h3>图片模型 · 效果增强版</h3>
              <p>约 20GB，质量更高；会使用部分系统内存，首字响应更慢。</p>
              <code>适合对图片理解要求较高的工作</code>
            </article>
          </div>
          <p class="model-runtime-note">
            从下载网站取得图片模型时，可能会同时得到两个文件。
            请在工作台中一次选择这两个文件，系统会自动配对。
          </p>
          <div class="model-rail" aria-label="示例兼容模型">
            <div><span>文字问答</span><small>日常对话</small></div>
            <div><span>图片识别</span><small>图片和文字</small></div>
            <div><span>文件总结</span><small>读取常见文件</small></div>
            <div><span>资料问答</span><small>根据单位资料回答</small></div>
            <div><span>内容写作</span><small>起草和修改材料</small></div>
            <div><span>自由选择</span><small>添加自己的模型</small></div>
          </div>
        </div>
      </section>

      <section id="download" class="final-cta">
        <div class="cta-grid"></div>
        <div class="section-number">08 / 准备使用</div>
        <p class="eyebrow">准备建立本地智能能力</p>
        <h2>无需连接云端。<br />从你自己的模型开始。</h2>
        <p>在一台电脑上启动，即可供单位内部其他电脑共同使用。</p>
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
      <p>面向离线环境的本地 AI 工作台</p>
      <div><span>产品介绍页</span><span>© 2026 SHOTAI</span></div>
    </footer>
  </div>
</template>
