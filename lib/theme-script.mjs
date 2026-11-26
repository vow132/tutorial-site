/**
 * 根布局 <head> 里的内联主题脚本（app/layout.tsx 输出，id="theme-script"）。
 *
 * 主题：读者手动选过就用他选的（localStorage），没选过跟随系统的深色模式，系统切换时实时跟着变。
 * 手动切到和系统一致的那一档时清掉记录，恢复「跟随系统」。CSS 的 dark: 变体看 <html data-theme>。
 * 只执行一次（window.__siteTheme）；整页在浏览器里渲染、这段没执行时由 components/theme-boot.tsx 补执行。
 *
 * 内容必须是固定的字符串（不能拼接设置里的值）：后台的严格 CSP（lib/csp.mjs）按它的 SHA-256 放行。
 */
export const THEME_SCRIPT = `(function(){if(window.__siteTheme)return;window.__siteTheme=1;var k="tutorial-site-theme";var root=document.documentElement;var mq=null;try{mq=matchMedia("(prefers-color-scheme: dark)")}catch(e){}function system(){return mq&&mq.matches?"dark":"light"}function stored(){try{var v=localStorage.getItem(k);return v==="dark"||v==="light"?v:null}catch(e){return null}}function sync(t){root.dataset.theme=t;root.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"#0d1117":"#f7f8fa")}sync(stored()||system());if(mq&&mq.addEventListener)mq.addEventListener("change",function(){if(!stored())sync(system())});try{var n=navigator,c=n.connection;if((c&&c.saveData)||(n.deviceMemory&&n.deviceMemory<4)||(n.hardwareConcurrency&&n.hardwareConcurrency<4)||matchMedia("(prefers-reduced-transparency: reduce)").matches)root.dataset.lite=""}catch(e){}document.addEventListener("click",function(e){var el=e.target instanceof Element?e.target.closest("[data-theme-toggle]"):null;if(!el)return;var t=root.dataset.theme==="dark"?"light":"dark";sync(t);try{if(t===system())localStorage.removeItem(k);else localStorage.setItem(k,t)}catch(e){}});window.addEventListener("storage",function(e){if(e.key===k)sync(stored()||system())})})()`;
