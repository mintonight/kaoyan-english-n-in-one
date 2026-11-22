(function () {
  'use strict';

  var deferredPrompt = null;
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isSecureForSW = location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1';

  function getIco(name, size) {
    if (window.LucideIcons) return window.LucideIcons.svg(name, { size: size || 14 });
    return '';
  }

  function showToast(text, actionLabel, onAction) {
    var old = document.getElementById('kaoyan-pwa-toast');
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = 'kaoyan-pwa-toast';
    div.style.cssText = [
      'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;',
      'background:rgba(31,25,20,.94);color:#fdfbf8;padding:10px 15px;border-radius:12px;',
      'border:1px solid rgba(253,251,248,.12);backdrop-filter:blur(10px);',
      'font-size:12.5px;line-height:1.5;box-shadow:0 14px 32px -10px rgba(20,14,8,.42);',
      'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);'
    ].join('');
    var span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);
    if (actionLabel && onAction) {
      var btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.style.cssText = 'border:0;background:#c46218;color:#fff;padding:4px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;';
      btn.onclick = function () { div.remove(); onAction(); };
      div.appendChild(btn);
    }
    var close = document.createElement('button');
    close.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    close.setAttribute('aria-label', '关闭');
    close.style.cssText = 'border:0;background:none;color:#b8aa99;cursor:pointer;display:inline-flex;align-items:center;padding:2px;';
    close.onclick = function () { div.remove(); };
    div.appendChild(close);
    document.body.appendChild(div);
    if (!actionLabel) {
      setTimeout(function () { if (div.parentNode) div.remove(); }, 4500);
    }
  }

  function updateInstallButtons() {
    var btns = document.querySelectorAll('[data-pwa-install]');
    btns.forEach(function (btn) {
      if (isStandalone) {
        btn.hidden = true;
        return;
      }
      if (deferredPrompt) {
        btn.hidden = false;
        btn.innerHTML = getIco('download', 14) + '<span>安装到本地</span>';
      } else if (isIOS && isSecureForSW) {
        btn.hidden = false;
        btn.innerHTML = getIco('download', 14) + '<span>添加到主屏幕</span>';
      } else {
        btn.hidden = true;
      }
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtons();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    isStandalone = true;
    updateInstallButtons();
    showToast('已安装到本地，断网也可直接使用');
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-pwa-install]') : null;
    if (!btn) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        updateInstallButtons();
      });
    } else if (isIOS) {
      showToast('iOS 离线安装：点浏览器底部「分享」按钮 → 选择「添加到主屏幕」');
    }
  });

  if (isSecureForSW && 'serviceWorker' in navigator) {
    var registerSW = function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('发现新版本内容，刷新后生效', '立即刷新', function () {
                nw.postMessage({ type: 'SKIP_WAITING' });
                location.reload();
              });
            }
          });
        });
      }).catch(function () {});
    };
    if (document.readyState === 'complete') registerSW();
    else window.addEventListener('load', registerSW);
  }

  function updateNetBadge() {
    document.querySelectorAll('[data-net-badge]').forEach(function (el) {
      if (navigator.onLine) {
        el.hidden = true;
      } else {
        el.hidden = false;
        el.innerHTML = getIco('wifi-off', 13) + '<span>离线模式</span>';
      }
    });
  }

  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', function () {
    updateNetBadge();
    showToast('已切换为离线模式：阅读与拼写可正常使用，联网后自动同步');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      updateInstallButtons();
      updateNetBadge();
    });
  } else {
    updateInstallButtons();
    updateNetBadge();
  }
})();
