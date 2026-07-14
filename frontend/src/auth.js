// auth.js
// Basit ortak-parola auth istemci tarafı yardımcıları.
//
// Uygulamadaki onlarca bileşen doğrudan `fetch('/api/...')` çağırıyor. Her
// birine Authorization header'ı elle eklemek yerine, global window.fetch'i
// bir kez sarmalıyoruz: /api isteklerine token otomatik eklenir ve 401
// dönerse token silinip giriş ekranına yönlendirilir.

const TOKEN_KEY = 'nova_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

// Giriş: parolayı backend'e gönderir, başarılıysa token'ı saklar.
export async function login(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success && data.token) {
    setToken(data.token);
    return { ok: true };
  }
  return { ok: false, error: data.error || 'Giriş başarısız' };
}

// window.fetch'i bir kez sarmala. onUnauthorized: 401 alınca çağrılır
// (App bunu giriş ekranını göstermek için kullanır).
let installed = false;
export function installFetchAuth(onUnauthorized) {
  if (installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api') || url.includes('/api/');

    if (isApi && url.indexOf('/api/login') === -1) {
      const token = getToken();
      const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }

    const res = await originalFetch(input, init);
    if (res.status === 401 && isApi && url.indexOf('/api/login') === -1) {
      clearToken();
      if (typeof onUnauthorized === 'function') onUnauthorized();
    }
    return res;
  };
}
