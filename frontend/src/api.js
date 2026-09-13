const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function reportExpiredSession(token) {
  window.dispatchEvent(new CustomEvent("journal-session-expired", { detail: { token } }));
}

async function request(path, { timeoutMs = 0, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = timeoutMs ? setTimeout(abort, timeoutMs) : null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!response.ok) {
      if (response.status === 401 && options.headers?.Authorization) {
        reportExpiredSession(options.headers.Authorization.replace(/^Bearer /, ""));
      }
      let detail = "Something went wrong. Please try again.";
      try {
        const body = await response.json();
        if (typeof body.detail === "string") detail = body.detail;
      } catch { /* Keep the fallback for proxy errors. */ }
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      const timeout = new Error("The request took too long. Please try again.");
      timeout.status = 408;
      throw timeout;
    }
    throw error;
  } finally {
    if (timer !== null) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

function retryDelay(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 400);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function readRequest(path, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await request(path, { timeoutMs: 20000, ...options }); }
    catch (error) {
      const temporary = error instanceof TypeError || error.status === 408 || error.status >= 500;
      if (options.signal?.aborted || !temporary || attempt === 1) throw error;
      await retryDelay(options.signal);
    }
  }
}

export const getProfile = (signal) => request("/api/profile", { signal });
export const getExperience = (signal) => request("/api/experience", { signal });
export const getSkills = (signal) => request("/api/skills", { signal });
export const getPosts = (signal) => readRequest("/api/posts", { signal });
export const getPost = (slug, signal) => readRequest(`/api/posts/${slug}`, { signal });
export const mediaUrl = (media) => `${API_BASE}${media.url}`;
export function uploadMedia(file, purpose, token, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal?.aborted) { reject(new DOMException("Upload canceled", "AbortError")); return; }
    xhr.open("POST", `${API_BASE}/api/uploads?name=${encodeURIComponent(file.name)}&purpose=${purpose}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.responseType = "json";
    xhr.timeout = 120000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) resolve(xhr.response);
      else {
        if (xhr.status === 401) reportExpiredSession(token);
        const error = new Error(typeof xhr.response?.detail === "string" ? xhr.response.detail : "Upload failed. Please try again.");
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Connection lost. Check your connection and retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry."));
    xhr.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}
export const loginAdmin = (password) =>
  request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
export const getAdminSession = (token, signal) =>
  readRequest("/api/auth/session", {
    timeoutMs: 5000,
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
export const createPost = (payload, token) =>
  request("/api/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
export const updateArticle = (slug, payload, token) => request(`/api/posts/${slug}`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
});
export const deleteArticle = (slug, token) => request(`/api/posts/${slug}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` },
});
export const sendContactMessage = (payload) =>
  request("/api/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
