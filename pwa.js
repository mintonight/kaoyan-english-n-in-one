(function () {
  'use strict';

  var deferredPrompt = null;
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isSecureForSW = location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1';

  function showToast(text, actionLabel, onAction) {
    var old = document.getElementById('kaoyan-pwa-toast');
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = 'kaoyan-pwa-toast';
    div.style.cssText = [
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;',
      'background:#2d261e;color:#fdfbf7;padding:9px 14px;border-radius:10px;',
      'font-size:12.5px;line-height:1.5;box-shadow:0 10px 24px rgba(0,0,0,.22);',
      'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);'
    ].join('');
    var span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);
    if (actionLabel && onAction) {
      var btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.style.cssText = 'border:0;background:#d97706;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;';
      btn.onclick = function () { div.remove(); onAction(); };
      div.appendChild(btn);
    }
    var close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', '关闭');
    close.style.cssText = 'border:0;background:none;color:#c7b59f;cursor:pointer;font-size:13px;padding:0 2px;';
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
        btn.textContent = '📲 安装到本地';
      } else if (isIOS && isSecureForSW) {
        btn.hidden = false;
        btn.textContent = '📲 添加到主屏幕';
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
    showToast('✅ 已安装到本地，断网也可直接使用');
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
        el.textContent = '📴 离线模式';
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
